import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Caption, Card, Field, Pill, Screen, SectionTitle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { SECOES_ANAMNESE, type RespostasAnamnese } from '@/models/anamnese';
import { listarMeusProfissionais, listarPlanos, type PlanoProfissional } from '@/services/professionalService';
import { submeterAnamneseEPlano } from '@/services/onboardingService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Spacing } from '@/theme';

/**
 * Rascunho local, por aparelho (mesmo padrão de `lista-compras.tsx`) — achado real (14/set):
 * paciente preencheu as 10 seções inteiras e "Enviar respostas" falhou porque a sessão expirou
 * durante o preenchimento (formulário longo, app foi pra segundo plano). Sem isso, ela perderia
 * tudo ao ter que atualizar a página/entrar de novo.
 */
function chaveRascunho(userId: string): string {
  return `anamnese-rascunho:${userId}`;
}

/**
 * Formulário puro da anamnese — as 10 seções de `SECOES_ANAMNESE`, sem lógica de onboarding
 * nem de escolha de plano. Reaproveitado pelo onboarding (`OnboardingAnamnese` abaixo), pela
 * reedição do paciente (`aluno/anamnese.tsx`) e pela revisão do profissional
 * (`pro/aluno/[id]/anamnese.tsx`) — extrair aqui evita ter a mesma lista de `Field` em 3 lugares.
 */
export function AnamneseCampos({
  respostas,
  onChange,
  somenteLeitura = false,
}: {
  respostas: RespostasAnamnese;
  onChange: (id: string, valor: string) => void;
  somenteLeitura?: boolean;
}) {
  return (
    <>
      {SECOES_ANAMNESE.map((secao) => (
        <Card key={secao.titulo}>
          <SectionTitle>{secao.titulo}</SectionTitle>
          {secao.campos.map((campo) => (
            <Field
              key={campo.id}
              label={campo.label}
              value={respostas[campo.id] ?? ''}
              onChangeText={(v) => onChange(campo.id, v)}
              placeholder={campo.placeholder}
              keyboardType={campo.tipo === 'numero' ? 'decimal-pad' : 'default'}
              multiline={campo.tipo === 'area'}
              editable={!somenteLeitura}
            />
          ))}
        </Card>
      ))}
    </>
  );
}

/**
 * Onboarding dentro do app (§12, 04/set): lead já criou conta e está logado, mas ainda não
 * respondeu a anamnese. `aluno/_layout.tsx` mostra isto no lugar das abas até isso acontecer.
 * O plano escolhido aqui é só um PEDIDO (`plano_solicitado_id`) — quem libera treino/dieta é
 * o profissional, confirmando depois de revisar (ver Painel).
 */
export function OnboardingAnamnese({ onConcluido }: { onConcluido: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [respostas, setRespostas] = useState<RespostasAnamnese>({});
  const [planos, setPlanos] = useState<PlanoProfissional[]>([]);
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rascunhoCarregado, setRascunhoCarregado] = useState(false);
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);

  const carregarPlanos = useCallback(async () => {
    if (!user) return;
    const profissionais = await listarMeusProfissionais(user.id);
    const professionalId = profissionais[0]?.professionalId;
    if (!professionalId) return;
    const todos = await listarPlanos(professionalId);
    setPlanos(todos.filter((p) => p.ativo));
  }, [user]);

  useEffect(() => {
    carregarPlanos();
  }, [carregarPlanos]);

  // Carrega o rascunho salvo (se houver) antes de começar a salvar de novo — sem isso, o efeito
  // de salvamento abaixo escreveria `{}` por cima do rascunho antes da leitura terminar.
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(chaveRascunho(user.id))
      .then((salvo) => {
        if (!salvo) return;
        try {
          const rascunho = JSON.parse(salvo) as { respostas?: RespostasAnamnese; planoId?: string | null };
          if (rascunho.respostas && Object.keys(rascunho.respostas).length) {
            setRespostas(rascunho.respostas);
            setPlanoId(rascunho.planoId ?? null);
            setRascunhoRestaurado(true);
          }
        } catch {
          // rascunho corrompido ou de versão antiga — ignora, começa do zero
        }
      })
      .finally(() => setRascunhoCarregado(true));
  }, [user]);

  // Salva a cada mudança, com debounce curto — não perder resposta se a sessão cair no meio
  // do preenchimento (formulário tem 10 seções, pode levar minutos pra terminar).
  useEffect(() => {
    if (!user || !rascunhoCarregado) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(chaveRascunho(user.id), JSON.stringify({ respostas, planoId })).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [user, rascunhoCarregado, respostas, planoId]);

  const atualizarResposta = useCallback((id: string, valor: string) => {
    setRespostas((atual) => ({ ...atual, [id]: valor }));
  }, []);

  async function enviar() {
    if (!user) return;
    if (planos.length && !planoId) {
      setErro('Escolhe qual plano você quer contratar.');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      // Formulário longo — a sessão pode ter expirado durante o preenchimento sem o app
      // perceber (achado real, 14/set). `submeter_anamnese_autenticado` é anon-chamável por
      // design (mesmo padrão do fluxo de convite), então uma sessão inválida não vira erro de
      // rede: a RPC roda sem usuário e devolve `false` silenciosamente. Checar a sessão antes
      // (o que força a renovação do token se ainda for possível) evita esse silêncio.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setErro(
          'Sua sessão expirou. Suas respostas ficaram salvas neste aparelho, atualize a página e entre de novo pra continuar.'
        );
        return;
      }
      const ok = await submeterAnamneseEPlano(respostas, planoId);
      if (!ok) {
        setErro(
          'Não consegui enviar. Atualize a página e entre de novo, suas respostas ficam salvas neste aparelho.'
        );
        return;
      }
      await AsyncStorage.removeItem(chaveRascunho(user.id)).catch(() => {});
      onConcluido();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar suas respostas.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Screen title="Vamos te conhecer" subtitle="Antes de começar, responde a anamnese e escolhe seu plano">
      <Card>
        <Caption>
          Suas respostas são usadas só pelo profissional que te convidou, pra montar seu plano.
          Nenhum campo é obrigatório — responda o que fizer sentido.
        </Caption>
      </Card>

      {rascunhoRestaurado ? (
        <Card>
          <Caption color={Palette.accent}>Recuperamos suas respostas salvas neste aparelho.</Caption>
        </Card>
      ) : null}

      <AnamneseCampos respostas={respostas} onChange={atualizarResposta} />

      <Card>
        <SectionTitle>Qual plano você quer contratar?</SectionTitle>
        {planos.length ? (
          <View style={styles.planos}>
            {planos.map((plano) => (
              <Pill
                key={plano.id}
                label={plano.nome}
                active={planoId === plano.id}
                onPress={() => setPlanoId((atual) => (atual === plano.id ? null : plano.id))}
              />
            ))}
          </View>
        ) : (
          <Caption>Seu profissional ainda não tem planos ativos — fala direto com ele.</Caption>
        )}
      </Card>

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
      <Button label="Enviar respostas" onPress={enviar} loading={enviando} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  planos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
