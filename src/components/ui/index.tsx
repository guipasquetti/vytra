import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRoleColor } from '@/contexts/role-theme';
import { FontSize, headingStyle, monoStyle, Palette, Radius, Spacing } from '@/theme';

/** Tela com fundo preto, título grande e conteúdo rolável — padrão da referência. */
export function Screen({
  title,
  subtitle,
  right,
  floating,
  children,
  scroll = true,
  voltar = false,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  /** Conteúdo ancorado no canto inferior da tela, fora da rolagem (ex.: autosave). */
  floating?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  /** Mostra seta de voltar antes do título — só pra telas abertas por push (nunca pra abas
   * raiz, que não têm "anterior"). Usa `router.back()` quando há histórico; sem histórico
   * (URL aberta direto/atualizada no navegador — comum no web), cai em "/", que decide sozinha
   * pra onde mandar (login ou a área certa por papel, ver `index.tsx`) — nunca deixa o toast de
   * erro do react-navigation ("action GO_BACK was not handled") aparecer. */
  voltar?: boolean;
}) {
  const router = useRouter();

  const header = title ? (
    <View style={styles.header}>
      {voltar ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
          style={styles.voltarBotao}
          accessibilityRole="button"
          accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color={Palette.text} />
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.scrollContent}>
          {header}
          {children}
        </View>
      )}
      {floating ? <View style={styles.floating}>{floating}</View> : null}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Body({
  children,
  color = Palette.text,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.body, { color }, style]}>{children}</Text>;
}

export function Caption({
  children,
  color = Palette.textSecondary,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.caption, { color }, style]}>{children}</Text>;
}

