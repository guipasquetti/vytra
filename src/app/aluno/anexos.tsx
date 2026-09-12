import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';

import {
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
} from '@/components/ui';
import { formatarDataHora } from '@/models/domain';
import {
  listarAnexosDaAssinatura,
  obterUrlAnexo,
  registrarAnexo,
  removerAnexo,
  uploadAnexo,
  type Anexo,
  type CategoriaAnexo,
} from '@/services/anexosService';
import { listarMeusProfissionais, type ProfissionalVinculado } from '@/services/professionalService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Spacing } from '@/theme';

const CATEGORIAS: { valor: CategoriaAnexo; label: string }[] = [
  { valor: 'exame', label: 'Exame' },
  { valor: 'laudo', label: 'Laudo' },
  { valor: 'outro', label: 'Outro' },
];

/**
 * Item 5 do benchmark de concorrentes (§30): anexo de paciente (exame/laudo). Paciente escolhe
 * o acompanhamento (quando tem mais de um profissional ativo, mesmo seletor do check-in) e sobe
 * o arquivo — nunca em nome de outro, RLS escopada por `subscription_id` (§0/LGPD).
 */
export default function AnexosAlunoScreen() {
  const user = useAuthStore((s) => s.user);
  const [profissionais, setProfissionais] = useState<ProfissionalVinculado[]>([]);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [categoria, setCategoria] = useState<CategoriaAnexo>('exame');
  const [arquivo, setArquivo] = useState<{ uri: string; name: string } | null>(null);
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!user) return;
    const vinculos = await listarMeusProfissionais(user.id);
    setProfissionais(vinculos);
    setSubscriptionId((atual) => atual ?? vinculos[0]?.subscriptionId ?? null);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!subscriptionId) {
        setAnexos([]);
        return;
      }
      listarAnexosDaAssinatura(subscriptionId).then(setAnexos);
    }, [subscriptionId]),
  );

  async function escolherArquivo() {
    const resultado = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const item = resultado.assets[0];
    setArquivo({ uri: item.uri, name: item.name });
  }

  async function enviar() {
    if (!user || !subscriptionId || !arquivo) return;
    const profissional = profissionais.find((p) => p.subscriptionId === subscriptionId);
    if (!profissional) return;
    setErro(null);
    setEnviando(true);
    try {
      const caminho = await uploadAnexo(user.id, subscriptionId, arquivo);
      await registrarAnexo({
        clientId: user.id,
        professionalId: profissional.professionalId,
        subscriptionId,
        categoria,
        nomeArquivo: arquivo.name,
        storagePath: caminho,
        observacao,
      });
      setArquivo(null);
      setObservacao('');
      setAnexos(await listarAnexosDaAssinatura(subscriptionId));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar o arquivo.');
    } finally {
      setEnviando(false);
    }
  }

  async function abrir(anexo: Anexo) {
    const url = await obterUrlAnexo(anexo.storage_path);
    if (url) {
      const { Linking } = await import('react-native');
      Linking.openURL(url);
    }
  }

  async function apagar(anexo: Anexo) {
    await removerAnexo(anexo.id, anexo.storage_path);
    if (subscriptionId) setAnexos(await listarAnexosDaAssinatura(subscriptionId));
  }

  if (loading || !user) return <Loading />;

  if (!profissionais.length) {
    return (
      <Screen title="Meus documentos" subtitle="Exames e laudos">
        <EmptyState text="Você precisa ter um acompanhamento ativo pra enviar documentos." />
      </Screen>
    );
  }

  return (
    <Screen title="Meus documentos" subtitle="Exames e laudos">
      {profissionais.length > 1 ? (
        <Card>
          <Caption color={Palette.textTertiary}>Enviar para</Caption>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
            {profissionais.map((p) => (
              <Pill
                key={p.subscriptionId}
                label={p.nome}
                active={subscriptionId === p.subscriptionId}
                onPress={() => setSubscriptionId(p.subscriptionId)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <Caption color={Palette.textTertiary}>Categoria</Caption>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          {CATEGORIAS.map((c) => (
            <Pill key={c.valor} label={c.label} active={categoria === c.valor} onPress={() => setCategoria(c.valor)} />
          ))}
        </View>
        <Button
          label={arquivo ? arquivo.name : 'Escolher arquivo (PDF ou foto)'}
          variant="ghost"
          onPress={escolherArquivo}
        />
        <Field
          label="Observação (opcional)"
          value={observacao}
          onChangeText={setObservacao}
          placeholder="Ex.: exame de sangue de rotina"
        />
        {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
        <Button label="Enviar" onPress={enviar} disabled={!arquivo} loading={enviando} />
      </Card>

      <SectionTitle>Enviados</SectionTitle>
      {anexos.length ? (
        anexos.map((a) => (
          <Card key={a.id}>
            <Body>{a.nome_arquivo}</Body>
            <Caption color={Palette.textTertiary}>
              {CATEGORIAS.find((c) => c.valor === a.categoria)?.label} · {formatarDataHora(a.created_at)}
            </Caption>
            {a.observacao ? <Caption>{a.observacao}</Caption> : null}
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button label="Abrir" variant="ghost" onPress={() => abrir(a)} />
              <Button label="Apagar" variant="ghost" color={Palette.danger} onPress={() => apagar(a)} />
            </View>
          </Card>
        ))
      ) : (
        <EmptyState text="Nenhum documento enviado ainda." />
      )}
    </Screen>
  );
}
