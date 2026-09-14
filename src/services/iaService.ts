import { supabase } from '@/lib/supabase';

/**
 * Geração de treino/dieta por IA a partir da anamnese (HANDOFF §40) — profissional SEMPRE
 * revisa no editor existente antes de publicar; a Edge Function só grava rascunho
 * (`publicado: false, gerado_por_ia: true`). Sem retry automático: falha aqui é falha, o
 * profissional clica de novo se quiser tentar outra vez.
 */

export type GeracaoIABloqueio = {
  code: 'PERFIL_INCOMPLETO' | 'META_CALORICA_AUSENTE' | 'RESPOSTA_INVALIDA' | 'ERRO_DESCONHECIDO';
  message: string;
};

const MENSAGENS_PADRAO: Record<GeracaoIABloqueio['code'], string> = {
  PERFIL_INCOMPLETO:
    'Complete peso, altura, data de nascimento e sexo no perfil do aluno antes de gerar com IA.',
  META_CALORICA_AUSENTE:
    'Calcule a meta calórica na calculadora acima antes de gerar a dieta com IA.',
  RESPOSTA_INVALIDA: 'A IA devolveu algo que não deu pra usar. Tenta de novo.',
  ERRO_DESCONHECIDO: 'Não consegui gerar agora. Tenta de novo em instantes.',
};

export async function gerarPlanoComIA(
  clientId: string,
  tipo: 'treino' | 'dieta',
): Promise<{ ok: true } | { ok: false; bloqueio: GeracaoIABloqueio }> {
  const { data, error } = await supabase.functions.invoke('generate-ai-plan', {
    body: { clientId, tipo },
  });

  if (error) {
    return { ok: false, bloqueio: { code: 'ERRO_DESCONHECIDO', message: MENSAGENS_PADRAO.ERRO_DESCONHECIDO } };
  }
  if (data?.ok) return { ok: true };

  const code = (data?.code as GeracaoIABloqueio['code']) ?? 'ERRO_DESCONHECIDO';
  return {
    ok: false,
    bloqueio: { code, message: data?.message || MENSAGENS_PADRAO[code] },
  };
}
