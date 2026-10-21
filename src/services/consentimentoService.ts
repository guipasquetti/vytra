import { supabase } from '@/lib/supabase';

/**
 * Consentimento específico para enviar as fotos do paciente à análise por IA (21/out).
 * Separado de `linha-base-v1` (que só cobre guardar as fotos e mostrá-las ao profissional):
 * a LGPD pede finalidade específica e a análise manda a imagem a um suboperador no exterior
 * (Anthropic). As Edge Functions `analyze-*` exigem esta linha vigente — o servidor decide,
 * a tela só coleta o aceite.
 */
export const VERSAO_CONSENTIMENTO_IA = 'analise-ia-fotos-v1';
const TEXTO_HASH_IA = 'vytra-analise-ia-fotos-v1';

export async function consentimentoIaVigente(clientId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('consentimentos_imagem')
    .select('revogado_em')
    .eq('client_id', clientId)
    .eq('versao', VERSAO_CONSENTIMENTO_IA)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && !data.revogado_em);
}

/** Registra o aceite; se já houve revogação, reativa limpando `revogado_em`. */
export async function registrarConsentimentoIa(clientId: string): Promise<void> {
  const { error } = await supabase.from('consentimentos_imagem').upsert(
    {
      client_id: clientId,
      versao: VERSAO_CONSENTIMENTO_IA,
      texto_hash: TEXTO_HASH_IA,
      aceito_em: new Date().toISOString(),
      revogado_em: null,
    },
    { onConflict: 'client_id,versao' },
  );
  if (error) throw error;
}

export async function revogarConsentimentoIa(clientId: string): Promise<void> {
  const { error } = await supabase
    .from('consentimentos_imagem')
    .update({ revogado_em: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('versao', VERSAO_CONSENTIMENTO_IA);
  if (error) throw error;
}
