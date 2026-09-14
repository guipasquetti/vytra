/**
 * Base pública do app — mesma origem no browser; fallback pra produção fora da web.
 * Compartilhado entre qualquer fluxo que precise montar um link absoluto (convite, redefinição
 * de senha) — nunca duplicar essa função de novo, só importar daqui.
 */
export function baseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://app-treino.expo.app';
}
