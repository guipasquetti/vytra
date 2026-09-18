import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CampoData } from '@/components/campo-data';
import { Body, Button, Caption, Card, EmptyState, Field, Loading, Screen, SectionTitle } from '@/components/ui';
import { formatarData, formatarDataHora } from '@/models/domain';
import {
  atualizarLead,
  criarAtendimento,
  criarLead,
  listarAtendimentosDoLead,
  listarLeads,
  type Atendimento,
  type Lead,
} from '@/services/leadsService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Spacing } from '@/theme';

export default function LeadsScreen() {
  const user = useAuthStore((s) => s.user);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    if (!user) return;
    setLeads(await listarLeads(user.id));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLeads([]);
      setLoading(true);
      return;
    }
    carregar();
  }, [user, carregar]);

  if (loading || !user) return <Loading />;

  const abertos = leads.filter((l) => l.status === 'lead');
  const perdidos = leads.filter((l) => l.status === 'perdido');

  return (
    <Screen title="Leads" subtitle="Pessoas em conversa que ainda não são pacientes">
      <Card>
        <SectionTitle>Como funciona</SectionTitle>
        <Caption>Registre a conversa, envie o convite e acompanhe o cadastro. Depois de concluir o convite, a pessoa entra em Pacientes.</Caption>
      </Card>

      <SectionTitle>Em avaliação</SectionTitle>
      {abertos.length ? (
        abertos.map((lead) => <LeadCard key={lead.id} lead={lead} onMudou={carregar} />)
      ) : (
        <EmptyState text="Nenhum lead em avaliação. Adicione alguém antes de registrar a primeira conversa." />
      )}

      {criando ? (
        <NovoLeadForm
          professionalId={user.id}
          onCancelar={() => setCriando(false)}
          onCriado={async () => {
            setCriando(false);
            await carregar();
          }}
        />
      ) : (
        <Button label="Adicionar lead" onPress={() => setCriando(true)} />
      )}

      {perdidos.length ? (
        <>
          <SectionTitle>Encerrados</SectionTitle>
          {perdidos.map((lead) => <LeadCard key={lead.id} lead={lead} onMudou={carregar} />)}
        </>
      ) : null}
    </Screen>
  );
}

type LeadFormValues = {
  nome: string;
  telefone: string;
  email: string;
  dataRetomada: string;
  observacoes: string;
};

function valoresIniciais(lead?: Lead): LeadFormValues {
  return {
    nome: lead?.nome ?? '',
    telefone: lead?.telefone ?? '',
    email: lead?.email ?? '',
    dataRetomada: lead?.data_retomada ?? '',
    observacoes: lead?.observacoes ?? '',
  };
}

function LeadCard({ lead, onMudou }: { lead: Lead; onMudou: () => Promise<void> }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [opcoes, setOpcoes] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function alternarPerdido() {
    setSalvando(true);
    try {
      await atualizarLead(lead.id, { status: lead.status === 'perdido' ? 'lead' : 'perdido' });
      await onMudou();
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <LeadForm
        titulo="Editar lead"
        valores={valoresIniciais(lead)}
        onCancelar={() => setEditando(false)}
        onSalvar={async (dados) => {
          await atualizarLead(lead.id, dados);
          setEditando(false);
          await onMudou();
        }}
      />
    );
  }

  const retomadaVencida = !!lead.data_retomada && lead.data_retomada <= new Date().toISOString().slice(0, 10);

  return (
    <Card style={lead.status === 'perdido' ? styles.perdido : undefined}>
      <View style={styles.header}>
        <Body style={styles.nome}>{lead.nome}</Body>
        <Caption color={lead.status === 'perdido' ? Palette.textTertiary : lead.convite_id ? Palette.accent : Palette.textSecondary}>
          {lead.status === 'perdido' ? 'Encerrado' : lead.convite_id ? 'Convite enviado' : 'Em avaliação'}
        </Caption>
      </View>
      {lead.telefone || lead.email ? (
        <Caption>{[lead.telefone, lead.email].filter(Boolean).join(' · ')}</Caption>
      ) : null}
      {lead.data_retomada ? (
        <Caption color={retomadaVencida ? Palette.orange : Palette.textSecondary}>
          Próxima retomada: {formatarData(lead.data_retomada)}
        </Caption>
      ) : null}
      {lead.observacoes ? <Caption>{lead.observacoes}</Caption> : null}

      <View style={styles.acoes}>
        <Button
          label={expandido ? 'Fechar histórico' : 'Registrar conversa'}
          variant="ghost"
          onPress={() => setExpandido((v) => !v)}
        />
        {lead.status === 'lead' && !lead.convite_id ? (
          <Button
            label="Enviar convite"
            onPress={() =>
              router.push(
                `/pro/convite?leadId=${lead.id}&nome=${encodeURIComponent(lead.nome)}&email=${encodeURIComponent(lead.email ?? '')}`
              )
            }
          />
        ) : null}
        {lead.status === 'lead' && lead.convite_id ? (
          <Button
            label="Reenviar convite"
            variant="ghost"
            onPress={() => router.push(`/pro/convite?leadId=${lead.id}&conviteId=${lead.convite_id}`)}
          />
        ) : null}
        <Button label="Mais opções" variant="ghost" onPress={() => setOpcoes((v) => !v)} />
      </View>

      {lead.convite_id ? <Caption>Convite enviado. Aguardando a conclusão do cadastro para entrar em Pacientes.</Caption> : null}

      {opcoes ? (
        <View style={styles.opcoes}>
          <Button label="Editar dados" variant="ghost" onPress={() => setEditando(true)} />
        <Button
          label={lead.status === 'perdido' ? 'Reabrir avaliação' : 'Encerrar lead'}
          variant="ghost"
          color={lead.status === 'perdido' ? Palette.accent : Palette.danger}
          onPress={alternarPerdido}
          disabled={salvando}
        />
        </View>
      ) : null}

      {expandido ? <AtendimentosDoLead leadId={lead.id} professionalId={lead.professional_id} /> : null}
    </Card>
  );
}

