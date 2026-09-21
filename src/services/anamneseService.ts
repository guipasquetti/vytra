import { supabase } from '@/lib/supabase';
import { extrairColunasAnamnese, type RespostasAnamnese } from '@/models/anamnese';

export type AnamneseCompleta = {
  respostasCompletas: RespostasAnamnese;
  atualizadoEm: string;
  solicitadaAtualizacaoEm: string | null;
  fotoPath: string | null;
};

/** Lê a anamnese completa de um cliente — RLS cobre o próprio paciente e o profissional vinculado (`is_professional_of`). */
export async function obterAnamnese(clientId: string): Promise<AnamneseCompleta | null> {
  const { data, error } = await supabase
    .from('anamnese')
    .select('respostas_completas, updated_at, solicitada_atualizacao_em, foto_path')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    respostasCompletas: (data.respostas_completas ?? {}) as RespostasAnamnese,
    atualizadoEm: data.updated_at,
    solicitadaAtualizacaoEm: data.solicitada_atualizacao_em,
    fotoPath: data.foto_path,
  };
}

/**
 * Foto anexada na anamnese — bucket privado próprio (`fotos-anamnese`), mesmo padrão de
 * `uploadFotoCheckin`/`obterUrlFotoCheckin` em `checkinService.ts`: caminho sempre prefixado
 * pelo uid do próprio paciente. Usada pelas 4 poses da linha de base (`LinhaBaseFotos`, §61) —
 * quem dispara a análise de IA é o chamador (`dispararAnaliseFotoAnamnese`, abaixo), porque só
 * ele conhece o conjunto atual das 4 fotos, não só a que acabou de subir.
 */
export async function uploadFotoAnamnese(
  clientId: string,
  arquivo: { uri: string; name: string },
): Promise<string> {
  const extensao = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'jpg';
  const caminho = `${clientId}/${Date.now()}.${extensao}`;
  const resposta = await fetch(arquivo.uri);
  const blob = await resposta.blob();
  const { error } = await supabase.storage
    .from('fotos-anamnese')
    .upload(caminho, blob, { contentType: blob.type || undefined });
  if (error) throw error;
  return caminho;
}

/** Link temporário (1h) pra abrir a foto do bucket privado. */
export async function obterUrlFotoAnamnese(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from('fotos-anamnese').createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}

export type FotosLinhaBaseAnamnese = {
  frente?: string;
  esquerdo?: string;
  direito?: string;
  costas?: string;
};

/**
 * Dispara (fire-and-forget, nunca trava o upload) a análise por IA do CONJUNTO atual de fotos
 * de linha de base — mesmo padrão de `dispararAnaliseFotosCheckin` em `checkinService.ts`
 * (§56), adaptado pras 4 poses da anamnese (§61, pedido do Guilherme: "como as do check-in").
 * Reanalisa o conjunto inteiro a cada foto nova/trocada (upsert por `client_id` na edge
 * function, não série histórica: a anamnese tem só uma linha de base, não uma série ao longo do
 * tempo como o check-in).
 */
export function dispararAnaliseFotoAnamnese(fotos: FotosLinhaBaseAnamnese): void {
  if (!fotos.frente && !fotos.esquerdo && !fotos.direito && !fotos.costas) return;
  supabase.functions.invoke('analyze-anamnese-photo', { body: { fotos } }).catch(() => {
    // Nunca deveria travar o upload da foto por causa da análise — se falhar, o profissional só
    // não vê a análise de IA pra esse conjunto.
  });
}

export type IndicadorAnaliseFotoAnamnese = { rotulo: string; observacao: string };
export type AnaliseFotoAnamnese = {
  fotos: FotosLinhaBaseAnamnese;
  resumo: string;
  indicadores: IndicadorAnaliseFotoAnamnese[];
};

/**
 * Análise de IA da linha de base, se já tiver rodado (background, pode demorar alguns segundos
 * após o upload) — RLS só libera pro profissional vinculado (`is_professional_of`), nunca pro
 * próprio paciente (mesmo padrão de `listarAnalisesFotos` em `checkinService.ts`).
 */
export async function obterAnaliseFotoAnamnese(clientId: string): Promise<AnaliseFotoAnamnese | null> {
  const { data, error } = await supabase
    .from('analise_foto_anamnese')
    .select('fotos, resumo, indicadores')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    fotos: (data.fotos ?? {}) as FotosLinhaBaseAnamnese,
    resumo: data.resumo,
    indicadores: (data.indicadores ?? []) as IndicadorAnaliseFotoAnamnese[],
  };
}

/**
 * Grava um snapshot do conjunto atual de fotos de linha de base (21/set, pedido do Guilherme:
 * comparativo entre as fotos) — chamado a cada envio explícito da anamnese (onboarding ou
 * "Salvar" na reedição, nunca no autosave de texto). Faz um dedup simples contra o último
 * snapshot pra não empilhar linha idêntica a cada save sem foto nova. Sem foto nenhuma no
 * conjunto, não grava nada.
 */
