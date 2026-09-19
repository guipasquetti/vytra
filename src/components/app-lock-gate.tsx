import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { autenticar, lerPreferenciaLock } from '@/lib/localAuthLock';
import { useAuthStore } from '@/store/authStore';
import { Palette, Spacing } from '@/theme';

/**
 * Trava de reabertura por biometria — cobre aluno e profissional com o mesmo gate, os dois
 * lidam com dado de saúde sensível (ver ângulo LGPD no handoff). `locked === null` é
 * "ainda resolvendo": fica coberto até decidir, pra não piscar conteúdo antes da hora.
 */
export function AppLockGate() {
  const session = useAuthStore((s) => s.session);
  const [ativado, setAtivado] = useState<boolean | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);
  const autenticando = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !session) return;
    lerPreferenciaLock().then((v) => {
      setAtivado(v);
      setLocked(v);
    });
  }, [session]);

  useEffect(() => {
    if (Platform.OS === 'web' || !ativado) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setLocked(true);
    });
    return () => sub.remove();
  }, [ativado]);

  async function tentarDesbloquear() {
    if (autenticando.current) return;
    autenticando.current = true;
    try {
      if (await autenticar()) setLocked(false);
    } finally {
      autenticando.current = false;
    }
  }

  useEffect(() => {
    if (locked) tentarDesbloquear();
  }, [locked]);

  if (Platform.OS === 'web' || !session || !ativado || !locked) return null;

  return (
    <View style={styles.cobertura}>
      <Ionicons name="lock-closed" size={40} color={Palette.accent} />
      <Text style={styles.titulo}>Vytra travado</Text>
      <Text style={styles.subtitulo}>Use Face ID ou digital pra continuar</Text>
      <Button label="Desbloquear" onPress={tentarDesbloquear} />
    </View>
  );
}

const styles = StyleSheet.create({
  cobertura: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    zIndex: 999,
  },
  titulo: {
    color: Palette.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitulo: {
    color: Palette.textSecondary,
    marginBottom: Spacing.md,
  },
});
