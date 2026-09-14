import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Caption, Pill } from '@/components/ui';
import { VytraLockup } from '@/components/vytra-logo';
import { signIn } from '@/services/authService';
import { FontSize, Palette, Radius, RoleColors, Spacing, type Role } from '@/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [modo, setModo] = useState<Role>('aluno');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const cor = RoleColors[modo];

  async function entrar() {
    setErro(null);
    setEntrando(true);
    try {
      await signIn(email.trim(), senha);
    } catch (e) {
      setErro(
        e instanceof Error && e.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : e instanceof Error
            ? e.message
            : 'Não foi possível entrar.',
      );
    } finally {
      setEntrando(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        <View style={styles.brand}>
          {/* Logotipo de verdade (wordmark em curvas), não texto imitando a fonte. */}
          <VytraLockup largura={196} />
          <Caption>Um plano realmente seu.</Caption>
        </View>

        <View style={styles.switchTrack}>
          <Pill label="Aluno" active={modo === 'aluno'} color={RoleColors.aluno} onPress={() => setModo('aluno')} />
          <Pill
            label="Profissional"
            active={modo === 'profissional'}
            color={RoleColors.profissional}
            onPress={() => setModo('profissional')}
          />
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="E-mail"
            placeholderTextColor={Palette.textTertiary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor={Palette.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            value={senha}
            onChangeText={setSenha}
            onSubmitEditing={entrar}
          />

          {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}

          <Button label="Entrar" color={cor} onPress={entrar} loading={entrando} />

          <Pressable style={styles.criarConta} onPress={() => router.push('/esqueci-senha')} hitSlop={8}>
            <Caption color={Palette.textSecondary}>Esqueci minha senha</Caption>
          </Pressable>

          <Pressable style={styles.criarConta} onPress={() => router.push('/cadastro-profissional')} hitSlop={8}>
            <Caption color={cor}>Não tem cadastro? Criar conta</Caption>
          </Pressable>
        </View>
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
    gap: Spacing.md,
  },
  switchTrack: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    padding: Spacing.xs,
    gap: Spacing.xs,
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
  criarConta: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
});
