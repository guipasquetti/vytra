import { supabase } from '@/lib/supabase';
import { normalizarNomeExercicio } from '@/lib/exerciseNormalize';

const BUCKET = 'exercicios-ilustracoes';

export type IlustracaoDinamica = {
  status: 'gerando' | 'pronta' | 'falha';
  /** URL pública — só presente quando `status === 'pronta'`. */
  url?: string;
};

/**
 * Busca em lote (uma query só, nunca uma por exercício) o cache global de ilustração gerada
 * por IA pros nomes informados. Nome ausente na resposta = ainda não existe linha nenhuma
 * (janela curta antes de `dispararGeracaoIlustracoes` criar o registro `gerando`).
 *
 * Chave de retorno é o nome ORIGINAL (não normalizado) — quem chama não precisa normalizar de
 * novo pra casar com `ex.nome`.
 */
export async function buscarIlustracoesDinamicas(
  nomes: string[],
): Promise<Record<string, IlustracaoDinamica>> {
  const porNormalizado = new Map<string, string[]>();
  for (const nome of nomes) {
    const norm = normalizarNomeExercicio(nome);
    (porNormalizado.get(norm) ?? porNormalizado.set(norm, []).get(norm)!).push(nome);
  }
  const normalizados = [...porNormalizado.keys()];
  if (!normalizados.length) return {};

  const { data, error } = await supabase
    .from('exercicios_ilustracoes')
    .select('nome_normalizado, storage_path, status')
    .in('nome_normalizado', normalizados);
  if (error) throw error;

  const resultado: Record<string, IlustracaoDinamica> = {};
  for (const row of data ?? []) {
    const originais = porNormalizado.get(row.nome_normalizado) ?? [];
    const url =
      row.status === 'pronta' && row.storage_path
        ? supabase.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl
        : undefined;
    for (const nomeOriginal of originais) {
      resultado[nomeOriginal] = { status: row.status as IlustracaoDinamica['status'], url };
    }
  }
  return resultado;
}

/**
 * Dispara (fire-and-forget, nunca trava o save) a geração de ilustração pros nomes que ainda
 * não têm — a Edge Function dedupe contra o catálogo estático e a tabela antes de gastar
 * qualquer chamada à OpenAI. Chamado de todo save de plano (manual ou IA), não só do fluxo de IA.
 */
export function dispararGeracaoIlustracoes(nomes: string[]): void {
  const unicos = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))];
  if (!unicos.length) return;
  supabase.functions.invoke('generate-exercise-illustration', { body: { nomes: unicos } }).catch(() => {
    // Nunca deveria travar o fluxo de salvar um plano por causa da ilustração — se falhar,
    // o exercício só fica sem imagem até o próximo save tentar de novo.
  });
}
