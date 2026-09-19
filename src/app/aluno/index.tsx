import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Body, Button, Caption, Card, EmptyState, GraficoPontos, Loading, Screen, SectionTitle, Stat } from '@/components/ui';
import { formatarData, formatarDataHora, itensReais, listaDeCompras, somaMacros } from '@/models/domain';
import {
  checkinPendente,
  historicoPeso,
  listarMeusCheckins,
  type CheckIn,
} from '@/services/checkinService';
import { buscarCategoriasPorIds, getPlanoAlimentar, type PlanoAlimentar } from '@/services/nutritionService';
import { listarMeusProfissionais, temPlanoConfirmado } from '@/services/professionalService';
import { proximaTeleconsulta, type Teleconsulta } from '@/services/teleconsultaService';
import {
  concluidoHoje,
  getWorkoutData,
  persistenciaSemanal,
  proximoDiaTreino,
  streakTreino,
  type WorkoutData,
} from '@/services/workoutService';
import { useAuthStore } from '@/store/authStore';
import { MacroColors, Palette, Spacing, trainingColor } from '@/theme';

/** Chave igual à usada em `aluno/dieta.tsx` — mesmo checklist, lido aqui só pro resumo. */
function chaveMarcados(userId: string): string {
  return `lista-compras-marcados:${userId}`;
}

const DIAS_PROJECAO_PADRAO = 30;

type EstadoInicio = {
  workout: WorkoutData | null;
  liberado: boolean;
  plano: PlanoAlimentar | null;
  categorias: Record<number, string>;
  checkins: CheckIn[];
  checkinDisponivel: boolean;
  consulta: Teleconsulta | null;
  comprasMarcadas: number;
};

/**
 * Tela inicial do aluno (§ redesenho do perfil, 08/set): agrega o que já existe espalhado em
 * Treino/Dieta/Check-in/Perfil num resumo só, pra abrir o app e ver o essencial sem trocar de
 * aba. Não lê nada novo do banco além do que essas telas já leem — só reorganiza.
 */
