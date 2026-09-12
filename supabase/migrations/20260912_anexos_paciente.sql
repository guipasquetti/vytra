-- Item 5 do benchmark de concorrentes (§30 do HANDOFF): anexo de paciente (exame, laudo),
-- gap que WebDiet e Dietbox cobrem e o Vytra não tinha. Paciente sobe o próprio documento;
-- profissional do acompanhamento lê. Nunca o contrário (profissional não anexa em nome do
-- paciente aqui — isso já existe como nota de prontuário em `atendimentos`, §33).
--
-- Lente de segurança/LGPD (§0): documento de saúde (exame/laudo) é dado sensível novo.
-- Escopado por `subscription_id` desde o início (não client_id/professional_id soltos) —
-- é a correção que já foi feita em `check_ins` (20260909173000) depois de um paciente com
-- dois profissionais poder vazar dado pro profissional errado. Aqui nasce certo.

create table public.anexos_paciente (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id),
  categoria text not null default 'outro' check (categoria in ('exame', 'laudo', 'outro')),
  nome_arquivo text not null,
  storage_path text not null,
  observacao text,
  created_at timestamptz not null default now()
);

create index anexos_paciente_subscription_id_idx
  on public.anexos_paciente (subscription_id, created_at desc);
create index anexos_paciente_client_id_idx
  on public.anexos_paciente (client_id, created_at desc);

alter table public.anexos_paciente enable row level security;

-- Mesma invariável do check-in: a assinatura referenciada precisa pertencer ao mesmo par
-- paciente/profissional gravado na linha, e estar ativa.
create function public.validar_assinatura_do_anexo()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_patient_id uuid;
  v_professional_id uuid;
begin
  select patient_id, professional_id
    into v_patient_id, v_professional_id
  from public.subscriptions
  where id = new.subscription_id;

  if v_patient_id is null then
    raise exception 'A assinatura do anexo não existe.';
  end if;

  if new.client_id <> v_patient_id or new.professional_id <> v_professional_id then
    raise exception 'O anexo precisa pertencer ao mesmo paciente e profissional da assinatura.';
  end if;

  return new;
end;
$function$;

create trigger anexos_paciente_validar_assinatura
  before insert or update of client_id, professional_id, subscription_id
  on public.anexos_paciente
  for each row execute function public.validar_assinatura_do_anexo();

-- Só o próprio paciente sobe, e só no próprio acompanhamento ativo — nunca em nome de outro.
create policy anexos_paciente_insert_self on public.anexos_paciente
  for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1
      from public.subscriptions s
      where s.id = subscription_id
        and s.patient_id = auth.uid()
        and s.professional_id = professional_id
        and s.status = 'ativa'
    )
  );

-- Paciente lê o próprio; profissional lê só o do acompanhamento que originou a linha (não
-- qualquer vínculo ativo com o paciente — mesmo cuidado do check-in pós-fix).
create policy anexos_paciente_select on public.anexos_paciente
  for select to authenticated
  using (
    client_id = auth.uid()
    or exists (
      select 1
      from public.subscriptions s
      where s.id = subscription_id
        and s.professional_id = auth.uid()
        and s.status = 'ativa'
    )
  );

-- Paciente pode apagar o próprio anexo (upload errado, documento desatualizado). Sem update:
-- corrigir é apagar e reenviar, mais simples que editar metadado de um documento já assinado.
create policy anexos_paciente_delete on public.anexos_paciente
  for delete to authenticated
  using (client_id = auth.uid());

-- Bucket privado, nunca público — mesmo padrão de `fotos-checkin`/`documentos-profissionais`.
insert into storage.buckets (id, name, public)
values ('anexos-paciente', 'anexos-paciente', false);

-- Verifica o acesso do profissional contra a linha real de `anexos_paciente` (mesmo desenho
-- de `pode_ler_foto_checkin`) — evita que um segundo profissional do mesmo paciente abra
-- documento de um acompanhamento que não é o dele.
create function public.pode_ler_anexo_paciente(p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.anexos_paciente a
    join public.subscriptions s on s.id = a.subscription_id
    where a.storage_path = p_caminho
      and s.professional_id = auth.uid()
      and s.status = 'ativa'
  );
$function$;

revoke all on function public.pode_ler_anexo_paciente(text) from public;
grant execute on function public.pode_ler_anexo_paciente(text) to authenticated;

-- Caminho sempre prefixado pelo próprio uid (`{client_id}/{subscription_id}/{arquivo}`) — só
-- o paciente escreve na própria pasta.
create policy anexos_paciente_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anexos-paciente'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy anexos_paciente_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anexos-paciente'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.pode_ler_anexo_paciente(name)
    )
  );

create policy anexos_paciente_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos-paciente'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
