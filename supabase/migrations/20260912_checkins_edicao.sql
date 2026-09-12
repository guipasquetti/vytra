-- Correção do check-in mais recente (pedido do Guilherme, 12/set): até aqui `check_ins` era
-- estritamente append-only (§14) — um envio errado só podia virar um novo envio. Decisão dele:
-- o paciente pode CORRIGIR o check-in que acabou de enviar (erro de digitação, foto errada),
-- dentro de uma janela curta — não é reabrir o histórico inteiro pra edição livre.
--
-- Lente de segurança/LGPD (§0): update em dado de saúde é superfície nova. Duas travas:
-- 1. Janela de tempo curta (24h) a partir do `created_at` original — não dá pra "reabrir"
--    depois disso, e a janela não se estende reeditando (é sempre contra o created_at, que
--    o update não toca).
-- 2. Trigger dedicada impede trocar `client_id`/`professional_id`/`subscription_id` no update
--    — sem isso, a RLS por si só permitiria, na teoria, "mover" um check-in pra outro
--    acompanhamento válido do mesmo paciente (ex.: de nutricionista pra educador físico).

create or replace function public.check_ins_impede_troca_vinculo()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.client_id <> old.client_id
    or new.professional_id <> old.professional_id
    or new.subscription_id <> old.subscription_id then
    raise exception 'Não é possível trocar o vínculo de um check-in já enviado.';
  end if;
  return new;
end;
$function$;

create trigger check_ins_impede_troca_vinculo
  before update on public.check_ins
  for each row execute function public.check_ins_impede_troca_vinculo();

-- Paciente corrige só o próprio check-in, só dentro de 24h do envio original, só se o
-- acompanhamento continuar ativo (mesma condição já usada pra inserir).
create policy check_ins_update_self on public.check_ins
  for update to authenticated
  using (
    client_id = auth.uid()
    and created_at > now() - interval '24 hours'
    and exists (
      select 1
      from public.subscriptions s
      where s.id = subscription_id
        and s.patient_id = auth.uid()
        and s.professional_id = professional_id
        and s.status = 'ativa'
    )
  )
  with check (
    client_id = auth.uid()
    and created_at > now() - interval '24 hours'
  );
