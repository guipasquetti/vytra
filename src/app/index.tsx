import { Redirect } from 'expo-router';

import { Loading } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

/**
 * Rota "/" — não tem tela própria, só decide o destino conforme sessão e papel.
 * Declarativo de propósito: o redirect por efeito no _layout depende de timing e
 * deixava essa rota cair no "Unmatched Route" no primeiro render.
 *
 * Link de recuperação de senha (14/set, achado ao testar com e-mail real): o Supabase só anexa
 * `redirect_to` na URL final quando ela bate com uma das Redirect URLs cadastradas no dashboard
 * — caso contrário volta pro Site URL puro, que é "/" (raiz), sem o `/redefinir-senha` do
 * pedido original. O token continua vindo junto, só que como fragmento da URL
 * (`#access_token=...&type=recovery`) grudado em "/" em vez de "/redefinir-senha". Sem essa
 * checagem, o `<Redirect>` abaixo troca de rota e o fragmento se perde (navegação do Router não
 * carrega hash), então o usuário cai direto no login sem nunca ver a tela de trocar senha.
 * `window.location.replace` (navegação de browser de verdade, não do Router) preserva o hash
 * exatamente — é o jeito garantido de não perder o token nesse desvio.
 */
export default function Index() {
  const { session, isLoading, profileLoaded, isProfessional } = useAuthStore();

  if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
    window.location.replace(`/redefinir-senha${window.location.hash}`);
    return <Loading />;
  }

  if (isLoading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (!profileLoaded) return <Loading />;
  return <Redirect href={isProfessional ? '/pro' : '/aluno'} />;
}
