-- Reenviar convite pra um lead que já tinha recebido um (Guilherme, 14/set): antes disso o
-- botão "Enviar convite" em pro/leads.tsx só existe quando `lead.convite_id` ainda é nulo —
-- depois de gerado uma vez, não tinha como gerar link novo (ex.: lead perdeu o link, ou o
-- WhatsApp não entregou).
--
-- Não cria linha nova em `convites` (não há unique constraint em lead_id que forçasse isso) —
-- reaproveita a mesma linha, só regenera o token (invalida o link antigo, que fica órfão) e
-- garante status='pendente'. `finalizar_cadastro_convite` (versão atual, ver
-- 20260904_anamnese_pos_login.sql) só aceita `status = 'pendente'`, então resetar o status é
-- o que garante que o link novo funciona mesmo se o convite tivesse ficado em outro estado.
--
-- Sem SECURITY DEFINER de propósito: RLS de `convites` (`convites_professionals_all`) já
-- restringe update a `created_by = auth.uid()` — o invoker herda essa checagem sozinho. O
-- `and created_by = auth.uid()` explícito abaixo é redundante com a RLS, mantido como
-- documentação/defesa em profundidade, não como substituto dela.
create or replace function public.reenviar_convite(p_convite_id uuid)
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  v_token text := gen_random_uuid()::text;
begin
  update public.convites
  set token = v_token, status = 'pendente'
  where id = p_convite_id and created_by = auth.uid() and status <> 'concluido';

  if not found then
    return null;
  end if;
  return v_token;
end;
$function$;
