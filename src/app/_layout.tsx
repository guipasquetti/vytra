import { DarkTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useAuthStore } from '@/store/authStore';
import { Palette } from '@/theme';
import { useBrandFonts } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync();

/** O app é dark-only por decisão de identidade visual (paleta "Sinal Vital" da marca). */
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Palette.background,
    card: Palette.surface,
    text: Palette.text,
    border: Palette.border,
    primary: Palette.accent,
  },
};

export default function RootLayout() {
  const { session, isLoading, profileLoaded, isProfessional, initialize } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();
  const [fontesCarregadas, erroFontes] = useBrandFonts();

  useEffect(() => {
    initialize();
  }, []);

  // A splash só sai quando a sessão E as fontes estão resolvidas — senão o primeiro render
  // usa a fonte do sistema e o texto "pula" quando a fonte da marca chega.
  // `erroFontes` conta como resolvido de propósito: fonte quebrada não pode travar o app na
  // splash; nesse caso o React Native cai na fonte do sistema sozinho.
  useEffect(() => {
    if (!isLoading && (fontesCarregadas || erroFontes)) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading, fontesCarregadas, erroFontes]);

  useEffect(() => {
    if (isLoading) return;

    const raiz = segments[0];
    // A rota "/" (raiz undefined) decide sozinha pra onde ir — ver src/app/index.tsx.
    if (raiz === undefined) return;

    // Fluxo público de convite: sem sessão até o fim (ou sessão momentânea criada no meio
    // do próprio fluxo, antes de finalizar_cadastro_convite rodar). Não pode ser
    // redirecionado por aqui — a própria tela navega quando termina.
    if (raiz === 'convite') return;

    // Cadastro de profissional (§0, 04/set): mesma lógica — sem sessão até o fim, ou sessão
    // momentânea criada no meio do próprio fluxo (signUp acontece antes de
    // cadastrar_profissional rodar).
    if (raiz === 'cadastro-profissional') return;

    // Recuperação de senha (14/set): "esqueci-senha" nunca tem sessão (pede o e-mail antes de
    // logar); "redefinir-senha" GANHA uma sessão de recuperação assim que lê o token da URL —
    // se essa regra pegasse isso, mandaria o usuário direto pra `/aluno`/`/pro` antes dele
    // trocar a senha. As duas telas navegam sozinhas quando terminam.
    if (raiz === 'esqueci-senha' || raiz === 'redefinir-senha') return;

    if (!session) {
      if (raiz !== 'login') router.replace('/login');
      return;
    }

    // Admin (04/set) é ortogonal a aluno/profissional — o Guilherme, por exemplo, é cliente
    // do Tassis E admin. Não pode cair na regra de área abaixo.
    if (raiz === 'admin') return;

    // Espera saber o papel antes de escolher a área — senão o aluno pisca na tela do
    // profissional (ou vice-versa) no primeiro render depois do login.
    if (!profileLoaded) return;

    // Trocou de papel ou entrou pela área errada (deep link, sessão antiga): corrige.
    const areaCorreta = isProfessional ? 'pro' : 'aluno';
    if (raiz !== areaCorreta) {
      router.replace(isProfessional ? '/pro' : '/aluno');
    }
  }, [session, isLoading, profileLoaded, isProfessional, segments]);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Palette.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="aluno" />
        <Stack.Screen name="pro" />
      </Stack>
    </ThemeProvider>
  );
}
