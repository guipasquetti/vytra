import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Body, Button, Caption, Card, EmptyState, Field, Loading, Pill, Screen, SectionTitle } from '@/components/ui';
import { formatarDataHora } from '@/models/domain';
import { obterPainelGestao, type PainelGestao, type ResumoAluno } from '@/services/gestaoService';
import { confirmarPlanoSolicitado } from '@/services/professionalService';
import { atualizarStatusTeleconsulta, criarTeleconsulta, type TeleconsultaComPaciente } from '@/services/teleconsultaService';
import { obterMinhaVerificacao, type VerificacaoProfissional } from '@/services/verificacaoService';
import { useAuthStore } from '@/store/authStore';
import { FontSize, Palette, Radius, RoleColors, Spacing } from '@/theme';

type Alerta = { clientId: string; nome: string; texto: string };

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Por aluno, não por especialidade do profissional (§45 do handoff) — cada par
 * paciente↔profissional contratou o que o PLANO CONFIRMADO dele inclui (`incluiTreino`/
 * `incluiDieta`), e um profissional pode vender planos mistos mesmo sem ser formado nos dois
 * (ex.: nutricionista que também monta treino por experiência).
 */
function montarAlertas(alunos: ResumoAluno[]): Alerta[] {
  const alertas: Alerta[] = [];
  for (const aluno of alunos) {
    if (aluno.incluiTreino) {
      const dias = diasDesde(aluno.ultimoTreino);
      if (dias === null || dias > 7) {
        alertas.push({
          clientId: aluno.clientId,
          nome: aluno.nome,
          texto: dias === null ? 'Nunca treinou' : `Sem treino há ${dias} dia${dias === 1 ? '' : 's'}`,
        });
      }
      if (!aluno.temPlanoTreino) {
        alertas.push({ clientId: aluno.clientId, nome: aluno.nome, texto: 'Sem treino montado ainda' });
      }
    }
    if (aluno.incluiDieta && !aluno.temPlanoDieta) {
      alertas.push({ clientId: aluno.clientId, nome: aluno.nome, texto: 'Sem plano alimentar montado' });
    }
    if (aluno.flagSaude) {
      alertas.push({ clientId: aluno.clientId, nome: aluno.nome, texto: `Saúde: ${aluno.flagSaude}` });
    }
    // Só cobra check-in de quem já tem pelo menos uma prescrição rodando — sem isso, ainda é
    // aluno novo esperando o profissional montar o plano, não faz sentido nagar check-in.
    const recebendoServico = (aluno.incluiTreino && aluno.temPlanoTreino) || (aluno.incluiDieta && aluno.temPlanoDieta);
    if (recebendoServico) {
      const diasCheckin = diasDesde(aluno.ultimoCheckin);
      if (diasCheckin === null || diasCheckin > 14) {
        alertas.push({
          clientId: aluno.clientId,
          nome: aluno.nome,
          texto:
            diasCheckin === null
              ? 'Nunca respondeu check-in'
              : `Check-in atrasado há ${diasCheckin} dias`,
        });
      }
    }
  }
  return alertas;
}

