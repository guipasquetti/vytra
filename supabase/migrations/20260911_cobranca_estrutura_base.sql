-- Estrutura base de cobrança (Asaas — sub-conta por profissional dentro da conta master
-- da Vytra). Decisões e desenho completo: HANDOFF.md §7 e
-- https://claude.ai/code/artifact/7b1e541b-6e03-4a79-b813-a3a352b6e368
--
-- Escopo desta migração: só a fundação (colunas + tabelas + RLS). Nenhum valor de
-- segredo/API key entra aqui — chave master fica em Edge Function secret, chave/token
-- por sub-conta (se o Asaas emitir um) vai em Supabase Vault, nunca em coluna de tabela
-- nem em migração versionada no git.

-- periodicidade era texto livre; fecha ao conjunto que a Vytra realmente vende, sem
-- virar enum de banco (mesmo padrão já usado em professionals.especialidade,
-- subscriptions.status, convites.status — texto + CHECK, mais fácil de estender depois,
-- como já aconteceu com convites.status ganhando 'recusado').
alter table public.professional_plans
  add constraint professional_plans_periodicidade_check
  check (periodicidade in ('mensal', 'trimestral', 'semestral', 'anual'));

-- billing_status fica SEPARADO de subscriptions.status de propósito: is_professional_of()
-- e is_client_of() dependem de status = 'ativa' em toda a RLS do projeto. Se inadimplência
-- fosse gravada em status, o profissional perderia a visibilidade do próprio paciente
-- inadimplente (e o paciente perderia acesso a professional_plans_select via
-- is_client_of) no exato momento em que mais precisam ver esse dado. billing_status é só
-- um gate de leitura na aplicação (Treino/Dieta), nunca entra em policy de RLS.
--
-- default 'ativo' nos dois casos preserva o comportamento atual de todo mundo (Tassis e
-- o aluno dele) sem precisar de backfill — mesma lógica já usada em
-- plans.publicado/planos_alimentares.publicado (20260906_plans_rascunho_publicado.sql).
-- Só passa a valer alguma coisa quando a integração de cobrança de fato criar uma
-- assinatura e começar a setar 'pendente'/'inadimplente'.
alter table public.subscriptions
  add column billing_status text not null default 'ativo',
  add constraint subscriptions_billing_status_check
  check (billing_status in ('ativo', 'pendente', 'inadimplente'));

alter table public.professionals
  add column billing_status text not null default 'ativo',
  add constraint professionals_billing_status_check
  check (billing_status in ('ativo', 'pendente', 'inadimplente')),
  add column asaas_subconta_id text;

-- Ledger de cobrança — estado atual por cobrança (paciente→profissional OU
-- profissional→Vytra, nunca as duas), upsert por gateway_charge_id pra aguentar retry de
-- webhook sem duplicar. Mesmo padrão de alvo-exclusivo do atendimentos_alvo_check
-- (20260904_leads_atendimentos.sql).
create table public.cobrancas (
  id uuid default gen_random_uuid() not null primary key,
  tipo text not null check (tipo in ('paciente', 'profissional')),
  subscription_id uuid references public.subscriptions(id),
  professional_id uuid references public.professionals(id),
  valor_centavos integer not null,
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'falhou', 'estornado')),
  gateway_charge_id text not null,
  ciclo_referencia date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cobrancas_gateway_charge_id_key unique (gateway_charge_id),
  constraint cobrancas_alvo_check check (
    (tipo = 'paciente' and subscription_id is not null and professional_id is null)
    or
    (tipo = 'profissional' and professional_id is not null and subscription_id is null)
  )
);

-- Log bruto de cada evento de webhook recebido, nunca sobrescrito — auditoria de verdade
-- (o que o Asaas mandou, quando), separado do estado atual em `cobrancas`. Mesma regra de
-- série temporal imutável já usada em check_ins/workout_logs.
create table public.cobranca_eventos (
  id uuid default gen_random_uuid() not null primary key,
  cobranca_id uuid not null references public.cobrancas(id),
  evento text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.cobrancas enable row level security;
alter table public.cobranca_eventos enable row level security;

-- Paciente lê só a própria cobrança.
create policy cobrancas_select_paciente on public.cobrancas
  for select to authenticated
  using (
    tipo = 'paciente'
    and exists (
      select 1 from public.subscriptions s
      where s.id = cobrancas.subscription_id and s.patient_id = auth.uid()
    )
  );

-- Profissional lê a cobrança dos próprios pacientes e a própria fatura Vytra.
create policy cobrancas_select_profissional on public.cobrancas
  for select to authenticated
  using (
    (tipo = 'paciente' and exists (
      select 1 from public.subscriptions s
      where s.id = cobrancas.subscription_id and s.professional_id = auth.uid()
    ))
    or
    (tipo = 'profissional' and professional_id = auth.uid())
  );

-- Sem policy de insert/update/delete pra anon/authenticated em nenhuma das duas tabelas
-- de propósito: só a Edge Function do webhook escreve, com a service_role key, que
-- ignora RLS por padrão. cobranca_eventos não tem policy de select nenhuma — é log de
-- auditoria, não precisa aparecer em tela nenhuma.
