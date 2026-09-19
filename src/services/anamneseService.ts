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
 * Dispara (fire-and-forget, nunca trava o upload) a análise por IA da foto recém-enviada —
 * mesmo padrão de `dispararAnaliseFotosCheckin` em `checkinService.ts` (§56), agora também pra
 * foto da anamnese (19/set). Reanalisa sempre que a foto trocar (upsert por `client_id` na
 * edge function, não série histórica: a anamnese só tem 1 foto "atual").
 */
function dispararAnaliseFotoAnamnese(fotoPath: string): void {
  supabase.functions.invoke('analyze-anamnese-photo', { body: { fotoPath } }).catch(() => {
    // Nunca deveria travar o upload da foto por causa da análise — se falhar, o profissional só
    // não vê a análise de IA pra essa foto.
  });
}

/**
 * Foto opcional anexada na anamnese (19/set, pedido do Guilherme) — bucket privado próprio
 * (`fotos-anamnese`), mesmo padrão de `uploadFotoCheckin`/`obterUrlFotoCheckin` em
 * `checkinService.ts`: caminho sempre prefixado pelo uid do próprio paciente. Dispara análise
 * automática por IA (mesma ideia do §56, fotos de check-in) — resultado só pro profissional ler,
 * nunca pro paciente (lente LGPD do §0: foto de corpo é dado sensível; ver nota de transferência
 * internacional na migração `20260919_analise_ia_foto_anamnese.sql`).
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
  dispararAnaliseFotoAnamnese(caminho);
  return caminho;
}

/** Link temporário (1h) pra abrir a foto do bucket privado. */
export async function obterUrlFotoAnamnese(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from('fotos-anamnese').createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}

export type IndicadorAnaliseFotoAnamnese = { rotulo: string; observacao: string };
export type AnaliseFotoAnamnese = {
  fotoPath: string;
  resumo: string;
  indicadores: IndicadorAnaliseFotoAnamnese[];
};

/**
 * Análise de IA da foto da anamnese, se já tiver rodado (background, pode demorar alguns
 * segundos após o upload) — RLS só libera pro profissional vinculado (`is_professional_of`),
 * nunca pro próprio paciente (mesmo padrão de `listarAnalisesFotos` em `checkinService.ts`).
 */
export async function obterAnaliseFotoAnamnese(clientId: string): Promise<AnaliseFotoAnamnese | null> {
  const { data, error } = await supabase
    .from('analise_foto_anamnese')
    .select('foto_path, resumo, indicadores')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    fotoPath: data.foto_path,
    resumo: data.resumo,
    indicadores: (data.indicadores ?? []) as IndicadorAnaliseFotoAnamnese[],
  };
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