export default function PainelScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [painel, setPainel] = useState<PainelGestao | null>(null);
  const [verificacao, setVerificacao] = useState<VerificacaoProfissional | null>(null);
  const [loading, setLoading] = useState(true);
  const [agendando, setAgendando] = useState(false);
  const [diaSelecionado, setDiaSelecionado] = useState(chaveDoDia(new Date()));

  const carregar = useCallback(async () => {
    if (!user) return;
    const [dadosPainel, dadosVerificacao] = await Promise.all([
      obterPainelGestao(user.id),
      obterMinhaVerificacao(user.id),
    ]);
    setPainel(dadosPainel);
    setVerificacao(dadosVerificacao);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(true);
      return;
    }
    carregar();
  }, [user, carregar]);

  if (loading || !user || !painel) return <Loading />;

  const nutricionista = painel.especialidade === 'nutricionista';
  const alertas = montarAlertas(painel.alunos);
  // Visibilidade dos indicadores de treino é por carteira real, não pela especialidade
  // cadastrada — um nutricionista com algum paciente de plano misto (§45) ainda precisa ver
  // essas métricas pros pacientes que treinam com ele.
  const algumComTreino = painel.alunos.some((a) => a.incluiTreino);
  const algumComDieta = painel.alunos.some((a) => a.incluiDieta);
  const labelSemPlano =
    algumComTreino && algumComDieta
      ? 'Sem plano completo'
      : algumComDieta
        ? 'Sem plano alimentar'
        : 'Sem treino montado';

  return (
    <Screen
      title="Início"
      subtitle={nutricionista ? 'Adesão alimentar e próximos retornos' : 'Treinos, evolução e próximas ações'}
      right={
        <Pressable
          onPress={() => router.push('/pro/leads')}
          style={({ pressed }) => [styles.convidar, pressed && styles.convidarPressed]}>
          <Caption color={Palette.text} style={styles.convidarText}>
            + Lead
          </Caption>
        </Pressable>
      }>
      {verificacao && verificacao.status !== 'aprovado' ? (
        <Card style={verificacao.status === 'rejeitado' ? styles.avisoRejeitado : styles.avisoPendente}>
          <SectionTitle>
            {verificacao.status === 'rejeitado' ? 'Verificação rejeitada' : 'Verificação pendente'}
          </SectionTitle>
          <Caption color={Palette.text}>
            Registro {verificacao.numeroRegistro}/{verificacao.ufRegistro}
            {verificacao.status === 'rejeitado'
              ? ` — ${verificacao.motivoRejeicao || 'fala com a gente pra entender o motivo.'}`
              : ' ainda em análise. Seu Painel já funciona normalmente enquanto isso.'}
          </Caption>
        </Card>
      ) : null}

      <SectionTitle>Visão da carteira</SectionTitle>
      <View style={styles.indicadores}>
        <Indicador value={painel.totalAlunos} label="Pacientes" />
        <Indicador value={painel.ativos} label="Acompanhamentos ativos" destaque />
        <Indicador value={painel.semPlano} label={labelSemPlano} atencao />
        <Indicador value={painel.checkinsAtrasados} label="Check-ins atrasados" atencao />
        {algumComTreino ? <Indicador value={painel.semTreino7d} label="Sem treino há 7 dias" atencao /> : null}
        <Indicador value={painel.leadsPendentes} label="Convites aguardando" />
      </View>

      {painel.alunos.some((a) => !a.planoNome && a.planoSolicitadoId) ? (
        <>
          <SectionTitle>Pedidos de serviço</SectionTitle>
          {painel.alunos
            .filter((a) => !a.planoNome && a.planoSolicitadoId)
            .map((a) => <PedidoPlanoCard key={a.subscriptionId} aluno={a} onMudou={carregar} />)}
        </>
      ) : null}

      <SectionTitle>Atenção necessária</SectionTitle>
      {alertas.length ? (
        alertas.map((a, i) => (
          <Card key={`${a.clientId}-${i}`} onPress={() => router.push(`/pro/aluno/${a.clientId}/resumo`)}>
            <Body>{a.nome}</Body>
            <Caption color={Palette.orange}>{a.texto}</Caption>
          </Card>
        ))
      ) : (
        <EmptyState text="Nada pedindo atenção agora." />
      )}

      <SectionTitle>Agenda de teleconsultas</SectionTitle>
      <AgendaSemana
        consultas={painel.agenda}
        diaSelecionado={diaSelecionado}
        onSelecionarDia={setDiaSelecionado}
      />
      {painel.agenda.filter((consulta) => chaveDoDia(new Date(consulta.data_hora)) === diaSelecionado).length ? (
        painel.agenda
          .filter((consulta) => chaveDoDia(new Date(consulta.data_hora)) === diaSelecionado)
          .map((c) => <ConsultaCard key={c.id} consulta={c} onMudou={carregar} />)
      ) : (
        <EmptyState text="Nenhuma teleconsulta neste dia." />
      )}
      {agendando ? (
        <NovaConsultaForm
          professionalId={user.id}
          alunos={painel.alunos}
          onCancelar={() => setAgendando(false)}
          onCriada={async () => {
            setAgendando(false);
            await carregar();
          }}
        />
      ) : (
        <Button label="Agendar teleconsulta" variant="ghost" onPress={() => setAgendando(true)} />
      )}

      <SectionTitle>Pacientes</SectionTitle>
      <Caption>Abra a carteira para consultar cada paciente, seus planos e histórico.</Caption>
      <Button label="Ver pacientes" variant="ghost" onPress={() => router.push('/pro/pacientes')} />
    </Screen>
  );
}

