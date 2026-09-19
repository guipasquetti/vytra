import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CameraGuiada, type AnguloFoto } from '@/components/camera-guiada';
import { SaveIndicator, type StatusSalvamento } from '@/components/save-indicator';
import { Body, Button, Caption, Card, Field, FotoAmpliavel, Pill, Screen, SectionTitle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { SECOES_ANAMNESE, type RespostasAnamnese } from '@/models/anamnese';
import {
  obterAnaliseFotoAnamnese,
  obterUrlFotoAnamnese,
  uploadFotoAnamnese,
  type AnaliseFotoAnamnese,
} from '@/services/anamneseService';
import { listarMeusProfissionais, listarPlanos, type PlanoProfissional } from '@/services/professionalService';
import {
  obterRascunhoAnamnese,
  salvarRascunhoAnamnese,
  submeterAnamneseEPlano,
} from '@/services/onboardingService';
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
 * Foto opcional anexada na anamnese (19/set, pedido do Guilherme) — anexo pro profissional ver,
 * sem as silhuetas-guia da câmera do check-in (`CameraGuiada`), que existem pra comparar ângulo
 * do corpo entre check-ins; aqui é só "manda uma foto se quiser". Ganhou análise automática por
 * IA (mesmo dia, pedido explícito dele: "como as do check-in", §56) — resultado só aparece no
 * modo `somenteLeitura` (visão do profissional), nunca pro próprio paciente. Compartilhado pelas
 * 3 telas que renderizam `AnamneseCampos` (onboarding, reedição do paciente, revisão do
 * profissional) — o profissional só visualiza, nunca troca a foto do paciente por conta própria.
 */
export function AnamneseFoto({
  clientId,
  fotoPath,
  onFotoChange,
  somenteLeitura = false,
}: {
  clientId: string;
  fotoPath: string | null;
  onFotoChange?: (caminho: string) => void;
  somenteLeitura?: boolean;
}) {
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [analise, setAnalise] = useState<AnaliseFotoAnamnese | null>(null);

  useEffect(() => {
    let cancelado = false;
    (fotoPath ? obterUrlFotoAnamnese(fotoPath) : Promise.resolve(null)).then((url) => {
      if (!cancelado) setFotoUrl(url);
    });
    return () => {
      cancelado = true;
    };
  }, [fotoPath]);

  // Análise só é buscada (e mostrada) no modo somenteLeitura — é a visão do profissional; o
  // paciente nunca lê isso (RLS de `analise_foto_anamnese` já bloqueia, mas nem tenta buscar
  // aqui). Descarta análise de uma foto anterior se `fotoPath` já mudou e a nova ainda não tem
  // resultado (roda em background, pode levar alguns segundos).
  useEffect(() => {
    if (!somenteLeitura || !fotoPath) {
      setAnalise(null);
      return;
    }
    let cancelado = false;
    obterAnaliseFotoAnamnese(clientId)
      .then((a) => {
        if (!cancelado) setAnalise(a && a.fotoPath === fotoPath ? a : null);
      })
      .catch(() => {
        if (!cancelado) setAnalise(null);
      });
    return () => {
      cancelado = true;
    };
  }, [somenteLeitura, clientId, fotoPath]);

  async function enviarArquivo(arquivo: { uri: string; name: string }) {
    setErro(null);
    setEnviando(true);
    try {
      const caminho = await uploadFotoAnamnese(clientId, arquivo);
      onFotoChange?.(caminho);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar a foto.');
    } finally {
      setEnviando(false);
    }
  }

  async function tirarFoto() {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      setErro('Sem acesso à câmera — permite o acesso nas configurações pra tirar a foto.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const arquivo = resultado.assets[0];
    await enviarArquivo({ uri: arquivo.uri, name: arquivo.fileName ?? 'anamnese.jpg' });
  }

  async function escolherDaGaleria() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      setErro('Sem acesso às fotos — permite o acesso nas configurações pra escolher da galeria.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const arquivo = resultado.assets[0];
    await enviarArquivo({ uri: arquivo.uri, name: arquivo.fileName ?? 'anamnese.jpg' });
  }

  if (somenteLeitura && !fotoUrl) return null;

  return (
    <Card>
      <SectionTitle>Foto (opcional)</SectionTitle>
      {!somenteLeitura ? (
        <Caption>Uma foto ajuda seu profissional a te conhecer melhor — não é obrigatório.</Caption>
      ) : null}
      {fotoUrl ? (
        <View style={styles.fotoPreview}>
          <FotoAmpliavel uri={fotoUrl} width={110} height={140} />
        </View>
      ) : null}
      {somenteLeitura && fotoUrl ? (
        analise ? (
          <View style={styles.analise}>
            <Caption color={Palette.accent}>Análise de IA</Caption>
            <Body>{analise.resumo}</Body>
            {analise.indicadores.map((ind, i) => (
              <Caption key={i}>
                {ind.rotulo}: {ind.observacao}
              </Caption>
            ))}
          </View>
        ) : (
          <Caption color={Palette.textTertiary} style={styles.analise}>
            Sem análise de IA pra esta foto ainda.
          </Caption>
        )
      ) : null}
      {!somenteLeitura ? (
        <View style={styles.fotoBotoes}>
          <Button
            label={fotoPath ? 'Trocar foto — câmera' : 'Tirar foto'}
            variant="ghost"
            onPress={tirarFoto}
            loading={enviando}
          />
          <Button
            label="Escolher da galeria"
            variant="ghost"
            onPress={escolherDaGaleria}
            loading={enviando}
          />
        </View>
      ) : null}
      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
    </Card>
  );
}

/** Linha de base visual: mesmas quatro poses e guia do check-in; paths ficam no JSON da anamnese. */
export function LinhaBaseFotos({ clientId, respostas, onChange, somenteLeitura = false }: { clientId: string; respostas: RespostasAnamnese; onChange: (id: string, valor: string) => void; somenteLeitura?: boolean }) {
  const [camera, setCamera] = useState<AnguloFoto | null>(null);
  const [consentiu, setConsentiu] = useState(Boolean(respostas.__consentimento_linha_base));
  const [urls, setUrls] = useState<Record<string, string>>({});
  const poses: { tipo: AnguloFoto; label: string }[] = [{ tipo: 'frente', label: 'Frente' }, { tipo: 'esquerdo', label: 'Perfil esquerdo' }, { tipo: 'direito', label: 'Perfil direito' }, { tipo: 'costas', label: 'Costas' }];
  useEffect(() => { Promise.all(poses.map(async ({ tipo }) => [tipo, await obterUrlFotoAnamnese(respostas[`__linha_base_${tipo}`] ?? '')] as const)).then((itens) => setUrls(Object.fromEntries(itens.filter(([, url]) => url)) as Record<string, string>)); }, [respostas]);
  async function aceitar() {
    await supabase.from('consentimentos_imagem').upsert({ client_id: clientId, versao: 'linha-base-v1', texto_hash: 'vytra-linha-base-v1' }, { onConflict: 'client_id,versao' });
    onChange('__consentimento_linha_base', 'v1'); setConsentiu(true);
  }
  async function salvar(tipo: AnguloFoto, arquivo: { uri: string; name: string }) {
    const caminho = await uploadFotoAnamnese(clientId, { ...arquivo, name: `${tipo}-${arquivo.name}` });
    onChange(`__linha_base_${tipo}`, caminho);
  }
  return <Card><SectionTitle>Fotos de linha de base</SectionTitle>
    {!consentiu && !somenteLeitura ? <><Caption>Quatro fotos guiadas criam seu ponto de partida. Só você e seu profissional vinculado podem vê-las. Controlador: Guilherme Pasquetti, responsável pela Vytra. Você pode revogar pela área Privacidade do app.</Caption><Button label="Aceitar e registrar consentimento" onPress={aceitar} /></> : null}
    {consentiu || somenteLeitura ? <View style={styles.fotoBotoes}>{poses.map(({ tipo, label }) => urls[tipo] && somenteLeitura ? <FotoAmpliavel key={tipo} uri={urls[tipo]} width={100} height={140} /> : <Button key={tipo} label={respostas[`__linha_base_${tipo}`] ? `${label} registrada` : `Registrar ${label}`} variant="ghost" onPress={() => setCamera(tipo)} disabled={somenteLeitura} />)}</View> : null}
    {camera ? <View style={styles.cameraOverlay}><CameraGuiada tipo={camera} onCancelar={() => setCamera(null)} onFoto={async (arquivo) => { const tipo = camera; setCamera(null); await salvar(tipo, arquivo); }} /></View> : null}
  </Card>;
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
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rascunhoCarregado, setRascunhoCarregado] = useState(false);
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);
  const [statusSalvamento, setStatusSalvamento] = useState<StatusSalvamento>('ocioso');

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
  // Servidor primeiro (cobre trocar de aparelho); se não der pra alcançar (offline, por
  // exemplo), cai pro rascunho local do próprio aparelho — mesmo padrão de resiliência de
  // sempre neste formulário (§49 do HANDOFF).
  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    async function carregar() {
      try {
        const doServidor = await obterRascunhoAnamnese(user!.id);
        if (cancelado) return;
        if (doServidor && Object.keys(doServidor.respostas).length) {
          setRespostas(doServidor.respostas);
          setPlanoId(doServidor.planoId);
          setFotoPath(doServidor.fotoPath);
          setRascunhoRestaurado(true);
          return;
        }
      } catch {
        // sem rede ou sem sessão ainda — tenta o local abaixo
      }
      try {
        const salvo = await AsyncStorage.getItem(chaveRascunho(user!.id));
        if (cancelado || !salvo) return;
        const rascunho = JSON.parse(salvo) as {
          respostas?: RespostasAnamnese;
          planoId?: string | null;
          fotoPath?: string | null;
        };
        if (rascunho.respostas && Object.keys(rascunho.respostas).length) {
          setRespostas(rascunho.respostas);
          setPlanoId(rascunho.planoId ?? null);
          setFotoPath(rascunho.fotoPath ?? null);
          setRascunhoRestaurado(true);
        }
      } catch {
        // rascunho corrompido ou de versão antiga — ignora, começa do zero
      }
    }
    carregar().finally(() => !cancelado && setRascunhoCarregado(true));
    return () => {
      cancelado = true;
    };
  }, [user]);

  // Salva a cada mudança, com debounce curto — não perder resposta se a sessão cair no meio
  // do preenchimento (formulário tem 10 seções, pode levar minutos pra terminar). Local sempre
  // (rápido, funciona offline); servidor em paralelo, melhor esforço — se falhar (sem rede), o
  // local já cobriu a perda, só não alcança outro aparelho até a próxima tentativa.
  useEffect(() => {
    if (!user || !rascunhoCarregado) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(chaveRascunho(user.id), JSON.stringify({ respostas, planoId, fotoPath })).catch(() => {});
      setStatusSalvamento('salvando');
      salvarRascunhoAnamnese(user.id, respostas, planoId, fotoPath)
        .then(() => setStatusSalvamento('salvo'))
        .catch(() => setStatusSalvamento('ocioso'));
    }, 400);
    return () => clearTimeout(timer);
  }, [user, rascunhoCarregado, respostas, planoId, fotoPath]);

  // 'salvo' fica visível por um tempinho e depois some — o indicador não precisa ficar preso
  // na tela pra sempre.
  useEffect(() => {
    if (statusSalvamento !== 'salvo') return;
    const timer = setTimeout(() => setStatusSalvamento('ocioso'), 1500);
    return () => clearTimeout(timer);
  }, [statusSalvamento]);

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
      // rede: a RPC roda sem usuário e devolve `false` silenciosamente. `getSession()` só lê
      // o estado local e pode devolver um access token já vencido; renovar aqui garante que a
      // RPC receba um JWT atual ou que a pessoa receba uma instrução clara para entrar de novo.
      const {
        data: { session },
        error: erroSessao,
      } = await supabase.auth.refreshSession();
      if (erroSessao || !session?.user) {
        setErro(
          'Sua sessão expirou. Suas respostas ficaram salvas neste aparelho, atualize a página e entre de novo pra continuar.'
        );
        return;
      }
      const ok = await submeterAnamneseEPlano(respostas, planoId, fotoPath);
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
        <View style={styles.cabecalhoIntro}>
          <Caption>
            Suas respostas são usadas só pelo profissional que te convidou, pra montar seu plano.
            Nenhum campo é obrigatório — responda o que fizer sentido.
          </Caption>
          <SaveIndicator status={statusSalvamento} />
        </View>
      </Card>

      {rascunhoRestaurado ? (
        <Card>
          <Caption color={Palette.accent}>Recuperamos suas respostas salvas.</Caption>
        </Card>
      ) : null}

      <AnamneseCampos respostas={respostas} onChange={atualizarResposta} />

      {user ? <LinhaBaseFotos clientId={user.id} respostas={respostas} onChange={atualizarResposta} /> : null}

      {user ? (
        <AnamneseFoto clientId={user.id} fotoPath={fotoPath} onFotoChange={setFotoPath} />
      ) : null}

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
  cameraOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 },
  planos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  cabecalhoIntro: {
    gap: Spacing.sm,
  },
  fotoPreview: {
    alignItems: 'flex-start',
  },
  fotoBotoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  analise: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
});
