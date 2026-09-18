-- Análise automática de fotos de check-in por IA com visão (Guilherme, 18/set) — apoio visual
-- pro profissional (proporção/postura/simetria, evolução desde o check-in anterior quando
-- existe foto pra comparar), nunca diagnóstico. Dispara sozinha a cada check-in com pelo menos
-- 1 foto, mesmo padrão de "sem retry automático, bloqueio gracioso" do §40 (IA treino/dieta).
--
-- Sensibilidade LGPD acima do que já existe (ação pendente, ver HANDOFF §40/§56): enquanto a
-- anamnese manda só texto curado, aqui vai IMAGEM do corpo do paciente pra Anthropic —
-- transferência internacional de dado biométrico, não só saúde em texto. O termo de
-- consentimento (fora do repo, ver §14/§40) precisa cobrir isso explicitamente antes de
-- qualquer paciente real passar por essa tela — sign-off do Guilherme, não é decisão só de
-- engenharia. Implementado a pedido dele nesta sessão; o gate de uso real continua sendo ele
-- decidir quando ligar pra pacientes de verdade.
--
-- Decisão de produto: resultado é visível só pro profissional (nunca pro próprio paciente) —
-- é leitura de apoio clínico/técnico, tipo prontuário, não conteúdo pra paciente interpretar
-- sozinho sem contexto.

alter table public.ia_geracoes
  drop constraint ia_geracoes_tipo_check;
alter table public.ia_geracoes
  add constraint ia_geracoes_tipo_check check (tipo in ('treino', 'dieta', 'analise_fotos'));

create table public.analises_fotos_checkin (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  checkin_id uuid not null references public.check_ins(id) on delete cascade,
  -- Check-in usado como base de comparação (o mais recente ANTERIOR com foto, mesma
  -- assinatura) — nulo quando esse foi o primeiro check-in com foto do paciente.
  checkin_anterior_id uuid references public.check_ins(id) on delete set null,
  resumo text not null,
  indicadores jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (checkin_id)
);

alter table public.analises_fotos_checkin enable row level security;

-- Só o profissional com assinatura ativa daquele paciente lê — mesma checagem de
-- `pode_ler_foto_checkin` (§54/§9). Paciente nunca lê essa tabela, de propósito (ver acima).
create policy analises_fotos_checkin_select on public.analises_fotos_checkin
  for select to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      where s.id = subscription_id
        and s.professional_id = auth.uid()
        and s.status = 'ativa'
    )
  );

-- Sem policy de insert/update/delete pra `authenticated` de propósito: só a edge function
-- (service role) grava aqui — mesmo padrão de `ia_geracoes`/`exercicios_ilustracoes`.
