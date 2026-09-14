// Edge Function: gera rascunho de treino OU dieta por IA a partir da anamnese do aluno.
// HANDOFF §40 — sempre grava `publicado: false, gerado_por_ia: true`; nunca publica sozinha.
// Sem retry automático: qualquer falha retorna na hora, sem re-prompt, sem job em background.
//
// Reusa lógica pura do app (nunca duplicada): `prepararParaSalvar`/`macrosPorGramas` de
// `src/models/domain.ts` e `normalizarNomeExercicio` de `src/lib/exerciseNormalize.ts`, ambos
// importados por caminho relativo — são arquivos zero-dependência, sem `require`/RN, rodam em
// Deno sem alteração. Se esses arquivos mudarem de lugar, atualizar os imports abaixo.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1';

import { macrosPorGramas, prepararParaSalvar, type PlanoEditavel } from '../../../src/models/domain.ts';

const MODELO = 'claude-haiku-4-5-20251001';

// Cópia intencional dos nomes canônicos de `src/lib/exerciseIllustrations.ts` (esse arquivo faz
// `require()` de PNG e não roda em Deno) — se adicionar ilustração nova lá, atualizar aqui também.
const EXERCICIOS_CATALOGO = [
  'Abdominal banco 45', 'Abdominal infra', 'Agachamento smith', 'Búlgaro', 'Cadeira abdutora',
  'Cadeira adutora', 'Cadeira extensora', 'Cadeira flexora', 'Crucifixo inverso',
  'Crucifixo máquina', 'Desenvolvimento máquina', 'Elevação frontal', 'Elevação lateral na polia',
  'Elevação lateral', 'Elevação pélvica', 'Hiperextensão lombar', 'Panturrilha em pé',
  'Leg press', 'Mesa flexora', 'Prancha', 'Pull down', 'Puxada alta barra reta',
  'Puxada alta pegada neutra', 'Remada com peito apoiado', 'Remada máquina cotovelos altos',
  'Remada serrote', 'Rosca martelo', 'Rosca unilateral', 'Stiff', 'Supino declinado',
  'Supino reto', 'Tríceps coice', 'Tríceps corda',
];

// Chaves permitidas de `anamnese.respostas_completas` por tipo — nunca identidade (nome, telefone,
// profissão) nem dado duplicado de `profiles` (idade/altura/peso/sexo já vêm de lá). LGPD: só o
// clinicamente/funcionalmente relevante pra gerar o plano sai da base, ver HANDOFF §40.
const CHAVES_ANAMNESE_TREINO = [
  'objetivo_principal', 'pratica_atividade', 'tempo_treino', 'freq_musculacao', 'freq_cardio',
  'duracao_treinos', 'intensidade', 'limitacao_fisica', 'patologias', 'historico_familiar',
];
const CHAVES_ANAMNESE_DIETA = [
  'objetivo_principal', 'patologias', 'medicamentos', 'intolerancias_alergias', 'nao_consome',
  'alimentos_gosta', 'alimentos_nao_gosta', 'refeicoes_por_dia', 'horarios_refeicoes',
  'facilidade_cozinhar', 'refeicoes_fora', 'sintomas_gastro', 'freq_ultraprocessados',
  'freq_doces_alcool',
];

type Bloqueio = { code: string; message: string };

