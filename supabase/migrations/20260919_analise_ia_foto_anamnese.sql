-- Análise automática da foto da anamnese por IA com visão (Guilherme, 19/set) — pedido
-- explícito dele: mesma análise que já existe pras fotos de check-in (§56), agora também na
-- foto opcional da anamnese (§59). Reverte a decisão original do §59 ("sem análise por IA,
-- não foi pedido") — foi pedido agora.
--
-- Diferença de desenho em relação a `analises_fotos_checkin` (§56): a anamnese tem só 1 foto
-- "atual" (não uma série ao longo do tempo como check-in, que tem N envios) — por isso a
-- análise é upsert por paciente (`client_id` é a própria chave primária), reanalisada sempre
-- que a foto trocar, sem conceito de "check-in anterior" pra comparar.
--
-- LGPD — mesma sensibilidade do §56 (ação pendente, mesmo termo de consentimento): FOTO do
-- corpo do paciente pra Anthropic é transferência internacional de dado biométrico, categoria
-- mais sensível que texto de anamnese. Sign-off do Guilherme antes de uso real com paciente
-- continua pendente (ver HANDOFF §56/§59) — implementado a pedido dele nesta sessão, ele decide
-- quando abrir pra paciente de verdade.
--
-- Decisão de produto: resultado só pro profissional (nunca pro paciente) — mesmo raciocínio do
-- §56 (apoio técnico/clínico, não conteúdo pra paciente interpretar sozinho sem contexto).

alter table public.ia_geracoes
  drop constraint ia_geracoes_tipo_check;
alter table public.ia_geracoes
  add constraint ia_geracoes_tipo_check
  check (tipo in ('treino', 'dieta', 'analise_fotos', 'analise_foto_anamnese'));

create table public.analise_foto_anamnese (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  foto_path text not null,
  resumo text not null,
  indicadores jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.analise_foto_anamnese enable row level security;

-- Só o profissional vinculado (assinatura ativa) lê — mesma checagem de
-- `analises_fotos_checkin_select` (§56), via `is_professional_of`. Paciente nunca lê esta
-- tabela, de propósito.
create policy analise_foto_anamnese_select on public.analise_foto_anamnese
  for select to authenticated
  using (is_professional_of(client_id));

-- Sem policy de insert/update/delete pra `authenticated` de propósito: só a edge function
-- (service role) grava aqui — mesmo padrão de `analises_fotos_checkin`/`ia_geracoes`.
