import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Vibration, View } from 'react-native';

import {
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  Field,
  GraficoPontos,
  Loading,
  Pill,
  Screen,
  StepperButton,
} from '@/components/ui';
import {
  formatarData,
  formatarSet,
  type Exercicio,
  type SetLog,
} from '@/models/domain';
import {
  ajustarPeso,
  avaliar,
  concluidoHoje,
  corrigirUltimaSerie,
  getWorkoutData,
  proximoDiaTreino,
  registrarSerie,
  seriesDeHoje,
  sessaoAnterior,
  sugerirSerie,
  type Sessao,
  type WorkoutData,
} from '@/services/workoutService';
import { temPlanoConfirmado } from '@/services/professionalService';
import { buscarIlustracoesDinamicas, type IlustracaoDinamica } from '@/services/illustrationService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Radius, Spacing, trainingColor } from '@/theme';
import { getExerciseIllustration } from '@/lib/exerciseIllustrations';

export default function TreinoScreen() {
  const user = useAuthStore((s) => s.user);
  const { dia: diaParam } = useLocalSearchParams<{ dia?: string }>();
  const [data, setData] = useState<WorkoutData | null>(null);
  const [liberado, setLiberado] = useState(true);
  const [loading, setLoading] = useState(true);
  const [diaAtivo, setDiaAtivo] = useState<string | null>(null);
  const [ilustracoesDinamicas, setIlustracoesDinamicas] = useState<Record<string, IlustracaoDinamica>>({});

  // Sobrescreve o dia selecionado quando se chega aqui com `?dia=` (ex.: "Ir treinar" do
  // Início) — sem isso, a aba fica com o último dia escolhido manualmente (não desmonta ao
  // trocar de aba), e o botão "Ir treinar" abria o dia errado.
  useEffect(() => {
    if (diaParam) setDiaAtivo(diaParam);
  }, [diaParam]);

  const carregar = useCallback(async () => {
    if (!user) return;
    const [resultado, confirmado] = await Promise.all([
      getWorkoutData(user.id),
      temPlanoConfirmado(user.id),
    ]);
    setData(resultado);
    setLiberado(confirmado);
    setDiaAtivo(
      (atual) =>
        atual ??
        proximoDiaTreino(resultado.plano?.dias ?? [], resultado.historico, resultado.rascunhos)?.id ??
        null,
    );
    setLoading(false);

    const nomes = (resultado.plano?.dias ?? []).flatMap((d) => d.ex.map((e) => e.nome));
    if (nomes.length) {
      buscarIlustracoesDinamicas(nomes)
        .then(setIlustracoesDinamicas)
        .catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setData(null);
      setLoading(true);
      return;
    }
    carregar();
  }, [user, carregar]);

  if (loading || !user) return <Loading />;

  if (!liberado) {
    return (
      <Screen title="Treino">
        <EmptyState text="Aguardando seu profissional confirmar o plano contratado pra liberar o treino." />
      </Screen>
    );
  }

  const dias = data?.plano?.publicado ? data.plano.dias : [];
  if (!dias.length) {
    return (
      <Screen title="Treino">
        <EmptyState text="Seu treinador está montando seu plano — fica pronto em até 2 dias." />
      </Screen>
    );
  }

  const dia = dias.find((d) => d.id === diaAtivo) ?? dias[0];
  const cor = trainingColor(dia.tipo);

  return (
    <Screen title="Treino" subtitle={data?.plano?.periodo || undefined}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayTabs}>
        {dias.map((d) => (
          <Pill
            key={d.id}
            label={`${d.id} · ${d.nome}`}
            active={d.id === dia.id}
            color={trainingColor(d.tipo)}
            onPress={() => setDiaAtivo(d.id)}
          />
        ))}
      </ScrollView>

      <View style={[styles.dayHeader, { borderLeftColor: cor }]}>
        <Body>{dia.nome}</Body>
        <Caption>{dia.desc}</Caption>
      </View>

      {dia.ex.map((ex) => (
        <ExercicioCard
          key={ex.id}
          ex={ex}
          diaId={dia.id}
          cor={cor}
          data={data!}
          onMudou={carregar}
          clientId={user!.id}
          ilustracaoDinamica={ilustracoesDinamicas[ex.nome]}
        />
      ))}
    </Screen>
  );
}

