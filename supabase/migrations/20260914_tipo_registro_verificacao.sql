-- Selo com o conselho certo, não a especialidade do Painel (Guilherme, 14/set — ver §45 do
-- handoff). Achado no caso real do Tassis: formado/registrado só em Nutrição (CRN), mas monta
-- alguns treinos por experiência sem ter CREF. `professionals.especialidade` continua
-- controlando só qual Painel/dashboard o profissional usa — nunca deveria ser a fonte do que
-- o selo afirma pro paciente. `numero_registro` já existia como texto livre, sem dizer QUAL
-- conselho é; sem esse dado, um selo com texto ("Nutricionista verificado") teria que
-- adivinhar pelo prefixo do número — frágil. `tipo_registro` guarda isso explícito.
--
-- Texto + CHECK, mesmo padrão já usado em `professionals.especialidade`/
-- `professional_plans.periodicidade`/`subscriptions.status` — mais fácil de estender (ex.:
-- CRP de psicólogo, no dia que a Vytra abrir esse profissional) do que enum de banco.
alter table public.professional_verificacoes
  add column tipo_registro text;

alter table public.professional_verificacoes
  add constraint professional_verificacoes_tipo_registro_check
  check (tipo_registro is null or tipo_registro in ('CREF', 'CRN'));

-- Cadastro novo já sabe o conselho: hoje `especialidade` e `tipo_registro` nascem 1:1 (quem
-- escolhe "Nutricionista" no cadastro só pode enviar CRN). O desalinhamento (caso Tassis) só
-- acontece DEPOIS, quando o profissional muda de especialidade ou soma um registro novo — daí
-- em diante `solicitarAlteracaoCadastro` (app) deixa escolher o tipo de registro direto, sem
-- depender mais da especialidade.
create or replace function public.cadastrar_profissional(
  p_nome text,
  p_especialidade text,
  p_cpf text,
  p_numero_registro text,
  p_uf_registro text,
  p_documento_path text,
  p_bio text DEFAULT NULL::text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_tipo_registro text := case when p_especialidade = 'nutricionista' then 'CRN' else 'CREF' end;
begin
  if v_uid is null then return false; end if;

  update public.profiles set nome = coalesce(nullif(p_nome, ''), nome) where id = v_uid;

  insert into public.professionals (id, especialidade)
  values (v_uid, p_especialidade)
  on conflict (id) do update set especialidade = excluded.especialidade;

  insert into public.professional_verificacoes
    (professional_id, cpf, numero_registro, uf_registro, tipo_registro, documento_path, bio, status)
  values (v_uid, p_cpf, p_numero_registro, p_uf_registro, v_tipo_registro, p_documento_path, p_bio, 'pendente')
  on conflict (professional_id) do update set
    cpf = excluded.cpf,
    numero_registro = excluded.numero_registro,
    uf_registro = excluded.uf_registro,
    tipo_registro = excluded.tipo_registro,
    documento_path = excluded.documento_path,
    bio = excluded.bio,
    status = 'pendente',
    motivo_rejeicao = null,
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now();

  return true;
end;
$function$;

-- Selo do paciente agora também devolve o conselho, pro rótulo do badge.
create or replace function public.obter_selo_profissionais(p_professional_ids uuid[])
returns table (professional_id uuid, verificado boolean, bio text, tipo_registro text)
language sql
security definer
set search_path = public
as $function$
  select v.professional_id, (v.status = 'aprovado') as verificado, v.bio, v.tipo_registro
  from public.professional_verificacoes v
  where v.professional_id = any(p_professional_ids)
    and (v.professional_id = auth.uid() or public.is_client_of(v.professional_id));
$function$;

revoke all on function public.obter_selo_profissionais(uuid[]) from public;
grant execute on function public.obter_selo_profissionais(uuid[]) to authenticated;
revoke execute on function public.obter_selo_profissionais(uuid[]) from anon;

-- Caso real que motivou tudo isso (Tassis Morais, a48c2932-d38b-44b5-941b-c0cf87d538a9):
-- formado/registrado em Nutrição (CRN-3 96720/SP, aprovado nesta sessão pra teste visual do
-- selo), monta alguns treinos por experiência sem CREF. `especialidade` vira o que ele
-- realmente é formado pra ser — Painel dele passa a ser o de nutricionista (§45), mas os
-- indicadores de treino (`gestaoService.ts`/`pro/index.tsx`) já foram trocados pra olhar o
-- plano de CADA paciente (`professional_plans.inclui_treino`), não mais a especialidade do
-- profissional — ele continua vendo métrica de treino de quem ele treina de verdade.
update public.professional_verificacoes
set tipo_registro = 'CRN'
where professional_id = 'a48c2932-d38b-44b5-941b-c0cf87d538a9';

update public.professionals
set especialidade = 'nutricionista'
where id = 'a48c2932-d38b-44b5-941b-c0cf87d538a9';