function chaveDoDia(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function proximosSeteDias(): Date[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, indice) => {
    const dia = new Date(hoje);
    dia.setDate(hoje.getDate() + indice);
    return dia;
  });
}

function AgendaSemana({
  consultas,
  diaSelecionado,
  onSelecionarDia,
}: {
  consultas: TeleconsultaComPaciente[];
  diaSelecionado: string;
  onSelecionarDia: (dia: string) => void;
}) {
  return (
    <View style={styles.semana}>
      {proximosSeteDias().map((dia) => {
        const chave = chaveDoDia(dia);
        const quantidade = consultas.filter(
          (consulta) => consulta.status === 'agendada' && chaveDoDia(new Date(consulta.data_hora)) === chave,
        ).length;
        const selecionado = chave === diaSelecionado;
        return (
          <Pressable
            key={chave}
            onPress={() => onSelecionarDia(chave)}
            style={[styles.diaAgenda, selecionado && styles.diaAgendaSelecionado]}>
            <Caption color={selecionado ? Palette.accent : Palette.textTertiary} style={styles.diaSemana}>
              {dia.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
            </Caption>
            <Body color={selecionado ? Palette.text : Palette.textSecondary} style={styles.diaNumero}>
              {dia.getDate()}
            </Body>
            <View style={[styles.diaMarcador, quantidade > 0 && styles.diaMarcadorAtivo]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function Indicador({
  value,
  label,
  destaque = false,
  atencao = false,
}: {
  value: number;
  label: string;
  destaque?: boolean;
  atencao?: boolean;
}) {
  const cor = atencao ? Palette.vitalAlert : destaque ? Palette.accent : Palette.text;
  return (
    <View style={[styles.indicador, atencao && styles.indicadorAtencao]}>
      <Caption style={styles.indicadorLabel}>{label}</Caption>
      <Body color={cor} style={styles.indicadorValor}>
        {value}
      </Body>
    </View>
  );
}

/**
 * Aluno respondeu a anamnese e pediu um plano no onboarding (§12), mas ninguém confirmou
 * ainda — enquanto isso, treino e dieta ficam bloqueados pro aluno. "Confirmar" grava
 * `plan_id` de verdade (`confirmarPlanoSolicitado`), que é o que libera.
 */
function PedidoPlanoCard({ aluno, onMudou }: { aluno: ResumoAluno; onMudou: () => Promise<void> }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!aluno.planoSolicitadoId) return;
    setSalvando(true);
    try {
      await confirmarPlanoSolicitado(aluno.subscriptionId, aluno.planoSolicitadoId);
      await onMudou();
    } finally {
      setSalvando(false);
    }
  }

  return (
      <Card onPress={() => router.push(`/pro/aluno/${aluno.clientId}/resumo`)}>
      <View style={styles.header}>
        <Body style={styles.nome}>{aluno.nome}</Body>
        <Caption color={Palette.blue}>Pediu: {aluno.planoSolicitadoNome}</Caption>
      </View>
      <Button label={`Confirmar ${aluno.planoSolicitadoNome}`} onPress={confirmar} loading={salvando} />
    </Card>
  );
}

function ConsultaCard({
  consulta,
  onMudou,
}: {
  consulta: TeleconsultaComPaciente;
  onMudou: () => Promise<void>;
}) {
  const [salvando, setSalvando] = useState(false);

  async function marcar(status: 'realizada' | 'cancelada') {
    setSalvando(true);
    try {
      await atualizarStatusTeleconsulta(consulta.id, status);
      await onMudou();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <View style={styles.header}>
        <Body style={styles.nome}>{consulta.pacienteNome}</Body>
        <Caption color={STATUS_COR[consulta.status] ?? Palette.textSecondary} style={styles.statusUpper}>
          {consulta.status}
        </Caption>
      </View>
      <Caption color={Palette.text}>{formatarDataHora(consulta.data_hora)}</Caption>
      {consulta.observacoes ? <Caption>{consulta.observacoes}</Caption> : null}

      {consulta.status === 'agendada' ? (
        <View style={styles.acoes}>
          <Button label="Entrar" onPress={() => Linking.openURL(consulta.link_meet)} />
          <Button label="Realizada" variant="ghost" onPress={() => marcar('realizada')} disabled={salvando} />
          <Button
            label="Cancelar"
            variant="ghost"
            color={Palette.danger}
            onPress={() => marcar('cancelada')}
            disabled={salvando}
          />
        </View>
      ) : null}
    </Card>
  );
}

const STATUS_COR: Record<string, string> = {
  agendada: Palette.blue,
  realizada: Palette.green,
  cancelada: Palette.textTertiary,
};

function NovaConsultaForm({
  professionalId,
  alunos,
  onCriada,
  onCancelar,
}: {
  professionalId: string;
  alunos: ResumoAluno[];
  onCriada: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [link, setLink] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!pacienteId) {
      setErro('Escolha o paciente.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      setErro('Data no formato AAAA-MM-DD.');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(hora)) {
      setErro('Hora no formato HH:MM.');
      return;
    }
    if (!link.trim()) {
      setErro('Cola o link do Meet (gere em meet.google.com/new).');
      return;
    }
    const dataHora = new Date(`${data}T${hora}:00`);
    if (Number.isNaN(dataHora.getTime())) {
      setErro('Data ou hora inválida.');
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await criarTeleconsulta({
        professional_id: professionalId,
        patient_id: pacienteId,
        data_hora: dataHora.toISOString(),
        link_meet: link.trim(),
        observacoes: observacoes.trim(),
      });
      await onCriada();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui agendar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Nova teleconsulta</SectionTitle>

      <Caption>Paciente</Caption>
      <View style={styles.alunosPicker}>
        {alunos.map((a) => (
          <Pill
            key={a.clientId}
            label={a.nome}
            active={pacienteId === a.clientId}
            onPress={() => setPacienteId(a.clientId)}
          />
        ))}
      </View>

      <Field label="Data" value={data} onChangeText={setData} placeholder="AAAA-MM-DD" />
      <Field label="Hora" value={hora} onChangeText={setHora} placeholder="HH:MM" />
      <Field
        label="Link do Meet"
        value={link}
        onChangeText={setLink}
        placeholder="https://meet.google.com/xxx-xxxx-xxx"
      />
      <Field label="Observações (opcional)" value={observacoes} onChangeText={setObservacoes} multiline />

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}

      <Button label="Agendar" onPress={salvar} loading={salvando} />
      <Button label="Cancelar" variant="ghost" onPress={onCancelar} />
    </Card>
  );
}

const styles = StyleSheet.create({
  avisoPendente: {
    borderWidth: 1,
    borderColor: Palette.blue,
  },
  avisoRejeitado: {
    borderWidth: 1,
    borderColor: Palette.danger,
  },
  convidar: {
    backgroundColor: RoleColors.profissional,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.lg,
  },
  convidarPressed: {
    opacity: 0.7,
  },
  convidarText: {
    fontWeight: '800',
  },
  indicadores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  semana: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  diaAgenda: {
    flex: 1,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
  },
  diaAgendaSelecionado: {
    borderColor: Palette.accent,
    backgroundColor: Palette.surface,
  },
  diaSemana: {
    fontSize: FontSize.caption,
    textTransform: 'uppercase',
  },
  diaNumero: {
    fontSize: FontSize.headline,
    fontWeight: '800',
  },
  diaMarcador: {
    width: 4,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: 'transparent',
  },
  diaMarcadorAtivo: {
    backgroundColor: Palette.accent,
  },
  indicador: {
    width: '48%',
    minHeight: 92,
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.border,
  },
  indicadorAtencao: {
    borderColor: Palette.vitalAlert,
  },
  indicadorLabel: {
    lineHeight: 16,
  },
  indicadorValor: {
    fontSize: FontSize.stat,
    fontWeight: '800',
    lineHeight: FontSize.stat,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  nome: {
    flex: 1,
  },
  statusUpper: {
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  acoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  alunosPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
