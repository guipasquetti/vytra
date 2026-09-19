import { supabase } from '@/lib/supabase';

/** `treino_sem_cref` é o tipo antigo (14/set), mantido porque o histórico é imutável.
 *  Declarações novas usam `treino_sem_registro`, que não amarra a Vytra a um conselho. */
export type TipoDeclaracao = 'treino_sem_cref' | 'treino_sem_registro';

/**
 * Texto exato exibido/aceito — guardado junto com o registro em `declaracoes_profissional`
 * pra cada aceite provar o que foi aceito NAQUELE momento, mesmo se este texto mudar depois.
 */
export const TEXTO_DECLARACAO_TREINO_SEM_CREF =
  'Declaro que tenho competência e experiência para prescrever treino físico aos meus ' +
  'pacientes, mesmo sem registro no CREF. Assumo integral responsabilidade técnica pelo ' +
  'conteúdo de treino que publico nesta plataforma — a Vytra é uma ferramenta de software e ' +
  'não substitui, supervisiona nem avaliza meu exercício profissional.';

/**
 * Texto vigente desde 19/set (catálogo de profissões): vale pra qualquer profissional sem
 * registro, numa profissão do catálogo, que cubra o módulo de treino.
 */
export const TEXTO_DECLARACAO_TREINO_SEM_REGISTRO =
  'Declaro que tenho competência e experiência para prescrever treino físico aos meus ' +
  'pacientes, mesmo sem registro em um conselho profissional que cubra essa prescrição. ' +
  'Assumo integral responsabilidade técnica pelo conteúdo de treino que publico nesta ' +
  'plataforma. A Vytra é uma ferramenta de software e não substitui, supervisiona nem avaliza ' +
  'meu exercício profissional.';

/** Aceite de treino sem registro, em qualquer das duas versões da declaração. */
export async function possuiDeclaracaoTreino(professionalId: string): Promise<boolean> {
  const { data } = await supabase
    .from('declaracoes_profissional')
    .select('id')
    .eq('professional_id', professionalId)
    .in('tipo', ['treino_sem_cref', 'treino_sem_registro'])
    .limit(1)
    .maybeSingle();
  return !!data;
}

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
