import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { hojeISO } from '@/models/domain';
import { useRoleColor } from '@/contexts/role-theme';
import { FontSize, monoStyle, Palette, Radius, Spacing } from '@/theme';

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Só dígitos, "-" auto nas posições certas: "20260918" digitado vira "2026-09-18" sozinho. */
function aplicarMascaraData(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  return [digitos.slice(0, 4), digitos.slice(4, 6), digitos.slice(6, 8)].filter(Boolean).join('-');
}

/** Mesma ideia da data, só que "HHMM" -> "HH:MM". */
function aplicarMascaraHora(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 4);
  return [digitos.slice(0, 2), digitos.slice(2, 4)].filter(Boolean).join(':');
}

function paraISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Sempre no fuso local — `new Date('AAAA-MM-DD')` direto interpreta como UTC e pode voltar um
 * dia no fuso do Brasil (mesma armadilha que `hojeISO()` em `models/domain.ts` já evita). */
function deISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Calendário pequeno pra escolher uma data — grid do mês, seta pra trocar de mês, "Hoje" pra
 * atalho. Seleção usa só cor/borda (sem preenchimento decorativo), mesmo padrão de `Pill` em
 * `ui/index.tsx` (§19: cor é o sinal, não decoração).
 */
function CalendarioMes({
  selecionada,
  minima,
  maxima,
  onSelecionar,
}: {
  selecionada: Date | null;
  minima?: Date;
  maxima?: Date;
  onSelecionar: (iso: string) => void;
}) {
  const roleColor = useRoleColor();
  const hoje = new Date();
  const [referencia, setReferencia] = useState(() => selecionada ?? hoje);

  const primeiroDiaSemana = new Date(referencia.getFullYear(), referencia.getMonth(), 1).getDay();
  const totalDias = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0).getDate();
  const celulas: (number | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ];

  function trocarMes(delta: number) {
    setReferencia((atual) => new Date(atual.getFullYear(), atual.getMonth() + delta, 1));
  }

  function foraDoIntervalo(dia: number): boolean {
    const data = new Date(referencia.getFullYear(), referencia.getMonth(), dia);
    if (minima && data < new Date(minima.getFullYear(), minima.getMonth(), minima.getDate())) return true;
    if (maxima && data > new Date(maxima.getFullYear(), maxima.getMonth(), maxima.getDate())) return true;
    return false;
  }

  return (
    <View style={styles.calendario}>
      <View style={styles.calendarioHeader}>
        <Pressable onPress={() => trocarMes(-1)} hitSlop={8} accessibilityLabel="Mês anterior">
          <Ionicons name="chevron-back" size={18} color={Palette.text} />
        </Pressable>
        <Text style={styles.calendarioTitulo}>
          {MESES[referencia.getMonth()]} {referencia.getFullYear()}
        </Text>
        <Pressable onPress={() => trocarMes(1)} hitSlop={8} accessibilityLabel="Próximo mês">
          <Ionicons name="chevron-forward" size={18} color={Palette.text} />
        </Pressable>
      </View>

      <View style={styles.calendarioLinha}>
        {DIAS_SEMANA.map((letra, i) => (
          <Text key={i} style={styles.calendarioDiaSemana}>
            {letra}
          </Text>
        ))}
      </View>

      {Array.from({ length: Math.ceil(celulas.length / 7) }, (_, semana) => (
        <View key={semana} style={styles.calendarioLinha}>
          {celulas.slice(semana * 7, semana * 7 + 7).map((dia, i) => {
            if (dia === null) return <View key={i} style={styles.calendarioCelula} />;
            const data = new Date(referencia.getFullYear(), referencia.getMonth(), dia);
            const ehHoje = paraISO(data) === paraISO(hoje);
            const ehSelecionada = selecionada && paraISO(data) === paraISO(selecionada);
            const desabilitado = foraDoIntervalo(dia);
            return (
              <Pressable
                key={i}
                disabled={desabilitado}
                onPress={() => onSelecionar(paraISO(data))}
                style={[
                  styles.calendarioCelula,
                  styles.calendarioDia,
                  ehSelecionada ? { borderColor: roleColor } : ehHoje ? styles.calendarioDiaHoje : null,
                ]}>
                <Text
                  style={[
                    styles.calendarioDiaTexto,
                    desabilitado && styles.calendarioDiaDesabilitado,
                    ehSelecionada ? { color: roleColor } : null,
                  ]}>
                  {dia}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <Pressable onPress={() => onSelecionar(hojeISO())} hitSlop={8} style={styles.calendarioHoje}>
        <Text style={[styles.calendarioHojeTexto, { color: roleColor }]}>Hoje</Text>
      </Pressable>
    </View>
  );
}

/** Campo de data com máscara automática (digita só números, "-" entra sozinho) e, opcionalmente,
 * um calendário pequeno pra escolher — usado quando o campo é uma data a agendar (teleconsulta,
 * retomada de lead), não pra data já conhecida (nascimento), onde navegar mês a mês até décadas
 * atrás só atrapalha. */
export function CampoData({
  label,
  value,
  onChangeText,
  placeholder = 'AAAA-MM-DD',
  comCalendario = false,
  dataMinima,
  dataMaxima,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  comCalendario?: boolean;
  dataMinima?: Date;
  dataMaxima?: Date;
}) {
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const roleColor = useRoleColor();

  return (
    <View style={styles.campo}>
      {label ? <Text style={styles.campoLabel}>{label}</Text> : null}
      <View style={styles.campoLinha}>
        <TextInput
          style={[styles.input, comCalendario && styles.inputComBotao]}
          value={value}
          onChangeText={(t) => onChangeText(aplicarMascaraData(t))}
          placeholder={placeholder}
          placeholderTextColor={Palette.textTertiary}
          keyboardType="number-pad"
          maxLength={10}
        />
        {comCalendario ? (
          <Pressable
            onPress={() => setCalendarioAberto((a) => !a)}
            style={styles.botaoCalendario}
            accessibilityLabel="Abrir calendário">
            <Ionicons name="calendar-outline" size={20} color={roleColor} />
          </Pressable>
        ) : null}
      </View>
      {calendarioAberto ? (
        <CalendarioMes
          selecionada={deISO(value)}
          minima={dataMinima}
          maxima={dataMaxima}
          onSelecionar={(iso) => {
            onChangeText(iso);
            setCalendarioAberto(false);
          }}
        />
      ) : null}
    </View>
  );
}

/** Campo de hora com máscara automática ("2030" digitado vira "20:30" sozinho). */
export function CampoHora({
  label,
  value,
  onChangeText,
  placeholder = 'HH:MM',
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.campo}>
      {label ? <Text style={styles.campoLabel}>{label}</Text> : null}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(t) => onChangeText(aplicarMascaraHora(t))}
        placeholder={placeholder}
        placeholderTextColor={Palette.textTertiary}
        keyboardType="number-pad"
        maxLength={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  campo: {
    gap: Spacing.xs,
  },
  campoLabel: {
    color: Palette.textSecondary,
    ...monoStyle(FontSize.caption, true),
  },
  campoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: Palette.surfaceElevated,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Palette.text,
    fontSize: FontSize.body,
  },
  inputComBotao: {
    flex: 1,
  },
  botaoCalendario: {
    backgroundColor: Palette.surfaceElevated,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  calendario: {
    marginTop: Spacing.sm,
    backgroundColor: Palette.surface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  calendarioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarioTitulo: {
    color: Palette.text,
    ...monoStyle(FontSize.small, true),
    textTransform: 'uppercase',
  },
  calendarioLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarioDiaSemana: {
    width: 32,
    textAlign: 'center',
    color: Palette.textTertiary,
    ...monoStyle(FontSize.caption, true),
  },
  calendarioCelula: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarioDia: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  calendarioDiaHoje: {
    borderColor: Palette.border,
  },
  calendarioDiaTexto: {
    color: Palette.text,
    fontSize: FontSize.small,
  },
  calendarioDiaDesabilitado: {
    color: Palette.textTertiary,
    opacity: 0.4,
  },
  calendarioHoje: {
    alignSelf: 'center',
    paddingTop: Spacing.xs,
  },
  calendarioHojeTexto: {
    ...monoStyle(FontSize.caption, true),
    textTransform: 'uppercase',
  },
});
