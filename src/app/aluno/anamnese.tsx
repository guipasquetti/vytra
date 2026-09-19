import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { AnamneseCampos, AnamneseFoto } from '@/components/onboarding-anamnese';
import { SaveIndicator, type StatusSalvamento } from '@/components/save-indicator';
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
 *
 * Autosave a cada campo (19/set, pedido do Guilherme) grava direto na `anamnese` final — não
 * precisa do rascunho separado que o onboarding usa: aqui a linha já existe (é edição, não
 * criação), então não tem gate de `possuiAnamnese()` pra proteger. O botão "Salvar" continua
 * existindo pra fechar a tela de propósito (`router.back()`).
 */
export default function AnamneseAlunoScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [respostas, setRespostas] = useState<RespostasAnamnese>({});
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [solicitadaEm, setSolicitadaEm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [statusSalvamento, setStatusSalvamento] = useState<StatusSalvamento>('ocioso');
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!user) return;
    const anamnese = await obterAnamnese(user.id);
    if (anamnese) {
      setRespostas(anamnese.respostasCompletas);
      setFotoPath(anamnese.fotoPath);
      setAtualizadoEm(anamnese.atualizadoEm);
      setSolicitadaEm(anamnese.solicitadaAtualizacaoEm);
    }
    setLoading(false);
    setCarregado(true);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const atualizarResposta = useCallback((id: string, valor: string) => {
    setRespostas((atual) => ({ ...atual, [id]: valor }));
  }, []);

  // Autosave debounced — mesma ideia do onboarding, mas gravando direto na anamnese já
  // existente (sem rascunho intermediário, ver comentário acima do componente).
  useEffect(() => {
    if (!user || !carregado) return;
    const timer = setTimeout(() => {
      setStatusSalvamento('salvando');
      submeterAnamneseEPlano(respostas, null, fotoPath)
        .then((ok) => setStatusSalvamento(ok ? 'salvo' : 'ocioso'))
        .catch(() => setStatusSalvamento('ocioso'));
    }, 800);
    return () => clearTimeout(timer);
  }, [user, carregado, respostas, fotoPath]);

  useEffect(() => {
    if (statusSalvamento !== 'salvo') return;
    const timer = setTimeout(() => setStatusSalvamento('ocioso'), 1500);
    return () => clearTimeout(timer);
  }, [statusSalvamento]);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const ok = await submeterAnamneseEPlano(respostas, null, fotoPath);
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
      floating={<SaveIndicator status={statusSalvamento} />}
      voltar>
      {solicitadaEm ? (
        <Card>
          <Caption color={Palette.orange}>
            Seu profissional pediu que você atualize suas respostas.
          </Caption>
        </Card>
      ) : null}
      {atualizadoEm ? (
        <Card>
          <Caption>Última atualização em {new Date(atualizadoEm).toLocaleDateString('pt-BR')}</Caption>
        </Card>
      ) : null}
      <AnamneseCampos respostas={respostas} onChange={atualizarResposta} />
      <AnamneseFoto clientId={user.id} fotoPath={fotoPath} onFotoChange={setFotoPath} />
      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
      <Button label="Salvar" onPress={salvar} loading={salvando} />
    </Screen>
  );
}