export default function InicioScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const [estado, setEstado] = useState<EstadoInicio | null>(null);

  const carregar = useCallback(async () => {
    if (!user) return;
    const [workout, liberado, plano, checkins, profissionais, consulta] = await Promise.all([
      getWorkoutData(user.id),
      temPlanoConfirmado(user.id),
      getPlanoAlimentar(user.id),
      listarMeusCheckins(user.id),
      listarMeusProfissionais(user.id),
      proximaTeleconsulta(user.id),
    ]);

    let categorias: Record<number, string> = {};
    let comprasMarcadas = 0;
    if (plano?.publicado && plano.refeicoes.length) {
      const idsTaco = [
        ...new Set(
          plano.refeicoes.flatMap((r) => r.itens.map((i) => i.taco_id)).filter((id): id is number => id != null),
        ),
      ];
      categorias = await buscarCategoriasPorIds(idsTaco);
      const salvo = await AsyncStorage.getItem(chaveMarcados(user.id));
      if (salvo) {
        try {
          comprasMarcadas = (JSON.parse(salvo) as string[]).length;
        } catch {
          comprasMarcadas = 0;
        }
      }
    }

    const pendencias = await Promise.all(profissionais.map((profissional) => checkinPendente(profissional.subscriptionId)));
    setEstado({ workout, liberado, plano, categorias, checkins, checkinDisponivel: pendencias.some(Boolean), consulta, comprasMarcadas });
  }, [user?.id]);

  // `useFocusEffect`, não `useEffect`: a aba fica montada ao trocar de aba (padrão do
  // `<Tabs>` do expo-router), então um `useEffect` só rodaria uma vez e o treino/dieta
  // registrados em outra aba nunca apareceriam aqui sem reload manual da página.
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  if (!user || !estado) return <Loading />;

  const primeiroNome = profile?.nome?.trim().split(' ')[0] || 'Olá';

  if (!estado.liberado) {
    return (
      <Screen title={primeiroNome}>
        <EmptyState text="Aguardando seu profissional confirmar o plano contratado." />
      </Screen>
    );
  }

  const dias = estado.workout?.plano?.publicado ? estado.workout.plano.dias : [];
  const diaHoje = proximoDiaTreino(dias, estado.workout?.historico ?? {}, estado.workout?.rascunhos ?? {});
  const exerciciosHoje = diaHoje?.ex ?? [];
  const concluidosHoje = exerciciosHoje.filter((ex) =>
    concluidoHoje(estado.workout!.historico[ex.id]),
  ).length;
  const streak = estado.workout ? streakTreino(estado.workout.historico) : 0;
  const treinosSemana = estado.workout?.plano?.treinos_semana ?? null;
  const persistencia =
    estado.workout && treinosSemana
      ? persistenciaSemanal(estado.workout.historico, treinosSemana)
      : null;

  const refeicoesReais = estado.plano?.publicado ? estado.plano.refeicoes : [];
  const totalDia = somaMacros(refeicoesReais.flatMap((r) => itensReais(r.itens)));
  const metaKcal = estado.plano?.meta_kcal ? Math.round(Number(estado.plano.meta_kcal)) : null;

  const compras = refeicoesReais.length
    ? listaDeCompras(refeicoesReais, DIAS_PROJECAO_PADRAO, estado.categorias)
    : [];
  const totalItensCompra = compras.reduce((n, g) => n + g.itens.length, 0);

  const pesos = historicoPeso(estado.checkins);
  const ultimoCheckin = estado.checkins[0] ?? null;
  const penultimoCheckin = estado.checkins[1] ?? null;

  /**
   * Vai direto pro dia de treino de hoje (`diaHoje`), não só pra aba Treino — sem isso, se o
   * aluno tivesse trocado de dia (A/B/C) numa visita anterior à aba, o estado ficava sticky
   * (a aba não desmonta ao trocar de aba) e "Ir treinar" abria o dia errado.
   */
  function irTreinar() {
    if (!diaHoje) return;
    router.push({ pathname: '/aluno/treino', params: { dia: diaHoje.id } });
  }

  return (
    <Screen title={`Olá, ${primeiroNome}`} subtitle="Resumo de hoje">
      <Card>
        <View style={styles.statsRow}>
          {persistencia != null ? (
            <Stat value={`${persistencia}%`} label="persistência semanal" color={Palette.orange} />
          ) : (
            <Stat value={String(streak)} label={streak === 1 ? 'dia seguido' : 'dias seguidos'} color={Palette.orange} />
          )}
          <Stat
            value={exerciciosHoje.length ? `${concluidosHoje}/${exerciciosHoje.length}` : '—'}
            label="treino hoje"
            color={trainingColor(diaHoje?.tipo)}
          />
          <Stat
            value={ultimoCheckin?.pontuacao_geral != null ? `${Math.round(ultimoCheckin.pontuacao_geral)}%` : '—'}
            label="check-in"
            color={Palette.purple}
          />
        </View>
        {treinosSemana ? (
          <Caption>
            {Math.max(0, 7 - treinosSemana)} {Math.max(0, 7 - treinosSemana) === 1 ? 'dia de descanso planejado' : 'dias de descanso planejados'} nesta semana.
          </Caption>
        ) : null}
      </Card>

      <SectionTitle>Treino de hoje</SectionTitle>
      {diaHoje ? (
        <Card onPress={irTreinar}>
          <View style={[styles.diaHeader, { borderLeftColor: trainingColor(diaHoje.tipo) }]}>
            <Body>{diaHoje.nome}</Body>
            <Caption>{diaHoje.desc}</Caption>
          </View>
          {exerciciosHoje.map((ex) => {
            const feito = concluidoHoje(estado.workout!.historico[ex.id]);
            return (
              <View key={ex.id} style={styles.exLinha}>
                <Caption color={feito ? Palette.green : Palette.textSecondary}>{feito ? '✓' : '○'}</Caption>
                <Caption color={feito ? Palette.textTertiary : Palette.text} style={styles.exNome}>
                  {ex.nome}
                </Caption>
              </View>
            );
          })}
          <Button label="Ir treinar" variant="ghost" color={trainingColor(diaHoje.tipo)} onPress={irTreinar} />
        </Card>
      ) : (
        <EmptyState text="Seu treinador está montando seu plano — fica pronto em até 2 dias." />
      )}

      <SectionTitle>Dieta de hoje</SectionTitle>
      {refeicoesReais.length ? (
        <Card onPress={() => router.push('/aluno/dieta')}>
          <View style={styles.statsRow}>
            <Stat
              value={String(Math.round(totalDia.kcal))}
              label={metaKcal ? `de ${metaKcal} kcal` : 'kcal hoje'}
              color={MacroColors.kcal}
            />
            <Stat value={`${Math.round(totalDia.proteina_g)}g`} label="proteína" color={MacroColors.proteina} />
            <Stat value={`${Math.round(totalDia.carboidrato_g)}g`} label="carbo" color={MacroColors.carboidrato} />
          </View>
          <Button label="Ver dieta completa" variant="ghost" color={Palette.purple} onPress={() => router.push('/aluno/dieta')} />
        </Card>
      ) : (
        <EmptyState text="Seu nutricionista está montando seu plano — fica pronto em até 2 dias." />
      )}

      {totalItensCompra > 0 ? (
        <Card onPress={() => router.push('/aluno/lista-compras')}>
          <View style={styles.linhaEntreTexto}>
            <View style={styles.listaComprasEsquerda}>
              <Ionicons name="list-outline" size={20} color={Palette.textSecondary} />
              <Body>Lista de compras</Body>
            </View>
            <Caption>
              {Math.min(estado.comprasMarcadas, totalItensCompra)}/{totalItensCompra}
            </Caption>
          </View>
        </Card>
      ) : null}

      <SectionTitle>Peso</SectionTitle>
      {pesos.length >= 2 ? (
        <Card>
          <View style={styles.linhaEntreTexto}>
            <Stat value={`${formatarNumero(pesos[pesos.length - 1].peso)}kg`} label="mais recente" color={Palette.blue} />
            <VariacaoPeso pesos={pesos} />
          </View>
          <GraficoPontos valores={pesos.map((p) => p.peso)} cor={Palette.blue} />
        </Card>
      ) : (
        <EmptyState text="Registre seu peso no check-in pra ver a evolução aqui." />
      )}

      <SectionTitle>Check-in</SectionTitle>
      <Card onPress={() => router.push('/aluno/checkin')}>
        {estado.checkinDisponivel ? (
          <>
            <Caption>Novo check-in disponível — leva poucos minutos.</Caption>
            <Button label="Fazer check-in" color={Palette.purple} onPress={() => router.push('/aluno/checkin')} />
          </>
        ) : ultimoCheckin ? (
          <>
            <View style={styles.linhaEntreTexto}>
              <Body>{ultimoCheckin.pontuacao_geral != null ? `${Math.round(ultimoCheckin.pontuacao_geral)}%` : '—'}</Body>
              <TendenciaCheckin atual={ultimoCheckin} anterior={penultimoCheckin} />
            </View>
            <Caption color={Palette.textTertiary}>
              Último em {formatarDataHora(ultimoCheckin.created_at)} · próximo em breve
            </Caption>
          </>
        ) : (
          <Caption>Nenhum check-in enviado ainda.</Caption>
        )}
      </Card>

      {estado.consulta ? (
        <>
          <SectionTitle>Próxima teleconsulta</SectionTitle>
          <Card>
            <Body>{formatarDataHora(estado.consulta.data_hora)}</Body>
            <Button
              label="Entrar na chamada"
              color={Palette.blue}
              onPress={() => Linking.openURL(estado.consulta!.link_meet)}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function formatarNumero(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace('.', ',');
}

function VariacaoPeso({ pesos }: { pesos: { data: string; peso: number }[] }) {
  const delta = pesos[pesos.length - 1].peso - pesos[0].peso;
  const cor = delta === 0 ? Palette.textSecondary : delta > 0 ? Palette.orange : Palette.green;
  const sinal = delta > 0 ? '+' : '';
  return (
    <Caption color={cor}>
      {sinal}
      {formatarNumero(delta)}kg desde {formatarData(pesos[0].data.slice(0, 10))}
    </Caption>
  );
}

function TendenciaCheckin({ atual, anterior }: { atual: CheckIn; anterior: CheckIn | null }) {
  if (!anterior || atual.pontuacao_geral == null || anterior.pontuacao_geral == null) return null;
  const delta = atual.pontuacao_geral - anterior.pontuacao_geral;
  if (Math.abs(delta) < 3) return <Caption color={Palette.textSecondary}>estável</Caption>;
  const subiu = delta > 0;
  return (
    <Caption color={subiu ? Palette.green : Palette.orange}>
      {subiu ? '↑' : '↓'} {Math.round(Math.abs(delta))}pts
    </Caption>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  diaHeader: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.md,
    gap: 2,
    marginBottom: Spacing.xs,
  },
  exLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  exNome: {
    flex: 1,
  },
  linhaEntreTexto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listaComprasEsquerda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
