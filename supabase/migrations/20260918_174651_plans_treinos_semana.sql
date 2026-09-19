-- Frequência semanal esperada do plano (definida pelo profissional), usada pra calcular
-- persistência em percentual da semana em vez de "dias seguidos" — sem isso, dia de descanso
-- agendado zerava o streak igual dia sem treino de verdade. Nullable/sem default: plano
-- existente sem o campo cai no comportamento antigo (streakTreino), sem precisar backfill.
alter table public.plans add column treinos_semana integer;
