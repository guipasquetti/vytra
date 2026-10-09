import { Linking } from 'react-native';

/**
 * Links digitados por profissional (Meet da teleconsulta, vídeo do exercício) são abertos no
 * aparelho do paciente — sem checar o esquema, `tel:`, `sms:`, `itms-services:` ou o deep link
 * de outro app seriam disparados por texto de terceiros. Só `https://` passa.
 */
const HTTPS = /^https:\/\/[^\s/$.?#][^\s]*$/i;

/** Devolve a URL limpa se for `https://`, senão `null`. */
export function urlHttpsValida(url: string | null | undefined): string | null {
  const limpa = url?.trim();
  return limpa && HTTPS.test(limpa) ? limpa : null;
}

/** Abre só links `https://`. Devolve `false` (sem abrir nada) se o link não passar. */
export async function abrirLinkSeguro(url: string | null | undefined): Promise<boolean> {
  const segura = urlHttpsValida(url);
  if (!segura) return false;
  try {
    await Linking.openURL(segura);
    return true;
  } catch {
    return false;
  }
}
