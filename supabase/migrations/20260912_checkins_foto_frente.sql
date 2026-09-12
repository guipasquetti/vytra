-- Quarto ângulo do progresso visual (pedido do Guilherme, 12/set): faltava foto de frente,
-- só existiam perfil esquerdo/direito/costas. Mesmo padrão das outras 3 — nullable, opcional,
-- mesma RLS de select/insert (escopada por subscription_id) e o mesmo bucket privado
-- `fotos-checkin`, sem policy nova: `pode_ler_foto_checkin` já verifica as 3 colunas antigas
-- e passa a verificar as 4.

alter table public.check_ins
  add column if not exists foto_frente_path text;

create or replace function public.pode_ler_foto_checkin(p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.check_ins ci
    join public.subscriptions s on s.id = ci.subscription_id
    where p_caminho in (
      ci.foto_frente_path,
      ci.foto_perfil_esquerdo_path,
      ci.foto_perfil_direito_path,
      ci.foto_costas_path
    )
      and s.professional_id = auth.uid()
      and s.status = 'ativa'
  );
$function$;