function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function registrarGeracao(
  serviceClient: ReturnType<typeof createClient>,
  args: {
    clientId: string;
    professionalId: string;
    tipo: 'treino' | 'dieta';
    status: 'sucesso' | 'falha_validacao' | 'falha_bloqueio' | 'falha_api';
    inputTokens?: number;
    outputTokens?: number;
    erro?: string;
  },
) {
  await serviceClient.from('ia_geracoes').insert({
    client_id: args.clientId,
    professional_id: args.professionalId,
    tipo: args.tipo,
    modelo: MODELO,
    status: args.status,
    input_tokens: args.inputTokens ?? null,
    output_tokens: args.outputTokens ?? null,
    erro: args.erro ?? null,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return resposta({ ok: false, code: 'METODO_INVALIDO' }, 405);

  let body: { clientId?: string; tipo?: 'treino' | 'dieta' };
  try {
    body = await req.json();
  } catch {
    return resposta({ ok: false, code: 'REQUISICAO_INVALIDA', message: 'JSON inválido.' }, 400);
  }
  const { clientId, tipo } = body;
  if (!clientId || (tipo !== 'treino' && tipo !== 'dieta')) {
    return resposta({ ok: false, code: 'REQUISICAO_INVALIDA', message: 'clientId e tipo são obrigatórios.' }, 400);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Cliente com o JWT de quem chamou — só pra checagem de autorização via RPC já existente,
  // que resolve `auth.uid()` a partir desse JWT.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return resposta({ ok: false, code: 'NAO_AUTENTICADO' }, 401);
  }
  const professionalId = userData.user.id;

  const { data: autorizado, error: autorizacaoError } = await callerClient.rpc('is_professional_of', {
    p_patient_id: clientId,
  });
  if (autorizacaoError || !autorizado) {
    return resposta({ ok: false, code: 'NAO_AUTORIZADO' }, 403);
  }

  // Daqui em diante, service role — já autorizado acima, e precisamos ler/gravar dado que a
  // RLS do profissional não cobriria integralmente (ex.: gravar rascunho de IA).
  const db = createClient(supabaseUrl, serviceRoleKey);

  const [{ data: perfil }, { data: anamnese }] = await Promise.all([
    db.from('profiles').select('data_nascimento, altura_cm, peso_kg, sexo').eq('id', clientId).maybeSingle(),
    db.from('anamnese').select('respostas_completas').eq('client_id', clientId).maybeSingle(),
  ]);

  if (!perfil?.peso_kg || !perfil?.altura_cm || !perfil?.data_nascimento || !perfil?.sexo) {
    const bloqueio: Bloqueio = {
      code: 'PERFIL_INCOMPLETO',
      message: 'Complete peso, altura, data de nascimento e sexo no perfil do aluno antes de gerar com IA.',
    };
    await registrarGeracao(db, { clientId, professionalId, tipo, status: 'falha_bloqueio', erro: bloqueio.code });
    return resposta({ ok: false, ...bloqueio });
  }

  const respostas = (anamnese?.respostas_completas ?? {}) as Record<string, string>;
  const chaves = tipo === 'treino' ? CHAVES_ANAMNESE_TREINO : CHAVES_ANAMNESE_DIETA;
  const dadosAnamnese = Object.fromEntries(
    chaves.map((chave) => [chave, respostas[chave]?.trim() || 'não informado']),
  );

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  try {
    if (tipo === 'treino') {
      return await gerarTreino(db, anthropic, { clientId, professionalId, dadosAnamnese });
    }
    return await gerarDieta(db, anthropic, { clientId, professionalId, dadosAnamnese });
  } catch (e) {
    await registrarGeracao(db, {
      clientId,
      professionalId,
      tipo,
      status: 'falha_api',
      erro: e instanceof Error ? e.message : String(e),
    });
    return resposta({ ok: false, code: 'ERRO_DESCONHECIDO', message: 'Não consegui gerar agora. Tenta de novo em instantes.' });
  }
});

const TOOL_TREINO = {
  name: 'emitir_treino',
  description: 'Emite um plano de treino estruturado.',
  input_schema: {
    type: 'object' as const,
    properties: {
      dias: {
        type: 'array' as const,
        minItems: 2,
        maxItems: 6,
        items: {
          type: 'object' as const,
          properties: {
            nome: { type: 'string' as const, description: 'Ex.: "Push", "Pull", "Leg", "Full body A".' },
            tipo: { type: 'string' as const, enum: ['push', 'pull', 'leg'] },
            desc: { type: 'string' as const, description: 'Grupos musculares, ex.: "Peito · Ombro · Tríceps".' },
            exercicios: {
              type: 'array' as const,
              minItems: 3,
              maxItems: 10,
              items: {
                type: 'object' as const,
                properties: {
                  nome: { type: 'string' as const },
                  sets: { type: 'integer' as const, minimum: 1, maximum: 6 },
                  min: { type: 'integer' as const, minimum: 1, maximum: 60 },
                  max: { type: 'integer' as const, minimum: 1, maximum: 60 },
                  tempo: { type: 'boolean' as const, description: 'true se for exercício por tempo (ex.: prancha), reps em segundos.' },
                  ombro: { type: 'boolean' as const, description: 'true se envolve ombro significativamente.' },
                },
                required: ['nome', 'sets', 'min', 'max'],
              },
            },
          },
          required: ['nome', 'tipo', 'desc', 'exercicios'],
        },
      },
    },
    required: ['dias'],
  },
};

async function gerarTreino(
  db: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  args: { clientId: string; professionalId: string; dadosAnamnese: Record<string, string> },
) {
  const system = `Você monta plano de treino de musculação em português do Brasil, no formato do app Vytra.
Regras obrigatórias:
- Baseie sets/reps/divisão de dias no objetivo, nível relatado e frequência semanal da anamnese abaixo. Se "limitação física/patologia" mencionar dor ou lesão, evite ou adapte exercícios que sobrecarreguem a região citada.
- Prefira nomes de exercício desta lista quando fizer sentido pro grupo muscular do dia (mantém ilustração já existente no app): ${EXERCICIOS_CATALOGO.join(', ')}. Pode usar outro nome quando não houver equivalente adequado na lista — não é uma lista fechada.
- Nunca invente número de dias por semana maior do que o relatado na anamnese quando esse dado existir.

Anamnese do aluno:
${Object.entries(args.dadosAnamnese).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;

  const msg = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: 'Monte o plano de treino.' }],
    tools: [TOOL_TREINO],
    tool_choice: { type: 'tool', name: 'emitir_treino' },
  });

  const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  const usage = { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };

  const diasBrutos = (toolUse?.input as { dias?: unknown[] } | undefined)?.dias;
  if (!Array.isArray(diasBrutos) || !diasBrutos.length) {
    await registrarGeracao(db, { ...args, tipo: 'treino', status: 'falha_validacao', ...usage, erro: 'sem dias' });
    return resposta({ ok: false, code: 'RESPOSTA_INVALIDA' });
  }

  // Monta um PlanoEditavel com ids vazios e reusa `prepararParaSalvar` — MESMA normalização e
  // geração sequencial de id que o editor manual usa, nunca duplicada.
  const planoParaNormalizar: PlanoEditavel = {
    periodo: '',
    treinador: '',
    publicado: false,
    geradoPorIa: true,
    dias: diasBrutos.map((d: any, i: number) => ({
      id: String.fromCharCode(65 + i),
      nome: String(d?.nome ?? ''),
      tipo: String(d?.tipo ?? 'push'),
      desc: String(d?.desc ?? ''),
      ex: Array.isArray(d?.exercicios)
        ? d.exercicios.map((ex: any) => ({
            id: '',
            nome: String(ex?.nome ?? ''),
            warm: '—',
            feeder: '—',
            sets: Number(ex?.sets) || 3,
            min: Number(ex?.min) || 8,
            max: Number(ex?.max) || 12,
            tempo: !!ex?.tempo,
            ombro: !!ex?.ombro,
          }))
        : [],
    })),
  };

  let dias;
  try {
    dias = prepararParaSalvar(planoParaNormalizar);
  } catch (e) {
    await registrarGeracao(db, { ...args, tipo: 'treino', status: 'falha_validacao', ...usage, erro: String(e) });
    return resposta({ ok: false, code: 'RESPOSTA_INVALIDA' });
  }

  const { error } = await db.from('plans').upsert(
    {
      client_id: args.clientId,
      professional_id: args.professionalId,
      periodo: '',
      treinador: '',
      dias,
      publicado: false,
      gerado_por_ia: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );
  if (error) {
    await registrarGeracao(db, { ...args, tipo: 'treino', status: 'falha_api', ...usage, erro: error.message });
    return resposta({ ok: false, code: 'ERRO_DESCONHECIDO' });
  }

  await registrarGeracao(db, { ...args, tipo: 'treino', status: 'sucesso', ...usage });
  await dispararGeracaoIlustracoes(dias.flatMap((d) => d.ex.map((e) => e.nome)));
  return resposta({ ok: true });
}

const TOOL_DIETA = {
  name: 'emitir_dieta',
  description: 'Emite um plano alimentar estruturado a partir de alvos de macro já calculados.',
  input_schema: {
    type: 'object' as const,
    properties: {
      refeicoes: {
        type: 'array' as const,
        minItems: 3,
        maxItems: 7,
        items: {
          type: 'object' as const,
          properties: {
            nome: { type: 'string' as const, description: 'Ex.: "Café da manhã", "Almoço".' },
            itens: {
              type: 'array' as const,
              minItems: 1,
              maxItems: 8,
              items: {
                type: 'object' as const,
                properties: {
                  nomeAlimento: { type: 'string' as const },
                  quantidadeG: { type: 'number' as const, minimum: 1 },
                },
                required: ['nomeAlimento', 'quantidadeG'],
              },
            },
          },
          required: ['nome', 'itens'],
        },
      },
    },
    required: ['refeicoes'],
  },
};

async function gerarDieta(
  db: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  args: { clientId: string; professionalId: string; dadosAnamnese: Record<string, string> },
) {
  const { data: planoAtual } = await db
    .from('planos_alimentares')
    .select('meta_kcal, meta_proteina_g, meta_carboidrato_g, meta_gordura_g')
    .eq('client_id', args.clientId)
    .maybeSingle();

  if (!planoAtual?.meta_kcal) {
    const bloqueio: Bloqueio = {
      code: 'META_CALORICA_AUSENTE',
      message: 'Calcule a meta calórica na calculadora da tela de dieta antes de gerar com IA.',
    };
    await registrarGeracao(db, { ...args, tipo: 'dieta', status: 'falha_bloqueio', erro: bloqueio.code });
    return resposta({ ok: false, ...bloqueio });
  }

  const system = `Você monta plano alimentar em português do Brasil, no formato do app Vytra.
Regra obrigatória e inegociável: a soma de kcal/macros do dia PRECISA bater aproximadamente
(±5%) com estes alvos já calculados pelo profissional — você NUNCA decide o total, só decide
quais alimentos e em que porção (em gramas) atingem esse total:
- kcal: ${planoAtual.meta_kcal}
- proteína (g): ${planoAtual.meta_proteina_g ?? 'sem alvo'}
- carboidrato (g): ${planoAtual.meta_carboidrato_g ?? 'sem alvo'}
- gordura (g): ${planoAtual.meta_gordura_g ?? 'sem alvo'}

Respeite intolerâncias/alergias e alimentos que o aluno não consome por opção. Prefira alimentos
que ele relatou gostar. Use nomes de alimento genéricos e comuns no Brasil (ex.: "arroz branco
cozido", "peito de frango grelhado", "banana prata") pra que o app consiga casar com a base TACO.

Anamnese do aluno:
${Object.entries(args.dadosAnamnese).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;

  const msg = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: 'Monte o plano alimentar.' }],
    tools: [TOOL_DIETA],
    tool_choice: { type: 'tool', name: 'emitir_dieta' },
  });

  const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  const usage = { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };

  const refeicoesBrutas = (toolUse?.input as { refeicoes?: unknown[] } | undefined)?.refeicoes;
  if (!Array.isArray(refeicoesBrutas) || !refeicoesBrutas.length) {
    await registrarGeracao(db, { ...args, tipo: 'dieta', status: 'falha_validacao', ...usage, erro: 'sem refeições' });
    return resposta({ ok: false, code: 'RESPOSTA_INVALIDA' });
  }

  const refeicoes = [];
  for (const r of refeicoesBrutas as any[]) {
    const itens = [];
    for (const item of Array.isArray(r?.itens) ? r.itens : []) {
      const nomeAlimento = String(item?.nomeAlimento ?? '').trim();
      const gramas = Number(item?.quantidadeG) || 0;
      if (!nomeAlimento || !gramas) continue;

      const { data: candidatos } = await db
        .from('alimentos_taco')
        .select('id, nome, kcal, proteina_g, carboidrato_g, lipideos_g')
        .ilike('nome', `%${nomeAlimento}%`)
        .limit(1);
      const alimento = candidatos?.[0];

      if (alimento) {
        itens.push({
          nome: alimento.nome,
          quantidade: `${gramas}g`,
          macros: macrosPorGramas(alimento, gramas),
          substituicoes: [],
          taco_id: alimento.id,
          quantidade_g: gramas,
        });
      } else {
        // Nunca inventa macro — item livre sem match na TACO fica sem macro, igual ao editor manual.
        itens.push({ nome: nomeAlimento, quantidade: `${gramas}g`, macros: null, substituicoes: [] });
      }
    }
    if (itens.length) refeicoes.push({ nome: String(r?.nome ?? 'Refeição'), itens });
  }

  if (!refeicoes.length) {
    await registrarGeracao(db, { ...args, tipo: 'dieta', status: 'falha_validacao', ...usage, erro: 'sem itens válidos' });
    return resposta({ ok: false, code: 'RESPOSTA_INVALIDA' });
  }

  const { error } = await db.from('planos_alimentares').upsert(
    {
      client_id: args.clientId,
      professional_id: args.professionalId,
      periodo: '',
      nutricionista: '',
      meta_kcal: planoAtual.meta_kcal,
      meta_proteina_g: planoAtual.meta_proteina_g,
      meta_carboidrato_g: planoAtual.meta_carboidrato_g,
      meta_gordura_g: planoAtual.meta_gordura_g,
      observacoes: '',
      refeicoes,
      publicado: false,
      gerado_por_ia: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );
  if (error) {
    await registrarGeracao(db, { ...args, tipo: 'dieta', status: 'falha_api', ...usage, erro: error.message });
    return resposta({ ok: false, code: 'ERRO_DESCONHECIDO' });
  }

  await registrarGeracao(db, { ...args, tipo: 'dieta', status: 'sucesso', ...usage });
  return resposta({ ok: true });
}

/**
 * Fire-and-forget pra Edge Function de ilustração — mesmo dedupe/cache de
 * `src/services/illustrationService.ts`, só que chamado server-to-server (service role) em vez
 * do client. Nunca deveria travar/derrubar a geração de treino por causa de ilustração.
 */
async function dispararGeracaoIlustracoes(nomes: string[]) {
  const unicos = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))];
  if (!unicos.length) return;
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-exercise-illustration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ nomes: unicos }),
    });
  } catch {
    // silencioso de propósito — ver comentário acima.
  }
}
