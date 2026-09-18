import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { EmptyState, Loading, Screen } from '@/components/ui';
import { ListaComprasSection } from '@/components/lista-compras';
import { buscarCategoriasPorIds, getPlanoAlimentar, type PlanoAlimentar } from '@/services/nutritionService';
import { useAuthStore } from '@/store/authStore';

/**
 * Rota dedicada à lista de compras (09/set) — antes só existia como seção no fim de
 * `aluno/dieta.tsx`, que exigia rolar a tela inteira (refeições + observações) pra chegar
 * nela. O card "Lista de compras" do Início aponta pra cá, não mais pra `/aluno/dieta`.
 */
export default function ListaComprasScreen() {
  const user = useAuthStore((s) => s.user);
  const [plano, setPlano] = useState<PlanoAlimentar | null>(null);
  const [categorias, setCategorias] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    const resultado = await getPlanoAlimentar(user.id);
    setPlano(resultado);
    if (resultado) {
      const idsTaco = [
        ...new Set(
          resultado.refeicoes.flatMap((r) => r.itens.map((i) => i.taco_id)).filter((id): id is number => id != null),
        ),
      ];
      setCategorias(await buscarCategoriasPorIds(idsTaco));
    }
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  if (loading || !user) return <Loading />;

  if (!plano || !plano.publicado || !plano.refeicoes.length) {
    return (
      <Screen title="Lista de compras" voltar>
        <EmptyState text="Seu nutricionista está montando seu plano — fica pronto em até 2 dias." />
      </Screen>
    );
  }

  return (
    <Screen title="Lista de compras" subtitle={plano.nutricionista || undefined} voltar>
      <ListaComprasSection userId={user.id} refeicoes={plano.refeicoes} categorias={categorias} />
    </Screen>
  );
}
