import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Trava biométrica de reabertura do app — não é login novo, a sessão do Supabase já persiste
 * sozinha (ver `supabase.ts`). Separado de lá de propósito: aquele `AppState` listener é só
 * pra refresh de token, esse aqui é sobre visibilidade de conteúdo sensível (anamnese, fotos
 * de check-in, prontuário — ver regra de LGPD do handoff).
 */

const CHAVE_PREFERENCIA = "app-lock-enabled";

export async function hardwareDisponivel(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const [temHardware, temCadastro] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return temHardware && temCadastro;
}

async function lerPreferenciaSalva(): Promise<boolean | null> {
  if (Platform.OS === "web") return null;
  const valor = await SecureStore.getItemAsync(CHAVE_PREFERENCIA);
  if (valor === "true") return true;
  if (valor === "false") return false;
  return null;
}

export async function salvarPreferenciaLock(ativado: boolean): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(CHAVE_PREFERENCIA, ativado ? "true" : "false");
}

/**
 * Lê a preferência do usuário; na primeira vez (nunca decidida), fica ligada por padrão se o
 * aparelho tem biometria cadastrada — dado de saúde sensível pede trava por padrão, não opt-in.
 * A decisão é persistida pra não mudar sozinha depois se a biometria do aparelho mudar.
 */
export async function lerPreferenciaLock(): Promise<boolean> {
  const salva = await lerPreferenciaSalva();
  if (salva != null) return salva;

  const padrao = await hardwareDisponivel();
  await salvarPreferenciaLock(padrao);
  return padrao;
}

export async function autenticar(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const resultado = await LocalAuthentication.authenticateAsync({
    promptMessage: "Desbloquear Vytra",
    cancelLabel: "Cancelar",
  });
  return resultado.success;
}
