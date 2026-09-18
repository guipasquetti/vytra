import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { AlunoTabs } from '@/components/aluno-tabs';
import {
  BarraProgresso,
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  Field,
  Loading,
  Pill,
  Screen,
  SectionTitle,
  Sparkline,
  Stat,
} from '@/components/ui';
import { formatarData, formatarDataHora } from '@/models/domain';
import { listarAnexosDaAssinatura, obterUrlAnexo, type Anexo } from '@/services/anexosService';
import {
  historicoPeso,
  historicoPontuacao,
  listarCheckinsDoAluno,
  obterComparacaoFotos,
  resumoAdesao,
  type ComparacaoAngulo,
} from '@/services/checkinService';
import { obterPainelGestao, type ResumoAluno } from '@/services/gestaoService';
import { criarAtendimento, listarAtendimentosDoCliente, type Atendimento } from '@/services/leadsService';
import { getWorkoutData, streakTreino } from '@/services/workoutService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Spacing } from '@/theme';

type Evolucao = {
  pesos: { data: string; peso: number }[];
  pontuacoes: { data: string; pontuacao: number }[];
  adesao: { categoria: string; rotulo: string; mediaPontuacao: number }[];
  fotos: ComparacaoAngulo[];
  streak: number;
};

export default function ResumoPacienteScreen() {
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [paciente, setPaciente] = useState<ResumoAluno | null>(null);
  const [consultas, setConsultas] = useState<{ id: string; data_hora: string; status: string; observacoes: string | null }[]>([]);
  const [evolucao, setEvolucao] = useState<Evolucao | null>(null);
  const [prontuario, setProntuario] = useState<Atendimento[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [notaTexto, setNotaTexto] = useState('');
  const [notaTeleconsulta, setNotaTeleconsulta] = useState<string | null>(null);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user || !clientId) return;
    const painel = await obterPainelGestao(user.id);
    const encontrado = painel.alunos.find((aluno) => aluno.clientId === clientId) ?? null;
    setPaciente(encontrado);
    setConsultas(
      painel.agenda.filter((consulta) => consulta.patient_id === clientId).map((consulta) => ({
        id: consulta.id,
        data_hora: consulta.data_hora,
        status: consulta.status,
        observacoes: consulta.observacoes,
      })),
    );

    if (encontrado) {
      const [checkins, workout, fotos, atendimentos, docs] = await Promise.all([
        listarCheckinsDoAluno(clientId),
        getWorkoutData(clientId),
        obterComparacaoFotos(encontrado.subscriptionId),
        listarAtendimentosDoCliente(clientId),
        listarAnexosDaAssinatura(encontrado.subscriptionId),
      ]);
      setEvolucao({
        pesos: historicoPeso(checkins),
        pontuacoes: historicoPontuacao(checkins),
        adesao: resumoAdesao(checkins),
        fotos,
        streak: streakTreino(workout.historico),
      });
      setProntuario(atendimentos);
      setAnexos(docs);
    }
    setLoading(false);
  }, [clientId, user]);

  async function registrarNota() {
    if (!user || !clientId || !notaTexto.trim()) return;
    setSalvandoNota(true);
    try {
      await criarAtendimento({
        professional_id: user.id,
        client_id: clientId,
        teleconsulta_id: notaTeleconsulta,
        notas: notaTexto.trim(),
      });
      setNotaTexto('');
      setNotaTeleconsulta(null);
      setProntuario(await listarAtendimentosDoCliente(clientId));
    } finally {
      setSalvandoNota(false);
    }
  }

  useEffect(() => {
    const task = setTimeout(() => {
      void carregar();
    }, 0);
    return () => clearTimeout(task);
  }, [carregar]);

  if (loading || !user) return <Loading />;
  if (!paciente) return <EmptyState text="Paciente não encontrado na sua carteira." />;

  return (
    <Screen title={paciente.nome} subtitle="Resumo do acompanhamento" voltar>
      <AlunoTabs clientId={clientId!} ativo="resumo" />

      <Card>
        <Pill
          label={paciente.status === 'ativa' ? 'Acompanhamento ativo' : `Acompanhamento ${paciente.status}`}
          active
          color={paciente.status === 'ativa' ? Palette.green : Palette.orange}
        />
        <Caption>{paciente.planoNome ? `Serviço contratado: ${paciente.planoNome}` : 'Serviço ainda não confirmado.'}</Caption>
        {paciente.planoSolicitadoNome && !paciente.planoNome ? (
          <Caption color={Palette.orange}>Paciente pediu: {paciente.planoSolicitadoNome}</Caption>
        ) : null}
      </Card>

      <SectionTitle>Anamnese</SectionTitle>
      <Card>
        {paciente.objetivoAnamnese ? <Body>Objetivo: {paciente.objetivoAnamnese}</Body> : null}
        {paciente.flagSaude ? (
          <Caption color={Palette.orange}>Atenção: {paciente.flagSaude}</Caption>
        ) : null}
        {paciente.alergiasAnamnese ? <Caption>Alergias: {paciente.alergiasAnamnese}</Caption> : null}
        {!paciente.objetivoAnamnese && !paciente.flagSaude && !paciente.alergiasAnamnese ? (
          <Caption color={Palette.orange}>Paciente ainda não respondeu a anamnese.</Caption>
        ) : null}
        <Button
          label="Ver anamnese completa"
          variant="ghost"
          onPress={() => router.push(`/pro/aluno/${clientId}/anamnese`)}
        />
      </Card>

      <SectionTitle>Prescrições</SectionTitle>
      <Card>
        <Body>Treino</Body>
        <Caption color={paciente.temPlanoTreino ? Palette.green : Palette.orange}>
          {paciente.temPlanoTreino ? 'Plano criado' : 'Ainda não criado'}
        </Caption>
        <Button
          label={paciente.temPlanoTreino ? 'Editar treino' : 'Criar treino'}
          onPress={() => router.push(`/pro/aluno/${clientId}`)}
        />
      </Card>
      <Card>
        <Body>Dieta</Body>
        <Caption color={paciente.temPlanoDieta ? Palette.green : Palette.orange}>
          {paciente.temPlanoDieta ? 'Plano criado' : 'Ainda não criado'}
        </Caption>
        <Button
          label={paciente.temPlanoDieta ? 'Editar dieta' : 'Criar dieta'}
          color={Palette.purple}
          onPress={() => router.push(`/pro/aluno/${clientId}/dieta`)}
        />
      </Card>

      <SectionTitle>Evolução</SectionTitle>
      <Card>
        <Stat value={String(evolucao?.streak ?? 0)} label={evolucao?.streak === 1 ? 'dia seguido' : 'dias seguidos'} color={Palette.orange} />
      </Card>

      {evolucao && evolucao.pesos.length >= 2 ? (
        <Card>
          <SectionTitle>Peso</SectionTitle>
          <Caption>
            {evolucao.pesos[evolucao.pesos.length - 1].peso}kg mais recente · desde{' '}
            {formatarData(evolucao.pesos[0].data.slice(0, 10))}
          </Caption>
          <Sparkline valores={evolucao.pesos.map((p) => p.peso)} cor={Palette.blue} />
        </Card>
      ) : null}

      {evolucao && evolucao.pontuacoes.length >= 2 ? (
        <Card>
          <SectionTitle>Pontuação de check-in</SectionTitle>
          <Caption>{evolucao.pontuacoes[evolucao.pontuacoes.length - 1].pontuacao}% mais recente</Caption>
          <Sparkline valores={evolucao.pontuacoes.map((p) => p.pontuacao)} cor={Palette.purple} />
        </Card>
      ) : null}

      {evolucao && evolucao.adesao.length ? (
        <Card>
          <SectionTitle>Adesão (últimos check-ins)</SectionTitle>
          {evolucao.adesao.map((a) => (
            <View key={a.categoria} style={{ gap: Spacing.xs }}>
              <Caption>{a.categoria} — {a.rotulo} ({a.mediaPontuacao}%)</Caption>
              <BarraProgresso valor={a.mediaPontuacao} total={100} cor={Palette.accent} />
            </View>
          ))}
        </Card>
      ) : null}

      {evolucao && evolucao.fotos.length ? (
        <Card>
          <SectionTitle>Fotos de progresso</SectionTitle>
          {evolucao.fotos.map((f) => (
            <View key={f.angulo} style={{ gap: Spacing.xs }}>
              <Caption>{f.label}</Caption>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {f.primeira ? <Image source={{ uri: f.primeira.url }} style={{ width: 100, height: 130, borderRadius: 8 }} /> : null}
                {f.ultima ? <Image source={{ uri: f.ultima.url }} style={{ width: 100, height: 130, borderRadius: 8 }} /> : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <SectionTitle>Consultas</SectionTitle>
      {consultas.length ? (
        consultas.map((consulta) => (
          <Card key={consulta.id}>
            <Body>{formatarDataHora(consulta.data_hora)}</Body>
            <Caption color={consulta.status === 'realizada' ? Palette.green : Palette.textSecondary}>
              {consulta.status}
            </Caption>
            {consulta.observacoes ? <Caption>{consulta.observacoes}</Caption> : null}
          </Card>
        ))
      ) : (
        <EmptyState text="Nenhuma consulta registrada para este paciente." />
      )}
      <SectionTitle>Documentos do paciente</SectionTitle>
      {anexos.length ? (
        anexos.map((a) => (
          <Card key={a.id}>
            <Body>{a.nome_arquivo}</Body>
            <Caption color={Palette.textTertiary}>
              {a.categoria} · {formatarDataHora(a.created_at)}
            </Caption>
            {a.observacao ? <Caption>{a.observacao}</Caption> : null}
            <Button
              label="Abrir"
              variant="ghost"
              onPress={async () => {
                const url = await obterUrlAnexo(a.storage_path);
                if (url) {
                  const { Linking } = await import('react-native');
                  Linking.openURL(url);
                }
              }}
            />
          </Card>
        ))
      ) : (
        <EmptyState text="Paciente ainda não enviou nenhum documento." />
      )}

      <SectionTitle>Prontuário</SectionTitle>
      <Card>
        <Field
          label="Nova nota"
          value={notaTexto}
          onChangeText={setNotaTexto}
          placeholder="Evolução, observação clínica, orientação combinada..."
          multiline
        />
        {consultas.length > 0 ? (
          <View style={{ gap: Spacing.xs }}>
            <Caption color={Palette.textTertiary}>Ligar a uma consulta (opcional)</Caption>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
              <Pill label="Nota avulsa" active={notaTeleconsulta === null} onPress={() => setNotaTeleconsulta(null)} />
              {consultas.map((consulta) => (
                <Pill
                  key={consulta.id}
                  label={formatarDataHora(consulta.data_hora)}
                  active={notaTeleconsulta === consulta.id}
                  onPress={() => setNotaTeleconsulta(consulta.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <Button
          label="Registrar nota"
          onPress={registrarNota}
          disabled={!notaTexto.trim()}
          loading={salvandoNota}
        />
      </Card>

      {prontuario.length ? (
        prontuario.map((atendimento) => {
          const consultaLigada = atendimento.teleconsulta_id
            ? consultas.find((c) => c.id === atendimento.teleconsulta_id)
            : null;
          return (
            <Card key={atendimento.id}>
              <Caption color={Palette.textTertiary}>
                {formatarDataHora(atendimento.data_atendimento)}
                {consultaLigada ? ` · consulta de ${formatarDataHora(consultaLigada.data_hora)}` : ''}
              </Caption>
              <Body>{atendimento.notas}</Body>
            </Card>
          );
        })
      ) : (
        <EmptyState text="Nenhuma nota de prontuário registrada ainda." />
      )}

      <Button label="Agendar consulta no Início" variant="ghost" onPress={() => router.push('/pro')} />
    </Screen>
  );
}