function ExercicioCard({
  ex,
  diaId,
  cor,
  data,
  clientId,
  onMudou,
  ilustracaoDinamica,
}: {
  ex: Exercicio;
  diaId: string;
  cor: string;
  data: WorkoutData;
  clientId: string;
  onMudou: () => Promise<void>;
  ilustracaoDinamica?: IlustracaoDinamica;
}) {
  const historico = data.historico[ex.id];
  const rascunho = data.rascunhos[ex.id];
  const logadas = seriesDeHoje(historico, rascunho);
  const anterior = sessaoAnterior(historico);
  const concluido = concluidoHoje(historico);
  const avaliacao = avaliar(ex, anterior);
  const illustration = getExerciseIllustration(ex.nome, diaId);

  const [pendente, setPendente] = useState<SetLog | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [descansoIniciadoEm, setDescansoIniciadoEm] = useState<number | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const sugerida = pendente ?? sugerirSerie(ex, logadas, anterior);

  async function registrar() {
    setSalvando(true);
    try {
      await registrarSerie(clientId, ex, logadas, sugerida);
      const aindaFalta = ex.sets - logadas.length - 1 > 0;
      setDescansoIniciadoEm(aindaFalta ? Date.now() : null);
      setPendente(null);
      await onMudou();
    } finally {
      setSalvando(false);
    }
  }

  async function corrigir() {
    setSalvando(true);
    try {
      const removida = await corrigirUltimaSerie(clientId, ex, historico, rascunho);
      setPendente(removida);
      setDescansoIniciadoEm(null);
      await onMudou();
    } finally {
      setSalvando(false);
    }
  }

  const restantes = ex.sets - logadas.length;

  return (
    <Card>
      <View style={styles.exHeader}>
        <Body style={styles.exName}>{ex.nome}</Body>
        <View style={[styles.badge, { backgroundColor: concluido ? Palette.green : cor }]}>
          <Caption color={Palette.background} style={styles.badgeText}>
            {logadas.length}/{ex.sets}
          </Caption>
        </View>
      </View>

      <Caption>
        Warm {ex.warm} · Feeder {ex.feeder} ·{' '}
        <Caption color={cor}>
          Working {ex.min}-{ex.max}
          {ex.tempo ? 's' : ''} ({ex.sets}x)
        </Caption>
      </Caption>

      {illustration ? (
        <View style={styles.illustration}>
          <Image
            source={illustration}
            style={styles.illustrationImage}
            resizeMode="contain"
            accessibilityLabel={`Demonstração de execução: ${ex.nome}`}
          />
        </View>
      ) : ilustracaoDinamica?.status === 'pronta' && ilustracaoDinamica.url ? (
        <View style={styles.illustration}>
          <Image
            source={{ uri: ilustracaoDinamica.url }}
            style={styles.illustrationImage}
            resizeMode="contain"
            accessibilityLabel={`Demonstração de execução: ${ex.nome}`}
          />
        </View>
      ) : ilustracaoDinamica?.status === 'gerando' ? (
        <Caption color={Palette.textTertiary}>Ilustração sendo gerada…</Caption>
      ) : null}

      {ex.nota ? <Caption color={Palette.orange}>{ex.nota}</Caption> : null}

      {ex.video ? (
        <Button
          label="Ver vídeo"
          variant="ghost"
          color={cor}
          onPress={() => Linking.openURL(ex.video!)}
        />
      ) : null}

      {anterior ? (
        <Caption>
          Última ({formatarData(anterior.data)}):{' '}
          <Caption color={Palette.text}>
            {anterior.sets.map((s) => formatarSet(ex, s)).join(' · ')}
          </Caption>
        </Caption>
      ) : null}

      <Caption color={avaliacao.tipo === 'up' ? Palette.green : Palette.textSecondary}>
        {avaliacao.texto}
      </Caption>

      {logadas.length > 0 ? (
        <View style={styles.logadas}>
          {logadas.map((s, i) => (
            <View key={i} style={styles.logadaChip}>
              <Caption color={Palette.text}>{formatarSet(ex, s)}</Caption>
              {s.obs ? <Caption color={Palette.textSecondary}>{s.obs}</Caption> : null}
            </View>
          ))}
        </View>
      ) : null}

      {concluido ? (
        <Caption color={Palette.green}>✓ Treino de hoje registrado</Caption>
      ) : (
        <View style={styles.registro}>
          <DescansoTimer
            inicio={descansoIniciadoEm}
            duracaoMs={(ex.descanso ?? 90) * 1000}
            cor={cor}
            onIniciar={() => setDescansoIniciadoEm(Date.now())}
            onPular={() => setDescansoIniciadoEm(null)}
          />

          {!ex.tempo && (
            <View style={styles.stepperRow}>
              <Caption>Carga</Caption>
              <View style={styles.stepperControls}>
                <StepperButton
                  icon="remove"
                  onPress={() => setPendente({ ...sugerida, p: ajustarPeso(sugerida.p, -1) })}
                />
                <Body style={styles.stepperValue}>{sugerida.p}kg</Body>
                <StepperButton
                  icon="add"
                  onPress={() => setPendente({ ...sugerida, p: ajustarPeso(sugerida.p, 1) })}
                />
              </View>
            </View>
          )}

          <View style={styles.stepperRow}>
            <Caption>{ex.tempo ? 'Tempo' : 'Reps'}</Caption>
            <View style={styles.stepperControls}>
              <StepperButton
                icon="remove"
                onPress={() =>
                  setPendente({ ...sugerida, r: Math.max(0, sugerida.r - (ex.tempo ? 5 : 1)) })
                }
              />
              <Body style={styles.stepperValue}>
                {sugerida.r}
                {ex.tempo ? 's' : ''}
              </Body>
              <StepperButton
                icon="add"
                onPress={() => setPendente({ ...sugerida, r: sugerida.r + (ex.tempo ? 5 : 1) })}
              />
            </View>
          </View>

          <Field
            label="Observação (opcional)"
            value={sugerida.obs ?? ''}
            onChangeText={(obs) => setPendente({ ...sugerida, obs: obs || undefined })}
            placeholder="Ex.: senti dor no ombro"
          />

          <Button
            label={`Registrar ${logadas.length + 1}ª série${restantes === 1 ? ' (última)' : ''}`}
            color={cor}
            onPress={registrar}
            loading={salvando}
          />
        </View>
      )}

      {logadas.length > 0 && (
        <Button label="Corrigir última série" variant="ghost" color={Palette.orange} onPress={corrigir} />
      )}

      {historico && historico.length > 0 && (
        <Button
          label="Ver histórico completo"
          variant="ghost"
          color={cor}
          onPress={() => setHistoricoAberto(true)}
        />
      )}

      <ModalHistorico
        ex={ex}
        historico={historico ?? []}
        cor={cor}
        visible={historicoAberto}
        onClose={() => setHistoricoAberto(false)}
      />
    </Card>
  );
}

