-- Corrige drift achado ao aplicar a migração `20260914_selo_profissional.sql` (§45 do
-- handoff): os 4 helpers de RLS (`is_trainer`/`is_professional`/`is_professional_of`/
-- `is_client_of`) estavam registrados no §0 como "EXECUTE revogado de anon, mantido pra
-- authenticated", mas uma checagem ao vivo em `information_schema.routine_privileges` (14/set)
-- mostrou os 4 com EXECUTE em PUBLIC de novo — provável recriação (`create or replace
-- function`) em algum momento entre 04/set e agora sem reaplicar o revoke, já que
-- CREATE OR REPLACE preserva ACLs só quando não passa por um DROP+CREATE por trás.
--
-- Risco é baixo (as 4 dependem de auth.uid(), retornam false sem sessão — mesma leitura já
-- feita no §0), mas é drift real do estado documentado. Corrige de volta ao estado pretendido.
revoke execute on function public.is_trainer() from public;
revoke execute on function public.is_professional() from public;
revoke execute on function public.is_professional_of(uuid) from public;
revoke execute on function public.is_client_of(uuid) from public;

grant execute on function public.is_trainer() to authenticated;
grant execute on function public.is_professional() to authenticated;
grant execute on function public.is_professional_of(uuid) to authenticated;
grant execute on function public.is_client_of(uuid) to authenticated;
