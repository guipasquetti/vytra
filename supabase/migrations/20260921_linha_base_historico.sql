-- Histórico de snapshots da linha de base da anamnese (21/set, pedido do Guilherme: comparativo
-- entre as fotos, "antes x depois" como o check-in já tem, ver `obterComparacaoFotos`). A linha
-- de base (§61) vive num único conjunto que se sobrescreve a cada nova foto
-- (`respostas.__linha_base_*`, upsert em `anamnese`/`anamnese_rascunho`) — sem histórico
-- embutido. Esta tabela grava um snapshot do conjunto {frente, esquerdo, direito, costas} a cada
-- envio explícito da anamnese (onboarding ou reedição), pra dar "primeira x mais recente".
create table public.linha_base_historico (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  fotos jsonb not null,
  criado_em timestamptz not null default now()
);

alter table public.linha_base_historico enable row level security;

-- O próprio paciente grava o snapshot (client-side, ao salvar a anamnese) e também lê o próprio
-- histórico; o profissional vinculado só lê (é ele quem vê o comparativo, mesmo padrão de
-- `analises_fotos_checkin`/`is_professional_of`).
create policy linha_base_historico_insert_own on public.linha_base_historico
  for insert to authenticated
  with check (client_id = auth.uid());

create policy linha_base_historico_select on public.linha_base_historico
  for select to authenticated
  using (client_id = auth.uid() or is_professional_of(client_id));
