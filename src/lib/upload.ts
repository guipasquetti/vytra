/**
 * Preparo comum dos uploads pra Storage (fotos de check-in/anamnese, anexos, carteirinha).
 * Os seletores só oferecem PDF e imagem, mas o nome do arquivo vem do aparelho/da web e
 * entrava cru no caminho do objeto — extensão e nome passam por aqui antes.
 */

const EXTENSOES_PERMITIDAS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf']);

/** Mesmo teto dos buckets no banco (`20261009_endurece_acesso.sql`). */
export const TAMANHO_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Extensão em minúsculas se for uma das permitidas; senão `padrao`. */
export function extensaoSegura(nome: string, padrao: string): string {
  const ext = nome.includes('.') ? (nome.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  return EXTENSOES_PERMITIDAS.has(ext) ? ext : padrao;
}

/** Nome sem separador de pasta, `..` nem caractere estranho — cabe num segmento de caminho. */
export function nomeArquivoSeguro(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._]+/, '')
    .slice(-80);
  return limpo || 'arquivo';
}

/** Lê o arquivo local e recusa o que passa do teto antes de gastar banda subindo. */
export async function lerArquivoParaUpload(uri: string): Promise<Blob> {
  const resposta = await fetch(uri);
  const blob = await resposta.blob();
  if (blob.size > TAMANHO_MAX_UPLOAD_BYTES) {
    throw new Error('Arquivo grande demais. O limite é 15 MB.');
  }
  return blob;
}
