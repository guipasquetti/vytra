import { Link } from 'expo-router';
import { View } from 'react-native';

import { Body, Button, Caption, Screen } from '@/components/ui';

/**
 * Fallback do Expo Router para o export estático (web): rotas com segmento dinâmico (ex.:
 * `/pro/aluno/[id]`, `/pro/aluno/[id]/dieta`, `/pro/aluno/[id]/resumo`) não existem em build
 * time — o id de cada paciente só existe em produção. Sem este arquivo, entrar direto numa
 * dessas URLs (link salvo, favorito, atalho na tela inicial, refresh) devolve 404 puro do
 * servidor, sem nunca carregar o app React — foi o caso relatado como "dieta e treino não
 * aparecem" (a tela funcionava perfeitamente quando aberta por clique dentro do app, só a
 * navegação direta quebrava).
 *
 * `Link href="/"` deixa a rota "/" decidir pra onde mandar (login ou a área certa por papel,
 * mesma lógica de `index.tsx`) — igual ao fallback de `router.canGoBack()` que `Screen`/`voltar`
 * já usa em outras telas.
 */
export default function NotFound() {
  return (
    <Screen title="Página não encontrada" scroll={false}>
      <View style={{ gap: 12 }}>
        <Body>Este link não existe ou expirou.</Body>
        <Caption>Se você chegou aqui por um atalho salvo, tente abrir o app e navegar de novo.</Caption>
        <Link href="/" asChild>
          <Button label="Voltar ao início" />
        </Link>
      </View>
    </Screen>
  );
}