export async function registrarSnapshotLinhaBase(
  clientId: string,
  fotos: FotosLinhaBaseAnamnese,
): Promise<void> {
  if (!fotos.frente && !fotos.esquerdo && !fotos.direito && !fotos.costas) return;
  const { data: ultimo, error: erroUltimo } = await supabase
    .from('linha_base_historico')
    .select('fotos')
    .eq('client_id', clientId)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroUltimo) throw erroUltimo;
  const anterior = (ultimo?.fotos ?? null) as FotosLinhaBaseAnamnese | null;
  const mudou =
    !anterior ||
    anterior.frente !== fotos.frente ||
    anterior.esquerdo !== fotos.esquerdo ||
    anterior.direito !== fotos.direito ||
    anterior.costas !== fotos.costas;
  if (!mudou) return;
  const { error } = await supabase.from('linha_base_historico').insert({ client_id: clientId, fotos });
  if (error) throw error;
}

const ANGULOS_LINHA_BASE = [
  { angulo: 'frente', label: 'Frente' },
  { angulo: 'esquerdo', label: 'Perfil esquerdo' },
  { angulo: 'direito', label: 'Perfil direito' },
  { angulo: 'costas', label: 'Costas' },
] as const;

export type FotoComparacaoLinhaBase = { url: string; data: string };
export type ComparacaoLinhaBase = {
  angulo: 'frente' | 'esquerdo' | 'direito' | 'costas';
  label: string;
  primeira: FotoComparacaoLinhaBase | null;
  ultima: FotoComparacaoLinhaBase | null;
};

/**
 * Comparativo "primeira x mais recente" da linha de base — mesmo padrão de
 * `obterComparacaoFotos` em `checkinService.ts` (§9), adaptado pro histórico de snapshots da
 * anamnese (`linha_base_historico`, acima). Só devolve algo quando há pelo menos 2 snapshots
 * distintos — 1 só não é comparação. Visível pro próprio paciente (RLS libera) e pro
 * profissional vinculado, igual ao check-in.
 */
export async function obterComparacaoLinhaBase(clientId: string): Promise<ComparacaoLinhaBase[]> {
  const { data, error } = await supabase
    .from('linha_base_historico')
    .select('fotos, criado_em')
    .eq('client_id', clientId)
    .order('criado_em', { ascending: true });
  if (error) throw error;
  const snapshots = data ?? [];
  if (snapshots.length < 2) return [];

  const primeiro = snapshots[0];
  const ultimo = snapshots[snapshots.length - 1];

  const resultado: ComparacaoLinhaBase[] = [];
  for (const a of ANGULOS_LINHA_BASE) {
    const pathPrimeira = (primeiro.fotos as FotosLinhaBaseAnamnese)[a.angulo];
    const pathUltima = (ultimo.fotos as FotosLinhaBaseAnamnese)[a.angulo];
    if (!pathPrimeira && !pathUltima) continue;
    const [urlPrimeira, urlUltima] = await Promise.all([
      pathPrimeira ? obterUrlFotoAnamnese(pathPrimeira) : Promise.resolve(null),
      pathUltima ? obterUrlFotoAnamnese(pathUltima) : Promise.resolve(null),
    ]);
    resultado.push({
      angulo: a.angulo,
      label: a.label,
      primeira: pathPrimeira && urlPrimeira ? { url: urlPrimeira, data: primeiro.criado_em } : null,
      ultima: pathUltima && urlUltima ? { url: urlUltima, data: ultimo.criado_em } : null,
    });
  }
  return resultado;
}

/**
 * Profissional pede pro paciente atualizar a anamnese (18/set) — sem chat/notificação no app
 * ainda (§30 do handoff), o pedido fica visível de forma passiva quando o paciente abre a
 * própria anamnese ou o Perfil. Update direto, já liberado pela RLS
 * (`anamnese_update_professional`, `is_professional_of`) — sem RPC nova.
 */
export async function solicitarAtualizacaoAnamnese(clientId: string): Promise<void> {
  const { error } = await supabase
    .from('anamnese')
    .update({ solicitada_atualizacao_em: new Date().toISOString() })
    .eq('client_id', clientId);
  if (error) throw error;
}

/**
 * Profissional revisa/corrige a anamnese de um paciente vinculado — update direto na tabela,
 * já liberado pela RLS (`anamnese_insert_professional`/`anamnese_update_professional`,
 * `is_professional_of(client_id)`). Nunca usar a RPC `submeter_anamnese_autenticado` aqui: ela
 * é `security definer` escopada em `auth.uid()` do paciente — chamada pelo profissional
 * gravaria na própria anamnese dele, não na do paciente.
 */
export async function salvarAnamneseComoProfissional(
  clientId: string,
  respostas: RespostasAnamnese
): Promise<void> {
  const { error } = await supabase.from('anamnese').upsert(
    {
      client_id: clientId,
      ...extrairColunasAnamnese(respostas),
      respostas_completas: respostas,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' }
  );
  if (error) throw error;
}
