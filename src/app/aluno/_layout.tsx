import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { Loading } from '@/components/ui';
import { OnboardingAnamnese } from '@/components/onboarding-anamnese';
import { SolicitacoesPendentes } from '@/components/solicitacoes-pendentes';
import { RoleThemeProvider } from '@/contexts/role-theme';
import { possuiAnamnese } from '@/services/onboardingService';
import { listarSolicitacoesPendentes, type SolicitacaoProfissional } from '@/services/solicitacoesService';
import { useAuthStore } from '@/store/authStore';
import { Palette, RoleColors } from '@/theme';

/**
 * Dois gates antes das abas (§12, 04/set):
 * 1. Solicitações pendentes — alguém que já tinha conta recebeu convite de um profissional
 *    novo (`SolicitacoesPendentes`); aceita/recusa sem senha, sem código.
 * 2. Anamnese — quem ainda não respondeu vê `OnboardingAnamnese` no lugar das abas.
 * Ambos ficam em state local, sem reload: a ação já grava no banco, só reconsulta.
 */
export default function ClientLayout() {
  const user = useAuthStore((s) => s.user);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoProfissional[] | null>(null);
  const [temAnamnese, setTemAnamnese] = useState<boolean | null>(null);

  const carregarSolicitacoes = useCallback(() => {
    listarSolicitacoesPendentes().then(setSolicitacoes);
  }, []);

  useEffect(() => {
    if (!user) {
      setSolicitacoes(null);
      setTemAnamnese(null);
      return;
    }
    carregarSolicitacoes();
    possuiAnamnese(user.id).then(setTemAnamnese);
  }, [user, carregarSolicitacoes]);

  if (!user || solicitacoes === null || temAnamnese === null) return <Loading />;

  return (
    <RoleThemeProvider color={RoleColors.aluno}>
      {solicitacoes.length ? (
        <SolicitacoesPendentes solicitacoes={solicitacoes} onMudou={carregarSolicitacoes} />
      ) : !temAnamnese ? (
        <OnboardingAnamnese onConcluido={() => setTemAnamnese(true)} />
      ) : (
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: RoleColors.aluno,
            tabBarInactiveTintColor: Palette.textTertiary,
            tabBarStyle: {
              backgroundColor: Palette.surface,
              borderTopColor: Palette.border,
              borderTopWidth: 1,
              elevation: 0,
            },
          }}>
          <Tabs.Screen
            name="index"
            options={{
              title: 'Início',
              tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="treino"
            options={{
              title: 'Treino',
              tabBarIcon: ({ color, size }) => <Ionicons name="barbell" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="dieta"
            options={{
              title: 'Dieta',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="restaurant" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="checkin"
            options={{
              title: 'Check-in',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="pulse" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="perfil"
            options={{
              title: 'Perfil',
              tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
            }}
          />
          <Tabs.Screen name="lista-compras" options={{ href: null }} />
          <Tabs.Screen name="anamnese" options={{ href: null }} />
          <Tabs.Screen name="anexos" options={{ href: null }} />
        </Tabs>
      )}
    </RoleThemeProvider>
  );
}
