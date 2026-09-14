import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Caption } from '@/components/ui';
import { VytraLockup } from '@/components/vytra-logo';
import { solicitarRedefinicaoSenha } from '@/services/authService';
import { FontSize, Palette, Radius, Spacing } from '@/theme';

/**
 * Pede o e-mail e dispara o link de recuperação (SMTP próprio, ver HANDOFF §16/§42). Fora do
 * guard de sessão em `_layout.tsx` — precisa ser alcançável sem estar logado.
 *
 * Sempre mostra a mesma mensagem de sucesso, exista ou não o e-mail: a API do Supabase já não
 * diferencia (não dá erro "não encontrado"), e repetir isso na UI evita enumeração de conta.
 */
export default function EsqueciSenhaScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar() {
    if (!email.trim()) {
      setErro('Digita seu e-mail.');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await solicitarRedefinicaoSenha(email.trim());
      setEnviado(true);
    } catch (e) {
      // Erro aqui é infra (rate limit, SMTP fora do ar) — nunca "e-mail não existe".
      setErro(e instanceof Error ? e.message : 'Não consegui enviar agora. Tenta de novo em instantes.');
    } finally {
      setEnviando(false);
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

        {enviado ? (
          <View style={styles.form}>
            <Caption color={Palette.text}>
              Se {email.trim()} tiver uma conta, mandamos um link de recuperação — confere sua
              caixa de entrada (e o spam).
            </Caption>
            <Pressable style={styles.voltar} onPress={() => router.replace('/login')} hitSlop={8}>
              <Caption color={Palette.accent}>Voltar pro login</Caption>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Caption color={Palette.text}>Digita o e-mail da sua conta — mandamos um link pra criar uma senha nova.</Caption>
            <TextInput
              style={styles.input}
              placeholder="E-mail"
              placeholderTextColor={Palette.textTertiary}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={enviar}
            />

            {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}

            <Button label="Enviar link" onPress={enviar} loading={enviando} />

            <Pressable style={styles.voltar} onPress={() => router.replace('/login')} hitSlop={8}>
              <Caption color={Palette.textSecondary}>Voltar pro login</Caption>
            </Pressable>
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
  voltar: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
});
