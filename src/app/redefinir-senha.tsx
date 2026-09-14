import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Caption } from '@/components/ui';
import { VytraLockup } from '@/components/vytra-logo';
import { supabase } from '@/lib/supabase';
import { redefinirSenha } from '@/services/authService';
import { FontSize, Palette, Radius, Spacing } from '@/theme';

type Estado = 'verificando' | 'invalido' | 'pronto' | 'trocada';

/**
 * Recebe o link de `solicitarRedefinicaoSenha` (HANDOFF §42) e troca a senha. Fora do guard de
 * sessão em `_layout.tsx` — essa tela GANHA uma sessão de recuperação assim que lê o token, e
 * não pode ser redirecionada por causa disso antes do usuário terminar.
 *
 * `detectSessionInUrl: false` em `lib/supabase.ts` (evita crash de SSR no export web) significa
 * que o token do link (fluxo implícito — `flowType` padrão do supabase-js, nunca mudado aqui)
 * NUNCA é lido sozinho: chega em `window.location.hash` como `#access_token=...&refresh_token=
 * ...&type=recovery`, e essa tela é quem lê isso manualmente e chama `setSession`.
 */
export default function RedefinirSenhaScreen() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('verificando');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function aplicarToken() {
      if (typeof window === 'undefined') {
        setEstado('invalido');
        return;
      }
      const bruto = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      const params = new URLSearchParams(bruto);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) {
        setEstado('invalido');
        return;
      }
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      // Limpa o token da URL — não pode ficar visível/reutilizável no histórico do navegador.
      window.history.replaceState(null, '', window.location.pathname);
      setEstado(error ? 'invalido' : 'pronto');
    }
    aplicarToken();
  }, []);

  async function salvar() {
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas não são iguais.');
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await redefinirSenha(senha);
      // Desloga a sessão de recuperação de propósito — o usuário entra de novo com a senha
      // nova, em vez de ficar autenticado silenciosamente por um link de e-mail.
      await supabase.auth.signOut();
      setEstado('trocada');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui trocar a senha agora.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        <View style={styles.brand}>
          <VytraLockup largura={196} />
        </View>

        {estado === 'verificando' ? (
          <ActivityIndicator color={Palette.accent} />
        ) : estado === 'invalido' ? (
          <View style={styles.form}>
            <Caption color={Palette.text}>
              Esse link não é mais válido — expirou ou já foi usado. Pede um novo.
            </Caption>
            <Button label="Pedir novo link" onPress={() => router.replace('/esqueci-senha')} />
          </View>
        ) : estado === 'trocada' ? (
          <View style={styles.form}>
            <Caption color={Palette.text}>Senha atualizada. Entra de novo com a senha nova.</Caption>
            <Button label="Ir para o login" onPress={() => router.replace('/login')} />
          </View>
        ) : (
          <View style={styles.form}>
            <Caption color={Palette.text}>Escolhe sua senha nova.</Caption>
            <TextInput
              style={styles.input}
              placeholder="Senha nova"
              placeholderTextColor={Palette.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              value={senha}
              onChangeText={setSenha}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirmar senha nova"
              placeholderTextColor={Palette.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              value={confirmacao}
              onChangeText={setConfirmacao}
              onSubmitEditing={salvar}
            />

            {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}

            <Button label="Salvar senha nova" onPress={salvar} loading={salvando} />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xxl,
  },
  brand: {
    alignItems: 'center',
  },
  form: {
    gap: Spacing.md,
  },
  input: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    color: Palette.text,
    fontSize: FontSize.body,
  },
});
