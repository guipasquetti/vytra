import { supabase } from '@/lib/supabase';
import {
  gerarIdDeExercicio,
  idsEmUso,
  idsRemovidos,
  novoDia,
  novoExercicio,
  planoParaEdicao,
  prepararParaSalvar,
  proximoIdDeDia,
  type DiaEditavel,
  type ExercicioEditavel,
  type PlanoEditavel,
} from '@/models/domain';
import { dispararGeracaoIlustracoes } from '@/services/illustrationService';

/**
 * Edição do plano de treino pelo profissional.
 *
 * A lógica de normalização/geração de id de exercício é pura e mora em `models/domain.ts`
 * (movida de volta pra cá em 14/set) — a Edge Function que gera treino por IA reusa exatamente
 * a mesma lógica de lá. Este arquivo reexporta tudo pra não quebrar nenhum call site existente.
 */
export {
  gerarIdDeExercicio,
  idsEmUso,
  idsRemovidos,
  novoDia,
  novoExercicio,
  planoParaEdicao,
  prepararParaSalvar,
  proximoIdDeDia,
  type DiaEditavel,
  type ExercicioEditavel,
  type PlanoEditavel,
};

export async function salvarPlano(
  clientId: string,
  professionalId: string,
  plano: PlanoEditavel,
): Promise<void> {
  const dias = prepararParaSalvar(plano);
  const { error } = await supabase.from('plans').upsert(
    {
      client_id: clientId,
      professional_id: professionalId,
      periodo: plano.periodo.trim(),
      treinador: plano.treinador.trim(),
      dias,
      publicado: plano.publicado,
      treinos_semana: plano.treinosSemana,
      // Todo save do profissional (inclusive o que só alterna publicado) marca o plano como
      // dele, nunca mais como sugestão de IA pendente de revisão — é o que faz a constraint
      // `plans_ia_exige_revisao` nunca disparar em uso normal.
      gerado_por_ia: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );
  if (error) throw error;

  // Fire-and-forget: garante ilustração (estática ou gerada por IA, cache global) pra qualquer
  // exercício novo que o profissional tenha digitado à mão — não trava o save.
  dispararGeracaoIlustracoes(dias.flatMap((dia) => dia.ex.map((ex) => ex.nome)));
}
