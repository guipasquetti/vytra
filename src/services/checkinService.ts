import { supabase } from '@/lib/supabase';
import { calcularResumo, rotuloQualitativo, type RespostasCheckin, type ResumoCheckin } from '@/models/checkin';
import type { Tables } from '@/models/database.types';

export type CheckIn = Tables<'check_ins'>;
export type FotosCheckin = { frente?: string; esquerdo?: string; direito?: string; costas?: string };

const PERIODICIDADE_DIAS = 14;
/** Janela pra corrigir o check-in recém-enviado (12/set) — mesmo valor da trava em SQL
 * (`check_ins_update_self`). Não é edição livre do histórico, só correção de erro recente. */
const JANELA_EDICAO_HORAS = 24;

/**
 * Dispara (fire-and-forget, nunca trava o envio do check-in) a análise por IA das fotos —
 * a Edge Function mesma checa se tem foto de verdade e se não tiver não gasta chamada nenhuma.
 * Mesmo padrão de `dispararGeracaoIlustracoes` em `illustrationService.ts`.
 */
function dispararAnaliseFotosCheckin(checkinId: string): void {
  supabase.functions.invoke('analyze-checkin-photos', { body: { checkinId } }).catch(() => {
    // Nunca deveria travar o envio do check-in por causa da análise — se falhar, o profissional
    // só não vê a análise de IA pra esse check-in.
  });
}

