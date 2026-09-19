import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { VytraMark } from '@/components/vytra-logo';
import { Caption } from '@/components/ui';
import { Palette, Spacing } from '@/theme';

export type StatusSalvamento = 'ocioso' | 'salvando' | 'salvo';

/**
 * Indicador de autosave (19/set, pedido do Guilherme): o mark da Vytra pulsa enquanto salva e
 * assenta quando termina — mesma ideia de "estamos salvando em tempo real" sem escrever texto
 * técnico tipo "sincronizando com o servidor". Usa `Animated` puro (não `react-native-reanimated`,
 * que está instalado mas sem uso no app ainda) — só um loop de escala, não precisa de worklet.
 * Quem chama controla a máquina de estados (debounce → 'salvando' → 'salvo' → 'ocioso' depois de
 * um tempo); o componente só anima o que recebe.
 */
export function SaveIndicator({ status }: { status: StatusSalvamento }) {
  const [escala] = useState(() => new Animated.Value(1));
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (status === 'salvando') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(escala, { toValue: 1.18, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(escala, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loopRef.current = loop;
      loop.start();
      return () => loop.stop();
    }
    loopRef.current?.stop();
    escala.setValue(1);
  }, [status, escala]);

  if (status === 'ocioso') return null;

  return (
    <View style={styles.linha}>
      <Animated.View style={{ transform: [{ scale: escala }] }}>
        <VytraMark largura={16} />
      </Animated.View>
      <Caption color={status === 'salvo' ? Palette.accent : Palette.textTertiary}>
        {status === 'salvando' ? 'Salvando…' : 'Salvo'}
      </Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
