-- Ajuste da análise de IA da foto da anamnese (21/set) — a foto avulsa do §59 foi substituída
-- pela "linha de base" de 4 poses guiadas (§61, mesmo padrão do check-in, ver `LinhaBaseFotos`
-- em onboarding-anamnese.tsx). A tabela `analise_foto_anamnese` (19/set) ainda guardava um único
-- `foto_path`; troca pra guardar o CONJUNTO de até 4 fotos analisadas junto, mesmo espírito de
-- `analyze-checkin-photos` (§56): uma análise por conjunto, não por ângulo isolado. Tabela vazia
-- em produção (feature nunca chegou a rodar de verdade — sign-off LGPD do §56 segue pendente),
-- seguro trocar sem backfill.
alter table public.analise_foto_anamnese
  drop column foto_path,
  add column fotos jsonb not null default '{}';