/** Envia um check-in — série temporal, nunca sobrescrita (§14: cada envio é uma linha nova). */
export async function submeterCheckin(
  clientId: string,
  professionalId: string,
  subscriptionId: string,
  respostas: RespostasCheckin,
  fotos: FotosCheckin,
): Promise<ResumoCheckin> {
  const resumo = calcularResumo(respostas);
  const { data, error } = await supabase
    .from('check_ins')
    .insert({
      client_id: clientId,
      professional_id: professionalId,
      subscription_id: subscriptionId,
      respostas,
      pontuacao_geral: resumo.pontuacaoGeral,
      pontuacao_categorias: Object.fromEntries(
        resumo.categorias.map((c) => [c.categoria, { valor: c.pontuacao, rotulo: c.rotulo }]),
      ),
      foto_frente_path: fotos.frente ?? null,
      foto_perfil_esquerdo_path: fotos.esquerdo ?? null,
      foto_perfil_direito_path: fotos.direito ?? null,
      foto_costas_path: fotos.costas ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  dispararAnaliseFotosCheckin(data.id);
  return resumo;
}

/** Se o check-in ainda pode ser corrigido (12/set) — janela curta, não é reabrir o histórico. */
export function podeEditarCheckin(checkin: CheckIn): boolean {
  const horasDesde = (Date.now() - new Date(checkin.created_at).getTime()) / 3_600_000;
  return horasDesde < JANELA_EDICAO_HORAS;
}

/**
 * Corrige o check-in mais recente, dentro da janela (12/set) — update, não insert. RLS
 * (`check_ins_update_self`) já barra fora da janela ou de outro paciente; a trigger
 * `check_ins_impede_troca_vinculo` barra mudar client/professional/subscription mesmo aqui.
 */
export async function corrigirCheckin(
  id: string,
  respostas: RespostasCheckin,
  fotos: FotosCheckin,
): Promise<ResumoCheckin> {
  const resumo = calcularResumo(respostas);
  const { error } = await supabase
    .from('check_ins')
    .update({
      respostas,
      pontuacao_geral: resumo.pontuacaoGeral,
      pontuacao_categorias: Object.fromEntries(
        resumo.categorias.map((c) => [c.categoria, { valor: c.pontuacao, rotulo: c.rotulo }]),
      ),
      foto_frente_path: fotos.frente ?? null,
      foto_perfil_esquerdo_path: fotos.esquerdo ?? null,
      foto_perfil_direito_path: fotos.direito ?? null,
      foto_costas_path: fotos.costas ?? null,
    })
    .eq('id', id);
  if (error) throw error;
  dispararAnaliseFotosCheckin(id);
  return resumo;
}

/** Envia uma foto do check-in pro bucket privado — caminho sempre prefixado pelo próprio uid. */
export async function uploadFotoCheckin(
  clientId: string,
  tipo: 'frente' | 'esquerdo' | 'direito' | 'costas',
  arquivo: { uri: string; name: string },
): Promise<string> {
  const extensao = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'jpg';
  const caminho = `${clientId}/${Date.now()}-${tipo}.${extensao}`;
  const resposta = await fetch(arquivo.uri);
  const blob = await resposta.blob();
  const { error } = await supabase.storage
    .from('fotos-checkin')
    .upload(caminho, blob, { contentType: blob.type || undefined });
  if (error) throw error;
  return caminho;
}

/** Link temporário (1h) pra abrir uma foto do bucket privado. */
export async function obterUrlFotoCheckin(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from('fotos-checkin').createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}

/** Histórico do próprio paciente, mais recente primeiro. */
export async function listarMeusCheckins(clientId: string): Promise<CheckIn[]> {
  const { data } = await supabase
    .from('check_ins')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** Histórico de um acompanhamento específico — nunca mistura profissionais do mesmo paciente. */
export async function listarCheckinsDaAssinatura(subscriptionId: string): Promise<CheckIn[]> {
  const { data } = await supabase
    .from('check_ins')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** Histórico de um paciente, visto pelo profissional (RLS já escopa por `is_professional_of`). */
export async function listarCheckinsDoAluno(clientId: string): Promise<CheckIn[]> {
  return listarMeusCheckins(clientId);
}

const ANGULOS = [
  { chave: 'foto_frente_path', angulo: 'frente', label: 'Frente' },
  { chave: 'foto_perfil_esquerdo_path', angulo: 'esquerdo', label: 'Perfil esquerdo' },
  { chave: 'foto_perfil_direito_path', angulo: 'direito', label: 'Perfil direito' },
  { chave: 'foto_costas_path', angulo: 'costas', label: 'Costas' },
] as const;

export type FotoComparacao = { url: string; data: string };
export type ComparacaoAngulo = {
  angulo: 'frente' | 'esquerdo' | 'direito' | 'costas';
  label: string;
  primeira: FotoComparacao | null;
  ultima: FotoComparacao | null;
};

/**
 * Progresso visual (FA do roadmap, item 04): primeira x mais recente foto de cada ângulo,
 * entre os check-ins que de fato enviaram foto (nem todo check-in manda — é opcional).
 * Só devolve algo quando há pelo menos 2 check-ins distintos com foto — 1 só não é
 * "comparação". Sem análise automática (postura/simetria) — isso é IA, fora de escopo aqui.
 */
export async function obterComparacaoFotos(subscriptionId: string): Promise<ComparacaoAngulo[]> {
  const checkins = await listarCheckinsDaAssinatura(subscriptionId); // mais recente primeiro
  const comFoto = checkins.filter(
    (c) => c.foto_frente_path || c.foto_perfil_esquerdo_path || c.foto_perfil_direito_path || c.foto_costas_path,
  );
  if (comFoto.length < 2) return [];

  const ultimo = comFoto[0];
  const primeiro = comFoto[comFoto.length - 1];

  const resultado: ComparacaoAngulo[] = [];
  for (const a of ANGULOS) {
    const pathPrimeira = primeiro[a.chave];
    const pathUltima = ultimo[a.chave];
    if (!pathPrimeira && !pathUltima) continue;
    const [urlPrimeira, urlUltima] = await Promise.all([
      pathPrimeira ? obterUrlFotoCheckin(pathPrimeira) : Promise.resolve(null),
      pathUltima ? obterUrlFotoCheckin(pathUltima) : Promise.resolve(null),
    ]);
    resultado.push({
      angulo: a.angulo,
      label: a.label,
      primeira: pathPrimeira && urlPrimeira ? { url: urlPrimeira, data: primeiro.created_at } : null,
      ultima: pathUltima && urlUltima ? { url: urlUltima, data: ultimo.created_at } : null,
    });
  }
  return resultado;
}

export type FotoDoCheckin = { angulo: 'frente' | 'esquerdo' | 'direito' | 'costas'; label: string; url: string };
export type GaleriaCheckin = { checkinId: string; data: string; fotos: FotoDoCheckin[] };

/**
 * Todo check-in que tem pelo menos uma foto, mais recente primeiro — pedido do Guilherme
 * (18/set): o profissional precisa ver os arquivos enviados a qualquer momento, não só quando
 * `obterComparacaoFotos` tem os 2 check-ins que a comparação exige. As duas funções coexistem
 * de propósito: essa aqui é a lista completa, a outra continua sendo o "antes x depois" rápido.
 */
export async function listarGaleriaCheckins(subscriptionId: string): Promise<GaleriaCheckin[]> {
  const checkins = await listarCheckinsDaAssinatura(subscriptionId); // mais recente primeiro
  const comFoto = checkins.filter(
    (c) => c.foto_frente_path || c.foto_perfil_esquerdo_path || c.foto_perfil_direito_path || c.foto_costas_path,
  );

  const resultado: GaleriaCheckin[] = [];
  for (const c of comFoto) {
    const fotos: FotoDoCheckin[] = [];
    for (const a of ANGULOS) {
      const caminho = c[a.chave];
      if (!caminho) continue;
      const url = await obterUrlFotoCheckin(caminho);
      if (url) fotos.push({ angulo: a.angulo, label: a.label, url });
    }
    if (fotos.length) resultado.push({ checkinId: c.id, data: c.created_at, fotos });
  }
  return resultado;
}

export type IndicadorAnaliseFotos = { rotulo: string; observacao: string };
export type AnaliseFotosCheckin = {
  checkinId: string;
  checkinAnteriorId: string | null;
  resumo: string;
  indicadores: IndicadorAnaliseFotos[];
};

/**
 * Análises de IA já prontas pros check-ins informados, indexadas por `checkinId` — busca em
 * lote (uma query só) pra usar junto de `listarGaleriaCheckins` sem N chamadas. Check-in sem
 * chave no retorno = ainda sem análise (gerando em background, falhou, ou é anterior a 18/set,
 * antes dessa feature existir) — quem chama decide como tratar a ausência, não é erro.
 */
export async function listarAnalisesFotos(checkinIds: string[]): Promise<Record<string, AnaliseFotosCheckin>> {
  if (!checkinIds.length) return {};
  const { data, error } = await supabase
    .from('analises_fotos_checkin')
    .select('checkin_id, checkin_anterior_id, resumo, indicadores')
    .in('checkin_id', checkinIds);
  if (error) throw error;
  const resultado: Record<string, AnaliseFotosCheckin> = {};
  for (const row of data ?? []) {
    resultado[row.checkin_id] = {
      checkinId: row.checkin_id,
      checkinAnteriorId: row.checkin_anterior_id,
      resumo: row.resumo,
      indicadores: (row.indicadores ?? []) as IndicadorAnaliseFotos[],
    };
  }
  return resultado;
}

export type RegistroPeso = { data: string; peso: number };

/**
 * Histórico de peso corporal extraído da pergunta `peso_corporal` do check-in (respondida
 * como texto livre, ver `RespostasCheckin`), em ordem cronológica crescente. Ignora check-ins
 * sem essa resposta ou com valor não numérico — não inventa peso pra quem não respondeu.
 */
export function historicoPeso(checkins: CheckIn[]): RegistroPeso[] {
  return checkins
    .map((c) => {
      const bruto = (c.respostas as Record<string, string> | null)?.peso_corporal;
      const peso = bruto ? Number(bruto.replace(',', '.')) : NaN;
      return Number.isFinite(peso) ? { data: c.created_at, peso } : null;
    })
    .filter((r): r is RegistroPeso => r !== null)
    .reverse();
}

export type RegistroPontuacao = { data: string; pontuacao: number };

/**
 * Série temporal de `pontuacao_geral` — mesma forma de `historicoPeso`, ordem cronológica
 * crescente. `check_ins` já grava essa nota por linha desde `submeterCheckin`, nunca antes
 * plotada em série (só o valor mais recente aparecia, em `gestaoService.ts` e no Início do
 * aluno) — dado que já existe, sem coluna nova.
 */
export function historicoPontuacao(checkins: CheckIn[]): RegistroPontuacao[] {
  return checkins
    .filter((c): c is CheckIn & { pontuacao_geral: number } => c.pontuacao_geral != null)
    .map((c) => ({ data: c.created_at, pontuacao: c.pontuacao_geral }))
    .reverse();
}

export type ResumoAdesaoCategoria = { categoria: string; rotulo: string; mediaPontuacao: number };

/**
 * Média por categoria de `pontuacao_categorias` (jsonb já gravado por `submeterCheckin`) nos
 * últimos `n` check-ins — dado que já existe, sem coluna nova. `checkins` deve vir mais
 * recente primeiro (mesma ordem de `listarCheckinsDoAluno`/`listarCheckinsDaAssinatura`).
 *
 * ⚠️ O `rotulo` é recalculado a partir da MÉDIA (`rotuloQualitativo`, `models/checkin.ts`), não
 * herdado de nenhum check-in individual — carregar o rótulo de uma resposta específica pra uma
 * média de várias respostas diferentes é incoerente (achado testando com `npx tsx`: uma
 * primeira versão pegava o rótulo do check-in mais antigo do lote, não da média).
 */
export function resumoAdesao(checkins: CheckIn[], n = 3): ResumoAdesaoCategoria[] {
  const recentes = checkins.slice(0, n);
  const somaPorCategoria = new Map<string, { soma: number; conta: number }>();
  for (const c of recentes) {
    const categorias = c.pontuacao_categorias as Record<string, { valor: number; rotulo: string }> | null;
    if (!categorias) continue;
    for (const [categoria, { valor }] of Object.entries(categorias)) {
      const atual = somaPorCategoria.get(categoria) ?? { soma: 0, conta: 0 };
      somaPorCategoria.set(categoria, { soma: atual.soma + valor, conta: atual.conta + 1 });
    }
  }
  return Array.from(somaPorCategoria.entries()).map(([categoria, { soma, conta }]) => {
    const mediaPontuacao = Math.round(soma / conta);
    return { categoria, rotulo: rotuloQualitativo(mediaPontuacao), mediaPontuacao };
  });
}

/** Tolerância além da periodicidade antes de considerar a sequência quebrada — mesma folga
 * usada pro streak de treino não zerar só porque o aluno ainda não abriu o app hoje. */
const STREAK_GRACE_DIAS = 3;

/**
 * Check-ins seguidos dentro do prazo, contando do mais recente pra trás (`checkins` deve vir
 * nessa ordem, mesma de `listarCheckinsDaAssinatura`/`listarCheckinsDoAluno`). Diferente do
 * streak de treino (`workoutService.streakTreino`, dias corridos), aqui "seguido" é responder
 * dentro do ciclo de `PERIODICIDADE_DIAS` — faltar um ciclo inteiro quebra a sequência mesmo
 * sem intervalo de dias exato entre respostas.
 */
export function streakCheckin(checkins: CheckIn[]): number {
  if (!checkins.length) return 0;

  const diasDesdeUltimo = (Date.now() - new Date(checkins[0].created_at).getTime()) / 86_400_000;
  if (diasDesdeUltimo > PERIODICIDADE_DIAS + STREAK_GRACE_DIAS) return 0;

  let streak = 1;
  for (let i = 1; i < checkins.length; i++) {
    const gap =
      (new Date(checkins[i - 1].created_at).getTime() - new Date(checkins[i].created_at).getTime()) / 86_400_000;
    if (gap > PERIODICIDADE_DIAS + STREAK_GRACE_DIAS) break;
    streak++;
  }
  return streak;
}

/** Se o paciente já pode enviar um novo check-in (nunca enviou, ou já passou a periodicidade). */
export async function checkinPendente(subscriptionId: string): Promise<boolean> {
  const { data } = await supabase
    .from('check_ins')
    .select('created_at')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return true;
  const diasDesde = (Date.now() - new Date(data.created_at).getTime()) / 86_400_000;
  return diasDesde >= PERIODICIDADE_DIAS;
}
