import { supabase } from '@/lib/supabase';
import { macrosPorGramas, type ItemRefeicao, type ItemSubstituicao, type Refeicao } from '@/models/domain';
import type { FormulaCalculo } from '@/models/gastoEnergetico';
import type { AlimentoTaco } from '@/services/nutritionService';

/**
 * Edição do plano alimentar pelo profissional.
 *
 * ⚠️ Formato dos itens: os macros gravados são **absolutos** (já na quantidade do item),
 * não por 100g. É o formato que já existe em produção e que a tela do aluno lê. O editor
 * preserva `substituicoes` e `obs` dos itens existentes — a dieta real do Tassis tem
 * substituições com observações escritas à mão, e perdê-las seria destruir trabalho dele.
 */

export type PlanoAlimentarEditavel = {
  periodo: string;
  nutricionista: string;
  meta_kcal: string;
  meta_proteina_g: string;
  meta_carboidrato_g: string;
  meta_gordura_g: string;
  observacoes: string;
  refeicoes: Refeicao[];
  /** Rascunho (false) fica invisível pro aluno até o profissional publicar explicitamente. */
  publicado: boolean;
  /** Config da calculadora de meta calórica — null até o profissional calcular pela 1ª vez. */
  formulaCalculo: FormulaCalculo | null;
  fatorAtividade: string;
  percentualGordura: string;
  /** Resultado no momento do cálculo, preservado mesmo se o profissional ajustar as metas depois. */
  tmbCalculada: number | null;
  getCalculado: number | null;
  /** Nasceu de geração automática por IA e ainda não passou por nenhum save do profissional. */
  geradoPorIa: boolean;
};

export function novoItem(): ItemRefeicao {
  return { nome: '', quantidade: '', macros: null, substituicoes: [] };
}

export function novaRefeicao(): Refeicao {
  return { nome: '', itens: [novoItem()] };
}

/** Monta um item a partir de um alimento da TACO numa dada gramagem. */
export function itemDeTaco(alimento: AlimentoTaco, gramas: number): ItemRefeicao {
  return {
    nome: alimento.nome,
    quantidade: `${gramas}g`,
    macros: macrosPorGramas(alimento, gramas),
    substituicoes: [],
    taco_id: alimento.id,
    quantidade_g: gramas,
  };
}

/**
 * Recalcula os macros de um item quando a gramagem muda — só possível se o item veio da
 * TACO (tem `taco_id`). Item livre mantém os macros que o profissional digitou.
 */
export function recalcularPorGramas(
  item: ItemRefeicao,
  gramas: number,
  alimento: AlimentoTaco | undefined,
): ItemRefeicao {
  if (!alimento) return { ...item, quantidade: `${gramas}g`, quantidade_g: gramas };
  return {
    ...item,
    quantidade: `${gramas}g`,
    quantidade_g: gramas,
    macros: macrosPorGramas(alimento, gramas),
  };
}

function numeroOuNulo(v: string): number | null {
  const limpo = v.trim().replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isNaN(n) ? null : n;
}

