import { supabase } from '@/lib/supabase';

export type TipoDeclaracao = 'treino_sem_cref';

/**
 * Texto exato exibido/aceito — guardado junto com o registro em `declaracoes_profissional`
 * pra cada aceite provar o que foi aceito NAQUELE momento, mesmo se este texto mudar depois.
 */
export const TEXTO_DECLARACAO_TREINO_SEM_CREF =
  'Declaro que tenho competência e experiência para prescrever treino físico aos meus ' +
  'pacientes, mesmo sem registro no CREF. Assumo integral responsabilidade técnica pelo ' +
  'conteúdo de treino que publico nesta plataforma — a Vytra é uma ferramenta de software e ' +
  'não substitui, supervisiona nem avaliza meu exercício profissional.';

/** Se o profissional já declarou esse tipo alguma vez — não pede de novo depois da 1ª vez. */
export async function possuiDeclaracao(professionalId: string, tipo: TipoDeclaracao): Promise<boolean> {
  const { data } = await supabase
    .from('declaracoes_profissional')
    .select('id')
    .eq('professional_id', professionalId)
    .eq('tipo', tipo)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/** Registro imutável — sem update/delete por design (ver migração), é rastro de auditoria. */
export async function registrarDeclaracao(
  professionalId: string,
  tipo: TipoDeclaracao,
  texto: string,
): Promise<void> {
  const { error } = await supabase
    .from('declaracoes_profissional')
    .insert({ professional_id: professionalId, tipo, texto });
  if (error) throw error;
}
