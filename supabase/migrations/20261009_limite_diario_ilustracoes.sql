-- Teto de custo da geração de ilustração (revisão de 09/out/2026, HANDOFF §73).
--
-- A Edge Function `generate-exercise-illustration` só gera imagem (OpenAI, paga, grava em bucket
-- público) para linhas que conseguiu inserir em `exercicios_ilustracoes`. Esta trava corta no
-- banco, independente do deploy da função: passou do limite do dia, o INSERT falha, nenhuma linha
-- nasce e nenhuma chamada à OpenAI é feita. Mesmo teto (40/dia) que a versão nova da função aplica.
create or replace function public.exercicios_ilustracoes_limite_diario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*) from public.exercicios_ilustracoes
    where criado_em >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
  ) >= 40 then
    raise exception 'Limite diário de ilustrações atingido.';
  end if;
  return new;
end;
$$;

drop trigger if exists exercicios_ilustracoes_limite_diario on public.exercicios_ilustracoes;
create trigger exercicios_ilustracoes_limite_diario
  before insert on public.exercicios_ilustracoes
  for each row execute function public.exercicios_ilustracoes_limite_diario();
