import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { CameraGuiada, type AnguloFoto } from '@/components/camera-guiada';
import { CampoData, CampoHora } from '@/components/campo-data';
import { SaveIndicator, type StatusSalvamento } from '@/components/save-indicator';
import { Body, Button, Caption, Card, Field, FotoAmpliavel, Pill, Screen, SectionTitle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { calcularMediaSono, SECOES_ANAMNESE, type CampoAnamnese, type RespostasAnamnese } from '@/models/anamnese';
import {
  dispararAnaliseFotoAnamnese,
  obterAnaliseFotoAnamnese,
  obterComparacaoLinhaBase,
  obterUrlFotoAnamnese,
  registrarSnapshotLinhaBase,
  uploadFotoAnamnese,
  type AnaliseFotoAnamnese,
  type ComparacaoLinhaBase,
  type FotosLinhaBaseAnamnese,
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
  function mudarCampo(id: string, valor: string) {
    onChange(id, valor);
    if (id !== 'horario_dormir' && id !== 'horario_acordar') return;
    const media = calcularMediaSono(
      id === 'horario_dormir' ? valor : respostas.horario_dormir ?? '',
      id === 'horario_acordar' ? valor : respostas.horario_acordar ?? '',
    );
    onChange('horas_sono', media);
  }

  function renderCampo(campo: CampoAnamnese) {
    const valor = respostas[campo.id] ?? '';
    const somenteTexto = somenteLeitura ? <Body>{valor || '—'}</Body> : null;
    if (somenteLeitura) return <View key={campo.id} style={styles.campoLeitura}><Caption>{campo.label}</Caption>{somenteTexto}</View>;

    if (campo.tipo === 'data') {
      return <CampoData key={campo.id} label={campo.label} value={valor} onChangeText={(v) => mudarCampo(campo.id, v)} />;
    }
    if (campo.tipo === 'hora') {
      return <CampoHora key={campo.id} label={campo.label} value={valor} onChangeText={(v) => mudarCampo(campo.id, v)} />;
    }
    if (campo.tipo === 'calculado') {
      return <View key={campo.id} style={styles.campoCalculado}><Caption>{campo.label}</Caption><Body color={valor ? Palette.accent : Palette.textTertiary}>{valor || 'Informe os dois horários acima'}</Body></View>;
    }
    if (campo.simNaoComDetalhe) {
      const respondeuNao = /^n[aã]o$/i.test(valor.trim());
      const respondeuSim = Boolean(valor) && !respondeuNao;
      return (
        <View key={campo.id} style={styles.campoEscolha}>
          <Caption>{campo.label}</Caption>
          <View style={styles.opcoes}>
            <Pill label="Não" active={respondeuNao} style={styles.opcaoBotao} onPress={() => mudarCampo(campo.id, 'Não')} />
            <Pill label="Sim" active={respondeuSim} style={styles.opcaoBotao} onPress={() => mudarCampo(campo.id, 'Sim')} />
          </View>
          {respondeuSim ? (
            <Field
              label="Conte mais"
              value={valor === 'Sim' ? '' : valor}
              onChangeText={(v) => mudarCampo(campo.id, v)}
              placeholder={campo.placeholder}
              multiline={campo.tipo === 'area'}
            />
          ) : null}
        </View>
      );
    }
    if (campo.opcoes) {
      return (
        <View key={campo.id} style={styles.campoEscolha}>
          <Caption>{campo.label}</Caption>
          <View style={styles.opcoes}>
            {campo.opcoes.map((opcao) => (
              <Pill key={opcao.valor} label={opcao.label} style={styles.opcaoBotao} active={valor === opcao.valor} onPress={() => mudarCampo(campo.id, opcao.valor)} />
            ))}
          </View>
        </View>
      );
    }
    return (
      <Field
        key={campo.id}
        label={campo.label}
        value={valor}
        onChangeText={(v) => mudarCampo(campo.id, v)}
        placeholder={campo.placeholder}
        keyboardType={campo.tipo === 'numero' ? 'decimal-pad' : 'default'}
        multiline={campo.tipo === 'area'}
      />
    );
  }

  return (
    <>
      {SECOES_ANAMNESE.map((secao) => (
        <Card key={secao.titulo}>
          <SectionTitle>{secao.titulo}</SectionTitle>
          {secao.campos.map(renderCampo)}
        </Card>
      ))}
    </>
  );
}

/** Extrai o conjunto atual de caminhos da linha de base a partir das respostas — mesmas 4
 * chaves usadas por `LinhaBaseFotos` (`__linha_base_frente/esquerdo/direito/costas`). Exportada
 * pra quem salva a anamnese (`aluno/anamnese.tsx`, `OnboardingAnamnese` abaixo) poder registrar
 * o snapshot do comparativo sem duplicar a extração. */
export function extrairFotosLinhaBase(respostas: RespostasAnamnese): FotosLinhaBaseAnamnese {
  return {
    frente: respostas.__linha_base_frente || undefined,
    esquerdo: respostas.__linha_base_esquerdo || undefined,
    direito: respostas.__linha_base_direito || undefined,
    costas: respostas.__linha_base_costas || undefined,
  };
}

/** Linha de base visual: mesmas quatro poses e guia do check-in; paths ficam no JSON da anamnese.
 * Ganhou análise automática por IA (21/set, pedido explícito do Guilherme: "como as do
 * check-in", §56) — mesmo padrão multi-ângulo, resultado só aparece no modo `somenteLeitura`
 * (visão do profissional), nunca pro próprio paciente. */
export function LinhaBaseFotos({ clientId, respostas, onChange, somenteLeitura = false }: { clientId: string; respostas: RespostasAnamnese; onChange: (id: string, valor: string) => void; somenteLeitura?: boolean }) {
  const sexoPerfil = useAuthStore((store) => store.profile?.sexo);
  // No onboarding, a escolha recém-feita ainda não foi persistida em `profile`; usar a
  // resposta atual garante que a referência muda imediatamente para a silhueta correta.
  const sexo = respostas.sexo || sexoPerfil;
  const [camera, setCamera] = useState<AnguloFoto | null>(null);
  const [abrirCamera, setAbrirCamera] = useState(false);
  const [consentiu, setConsentiu] = useState(Boolean(respostas.__consentimento_linha_base));
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [analise, setAnalise] = useState<AnaliseFotoAnamnese | null>(null);
  const [comparacao, setComparacao] = useState<ComparacaoLinhaBase[]>([]);
  const poses: { tipo: AnguloFoto; label: string }[] = [{ tipo: 'frente', label: 'Frente' }, { tipo: 'esquerdo', label: 'Perfil esquerdo' }, { tipo: 'direito', label: 'Perfil direito' }, { tipo: 'costas', label: 'Costas' }];
  useEffect(() => { Promise.all(poses.map(async ({ tipo }) => [tipo, await obterUrlFotoAnamnese(respostas[`__linha_base_${tipo}`] ?? '')] as const)).then((itens) => setUrls(Object.fromEntries(itens.filter(([, url]) => url)) as Record<string, string>)); }, [respostas]);
  useEffect(() => { if (!somenteLeitura) supabase.from('consentimentos_imagem').select('revogado_em').eq('client_id', clientId).eq('versao', 'linha-base-v1').maybeSingle().then(({ data }) => { if (data && !data.revogado_em) setConsentiu(true); }); }, [clientId, somenteLeitura]);
  // Análise só é buscada (e mostrada) no modo somenteLeitura — é a visão do profissional; o
  // paciente nunca lê isso (RLS de `analise_foto_anamnese` já bloqueia, nem tenta buscar aqui).
  const fotosAtuais = extrairFotosLinhaBase(respostas);
  useEffect(() => {
    let cancelado = false;
    (somenteLeitura ? obterAnaliseFotoAnamnese(clientId) : Promise.resolve(null))
      .then((a) => { if (!cancelado) setAnalise(a); })
      .catch(() => { if (!cancelado) setAnalise(null); });
    return () => { cancelado = true; };
  }, [somenteLeitura, clientId, fotosAtuais.frente, fotosAtuais.esquerdo, fotosAtuais.direito, fotosAtuais.costas]);
  // Comparativo "primeira x mais recente" (21/set, pedido do Guilherme) — visível tanto pro
  // paciente quanto pro profissional, mesmo padrão de `obterComparacaoFotos` do check-in. Só
  // aparece quando já existe mais de um snapshot salvo (`linha_base_historico`); atualiza de
  // novo quando o próprio conjunto muda, pra refletir um snapshot novo assim que ele é gravado.
  useEffect(() => {
    let cancelado = false;
    obterComparacaoLinhaBase(clientId)
      .then((c) => { if (!cancelado) setComparacao(c); })
      .catch(() => { if (!cancelado) setComparacao([]); });
    return () => { cancelado = true; };
  }, [clientId, fotosAtuais.frente, fotosAtuais.esquerdo, fotosAtuais.direito, fotosAtuais.costas]);
  async function aceitar() {
    await supabase.from('consentimentos_imagem').upsert({ client_id: clientId, versao: 'linha-base-v1', texto_hash: 'vytra-linha-base-v1' }, { onConflict: 'client_id,versao' });
    onChange('__consentimento_linha_base', 'v1'); setConsentiu(true);
  }
  async function salvar(tipo: AnguloFoto, arquivo: { uri: string; name: string }) {
    const caminho = await uploadFotoAnamnese(clientId, { ...arquivo, name: `${tipo}-${arquivo.name}` });
    onChange(`__linha_base_${tipo}`, caminho);
    dispararAnaliseFotoAnamnese({ ...fotosAtuais, [tipo]: caminho });
  }
  async function galeria() { if (!camera) return; const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 }); if (!r.canceled && r.assets?.[0]) { const tipo = camera; setCamera(null); await salvar(tipo, { uri: r.assets[0].uri, name: r.assets[0].fileName ?? `${tipo}.jpg` }); } }
  return <Card><SectionTitle>Fotos de linha de base</SectionTitle>
    {!consentiu && !somenteLeitura ? <><Caption>Quatro fotos guiadas criam seu ponto de partida. Só você e seu profissional vinculado podem vê-las. Você pode revogar esse consentimento pela área Privacidade do app Vytra.</Caption><Button label="Aceitar e registrar consentimento" onPress={aceitar} /></> : null}
    {consentiu || somenteLeitura ? <View style={styles.fotoBotoes}>{poses.map(({ tipo, label }) => urls[tipo] && somenteLeitura ? <FotoAmpliavel key={tipo} uri={urls[tipo]} width={100} height={140} /> : <Button key={tipo} label={respostas[`__linha_base_${tipo}`] ? `${label} registrada` : `Registrar ${label}`} variant="ghost" style={styles.acaoGrade} onPress={() => { setAbrirCamera(false); setCamera(tipo); }} disabled={somenteLeitura} />)}</View> : null}
    {comparacao.length ? (
      <View style={styles.analiseBox}>
        <Caption color={Palette.textTertiary}>Evolução — primeira x mais recente</Caption>
        {comparacao.map((c) => (
          <View key={c.angulo} style={styles.comparacaoLinha}>
            <Caption>{c.label}</Caption>
            <View style={styles.fotoBotoes}>
              {c.primeira ? <FotoAmpliavel uri={c.primeira.url} width={100} height={140} /> : null}
              {c.ultima ? <FotoAmpliavel uri={c.ultima.url} width={100} height={140} /> : null}
            </View>
          </View>
        ))}
      </View>
    ) : null}
    {somenteLeitura ? (
      analise ? (
        <View style={styles.analiseBox}>
          <Caption color={Palette.accent}>Análise de IA</Caption>
          <Body>{analise.resumo}</Body>
          {analise.indicadores.map((ind, i) => (
            <Caption key={i}>{ind.rotulo}: {ind.observacao}</Caption>
          ))}
        </View>
      ) : Object.keys(urls).length ? (
        <Caption color={Palette.textTertiary} style={styles.analiseBox}>Sem análise de IA pra estas fotos ainda.</Caption>
      ) : null
    ) : null}
    <Modal visible={Boolean(camera)} animationType="slide" onRequestClose={() => setCamera(null)}>
      {camera && abrirCamera ? <CameraGuiada tipo={camera} sexo={sexo} onCancelar={() => setAbrirCamera(false)} onFoto={async (arquivo) => { const tipo = camera; setCamera(null); await salvar(tipo, arquivo); }} /> : <Screen title="Adicionar foto" subtitle="Escolha como registrar esta pose" scroll={false}><Card><Button label="Tirar foto" onPress={() => setAbrirCamera(true)} /><Button label="Escolher da galeria" variant="ghost" onPress={galeria} /><Button label="Cancelar" variant="ghost" onPress={() => setCamera(null)} /></Card></Screen>}
    </Modal>
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
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [respostas, setRespostas] = useState<RespostasAnamnese>({});
  const [planos, setPlanos] = useState<PlanoProfissional[]>([]);
  const [planoId, setPlanoId] = useState<string | null>(null);
  // Compatibilidade: fotos avulsas enviadas antes desta correção não voltam a aparecer na UI,
  // mas o caminho continua no rascunho/envio para não apagar dado já entregue pelo paciente.
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
      // Snapshot da linha de base pro comparativo "primeira x mais recente" (21/set) — melhor
      // esforço, nunca trava o onboarding se falhar.
      registrarSnapshotLinhaBase(user.id, extrairFotosLinhaBase(respostas)).catch(() => {});
      const sexoEscolhido = respostas.sexo;
      if (profile && (sexoEscolhido === 'feminino' || sexoEscolhido === 'masculino' || sexoEscolhido === 'outro')) {
        // O banco já foi atualizado pela RPC; espelha no estado local antes de liberar as abas
        // para que o próximo check-in abra com a referência correspondente, sem exigir reload.
        setProfile({ ...profile, sexo: sexoEscolhido });
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
    <Screen title="Vamos te conhecer" subtitle="Antes de começar, responde a anamnese e escolhe seu plano" floating={<SaveIndicator status={statusSalvamento} />}>
      <Card>
        <View style={styles.cabecalhoIntro}>
          <Caption>
            Suas respostas são usadas só pelo profissional que te convidou, pra montar seu plano.
            Nenhum campo é obrigatório — responda o que fizer sentido.
          </Caption>
        </View>
      </Card>

      {rascunhoRestaurado ? (
        <Card>
          <Caption color={Palette.accent}>Recuperamos suas respostas salvas.</Caption>
        </Card>
      ) : null}

      <AnamneseCampos respostas={respostas} onChange={atualizarResposta} />

      {user ? <LinhaBaseFotos clientId={user.id} respostas={respostas} onChange={atualizarResposta} /> : null}

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
  opcoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  opcaoBotao: {
    flexGrow: 1,
    flexBasis: 150,
    alignItems: 'center',
  },
  campoEscolha: {
    gap: Spacing.xs,
  },
  campoCalculado: {
    gap: Spacing.xs,
  },
  campoLeitura: {
    gap: Spacing.xs,
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
  acaoGrade: { flexGrow: 1, flexBasis: 180 },
  analiseBox: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  comparacaoLinha: {
    gap: Spacing.xs,
  },
});