/**
 * Contagem de descanso baseada em timestamp (não em contador decrescente) — voltar de
 * background recalcula certo na hora, sem precisar de `AppState`/lidar com drift. Ao chegar a
 * zero, vibra uma vez e passa a contar pra cima: quanto passou do descanso previsto é o
 * atraso do retorno.
 *
 * Fica sempre visível no card: parado, mostra o descanso previsto e deixa iniciar à mão (ex.:
 * depois do warm/feeder, que não passam por `registrarSerie`); rodando, "Iniciar" vira
 * "Reiniciar" ao lado de "Pular".
 */
function DescansoTimer({
  inicio,
  duracaoMs,
  cor,
  onIniciar,
  onPular,
}: {
  inicio: number | null;
  duracaoMs: number;
  cor: string;
  onIniciar: () => void;
  onPular: () => void;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  const vibrou = useRef(false);
  const rodando = inicio !== null;

  useEffect(() => {
    if (inicio === null) return;
    vibrou.current = false;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [inicio]);

  // `agora` pode ser anterior a um `inicio` recém-reiniciado até o próximo tick.
  const restanteMs = rodando ? duracaoMs - Math.max(0, agora - inicio) : duracaoMs;
  const zerou = rodando && restanteMs <= 0;

  useEffect(() => {
    if (zerou && !vibrou.current) {
      vibrou.current = true;
      Vibration.vibrate(400);
    }
  }, [zerou]);

  return (
    <View style={[styles.timer, { borderColor: rodando ? cor : Palette.border }]}>
      <Ionicons name="time-outline" size={20} color={rodando ? cor : Palette.textSecondary} />
      <View style={styles.timerTexto}>
        <Body style={[styles.timerValor, { color: rodando ? cor : Palette.text }]}>
          {zerou ? `+${formatarDuracao(-restanteMs)}` : formatarDuracao(restanteMs)}
        </Body>
        <Caption color={Palette.textSecondary}>
          {zerou ? 'atrasado pro retorno' : 'descanso'}
        </Caption>
      </View>
      <View style={styles.timerAcoes}>
        <TimerAcao
          icon={rodando ? 'refresh' : 'play'}
          label={rodando ? 'Reiniciar' : 'Iniciar'}
          cor={cor}
          destaque={!rodando}
          onPress={onIniciar}
        />
        {rodando ? (
          <TimerAcao icon="play-skip-forward" label="Pular" cor={cor} onPress={onPular} />
        ) : null}
      </View>
    </View>
  );
}

/** Botão compacto do timer — cabe na linha do timer, sem o padding do `Button` de formulário. */
function TimerAcao({
  icon,
  label,
  cor,
  destaque,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  cor: string;
  destaque?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${label} descanso`}
      style={({ pressed }) => [
        styles.timerAcao,
        destaque ? { backgroundColor: cor, borderColor: cor } : { borderColor: cor },
        pressed && styles.timerAcaoPressionada,
      ]}>
      <Ionicons name={icon} size={14} color={destaque ? Palette.background : cor} />
      <Caption color={destaque ? Palette.background : cor} style={styles.timerAcaoTexto}>
        {label}
      </Caption>
    </Pressable>
  );
}

function formatarDuracao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(s / 60);
  const seg = s % 60;
  return `${min}:${String(seg).padStart(2, '0')}`;
}

/** Gráfico de evolução + histórico completo do exercício, aberto à parte do card principal. */
function ModalHistorico({
  ex,
  historico,
  cor,
  visible,
  onClose,
}: {
  ex: Exercicio;
  historico: Sessao[];
  cor: string;
  visible: boolean;
  onClose: () => void;
}) {
  // `sets` só guarda série "working" de verdade (warm/feeder são texto informativo, nunca
  // passam por `registrarSerie`) — primeiro set já é a primeira série de trabalho, mesma
  // leitura que `avaliar()` faz em `anterior.sets[0]`.
  const valores = historico.map((s) => (ex.tempo ? s.sets[0]?.r : s.sets[0]?.p) ?? 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalFundo}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Body style={styles.exName}>{ex.nome}</Body>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={Palette.text} />
            </Pressable>
          </View>

          {historico.length >= 2 ? <GraficoPontos valores={valores} cor={cor} /> : null}

          <ScrollView contentContainerStyle={styles.modalLista}>
            {historico
              .slice()
              .reverse()
              .map((s, i) => (
                <View key={i} style={styles.histRow}>
                  <Caption>{formatarData(s.data)}</Caption>
                  <Caption color={Palette.text}>
                    {s.sets.map((x) => formatarSet(ex, x)).join('  ·  ')}
                  </Caption>
                </View>
              ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dayTabs: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  dayHeader: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.md,
    gap: 2,
  },
  exHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  exName: {
    flex: 1,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  badgeText: {
    fontWeight: '800',
  },
  illustration: {
    height: 210,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Palette.surfaceElevated,
  },
  illustrationImage: {
    width: '100%',
    height: '100%',
  },
  logadas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  logadaChip: {
    backgroundColor: Palette.surfaceElevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    gap: 2,
  },
  registro: {
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepperValue: {
    minWidth: 72,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  histRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  timerTexto: {
    flex: 1,
    minWidth: 0,
  },
  timerValor: {
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  timerAcoes: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  timerAcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  timerAcaoPressionada: {
    opacity: 0.6,
  },
  timerAcaoTexto: {
    fontWeight: '700',
  },
  modalFundo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: Palette.surface,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalLista: {
    gap: Spacing.xs,
  },
});
