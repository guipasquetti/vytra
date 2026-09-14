import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { RoleThemeProvider } from '@/contexts/role-theme';
import { Palette, RoleColors } from '@/theme';

export default function ProLayout() {
  return (
    <RoleThemeProvider color={RoleColors.profissional}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: RoleColors.profissional,
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
            tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="pacientes"
          options={{
            title: 'Pacientes',
            tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="leads"
          options={{
            title: 'Leads',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-circle" size={size} color={color} />
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
        {/* Serviços (11/set): saiu da barra — é configuração mexida raro (preço/período de
            professional_plans), não trabalho do dia a dia como Pacientes/Leads. Acessível
            pelo Perfil, mesma rota de sempre, sem quebrar link nenhum. */}
        <Tabs.Screen
          name="planos"
          options={{
            href: null,
            headerShown: true,
            title: 'Serviços',
            headerStyle: { backgroundColor: Palette.background },
            headerTintColor: Palette.text,
            headerShadowVisible: false,
          }}
        />
        {/* Detalhe do aluno e geração de convite: acessíveis por push, não são abas. */}
        <Tabs.Screen name="convite" options={{ href: null, headerShown: false }} />
        <Tabs.Screen
          name="cadastro-editar"
          options={{
            href: null,
            headerShown: true,
            title: 'Alterar cadastro',
            headerStyle: { backgroundColor: Palette.background },
            headerTintColor: Palette.text,
            headerShadowVisible: false,
          }}
        />
        <Tabs.Screen
          name="aluno/[id]/index"
          options={{
            href: null,
            headerShown: true,
            title: 'Plano de treino',
            headerStyle: { backgroundColor: Palette.background },
            headerTintColor: Palette.text,
            headerShadowVisible: false,
          }}
        />
        <Tabs.Screen
          name="aluno/[id]/dieta"
          options={{
            href: null,
            headerShown: true,
            title: 'Plano alimentar',
            headerStyle: { backgroundColor: Palette.background },
            headerTintColor: Palette.text,
            headerShadowVisible: false,
          }}
        />
        <Tabs.Screen
          name="aluno/[id]/resumo"
          options={{
            href: null,
            headerShown: true,
            title: 'Paciente',
            headerStyle: { backgroundColor: Palette.background },
            headerTintColor: Palette.text,
            headerShadowVisible: false,
          }}
        />
        <Tabs.Screen
          name="aluno/[id]/anamnese"
          options={{
            href: null,
            headerShown: true,
            title: 'Anamnese',
            headerStyle: { backgroundColor: Palette.background },
            headerTintColor: Palette.text,
            headerShadowVisible: false,
          }}
        />
      </Tabs>
    </RoleThemeProvider>
  );
}
