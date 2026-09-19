-- Catálogo de profissões + registros 1:N por profissional (Guilherme, 19/set).
--
-- Motivo: `professional_verificacoes.tipo_registro` só aceitava CREF/CRN, um por profissional.
-- A Vytra vai abrir para outras profissões (fisioterapia primeiro), e o caso real do Tassis
-- (CRN aprovado, pode somar CREF depois) pede mais de um registro por pessoa, cada um com a
-- própria verificação. Abrir profissão nova passa a ser uma linha em `profissoes`, sem migração.
--
-- Migração ADITIVA e compatível com o app em produção antes do deploy novo:
-- - `professional_verificacoes` continua existindo e guardando o que é da CONTA (CPF, bio,
--   status geral usado no banner de verificação). `tipo_registro`/`numero_registro`/
--   `uf_registro` ficam como legado, ainda preenchidos pelo cadastro pra não quebrar o app antigo.
-- - `obter_selo_profissionais` mantém as colunas antigas e ganha `areas` (siglas das áreas
--   verificadas). O app antigo ignora a coluna nova.
-- - `cadastrar_profissional` ganha `p_profissao` com default: chamada antiga (7 args) segue válida.
--
-- Lente §0 (segurança/LGPD): número de registro e documento ficam em `professional_registros`,
-- legível só pelo próprio profissional e pelo admin. Paciente continua recebendo só a sigla da
-- área pelo RPC do selo. Escrita de registro só por RPC SECURITY DEFINER: o client nunca grava
-- status, reviewed_by ou reviewed_at direto.

-- 1. Catálogo -------------------------------------------------------------------------------
create table public.profissoes (
  codigo text primary key,
  nome text not null,                 -- rótulo por extenso, usado em formulário
  sigla_selo text not null unique,    -- rótulo compacto do selo (decisão 14/set: sigla, não nome)
  conselho_sigla text,                -- null = profissão sem conselho (possível no futuro)
  conselho_nome text,
  url_consulta text,                  -- onde o admin confere o registro
  modulos text[] not null default '{}' check (modulos <@ array['dieta', 'treino']),
  painel text not null default 'personal_trainer'
    check (painel in ('nutricionista', 'personal_trainer')), -- valor gravado em professionals.especialidade
  ativo boolean not null default false, -- aparece no cadastro
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profissoes enable row level security;

-- Catálogo é informação pública (nenhum dado pessoal) e o cadastro de profissional começa
-- sem sessão, então anon também lê.
create policy profissoes_select on public.profissoes for select using (true);
create policy profissoes_admin_write on public.profissoes for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.profissoes
  (codigo, nome, sigla_selo, conselho_sigla, conselho_nome, url_consulta, modulos, painel, ativo, ordem)
values
  ('nutricao', 'Nutrição', 'NT', 'CRN', 'Conselho Regional de Nutricionistas',
   'https://www.cfn.org.br', '{dieta}', 'nutricionista', true, 1),
  ('educacao_fisica', 'Educação física', 'EF', 'CREF', 'Conselho Regional de Educação Física',
   'https://www.confef.org.br', '{treino}', 'personal_trainer', true, 2),
  -- Cadastrada inativa: pronta no catálogo, fora do cadastro até decidir quais módulos cobre.
  ('fisioterapia', 'Fisioterapia', 'FT', 'CREFITO',
   'Conselho Regional de Fisioterapia e Terapia Ocupacional',
   'https://www.coffito.gov.br', '{}', 'personal_trainer', false, 3);

-- 2. Registros ------------------------------------------------------------------------------
create table public.professional_registros (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  profissao text not null references public.profissoes(codigo),
  numero text not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  documento_path text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  motivo_rejeicao text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, profissao)
);

create index professional_registros_status_idx on public.professional_registros (status);

alter table public.professional_registros enable row level security;

create policy professional_registros_select on public.professional_registros
  for select using (professional_id = auth.uid() or public.is_admin());
-- Sem policy de insert/update/delete: escrita só pelas RPCs abaixo.

-- Backfill a partir da verificação atual (hoje: 1 linha, Tassis, CRN aprovado).
insert into public.professional_registros
  (professional_id, profissao, numero, uf, documento_path, status, motivo_rejeicao,
   reviewed_by, reviewed_at, created_at, updated_at)
