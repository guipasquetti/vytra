-- Pedido do Guilherme (19/set): foto opcional já na anamnese + rascunho salvo automaticamente
-- a cada campo, pra não perder resposta se o paciente preencher em etapas/aparelhos diferentes.
--
-- Lente de segurança/LGPD (§0 do HANDOFF): foto do próprio corpo é dado mais sensível que texto
-- de anamnese (mesmo raciocínio já registrado no §56, pras fotos de check-in) — bucket privado,
-- caminho sempre prefixado pelo uid do paciente, leitura restrita ao próprio paciente e ao
-- profissional vinculado (`is_professional_of`), nunca público. Sem análise por IA aqui (não foi
-- pedido) — é só anexo pro profissional ver.
--
-- O rascunho NÃO pode reaproveitar a tabela `anamnese` final: `possuiAnamnese()` (gate do
-- onboarding em `aluno/_layout.tsx`) checa só a EXISTÊNCIA da linha, sem exigir nenhum campo
-- preenchido (decisão de produto já tomada: "sem campo obrigatório"). Se o autosave escrevesse
-- direto em `anamnese`, a primeira letra digitada já liberaria o paciente pras abas do app,
-- pulando a escolha do plano. Por isso rascunho é tabela própria, só o paciente lê/escreve, e a
-- RPC de envio final apaga o rascunho ao concluir — mesmo padrão de `workout_drafts` (linha
-- solta que existe só enquanto o trabalho está em progresso).

create table public.anamnese_rascunho (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  respostas jsonb not null default '{}'::jsonb,
  plano_id uuid,
  foto_path text,
  updated_at timestamptz not null default now()
);

alter table public.anamnese_rascunho enable row level security;

-- Só o próprio paciente lê/escreve o próprio rascunho — nem o profissional precisa ver um
-- preenchimento pela metade.
create policy anamnese_rascunho_all_own on public.anamnese_rascunho for all to public
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

alter table public.anamnese
  add column foto_path text;

-- Bucket privado pra foto da anamnese, mesmo padrão de `fotos-checkin` (§13/§56).
insert into storage.buckets (id, name, public)
values ('fotos-anamnese', 'fotos-anamnese', false);

create policy fotos_anamnese_insert on storage.objects
  for insert
  with check (
    bucket_id = 'fotos-anamnese'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy fotos_anamnese_select on storage.objects
  for select
  using (
    bucket_id = 'fotos-anamnese'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_professional_of(((storage.foldername(name))[1])::uuid)
    )
  );

create policy fotos_anamnese_delete on storage.objects
  for delete
  using (
    bucket_id = 'fotos-anamnese'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- `submeter_anamnese_autenticado` ganha `p_foto_path` e, ao concluir com sucesso, apaga o
-- rascunho do paciente que chamou (mesmo `auth.uid()`, sem risco de apagar rascunho de outro).
create or replace function public.submeter_anamnese_autenticado(
  p_respostas jsonb,
  p_plano_id uuid default null,
  p_foto_path text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;

  update public.profiles set
    nome = coalesce(nullif(p_respostas->>'nome_completo',''), nome),
    telefone = coalesce(nullif(p_respostas->>'telefone',''), telefone),
    data_nascimento = nullif(p_respostas->>'data_nascimento','')::date,
    altura_cm = nullif(p_respostas->>'altura_cm','')::numeric,
    peso_kg = nullif(p_respostas->>'peso_atual','')::numeric
  where id = v_uid;

  insert into public.anamnese (client_id, objetivo_principal, nivel_atividade, lesoes_dores, condicoes_medicas,
    medicamentos, cirurgias, historico_familiar, restricoes_alimentares, alergias, observacoes,
    respostas_completas, foto_path, updated_at)
  values (v_uid,
    coalesce(p_respostas->>'objetivo_principal',''),
    coalesce(p_respostas->>'pratica_atividade',''),
    coalesce(p_respostas->>'limitacao_fisica',''),
    coalesce(p_respostas->>'patologias',''),
    coalesce(p_respostas->>'medicamentos',''),
    coalesce(p_respostas->>'cirurgias',''),
    coalesce(p_respostas->>'historico_familiar',''),
    coalesce(p_respostas->>'nao_consome',''),
    coalesce(p_respostas->>'intolerancias_alergias',''),
    coalesce(p_respostas->>'observacoes_finais',''),
    p_respostas, p_foto_path, now()
  )
  on conflict (client_id) do update set
    objetivo_principal = excluded.objetivo_principal,
    nivel_atividade = excluded.nivel_atividade,
    lesoes_dores = excluded.lesoes_dores,
    condicoes_medicas = excluded.condicoes_medicas,
    medicamentos = excluded.medicamentos,
    cirurgias = excluded.cirurgias,
    historico_familiar = excluded.historico_familiar,
    restricoes_alimentares = excluded.restricoes_alimentares,
    alergias = excluded.alergias,
    observacoes = excluded.observacoes,
    respostas_completas = excluded.respostas_completas,
    foto_path = coalesce(excluded.foto_path, public.anamnese.foto_path),
    updated_at = now();

  if p_plano_id is not null then
    update public.subscriptions
    set plano_solicitado_id = p_plano_id
    where patient_id = v_uid and plan_id is null;
  end if;

  delete from public.anamnese_rascunho where client_id = v_uid;

  return true;
end;
$function$;
