-- Blindagem de responsabilidade — parte técnica (Guilherme, 14/set, motivado pelo caso real do
-- Tassis: NT registrado, monta treino sem CREF). `professional_plans.inclui_treino` era um
-- toggle livre, sem nenhuma checagem contra o registro verificado (§46/§47 do handoff) — um
-- profissional podia habilitar treino sem nunca ter afirmado, nem pra si mesmo, que assume a
-- responsabilidade técnica por isso.
--
-- Essa tabela é o rastro de auditoria dessa afirmação: registro imutável (sem policy de
-- update/delete — ninguém edita depois, nem o próprio profissional) de quando um profissional
-- sem CREF concordou em habilitar treino, com o texto EXATO que ele aceitou (não um ID de
-- versão — se o texto mudar depois, o registro antigo continua provando o que foi aceito
-- naquele momento). `tipo` é texto + CHECK (mesmo padrão de `especialidade`/`periodicidade`/
-- `tipo_registro`) — hoje só cobre treino sem CREF, mas o mesmo mecanismo serve pra qualquer
-- declaração futura (ex.: dieta sem CRN, se algum dia fizer sentido o caminho inverso).
create table public.declaracoes_profissional (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  tipo text not null check (tipo in ('treino_sem_cref')),
  texto text not null,
  created_at timestamptz not null default now()
);

alter table public.declaracoes_profissional enable row level security;

create policy declaracoes_profissional_select_self on public.declaracoes_profissional
  for select using (professional_id = auth.uid() or public.is_admin());

-- Só insert — sem policy de update/delete de propósito, é log de auditoria, não estado
-- editável (mesmo padrão de `cobranca_eventos`).
create policy declaracoes_profissional_insert_self on public.declaracoes_profissional
  for insert with check (professional_id = auth.uid());
