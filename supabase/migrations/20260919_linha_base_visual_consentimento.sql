-- Consentimento específico para a linha de base visual da anamnese.
create table public.consentimentos_imagem (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  versao text not null,
  texto_hash text not null,
  aceito_em timestamptz not null default now(),
  revogado_em timestamptz,
  unique (client_id, versao)
);
alter table public.consentimentos_imagem enable row level security;
create policy consentimentos_imagem_paciente on public.consentimentos_imagem for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy consentimentos_imagem_profissional on public.consentimentos_imagem for select to authenticated
  using (is_professional_of(client_id));

alter table public.anamnese add column fotos_linha_base jsonb not null default '{}'::jsonb;
alter table public.anamnese_rascunho add column fotos_linha_base jsonb not null default '{}'::jsonb;
