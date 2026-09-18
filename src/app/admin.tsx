import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Caption, Card, EmptyState, Field, Loading, Screen, SectionTitle } from '@/components/ui';
import { formatarDataHora } from '@/models/domain';
import { rotuloEspecialidade } from '@/services/solicitacoesService';
import {
  aprovarVerificacao,
  listarVerificacoesPendentes,
  obterUrlDocumento,
  rejeitarVerificacao,
  type SolicitacaoVerificacaoAdmin,
} from '@/services/verificacaoService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Spacing } from '@/theme';

const LINKS_CONSELHO: Record<string, string> = {
  CREF: 'https://www.confef.org.br',
  CRN: 'https://www.cfn.org.br',
};

/**
 * Fila de verificação de profissionais (§0, 04/set) — só quem tem `profiles.is_admin = true`
 * usa isso (hoje, só o Guilherme). Não é papel formal (RBAC), é uma flag simples — ver
 * migração `20260904_cadastro_profissional_verificado.sql`.
 */
export default function AdminScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoVerificacaoAdmin[] | null>(null);

  const carregar = useCallback(async () => {
    setSolicitacoes(await listarVerificacoesPendentes());
  }, []);

  useEffect(() => {
    if (profile?.is_admin) carregar();
  }, [profile?.is_admin, carregar]);

  if (!profile) return <Loading />;

  if (!profile.is_admin) {
    return (
      <Screen title="Sem acesso" voltar>
        <EmptyState text="Essa área é restrita." />
      </Screen>
    );
  }

  if (solicitacoes === null) return <Loading />;

  return (
    <Screen title="Verificações" subtitle="Profissionais aguardando aprovação" voltar>
      {solicitacoes.length ? (
        solicitacoes.map((s) => (
          <SolicitacaoCard key={s.id} solicitacao={s} adminId={profile.id} onMudou={carregar} />
        ))
      ) : (
        <EmptyState text="Nenhuma verificação pendente." />
      )}
    </Screen>
  );
}

function SolicitacaoCard({
  solicitacao,
  adminId,
  onMudou,
}: {
  solicitacao: SolicitacaoVerificacaoAdmin;
  adminId: string;
  onMudou: () => Promise<void>;
}) {
  const [urlDocumento, setUrlDocumento] = useState<string | null>(null);
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    if (solicitacao.documentoPath) {
      obterUrlDocumento(solicitacao.documentoPath).then(setUrlDocumento);
    }
  }, [solicitacao.documentoPath]);

  async function aprovar() {
    setProcessando(true);
    try {
      await aprovarVerificacao(solicitacao.id, adminId);
      await onMudou();
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarRejeicao() {
    if (!motivo.trim()) return;
    setProcessando(true);
    try {
      await rejeitarVerificacao(solicitacao.id, adminId, motivo.trim());
      await onMudou();
    } finally {
      setProcessando(false);
    }
  }

  return (
    <Card>
      <SectionTitle>{solicitacao.professionalNome}</SectionTitle>
      <Caption color={Palette.text}>{solicitacao.professionalEmail}</Caption>
      <Caption>{rotuloEspecialidade(solicitacao.especialidade)}</Caption>
      <Caption color={Palette.text}>
        Registro: {solicitacao.tipoRegistro ? `${solicitacao.tipoRegistro} ` : ''}
        {solicitacao.numeroRegistro}/{solicitacao.ufRegistro}
      </Caption>
      {solicitacao.cpf ? <Caption>CPF: {solicitacao.cpf}</Caption> : null}
      {solicitacao.bio ? <Caption>{solicitacao.bio}</Caption> : null}
      <Caption>Enviado em {formatarDataHora(solicitacao.createdAt)}</Caption>

      <View style={styles.acoes}>
        {urlDocumento ? (
          <Button label="Ver documento" variant="ghost" onPress={() => Linking.openURL(urlDocumento)} />
        ) : null}
        {solicitacao.tipoRegistro && LINKS_CONSELHO[solicitacao.tipoRegistro] ? (
          <Button
            label="Conferir no site do conselho"
            variant="ghost"
            onPress={() => Linking.openURL(LINKS_CONSELHO[solicitacao.tipoRegistro!])}
          />
        ) : null}
      </View>

      {rejeitando ? (
        <View style={styles.rejeicao}>
          <Field
            label="Motivo da rejeição"
            value={motivo}
            onChangeText={setMotivo}
            placeholder="O que precisa corrigir?"
            multiline
          />
          <View style={styles.acoes}>
            <Button label="Confirmar rejeição" color={Palette.danger} onPress={confirmarRejeicao} loading={processando} />
            <Button label="Cancelar" variant="ghost" onPress={() => setRejeitando(false)} />
          </View>
        </View>
      ) : (
        <View style={styles.acoes}>
          <Button label="Aprovar" onPress={aprovar} loading={processando} />
          <Button label="Rejeitar" variant="ghost" color={Palette.danger} onPress={() => setRejeitando(true)} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  acoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  rejeicao: {
    gap: Spacing.sm,
  },
});