select v.professional_id,
       case coalesce(v.tipo_registro, case when p.especialidade = 'nutricionista' then 'CRN' else 'CREF' end)
         when 'CRN' then 'nutricao' else 'educacao_fisica' end,
       v.numero_registro, upper(v.uf_registro), v.documento_path, v.status, v.motivo_rejeicao,
       v.reviewed_by, v.reviewed_at, v.created_at, v.updated_at
from public.professional_verificacoes v
join public.professionals p on p.id = v.professional_id
on conflict (professional_id, profissao) do nothing;

-- 3. RPCs do profissional -------------------------------------------------------------------

-- Cria ou atualiza UM registro, sempre voltando ele (e só ele) pra 'pendente'. Os outros
-- registros aprovados do mesmo profissional seguem valendo no selo.
create function public.solicitar_registro(
  p_profissao text,
  p_numero text,
  p_uf text,
  p_documento_path text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'sem sessão'; end if;
  if not exists (select 1 from public.professionals where id = v_uid) then
    raise exception 'conta não é de profissional';
  end if;
  if not exists (select 1 from public.profissoes where codigo = p_profissao and ativo) then
    raise exception 'profissão indisponível';
  end if;
  if coalesce(trim(p_numero), '') = '' then raise exception 'número do registro obrigatório'; end if;
  if p_documento_path is not null and split_part(p_documento_path, '/', 1) <> v_uid::text then
    raise exception 'documento fora da pasta do profissional';
  end if;

  insert into public.professional_registros (professional_id, profissao, numero, uf, documento_path)
  values (v_uid, p_profissao, trim(p_numero), upper(trim(p_uf)), p_documento_path)
  on conflict (professional_id, profissao) do update set
    numero = excluded.numero,
    uf = excluded.uf,
    documento_path = coalesce(excluded.documento_path, professional_registros.documento_path),
    status = 'pendente',
    motivo_rejeicao = null,
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

-- Bio deixa de reabrir a verificação: antes, editar só a bio passava pelo update com
-- status = 'pendente' e derrubava o selo.
create function public.atualizar_minha_bio(p_bio text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.professional_verificacoes
  set bio = nullif(trim(p_bio), ''), updated_at = now()
  where professional_id = auth.uid();
$function$;

-- 4. RPC do admin ---------------------------------------------------------------------------
-- Aprovar o primeiro registro também aprova a conta (banner some). Rejeitar só mexe na conta
-- quando ela ainda não tem nenhum registro aprovado.
create function public.revisar_registro(p_registro_id uuid, p_aprovar boolean, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
  v_prof uuid;
begin
  if not public.is_admin() then raise exception 'restrito ao admin'; end if;
  if not p_aprovar and coalesce(trim(p_motivo), '') = '' then
    raise exception 'motivo obrigatório para rejeitar';
  end if;

  update public.professional_registros
  set status = case when p_aprovar then 'aprovado' else 'rejeitado' end,
      motivo_rejeicao = case when p_aprovar then null else trim(p_motivo) end,
      reviewed_by = v_admin,
      reviewed_at = now(),
      updated_at = now()
  where id = p_registro_id
  returning professional_id into v_prof;

  if v_prof is null then raise exception 'registro não encontrado'; end if;

  if p_aprovar then
    update public.professional_verificacoes
    set status = 'aprovado', motivo_rejeicao = null, reviewed_by = v_admin, reviewed_at = now(), updated_at = now()
    where professional_id = v_prof and status <> 'aprovado';
  elsif not exists (
    select 1 from public.professional_registros where professional_id = v_prof and status = 'aprovado'
  ) then
    update public.professional_verificacoes
    set status = 'rejeitado', motivo_rejeicao = trim(p_motivo), reviewed_by = v_admin, reviewed_at = now(), updated_at = now()
    where professional_id = v_prof;
  end if;
end;
$function$;

-- 5. Cadastro (compatível com a chamada antiga) ---------------------------------------------
drop function public.cadastrar_profissional(text, text, text, text, text, text, text);

create function public.cadastrar_profissional(
  p_nome text,
  p_especialidade text,
  p_cpf text,
  p_numero_registro text,
  p_uf_registro text,
  p_documento_path text,
  p_bio text default null,
  p_profissao text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profissao public.profissoes%rowtype;
begin
  if v_uid is null then return false; end if;

  -- App antigo não manda p_profissao: deriva da especialidade, como antes.
  select * into v_profissao from public.profissoes
  where codigo = coalesce(p_profissao, case when p_especialidade = 'nutricionista' then 'nutricao' else 'educacao_fisica' end)
    and ativo;
  if not found then return false; end if;

  update public.profiles set nome = coalesce(nullif(p_nome, ''), nome) where id = v_uid;

  insert into public.professionals (id, especialidade)
  values (v_uid, v_profissao.painel)
  on conflict (id) do update set especialidade = excluded.especialidade;

  insert into public.professional_verificacoes
    (professional_id, cpf, numero_registro, uf_registro, tipo_registro, documento_path, bio, status)
  values (v_uid, p_cpf, p_numero_registro, upper(p_uf_registro),
          case when v_profissao.conselho_sigla in ('CREF', 'CRN') then v_profissao.conselho_sigla end,
          p_documento_path, p_bio, 'pendente')
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

  insert into public.professional_registros (professional_id, profissao, numero, uf, documento_path)
  values (v_uid, v_profissao.codigo, trim(p_numero_registro), upper(trim(p_uf_registro)), p_documento_path)
  on conflict (professional_id, profissao) do update set
    numero = excluded.numero, uf = excluded.uf, documento_path = excluded.documento_path,
    status = 'pendente', motivo_rejeicao = null, reviewed_by = null, reviewed_at = null, updated_at = now();

  return true;
end;
$function$;

-- 6. Selo do paciente: + áreas verificadas --------------------------------------------------
drop function public.obter_selo_profissionais(uuid[]);

create function public.obter_selo_profissionais(p_professional_ids uuid[])
returns table (professional_id uuid, verificado boolean, bio text, tipo_registro text, areas text[])
language sql
security definer
set search_path = public
as $function$
  select v.professional_id,
         exists (select 1 from public.professional_registros r
                 where r.professional_id = v.professional_id and r.status = 'aprovado') as verificado,
         v.bio,
         v.tipo_registro,
         coalesce((select array_agg(pr.sigla_selo order by pr.ordem)
                   from public.professional_registros r
                   join public.profissoes pr on pr.codigo = r.profissao
                   where r.professional_id = v.professional_id and r.status = 'aprovado'), '{}') as areas
  from public.professional_verificacoes v
  where v.professional_id = any(p_professional_ids)
    and (v.professional_id = auth.uid() or public.is_client_of(v.professional_id));
$function$;

-- 7. Declaração genérica de treino ----------------------------------------------------------
-- 'treino_sem_cref' continua válido (histórico imutável); o novo tipo vale para qualquer
-- profissional sem registro verificado numa profissão que cubra o módulo de treino.
alter table public.declaracoes_profissional drop constraint declaracoes_profissional_tipo_check;
alter table public.declaracoes_profissional add constraint declaracoes_profissional_tipo_check
  check (tipo in ('treino_sem_cref', 'treino_sem_registro'));

-- 8. Permissões ------------------------------------------------------------------------------
-- Supabase concede EXECUTE a anon/authenticated direto em função nova (§45): revogar nomeado.
revoke all on function public.solicitar_registro(text, text, text, text) from public, anon;
grant execute on function public.solicitar_registro(text, text, text, text) to authenticated;

revoke all on function public.atualizar_minha_bio(text) from public, anon;
grant execute on function public.atualizar_minha_bio(text) to authenticated;

revoke all on function public.revisar_registro(uuid, boolean, text) from public, anon;
grant execute on function public.revisar_registro(uuid, boolean, text) to authenticated;

revoke all on function public.obter_selo_profissionais(uuid[]) from public, anon;
grant execute on function public.obter_selo_profissionais(uuid[]) to authenticated;

revoke all on function public.cadastrar_profissional(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.cadastrar_profissional(text, text, text, text, text, text, text, text) to authenticated;
