import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Palette, Spacing } from '@/theme';

/**
 * Fallback obrigatório do Expo Router pro export web estático (`app.json` → `web.output:
 * "static"`). Sem este arquivo, o build não gera nenhum HTML de fallback pro roteador
 * client-side assumir — qualquer URL que não exista como arquivo estático literal no export
 * (todo `/pro/aluno/[id]/...` e `/aluno/...` com parâmetro dinâmico, já que o id do
 * paciente não dá pra prever em build time) volta 404 puro do host, sem o JS do app rodar.
 *
 * Isso é o motivo raiz do card "Dieta e treino não está aparecendo para o Tassis" (23/set):
 * confirmado ao vivo (24/set) que `GET /pro/aluno/{id}/dieta`, `/pro/aluno/{id}` e
 * `/pro/aluno/{id}/resumo` devolvem 404 do servidor em qualquer navegação direta (refresh,
 * link salvo, ícone na tela de início) — só carregava certo aqui porque o navegador já tinha
 * o bundle de uma visita anterior na mesma aba. Corrige o próximo passo do fallback (o host
 * ter uma página pra servir), mas o rebuild + `eas deploy --prod` (e o `vercel deploy` do
 * domínio próprio) ainda precisam rodar pra valer em produção — não é só código, é publicar
 * de novo.
 */
export default function NaoEncontrado() {
  return (
    <>
      <Stack.Screen options={{ title: 'Página não encontrada' }} />
      <View style={styles.container}>
        <Text style={styles.titulo}>Essa tela não existe.</Text>
        <Text style={styles.texto}>
          O link pode estar quebrado, ou a página já não existe mais.
        </Text>
        <Link href="/" style={styles.link}>
          Voltar ao início
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Palette.background,
  },
  titulo: {
    color: Palette.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  texto: {
    color: Palette.textSecondary,
    textAlign: 'center',
  },
  link: {
    color: Palette.accent,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
});
