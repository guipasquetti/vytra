import { supabase } from '@/lib/supabase';
import { extrairColunasAnamnese, type RespostasAnamnese } from '@/models/anamnese';

export type AnamneseCompleta = {
  respostasCompletas: RespostasAnamnese;
  atualizadoEm: string;
  solicitadaAtualizacaoEm: string | null;
};

/** Lê a anamnese completa de um cliente — RLS cobre o próprio paciente e o profissional vinculado (`is_professional_of`). */
export async function obterAnamnese(clientId: string): Promise<AnamneseCompleta | null> {
  const { data, error } = await supabase
    .from('anamnese')
    .select('respostas_completas, updated_at, solicitada_atualizacao_em')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    respostasCompletas: (data.respostas_completas ?? {}) as RespostasAnamnese,
    atualizadoEm: data.updated_at,
    solicitadaAtualizacaoEm: data.solicitada_atualizacao_em,
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