export function planoAlimentarParaEdicao(
  plano: {
    periodo: string;
    nutricionista: string;
    meta_kcal: number | null;
    meta_proteina_g: number | null;
    meta_carboidrato_g: number | null;
    meta_gordura_g: number | null;
    observacoes: string;
    refeicoes: Refeicao[];
    publicado: boolean;
    formula_calculo?: string | null;
    fator_atividade?: number | null;
    percentual_gordura?: number | null;
    tmb_calculada?: number | null;
    get_calculado?: number | null;
    gerado_por_ia?: boolean;
  } | null,
  nomeProfissional: string,
): PlanoAlimentarEditavel {
  if (!plano) {
    // Plano novo nasce como rascunho — só fica visível pro aluno quando o profissional publicar.
    return {
      periodo: '',
      nutricionista: nomeProfissional,
      meta_kcal: '',
      meta_proteina_g: '',
      meta_carboidrato_g: '',
      meta_gordura_g: '',
      observacoes: '',
      refeicoes: [novaRefeicao()],
      publicado: false,
      formulaCalculo: null,
      fatorAtividade: '',
      percentualGordura: '',
      tmbCalculada: null,
      getCalculado: null,
      geradoPorIa: false,
    };
  }
  return {
    periodo: plano.periodo ?? '',
    nutricionista: plano.nutricionista || nomeProfissional,
    meta_kcal: plano.meta_kcal?.toString() ?? '',
    meta_proteina_g: plano.meta_proteina_g?.toString() ?? '',
    meta_carboidrato_g: plano.meta_carboidrato_g?.toString() ?? '',
    meta_gordura_g: plano.meta_gordura_g?.toString() ?? '',
    observacoes: plano.observacoes ?? '',
    refeicoes: plano.refeicoes.length ? plano.refeicoes : [novaRefeicao()],
    publicado: plano.publicado,
    formulaCalculo: (plano.formula_calculo as FormulaCalculo | null) ?? null,
    fatorAtividade: plano.fator_atividade?.toString() ?? '',
    percentualGordura: plano.percentual_gordura?.toString() ?? '',
    tmbCalculada: plano.tmb_calculada ?? null,
    getCalculado: plano.get_calculado ?? null,
    geradoPorIa: plano.gerado_por_ia ?? false,
  };
}

export async function salvarPlanoAlimentar(
  clientId: string,
  professionalId: string,
  plano: PlanoAlimentarEditavel,
): Promise<void> {
  const refeicoes = plano.refeicoes.map((r) => ({
    ...r,
    nome: r.nome.trim() || 'Refeição',
    // Preserva todo o resto do item (substituicoes, obs, taco_id) — só normaliza texto.
    itens: r.itens.map((i) => ({ ...i, nome: i.nome.trim(), quantidade: i.quantidade.trim() })),
  }));

  const { error } = await supabase.from('planos_alimentares').upsert(
    {
      client_id: clientId,
      professional_id: professionalId,
      periodo: plano.periodo.trim(),
      nutricionista: plano.nutricionista.trim(),
      meta_kcal: numeroOuNulo(plano.meta_kcal),
      meta_proteina_g: numeroOuNulo(plano.meta_proteina_g),
      meta_carboidrato_g: numeroOuNulo(plano.meta_carboidrato_g),
      meta_gordura_g: numeroOuNulo(plano.meta_gordura_g),
      observacoes: plano.observacoes.trim(),
      refeicoes,
      publicado: plano.publicado,
      formula_calculo: plano.formulaCalculo,
      fator_atividade: numeroOuNulo(plano.fatorAtividade),
      percentual_gordura: numeroOuNulo(plano.percentualGordura),
      tmb_calculada: plano.tmbCalculada,
      get_calculado: plano.getCalculado,
      // Todo save do profissional (inclusive o que só alterna publicado) marca a dieta como
      // dele, nunca mais como sugestão de IA pendente de revisão — mesma regra de `planEditor.ts`.
      gerado_por_ia: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );
  if (error) throw error;
}

/** Adiciona uma substituição vazia a um item — mesmo padrão de `novoItem`. */
export function adicionarSubstituicao(item: ItemRefeicao): ItemRefeicao {
  return { ...item, substituicoes: [...item.substituicoes, { nome: '', quantidade: '', macros: null }] };
}

export function removerSubstituicao(item: ItemRefeicao, indice: number): ItemRefeicao {
  return { ...item, substituicoes: item.substituicoes.filter((_, i) => i !== indice) };
}

export function atualizarSubstituicao(
  item: ItemRefeicao,
  indice: number,
  patch: Partial<ItemSubstituicao>,
): ItemRefeicao {
  return {
    ...item,
    substituicoes: item.substituicoes.map((s, i) => (i === indice ? { ...s, ...patch } : s)),
  };
}

/** Monta uma substituição a partir de um alimento da TACO — mesmo cálculo de `itemDeTaco`. */
export function substituicaoDeTaco(alimento: AlimentoTaco, gramas: number): ItemSubstituicao {
  return {
    nome: alimento.nome,
    quantidade: `${gramas}g`,
    macros: macrosPorGramas(alimento, gramas),
  };
}
