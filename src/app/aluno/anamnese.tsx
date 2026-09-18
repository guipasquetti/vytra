import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { AnamneseCampos } from '@/components/onboarding-anamnese';
import { Button, Caption, Card, Loading, Screen } from '@/components/ui';
import type { RespostasAnamnese } from '@/models/anamnese';
import { obterAnamnese } from '@/services/anamneseService';
import { submeterAnamneseEPlano } from '@/services/onboardingService';
import { useAuthStore } from '@/store/authStore';
import { Palette } from '@/theme';

/**
 * Reedição da própria anamnese, pós-onboarding — antes só existia a criação inicial
 * (`OnboardingAnamnese`). Reaproveita a mesma RPC `submeter_anamnese_autenticado` com
 * `planoId = null`: é upsert seguro e não toca em `subscriptions` quando não há plano a pedir.
 */
export default function AnamneseAlunoScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [respostas, setRespostas] = useState<RespostasAnamnese>({});
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!user) return;
    const anamnese = await obterAnamnese(user.id);
    if (anamnese) {
      setRespostas(anamnese.respostasCompletas);
      setAtualizadoEm(anamnese.atualizadoEm);
    }
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const atualizarResposta = useCallback((id: string, valor: string) => {
    setRespostas((atual) => ({ ...atual, [id]: valor }));
  }, []);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const ok = await submeterAnamneseEPlano(respostas, null);
      if (!ok) {
        setErro('Não consegui salvar suas respostas. Tenta de novo.');
        return;
      }
      router.back();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar suas respostas.');
    } finally {
      setSalvando(false);
    }
  }

  if (loading || !user) return <Loading />;

  return (
    <Screen
      title="Minha anamnese"
      subtitle="Mantenha essas informações atualizadas para seu profissional"
      voltar>
      {atualizadoEm ? (
        <Card>
          <Caption>Última atualização em {new Date(atualizadoEm).toLocaleDateString('pt-BR')}</Caption>
        </Card>
      ) : null}
      <AnamneseCampos respostas={respostas} onChange={atualizarResposta} />
      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
      <Button label="Salvar" onPress={salvar} loading={salvando} />
    </Screen>
  );
}
