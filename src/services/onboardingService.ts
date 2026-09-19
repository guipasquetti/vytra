import { supabase } from '@/lib/supabase';
import type { RespostasAnamnese } from '@/models/anamnese';

/** Se já existe anamnese pra este cliente — gate de onboarding em `aluno/_layout.tsx`. */
export async function possuiAnamnese(clientId: string): Promise<boolean> {
  const { data } = await supabase
    .from('anamnese')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle();
  return !!data;
}

/**
 * Paciente autenticado grava a própria anamnese e o plano que quer comprar, num passo só,
 * dentro do app (§12, 04/set). RLS não deixa o paciente escrever direto em `anamnese` nem
 * `subscriptions` — por isso sai por RPC `security definer`, escopada em `auth.uid()`.
 * `planoId` vira `subscriptions.plano_solicitado_id` (pedido do paciente) — quem confirma de
 * verdade (`plan_id`, o que libera treino/dieta) é o profissional, depois de revisar.
 * `fotoPath` é o caminho no bucket privado `fotos-anamnese` (19/set) — a RPC preserva o valor
 * anterior quando chamada sem foto nova (`coalesce`), então reenviar o formulário sem trocar a
 * foto não apaga a que já estava lá.
 */
export async function submeterAnamneseEPlano(
  respostas: RespostasAnamnese,
  planoId: string | null,
  fotoPath?: string | null
): Promise<boolean> {
  const { data, error } = await supabase.rpc('submeter_anamnese_autenticado', {
    p_respostas: respostas,
    p_plano_id: planoId ?? undefined,
    p_foto_path: fotoPath ?? undefined,
  });
  if (error) throw error;
  return data === true;
}

export type RascunhoAnamnese = {
  respostas: RespostasAnamnese;
  planoId: string | null;
  fotoPath: string | null;
};

/**
 * Rascunho da anamnese salvo no servidor (19/set) — tabela própria `anamnese_rascunho`, nunca
 * a `anamnese` final: `possuiAnamnese()` acima checa só a EXISTÊNCIA da linha, sem exigir campo
 * nenhum preenchido, então autosalvar direto na tabela final liberaria o paciente pras abas do
 * app na primeira letra digitada, pulando a escolha do plano. RLS restringe ao próprio
 * paciente (`client_id = auth.uid()`), mesmo padrão de `workout_drafts`. Complementa (não
 * substitui) o rascunho local em `AsyncStorage`: local cobre perda de rede no meio da digitação,
 * servidor cobre trocar de aparelho.
 */
export async function obterRascunhoAnamnese(clientId: string): Promise<RascunhoAnamnese | null> {
  const { data, error } = await supabase
    .from('anamnese_rascunho')
    .select('respostas, plano_id, foto_path')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    respostas: (data.respostas ?? {}) as RespostasAnamnese,
    planoId: data.plano_id,
    fotoPath: data.foto_path,
  };
}

export async function salvarRascunhoAnamnese(
  clientId: string,
  respostas: RespostasAnamnese,
  planoId: string | null,
  fotoPath: string | null
): Promise<void> {
  const { error } = await supabase.from('anamnese_rascunho').upsert(
    {
      client_id: clientId,
      respostas,
      plano_id: planoId,
      foto_path: fotoPath,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' }
  );
  if (error) throw error;
}
