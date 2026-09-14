-- Selo de verificado pro paciente (Guilherme, 14/set): badge visual (tipo o azul do Meta, na
-- cor da marca) em cima de `professional_verificacoes.status = 'aprovado'`, mais a bio do
-- profissional, aparecendo no card de "Meus profissionais" do aluno.
--
-- `professional_verificacoes` tem RLS restrita a `professional_id = auth.uid() or is_admin()`
-- (§0/§8 do handoff) de propósito — guarda CPF, número de registro e caminho do documento, e
-- paciente não deveria ler nada disso direto da tabela. Essa RPC SECURITY DEFINER expõe só o
-- que o paciente precisa pro selo (bool `verificado` + `bio`), reusando `is_client_of()` pra
-- garantir que só quem é cliente ativo daquele profissional (ou o próprio profissional
-- perguntando sobre si mesmo) recebe alguma coisa — sem novo acesso de tabela, sem vazar CPF/
-- número de registro/documento.
create or replace function public.obter_selo_profissionais(p_professional_ids uuid[])
returns table (professional_id uuid, verificado boolean, bio text)
language sql
security definer
set search_path = public
as $function$
  select v.professional_id, (v.status = 'aprovado') as verificado, v.bio
  from public.professional_verificacoes v
  where v.professional_id = any(p_professional_ids)
    and (v.professional_id = auth.uid() or public.is_client_of(v.professional_id));
$function$;

-- `revoke ... from public` sozinho NÃO tira o EXECUTE que o Supabase concede a `anon` por
-- padrão em toda função nova do schema `public` (grant direto, não via PUBLIC) — achado ao
-- conferir `information_schema.routine_privileges` depois de aplicar: `anon` aparecia com
-- EXECUTE mesmo com o revoke de PUBLIC feito. Precisa revogar de `anon` explicitamente, mesmo
-- padrão que os 4 helpers (`is_trainer`/`is_professional`/`is_professional_of`/`is_client_of`)
-- já usavam (§0 do handoff) — só que a checagem ao vivo (14/set) mostrou que os 4 helpers
-- **regrediram**: estão com EXECUTE em `PUBLIC` de novo (registrado como achado aberto no
-- handoff, correção separada, fora do escopo desta migração).
revoke all on function public.obter_selo_profissionais(uuid[]) from public;
grant execute on function public.obter_selo_profissionais(uuid[]) to authenticated;
revoke execute on function public.obter_selo_profissionais(uuid[]) from anon;