function AtendimentosDoLead({ leadId, professionalId }: { leadId: string; professionalId: string }) {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [notas, setNotas] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setAtendimentos(await listarAtendimentosDoLead(leadId));
    setCarregado(true);
  }, [leadId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function registrar() {
    if (!notas.trim()) return;
    setSalvando(true);
    try {
      await criarAtendimento({ professional_id: professionalId, lead_id: leadId, notas: notas.trim() });
      setNotas('');
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.atendimentos}>
      <SectionTitle>Histórico de conversas</SectionTitle>
      {carregado && atendimentos.length === 0 ? <Caption>Nenhuma conversa registrada ainda.</Caption> : null}
      {atendimentos.map((a) => (
        <View key={a.id} style={styles.atendimento}>
          <Caption color={Palette.text}>{formatarDataHora(a.data_atendimento)}</Caption>
          {a.notas ? <Caption>{a.notas}</Caption> : null}
        </View>
      ))}
      <Field
        label="Registrar conversa"
        value={notas}
        onChangeText={setNotas}
        placeholder="Hábitos, expectativa, contexto, objeções..."
        multiline
      />
      <Button label="Salvar conversa" variant="ghost" onPress={registrar} loading={salvando} />
    </View>
  );
}

function NovoLeadForm({
  professionalId,
  onCriado,
  onCancelar,
}: {
  professionalId: string;
  onCriado: () => Promise<void>;
  onCancelar: () => void;
}) {
  return (
    <LeadForm
      titulo="Novo lead"
      valores={valoresIniciais()}
      onCancelar={onCancelar}
      onSalvar={async (dados) => {
        await criarLead({ ...dados, professional_id: professionalId });
        await onCriado();
      }}
    />
  );
}

function LeadForm({
  titulo,
  valores,
  onSalvar,
  onCancelar,
}: {
  titulo: string;
  valores: LeadFormValues;
  onSalvar: (dados: {
    nome: string;
    telefone: string | null;
    email: string | null;
    data_retomada: string | null;
    observacoes: string | null;
  }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(valores.nome);
  const [telefone, setTelefone] = useState(valores.telefone);
  const [email, setEmail] = useState(valores.email);
  const [dataRetomada, setDataRetomada] = useState(valores.dataRetomada);
  const [observacoes, setObservacoes] = useState(valores.observacoes);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) {
      setErro('Dê um nome ao lead.');
      return;
    }
    if (dataRetomada && !/^\d{4}-\d{2}-\d{2}$/.test(dataRetomada)) {
      setErro('Data de retomada no formato AAAA-MM-DD.');
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await onSalvar({
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        data_retomada: dataRetomada || null,
        observacoes: observacoes.trim() || null,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar o lead.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <SectionTitle>{titulo}</SectionTitle>
      <Field label="Nome" value={nome} onChangeText={setNome} placeholder="Nome do lead" />
      <Field label="Telefone" value={telefone} onChangeText={setTelefone} placeholder="(xx) xxxxx-xxxx" />
      <Field label="E-mail" value={email} onChangeText={setEmail} placeholder="email@lead.com" />
      <CampoData
        label="Retomar em (opcional)"
        value={dataRetomada}
        onChangeText={setDataRetomada}
        comCalendario
        dataMinima={new Date()}
      />
      <Field label="Observações" value={observacoes} onChangeText={setObservacoes} multiline />

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}

      <Button label="Salvar lead" onPress={salvar} loading={salvando} />
      <Button label="Cancelar" variant="ghost" onPress={onCancelar} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  nome: {
    flex: 1,
  },
  perdido: {
    opacity: 0.5,
  },
  acoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  opcoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.border,
  },
  atendimentos: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.border,
  },
  atendimento: {
    gap: 2,
  },
});
