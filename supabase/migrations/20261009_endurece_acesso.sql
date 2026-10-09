-- Endurecimento de acesso (revisão de 09/out/2026, HANDOFF §73).
--
-- Cada bloco fecha uma brecha confirmada em produção. Nada aqui muda o que o app faz hoje:
-- o cliente só escreve em `subscriptions` por UPDATE de status/plan_id, nunca edita `profiles`
-- de outra pessoa nem `professionals`, e as duas funções que criam assinatura são SECURITY
-- DEFINER (`finalizar_cadastro_convite`, `submeter_anamnese_autenticado`).

-- ---------------------------------------------------------------------------
-- 1. Assinatura é o que dá ao profissional acesso a dado de saúde (is_professional_of).
--    `subscriptions_write` era FOR ALL com WITH CHECK só em professional_id: qualquer usuário
--    vira profissional pelo `cadastrar_profissional` (sem aprovação prévia na RLS) e então
--    INSERIA uma assinatura 'ativa' pra um paciente qualquer, sem convite aceito, passando a
--    ler anamnese, fotos e check-ins dele. Agora o profissional só ATUALIZA assinatura própria,
--    e só status/plan_id/plano_solicitado_id.
-- ---------------------------------------------------------------------------
drop policy if exists subscriptions_write on public.subscriptions;

create policy subscriptions_update_professional on public.subscriptions
  for update to authenticated
  using (professional_id = auth.uid())
  with check (professional_id = auth.uid());

create or replace function public.subscriptions_protege_colunas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and (
       new.patient_id is distinct from old.patient_id
    or new.professional_id is distinct from old.professional_id
    or new.billing_status is distinct from old.billing_status
    or new.started_at is distinct from old.started_at
    or new.current_period_end is distinct from old.current_period_end
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Só status e plano da assinatura podem ser alterados pelo app.';
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_protege_colunas on public.subscriptions;
create trigger subscriptions_protege_colunas
  before update on public.subscriptions
  for each row execute function public.subscriptions_protege_colunas();

-- ---------------------------------------------------------------------------
-- 2. Policies que o app não usa e que davam escrita demais.
--    - profiles_update_trainer: profissional podia reescrever QUALQUER coluna do perfil do
--      paciente (nome, telefone, e-mail...). O app só edita o próprio perfil.
--    - professionals_update_self: sem restrição de coluna, o profissional podia mudar o próprio
--      `billing_status`/`asaas_subconta_id` (cobrança chega por webhook com service role).
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update_trainer on public.profiles;
drop policy if exists professionals_update_self on public.professionals;

-- O comentário em authService.ts já dizia que `email` era protegido por trigger; não era.
create or replace function public.profiles_protege_colunas_privilegiadas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.is_admin is distinct from old.is_admin or new.role is distinct from old.role)
     and not public.is_admin() then
    raise exception 'não autorizado a alterar is_admin/role';
  end if;
  if new.email is distinct from old.email and coalesce(auth.role(), '') = 'authenticated' then
    raise exception 'o e-mail do perfil não pode ser alterado pelo app';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Convite sem dono ficava visível/editável por qualquer profissional.
