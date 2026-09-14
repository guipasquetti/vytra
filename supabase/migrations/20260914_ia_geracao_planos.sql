-- IA gera treino/dieta a partir da anamnese (HANDOFF §30, item 3 reaberto em 14/set — antes
-- descartado por custo de infra). Profissional SEMPRE revisa e publica manualmente; a IA nunca
-- publica sozinha. Ver HANDOFF §40 pro desenho completo.

alter table public.plans
  add column gerado_por_ia boolean not null default false;

alter table public.planos_alimentares
  add column gerado_por_ia boolean not null default false;

-- Rede de segurança no nível do banco: nunca pode existir uma linha com gerado_por_ia=true E
-- publicado=true ao mesmo tempo. A app já limpa gerado_por_ia=false em todo save (inclusive o
-- que publica — ver `salvarPlano`/`salvarPlanoAlimentar`), então isso nunca deveria disparar em
-- uso normal; é rede de segurança contra bug futuro, não caminho esperado.
alter table public.plans
  add constraint plans_ia_exige_revisao check (not (gerado_por_ia and publicado));

alter table public.planos_alimentares
  add constraint planos_alimentares_ia_exige_revisao check (not (gerado_por_ia and publicado));

-- Auditoria de custo real — o motivo do descarte original era "custo de infra" nunca medido de
-- verdade. Cada chamada (sucesso ou falha) grava aqui, dando visibilidade de gasto real.
create table public.ia_geracoes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  tipo text not null check (tipo in ('treino', 'dieta')),
  modelo text not null,
  status text not null check (status in ('sucesso', 'falha_validacao', 'falha_bloqueio', 'falha_api')),
  input_tokens integer,
  output_tokens integer,
  erro text,
  created_at timestamptz not null default now()
);

alter table public.ia_geracoes enable row level security;

-- Só o próprio profissional que gerou vê seu histórico/custo.
create policy ia_geracoes_select on public.ia_geracoes for select to authenticated
  using (professional_id = auth.uid());

-- Sem policy de insert/update/delete pra `authenticated` de propósito: só a edge function
-- (service role, que ignora RLS) grava aqui. O app nunca escreve nessa tabela diretamente.

-- Cache global de ilustração de exercício gerada por IA (OpenAI) — por nome normalizado, não
-- por plano/aluno/profissional: o mesmo exercício gerado uma vez serve pra qualquer plano futuro
-- que usar esse nome, o que limita o custo total ao número de exercícios distintos já vistos.
create table public.exercicios_ilustracoes (
  nome_normalizado text primary key,
  storage_path text,
  status text not null check (status in ('gerando', 'pronta', 'falha')),
  modelo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.exercicios_ilustracoes enable row level security;

-- Não é dado sensível de aluno (é um diagrama genérico de exercício) — qualquer usuário
-- autenticado do app pode ler pra exibir a ilustração no próprio plano.
create policy exercicios_ilustracoes_select on public.exercicios_ilustracoes for select
  to authenticated using (true);

-- Sem policy de insert/update pra `authenticated`: só a edge function (service role) grava.
