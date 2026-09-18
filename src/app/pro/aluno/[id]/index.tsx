import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AlunoTabs } from '@/components/aluno-tabs';
import {
  Body,
  Button,
  Caption,
  Card,
  Field,
  Loading,
  Pill,
  RemoveButton,
  Screen,
  SectionTitle,
  ToggleRow,
} from '@/components/ui';
import type { DiaTreino } from '@/models/domain';
import { getProfile } from '@/services/authService';
import { gerarPlanoComIA } from '@/services/iaService';
import {
  idsRemovidos,
  novoDia,
  novoExercicio,
  planoParaEdicao,
  prepararParaSalvar,
  salvarPlano,
  type DiaEditavel,
  type ExercicioEditavel,
  type PlanoEditavel,
} from '@/services/planEditor';
import { getWorkoutData } from '@/services/workoutService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Radius, Spacing, trainingColor } from '@/theme';

const TIPOS = ['push', 'pull', 'leg'] as const;

export default function EditorPlanoScreen() {
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [nomeAluno, setNomeAluno] = useState('');
  const [original, setOriginal] = useState<DiaTreino[]>([]);
  const [plano, setPlano] = useState<PlanoEditavel | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clientId) return;
    const [perfil, dados] = await Promise.all([getProfile(clientId), getWorkoutData(clientId)]);
    setNomeAluno(perfil?.nome || 'Aluno');
    const dias = dados.plano?.dias ?? [];
    setOriginal(dias);
    setPlano(
      planoParaEdicao(
        dias,
        dados.plano?.periodo ?? '',
        dados.plano?.treinador || profile?.nome || '',
        dados.plano?.publicado ?? false,
        dados.plano?.gerado_por_ia ?? false,
      ),
    );
  }, [clientId, profile?.nome]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!plano) return <Loading />;

  function atualizarDia(indice: number, mudanca: Partial<DiaEditavel>) {
    setPlano((atual) =>
      atual
        ? { ...atual, dias: atual.dias.map((d, i) => (i === indice ? { ...d, ...mudanca } : d)) }
        : atual,
    );
  }

  function atualizarExercicio(
    diaIndice: number,
    exIndice: number,
    mudanca: Partial<ExercicioEditavel>,
  ) {
    setPlano((atual) =>
      atual
        ? {
            ...atual,
            dias: atual.dias.map((d, i) =>
              i === diaIndice
                ? { ...d, ex: d.ex.map((e, j) => (j === exIndice ? { ...e, ...mudanca } : e)) }
                : d,
            ),
          }
        : atual,
    );
  }

  async function salvar() {
    if (!user || !clientId || !plano) return;
    setErro(null);
    setMensagem(null);
    setSalvando(true);
    try {
      await salvarPlano(clientId, user.id, plano);
      setMensagem('Plano salvo.');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar o plano.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarPublicacao() {
    if (!user || !clientId || !plano) return;
    setErro(null);
    setMensagem(null);
    setPublicando(true);
    try {
      const novoPlano = { ...plano, publicado: !plano.publicado, geradoPorIa: false };
      await salvarPlano(clientId, user.id, novoPlano);
      setMensagem(
        novoPlano.publicado
          ? 'Plano publicado — o aluno já pode ver.'
          : 'Plano despublicado — some da tela do aluno até publicar de novo.',
      );
      setPlano(novoPlano);
      setOriginal(prepararParaSalvar(novoPlano));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui atualizar a publicação.');
    } finally {
      setPublicando(false);
    }
  }

  async function gerarComIA() {
    if (!clientId || !plano) return;

    const temConteudo = plano.dias.some((d) => d.ex.some((e) => e.nome.trim()));
    if (temConteudo) {
      Alert.alert(
        'Gerar com IA',
        'Isso substitui o plano atual por uma sugestão da IA — revise antes de publicar. Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Gerar', style: 'destructive', onPress: executarGeracao },
        ],
      );
      return;
    }
    await executarGeracao();
  }

  async function executarGeracao() {
    if (!clientId) return;
    setErro(null);
    setMensagem(null);
    setGerando(true);
    try {
      const resultado = await gerarPlanoComIA(clientId, 'treino');
      if (resultado.ok) {
        setMensagem('Treino gerado — revise e publique quando estiver de acordo.');
        await carregar();
      } else {
        setErro(resultado.bloqueio.message);
      }
    } finally {
      setGerando(false);
    }
  }

  const removidos = idsRemovidos(original, plano.dias);

  return (
    <Screen title={nomeAluno} subtitle="Plano de treino" voltar>
      <AlunoTabs clientId={clientId!} ativo="treino" />

      <Card>
        <View style={styles.statusRow}>
          <Pill
            label={plano.publicado ? 'Publicado' : 'Rascunho'}
            active
            color={plano.publicado ? Palette.green : Palette.orange}
          />
          <View style={styles.statusActions}>
            <Button label="Gerar com IA" variant="ghost" onPress={gerarComIA} loading={gerando} />
            <Button
              label={plano.publicado ? 'Despublicar' : 'Publicar'}
              variant="ghost"
              color={plano.publicado ? Palette.orange : Palette.green}
              onPress={alternarPublicacao}
              loading={publicando}
            />
          </View>
        </View>
        <Caption>
          {plano.publicado
            ? 'Visível pro aluno. Edições ficam visíveis assim que salvas.'
            : 'Invisível pro aluno até você publicar — ele vê "seu plano está sendo montado".'}
        </Caption>
      </Card>

      {plano.geradoPorIa && (
        <Card>
          <Caption color={Palette.orange}>
            Sugestão de IA — revise antes de publicar. Qualquer alteração ou publicação já marca
            o plano como seu.
          </Caption>
        </Card>
      )}

      <Card>
        <Field
          label="Período"
          value={plano.periodo}
          onChangeText={(periodo) => setPlano({ ...plano, periodo })}
          placeholder="Ex.: Set/Out 2026"
        />
        <Field
          label="Treinador"
          value={plano.treinador}
          onChangeText={(treinador) => setPlano({ ...plano, treinador })}
        />
      </Card>

      {plano.dias.map((dia, i) => (
        <Card key={`${dia.id}-${i}`}>
          <View style={styles.diaHeader}>
            <View style={[styles.diaBadge, { backgroundColor: trainingColor(dia.tipo) }]}>
              <Caption color={Palette.background} style={styles.diaBadgeText}>
                {dia.id || '?'}
              </Caption>
            </View>
            <Field
              value={dia.nome}
              onChangeText={(nome) => atualizarDia(i, { nome })}
              placeholder="Nome do dia (ex.: Push)"
            />
          </View>

          <View style={styles.tipos}>
            {TIPOS.map((tipo) => (
              <Pill
                key={tipo}
                label={tipo}
                active={dia.tipo === tipo}
                color={trainingColor(tipo)}
                onPress={() => atualizarDia(i, { tipo })}
              />
            ))}
          </View>

          <Field
            label="Grupos musculares"
            value={dia.desc}
            onChangeText={(desc) => atualizarDia(i, { desc })}
            placeholder="Ex.: Peito · Ombro · Tríceps"
          />

          {dia.ex.map((ex, j) => (
            <View key={ex.id || `novo-${j}`} style={styles.exercicio}>
              <View style={styles.exHeader}>
                <Caption color={Palette.textTertiary}>{ex.id || 'novo'}</Caption>
                {dia.ex.length > 1 && (
                  <RemoveButton
                    label="✕"
                    onPress={() =>
                      atualizarDia(i, { ex: dia.ex.filter((_, indice) => indice !== j) })
                    }
                  />
                )}
              </View>

              <Field
                value={ex.nome}
                onChangeText={(nome) => atualizarExercicio(i, j, { nome })}
                placeholder="Nome do exercício"
              />

              <View style={styles.linha}>
                <Field
                  label="Séries"
                  value={String(ex.sets)}
                  keyboardType="number-pad"
                  onChangeText={(v) => atualizarExercicio(i, j, { sets: Number(v) || 0 })}
                />
                <Field
                  label={ex.tempo ? 'Seg. mín.' : 'Rep. mín.'}
                  value={String(ex.min)}
                  keyboardType="number-pad"
                  onChangeText={(v) => atualizarExercicio(i, j, { min: Number(v) || 0 })}
                />
                <Field
                  label={ex.tempo ? 'Seg. máx.' : 'Rep. máx.'}
                  value={String(ex.max)}
                  keyboardType="number-pad"
                  onChangeText={(v) => atualizarExercicio(i, j, { max: Number(v) || 0 })}
                />
              </View>

              <View style={styles.linha}>
                <Field
                  label="Warm up"
                  value={ex.warm}
                  onChangeText={(warm) => atualizarExercicio(i, j, { warm })}
                />
                <Field
                  label="Feeder"
                  value={ex.feeder}
                  onChangeText={(feeder) => atualizarExercicio(i, j, { feeder })}
                />
              </View>

              <Field
                label="Observação"
                value={ex.nota ?? ''}
                onChangeText={(nota) => atualizarExercicio(i, j, { nota })}
                placeholder="Ex.: sempre com sobrecarga"
              />

              <Field
                label="Vídeo (URL)"
                value={ex.video ?? ''}
                onChangeText={(video) => atualizarExercicio(i, j, { video })}
                placeholder="Link do vídeo de execução"
              />

              <ToggleRow
                label="Cronometrado (segundos)"
                value={!!ex.tempo}
                onValueChange={(tempo) => atualizarExercicio(i, j, { tempo })}
              />
              <ToggleRow
                label="Sensível ao ombro"
                value={!!ex.ombro}
                onValueChange={(ombro) => atualizarExercicio(i, j, { ombro })}
              />
            </View>
          ))}

          <Button
            label="+ Exercício"
            variant="ghost"
            onPress={() => atualizarDia(i, { ex: [...dia.ex, novoExercicio()] })}
          />
          {plano.dias.length > 1 && (
            <RemoveButton
              label="Remover dia"
              onPress={() =>
                setPlano({ ...plano, dias: plano.dias.filter((_, indice) => indice !== i) })
              }
            />
          )}
        </Card>
      ))}

      <Button
        label="+ Dia de treino"
        variant="ghost"
        onPress={() =>
          setPlano({ ...plano, dias: [...plano.dias, novoDia(plano.dias.map((d) => d.id))] })
        }
      />

      {removidos.length > 0 && (
        <Card>
          <SectionTitle>Atenção</SectionTitle>
          <Caption color={Palette.orange}>
            {removidos.length} exercício{removidos.length === 1 ? '' : 's'} sairá
            {removidos.length === 1 ? '' : 'ão'} do plano ({removidos.join(', ')}). O histórico de
            carga deles fica guardado no banco, mas some da tela do aluno.
          </Caption>
        </Card>
      )}

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
      {mensagem ? <Caption color={Palette.green}>{mensagem}</Caption> : null}

      <Button label="Salvar plano" onPress={salvar} loading={salvando} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  diaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  diaBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaBadgeText: {
    fontWeight: '800',
  },
  tipos: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  exercicio: {
    backgroundColor: Palette.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  exHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linha: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