-- ---------------------------------------------------------------------------
drop policy if exists convites_professionals_all on public.convites;
create policy convites_professionals_all on public.convites
  for all to authenticated
  using (public.is_professional() and created_by = auth.uid())
  with check (public.is_professional() and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Teleconsulta: o UPDATE do profissional não conferia o paciente.
-- ---------------------------------------------------------------------------
drop policy if exists teleconsultas_update on public.teleconsultas;
create policy teleconsultas_update on public.teleconsultas
  for update to authenticated
  using (professional_id = auth.uid())
  with check (professional_id = auth.uid() and public.is_professional_of(patient_id));

-- ---------------------------------------------------------------------------
-- 5. Caminho de arquivo de Storage informado pelo cliente precisa estar na pasta de quem
--    enviou. `pode_ler_foto_checkin`/`pode_ler_anexo_paciente` liberam a leitura pelo
--    CAMINHO gravado na linha: sem esta checagem, um paciente gravava o caminho de outro
--    usuário e o próprio profissional passava a ler a foto dele. As Edge Functions de análise
--    também baixam esses caminhos com service role.
-- ---------------------------------------------------------------------------
create or replace function public.check_ins_valida_caminhos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prefixo text := new.client_id::text || '/';
  caminho text;
begin
  foreach caminho in array array[
    new.foto_frente_path, new.foto_perfil_esquerdo_path,
    new.foto_perfil_direito_path, new.foto_costas_path
  ] loop
    if caminho is not null and (left(caminho, length(prefixo)) <> prefixo or position('..' in caminho) > 0) then
      raise exception 'Foto de check-in fora da pasta do paciente.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists check_ins_valida_caminhos on public.check_ins;
create trigger check_ins_valida_caminhos
  before insert or update on public.check_ins
  for each row execute function public.check_ins_valida_caminhos();

create or replace function public.anexos_valida_caminho()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prefixo text := new.client_id::text || '/';
begin
  if left(new.storage_path, length(prefixo)) <> prefixo or position('..' in new.storage_path) > 0 then
    raise exception 'Anexo fora da pasta do paciente.';
  end if;
  return new;
end;
$$;

drop trigger if exists anexos_valida_caminho on public.anexos_paciente;
create trigger anexos_valida_caminho
  before insert or update on public.anexos_paciente
  for each row execute function public.anexos_valida_caminho();

-- ---------------------------------------------------------------------------
-- 6. Menor privilégio nas funções SECURITY DEFINER. REVOKE só de `anon` não basta: o EXECUTE
--    vem do PUBLIC. Ficam abertas a `anon` só as do fluxo por token (`obter_convite`,
--    `submeter_anamnese`) e `is_admin` (avaliada dentro de policies com role public). As demais
--    já devolviam false/vazio sem `auth.uid()`; agora nem executam.
-- ---------------------------------------------------------------------------
revoke execute on function public.finalizar_cadastro_convite(text) from public, anon;
revoke execute on function public.obter_solicitacoes_pendentes() from public, anon;
revoke execute on function public.recusar_convite(text) from public, anon;
revoke execute on function public.submeter_anamnese_autenticado(jsonb, uuid, text) from public, anon;
revoke execute on function public.pode_ler_anexo_paciente(text) from public, anon;
revoke execute on function public.pode_ler_foto_checkin(text) from public, anon;

grant execute on function public.finalizar_cadastro_convite(text) to authenticated, service_role;
grant execute on function public.obter_solicitacoes_pendentes() to authenticated, service_role;
grant execute on function public.recusar_convite(text) to authenticated, service_role;
grant execute on function public.submeter_anamnese_autenticado(jsonb, uuid, text) to authenticated, service_role;
grant execute on function public.pode_ler_anexo_paciente(text) to authenticated, service_role;
grant execute on function public.pode_ler_foto_checkin(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Privilégios de tabela. O Supabase concede tudo a anon/authenticated por padrão e a RLS
--    segura o resto, mas TRUNCATE ignora RLS e anon não usa tabela nenhuma (fluxo público é
--    por RPC). `profissoes` (lista da tela de cadastro) e `alimentos_taco` seguem legíveis.
-- ---------------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

revoke all on all tables in schema public from anon;
grant select on public.profissoes, public.alimentos_taco to anon;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated;

-- ---------------------------------------------------------------------------
-- 8. Teto de tamanho nos buckets (upload sem limite = custo e abuso). Tipos MIME ficam de fora
--    de propósito: o Blob do React Native às vezes sobe sem Content-Type, e travar por MIME
--    sem teste em aparelho derrubaria upload legítimo.
-- ---------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 15728640
 where id in ('fotos-checkin', 'fotos-anamnese', 'anexos-paciente', 'documentos-profissionais');

update storage.buckets
   set file_size_limit = 5242880
 where id = 'exercicios-ilustracoes';
