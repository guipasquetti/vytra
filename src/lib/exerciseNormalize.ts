/**
 * Normalização de nome de exercício — acento fora, minúsculo, só alfanumérico.
 *
 * Único lugar onde essa regra existe: usado pra casar com o catálogo estático
 * (`exerciseIllustrations.ts`), pra chavear o cache global de ilustração gerada por IA
 * (`exercicios_ilustracoes.nome_normalizado`) e pelas Edge Functions (importado direto por
 * caminho relativo — arquivo puro, sem `require`/RN, roda em Deno sem alteração). Se duas
 * normalizações divergirem, o cache erra silenciosamente (gera de novo ou nunca casa).
 */
export function normalizarNomeExercicio(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
