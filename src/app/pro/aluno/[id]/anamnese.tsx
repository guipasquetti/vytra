import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { AlunoTabs } from '@/components/aluno-tabs';
import { AnamneseCampos } from '@/components/onboarding-anamnese';
import { Button, Caption, Card, Loading, Screen } from '@/components/ui';
import type { RespostasAnamnese } from '@/models/anamnese';
import { obterAnamnese, salvarAnamneseComoProfissional } from '@/services/anamneseService';
import { Palette } from '@/theme';

/**
 * Revisão/correção da anamnese pelo profissional — hoje a RLS já libera update direto na
 * tabela (`anamnese_update_professional`, `is_professional_of`), só faltava a tela. Nunca
 * usa a RPC `submeter_anamnese_autenticado` (é escopada em `auth.uid()` do paciente).
 */
export default function AnamnesePacienteScreen() {
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [respostas, setRespostas] = useState<RespostasAnamnese>({});
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clientId) return;
    const anamnese = await obterAnamnese(clientId);
    if (anamnese) {
      setRespostas(anamnese.respostasCompletas);
      setAtualizadoEm(anamnese.atualizadoEm);
    }
    setLoading(false);
  }, [clientId]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const atualizarResposta = useCallback((id: string, valor: string) => {
    setRespostas((atual) => ({ ...atual, [id]: valor }));
  }, []);

  async function salvar() {
    if (!clientId) return;
    setErro(null);
    setSalvando(true);
    try {
      await salvarAnamneseComoProfissional(clientId, respostas);
      router.back();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar a anamnese.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen title="Anamnese" subtitle="Revise e corrija as respostas do paciente" voltar>
      <AlunoTabs clientId={clientId!} ativo="anamnese" />
      {atualizadoEm ? (
        <Card>
          <Caption>Última atualização em {new Date(atualizadoEm).toLocaleDateString('pt-BR')}</Caption>
        </Card>
      ) : (
        <Card>
          <Caption color={Palette.orange}>Paciente ainda não respondeu a anamnese.</Caption>
        </Card>
      )}
      <AnamneseCampos respostas={respostas} onChange={atualizarResposta} />
      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
      <Button label="Salvar" onPress={salvar} loading={salvando} />
    </Screen>
  );
}