/** Número grande com rótulo — o "stat tile" da referência. */
export function Stat({ value, label, color = Palette.text }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Barra de progresso simples — sem lib nova, só `View` com largura proporcional. Extraída de
 * `aluno/index.tsx` (09/set) pra ser reaproveitada no dashboard de evolução do profissional
 * (`pro/aluno/[id]/resumo.tsx`), sem duplicar a mesma implementação em dois arquivos.
 */
export function BarraProgresso({ valor, total, cor }: { valor: number; total: number; cor: string }) {
  const pct = total > 0 ? Math.min(1, valor / total) * 100 : 0;
  return (
    <View style={styles.progressoTrilha}>
      <View style={[styles.progressoPreenchido, { width: `${pct}%`, backgroundColor: cor }]} />
    </View>
  );
}

/**
 * Mini-gráfico de barras — sem lib de chart, só `View`s escaladas pelo min/max da série.
 * Mesma origem/motivo de extração da `BarraProgresso` acima.
 */
export function Sparkline({ valores, cor }: { valores: number[]; cor: string }) {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const amplitude = max - min || 1;
  const ultimos = valores.slice(-12);
  return (
    <View style={styles.sparkline}>
      {ultimos.map((v, i) => {
        const altura = 8 + ((v - min) / amplitude) * 40;
        const ultimo = i === ultimos.length - 1;
        return (
          <View
            key={i}
            style={[styles.sparklineBarra, { height: altura, backgroundColor: ultimo ? cor : Palette.surfaceElevated }]}
          />
        );
      })}
    </View>
  );
}

/**
 * Gráfico de pontos sobre uma linha de base — pontos escalados pelo min/max da série, sem
 * preenchimento decorativo (§19: cor só como sinal). Leitura mais direta que a `Sparkline`
 * (barras) pra série contínua tipo peso, no espírito de traço de monitor da paleta Sinal Vital.
 */
export function GraficoPontos({ valores, cor }: { valores: number[]; cor: string }) {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const amplitude = max - min || 1;
  const ultimos = valores.slice(-12);
  return (
    <View style={styles.pontosGrafico}>
      {ultimos.map((v, i) => {
        const altura = ((v - min) / amplitude) * 40;
        const ultimo = i === ultimos.length - 1;
        return (
          <View key={i} style={styles.pontosColuna}>
            <View
              style={[
                styles.pontosPonto,
                { marginBottom: altura, borderColor: cor, backgroundColor: ultimo ? cor : 'transparent' },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

export function Pill({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active?: boolean;
  color?: string;
  onPress?: () => void;
}) {
  const roleColor = useRoleColor();
  color ??= roleColor;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active ? { borderColor: color } : styles.pillInactive]}>
      <Text style={[styles.pillText, active ? { color } : undefined]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  color,
  variant = 'solid',
  disabled,
  loading,
}: {
  label: string;
  onPress?: () => void;
  color?: string;
  variant?: 'solid' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const roleColor = useRoleColor();
  color ??= roleColor;
  const solid = variant === 'solid';
  const solidColor = color === Palette.danger ? Palette.danger : Palette.text;
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        solid ? { backgroundColor: solidColor } : [styles.buttonGhost, { borderColor: color }],
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.cardPressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={solid ? Palette.background : color} />
      ) : (
        <Text style={[styles.buttonText, solid ? styles.buttonTextSolid : { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 120;

/** Botão redondo de +/- usado no registro de séries — segurar repete o incremento. */
export function StepperButton({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // `onPress` muda a cada render (fecha sobre o peso/reps atual do chamador). Se o
  // setInterval chamasse a função capturada no grant, ficaria travado repetindo o MESMO
  // incremento a partir do valor de quando o dedo pousou — por isso "não subia" depois do
  // primeiro passo. Uma ref sempre atualizada garante que cada tick chama a versão atual.
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  });

  function parar() {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    delayRef.current = null;
    intervalRef.current = null;
  }

  function segurar() {
    onPressRef.current();
    delayRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => onPressRef.current(), REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  }

  useEffect(() => parar, []);

  return (
    <Pressable
      onPressIn={segurar}
      onPressOut={parar}
      style={({ pressed }) => [styles.stepper, pressed && styles.cardPressed]}>
      <Ionicons name={icon} size={20} color={Palette.text} />
    </Pressable>
  );
}

/** Campo de texto com rótulo — base dos formulários do profissional. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  editable = true,
  style,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  /** Vira textarea de 3 linhas — usado nas perguntas de resposta longa da anamnese. */
  multiline?: boolean;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, !editable && styles.inputDesabilitado]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Palette.textTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        numberOfLines={multiline ? 3 : undefined}
        textAlignVertical={multiline ? 'top' : undefined}
      />
    </View>
  );
}

/** Linha com rótulo e switch. */
export function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.caption, { color: Palette.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: Palette.accent, false: Palette.surfaceElevated }}
      />
    </View>
  );
}

/** Botão pequeno de remover, usado em listas editáveis. */
export function RemoveButton({ onPress, label = 'Remover' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.cardPressed]}>
      <Text style={styles.removeText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Selo de profissional verificado — mesmo espírito do badge azul de contas verificadas, só
 * que na cor da marca (`Palette.accent`, o verde-menta "Sinal Vital"). Aparece quando há ao
 * menos um registro aprovado em `professional_registros` (via RPC `obter_selo_profissionais`,
 * nunca inventado no client). `label` são as siglas das áreas verificadas (ex.: "NT · EF",
 * via `rotuloSelo`), nunca a sigla do conselho. Sem ele, só o ícone redondo.
 */
export function SeloVerificado({ label, size = 16 }: { label?: string | null; size?: number }) {
  const icone = (
    <View style={[styles.selo, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="checkmark-sharp" size={size * 0.65} color={Palette.background} />
    </View>
  );
  if (!label) return icone;
  return (
    <View style={styles.seloPill}>
      {icone}
      <Text style={styles.seloLabel}>{label}</Text>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <Caption>{text}</Caption>
    </Card>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={Palette.accent} />
    </View>
  );
}

/**
 * Miniatura de foto que abre em tela cheia ao tocar (18/set, pedido do Guilherme: fotos de
 * check-in precisavam poder ser ampliadas). Cada instância cuida do próprio estado de
 * aberto/fechado — quem usa não precisa gerenciar overlay nenhum.
 */
export function FotoAmpliavel({
  uri,
  width = 100,
  height = 130,
}: {
  uri: string;
  width?: number;
  height?: number;
}) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <Pressable onPress={() => setAberta(true)}>
        <Image source={{ uri }} style={{ width, height, borderRadius: Radius.sm }} />
      </Pressable>
      {/* `Modal`, não `View absolute` — a miniatura vive dentro de containers pequenos (linha de
       * fotos de um card); um overlay absoluto ficaria preso na área desse container, não na
       * tela inteira. `Modal` renderiza por cima de tudo (portal de verdade, inclusive no web). */}
      <Modal visible={aberta} transparent animationType="fade" onRequestClose={() => setAberta(false)}>
        <Pressable style={styles.lightboxFundo} onPress={() => setAberta(false)}>
          <Image source={{ uri }} style={styles.lightboxImagem} resizeMode="contain" />
          <Pressable style={styles.lightboxFechar} onPress={() => setAberta(false)} hitSlop={12}>
            <Ionicons name="close" size={28} color={Palette.text} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  lightboxFundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImagem: {
    width: '100%',
    height: '100%',
  },
  lightboxFechar: {
    position: 'absolute',
    top: Spacing.xl,
    right: Spacing.lg,
  },
  progressoTrilha: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surfaceElevated,
    overflow: 'hidden',
  },
  progressoPreenchido: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 48,
    marginTop: Spacing.sm,
  },
  sparklineBarra: {
    flex: 1,
    borderRadius: Radius.sm,
    minHeight: 8,
  },
  pontosGrafico: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 48,
    marginTop: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Palette.border,
  },
  pontosColuna: {
    flex: 1,
    alignItems: 'center',
  },
  pontosPonto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
  },
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
    gap: Spacing.lg,
  },
  floating: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    zIndex: 10,
    backgroundColor: Palette.surfaceElevated,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  voltarBotao: {
    paddingTop: 2,
    paddingRight: Spacing.sm,
  },
  title: {
    color: Palette.text,
    ...headingStyle(FontSize.display, true),
    textTransform: 'uppercase',
  },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: FontSize.small,
    fontWeight: '500',
  },
  card: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  cardPressed: {
    opacity: 0.7,
  },
  sectionTitle: {
    color: Palette.textSecondary,
    ...monoStyle(FontSize.caption, true),
    textTransform: 'uppercase',
    marginTop: Spacing.sm,
  },
  body: {
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  caption: {
    fontSize: FontSize.small,
    fontWeight: '500',
    lineHeight: 20,
  },
  stat: {
    gap: 2,
  },
  statValue: {
    ...headingStyle(FontSize.stat, true),
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: Palette.textSecondary,
    ...monoStyle(FontSize.caption, true),
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pill: {
    backgroundColor: Palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  pillInactive: {
    backgroundColor: 'transparent',
  },
  pillText: {
    color: Palette.textSecondary,
    ...monoStyle(FontSize.caption, true),
  },
  button: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    ...monoStyle(FontSize.caption, true),
    textTransform: 'uppercase',
  },
  buttonTextSolid: {
    color: Palette.background,
  },
  stepper: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.background,
  },
  field: {
    gap: Spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    color: Palette.textSecondary,
    ...monoStyle(FontSize.caption, true),
    flexShrink: 1,
  },
  input: {
    backgroundColor: Palette.surfaceElevated,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Palette.text,
    fontSize: FontSize.body,
  },
  inputMultiline: {
    minHeight: 72,
    paddingTop: Spacing.md,
  },
  inputDesabilitado: {
    opacity: 0.6,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  removeText: {
    color: Palette.danger,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  selo: {
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seloPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seloLabel: {
    color: Palette.accent,
    ...monoStyle(FontSize.caption, true),
  },
});
