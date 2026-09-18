// Edge Function: análise automática das fotos de um check-in por IA com visão (HANDOFF §56).
// Dispara sozinha a cada check-in com pelo menos 1 foto (`src/services/checkinService.ts`,
// fire-and-forget, nunca trava o envio do check-in) — compara com a foto mais recente anterior
// da mesma assinatura quando existe. Resultado é só pro profissional ler (nunca pro paciente),
// é apoio visual, nunca diagnóstico. Sem retry automático, mesmo padrão de `generate-ai-plan`.
//
// LGPD: isso manda FOTO do paciente pra Anthropic, transferência mais sensível que o texto
// curado da anamnese que `generate-ai-plan` já manda — ação pendente registrada na migração
// (`20260918_analise_ia_fotos_checkin.sql`) e no HANDOFF §56, sign-off do Guilherme antes de
// uso real com paciente.

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1';

const MODELO = 'claude-sonnet-5';
const BUCKET = 'fotos-checkin';

const ANGULOS = [
  { chave: 'foto_frente_path', label: 'Frente' },
  { chave: 'foto_perfil_esquerdo_path', label: 'Perfil esquerdo' },
  { chave: 'foto_perfil_direito_path', label: 'Perfil direito' },
  { chave: 'foto_costas_path', label: 'Costas' },
] as const;

type LinhaCheckin = Record<string, unknown>;
type Foto = { path: string; label: string };
type FotoCodificada = { label: string; mediaType: string; base64: string };

function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function extrairFotos(checkin: LinhaCheckin): Foto[] {
  const fotos: Foto[] = [];
  for (const a of ANGULOS) {
    const path = checkin[a.chave];
    if (typeof path === 'string' && path) fotos.push({ path, label: a.label });
  }
  return fotos;
}

/** Uint8Array -> base64 em blocos, pra não estourar a pilha de `String.fromCharCode` com foto grande. */
function paraBase64(bytes: Uint8Array): string {
  let binario = '';
  const tamanhoBloco = 0x8000;
  for (let i = 0; i < bytes.length; i += tamanhoBloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + tamanhoBloco));
  }
  return btoa(binario);
}

async function baixarEcodificar(
  db: ReturnType<typeof createClient>,
  fotos: Foto[],
): Promise<FotoCodificada[]> {
  const resultado: FotoCodificada[] = [];
  for (const f of fotos) {
    const { data, error } = await db.storage.from(BUCKET).download(f.path);
    if (error || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    resultado.push({ label: f.label, mediaType: data.type || 'image/jpeg', base64: paraBase64(bytes) });
  }
  return resultado;
}

async function registrarGeracao(
  db: ReturnType<typeof createClient>,
  args: {
    clientId: string;
    professionalId: string;
    status: 'sucesso' | 'falha_validacao' | 'falha_api';
    inputTokens?: number;
    outputTokens?: number;
    erro?: string;
  },
) {
  await db.from('ia_geracoes').insert({
    client_id: args.clientId,
    professional_id: args.professionalId,
    tipo: 'analise_fotos',
    modelo: MODELO,
    status: args.status,
    input_tokens: args.inputTokens ?? null,
    output_tokens: args.outputTokens ?? null,
    erro: args.erro ?? null,
  });
}

const TOOL_ANALISE = {
  name: 'emitir_analise_fotos',
  description: 'Emite análise textual e indicadores qualitativos a partir das fotos de progresso do paciente.',
  input_schema: {
    type: 'object' as const,
    properties: {
      resumo: {
        type: 'string' as const,
        description:
          'Parágrafo com impressão visual geral e, se houver fotos do check-in anterior pra comparar, a evolução percebida entre elas.',
      },
      indicadores: {
        type: 'array' as const,
        minItems: 2,
        maxItems: 6,
        items: {
          type: 'object' as const,
          properties: {
            rotulo: {
              type: 'string' as const,
              description:
                'Ex.: "Composição corporal aparente", "Postura", "Simetria", "Evolução desde o último check-in".',
            },
            observacao: { type: 'string' as const },
          },
          required: ['rotulo', 'observacao'],
        },
      },
    },
    required: ['resumo', 'indicadores'],
  },
};

const SYSTEM = `Você analisa fotos de progresso físico de pacientes em português do Brasil, no app Vytra — apoio visual pro profissional (educador físico ou nutricionista) que acompanha o caso. O texto que você gera é lido só pelo profissional, nunca direto pelo paciente.

Regras obrigatórias:
- Nunca dê diagnóstico médico. Nunca estime peso ou percentual de gordura como número exato — são fotos, não exame. Fale em termos qualitativos ("aparenta", "sugere", "vale observar").
- As fotos seguem um padrão de enquadramento e pose (silhueta-guia usada no app), então comparação de ângulo/postura entre fotos é mais confiável que estimativa absoluta de composição corporal.
- Considere proporções, simetria aparente, postura e sinais visuais relevantes pro trabalho de quem monta treino (ex.: assimetria muscular, postura) ou dieta (ex.: sinais visuais de composição corporal) — nunca invente o que a foto não mostra.
- Se houver fotos de um check-in anterior pra comparação, descreva a mudança percebida entre elas; se não houver, analise só o conjunto atual como ponto de partida.
- Nunca comente sobre identidade, rosto ou qualquer coisa fora do escopo de treino/nutrição.`;

async function analisar(
  db: ReturnType<typeof createClient>,
  checkin: LinhaCheckin,
  fotosAtuais: Foto[],
) {
  const clientId = String(checkin.client_id);
  const professionalId = String(checkin.professional_id);

  try {
    const { data: anteriores } = await db
      .from('check_ins')
      .select(
        'id, created_at, foto_frente_path, foto_perfil_esquerdo_path, foto_perfil_direito_path, foto_costas_path',
      )
      .eq('subscription_id', checkin.subscription_id as string)
      .lt('created_at', checkin.created_at as string)
      .order('created_at', { ascending: false })
      .limit(10);

    const anterior = (anteriores ?? []).find((c) => extrairFotos(c).length > 0) ?? null;
    const fotosAnteriores = anterior ? extrairFotos(anterior) : [];

    const [imgsAtuais, imgsAnteriores] = await Promise.all([
      baixarEcodificar(db, fotosAtuais),
      baixarEcodificar(db, fotosAnteriores),
    ]);

    if (!imgsAtuais.length) {
      await registrarGeracao(db, { clientId, professionalId, status: 'falha_validacao', erro: 'download falhou' });
      return;
    }

    const content: Array<
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text'; text: string }
    > = [];
    for (const img of imgsAtuais) {
      content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
      content.push({ type: 'text', text: `Foto atual — ${img.label}` });
    }
    if (imgsAnteriores.length && anterior) {
      const dataAnterior = new Date(anterior.created_at as string).toLocaleDateString('pt-BR');
      for (const img of imgsAnteriores) {
        content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
        content.push({ type: 'text', text: `Foto anterior (${dataAnterior}) — ${img.label}` });
      }
    }
    content.push({ type: 'text', text: 'Analise as fotos acima e emita a análise.' });

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const msg = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1536,
      system: SYSTEM,
      // deno-lint-ignore no-explicit-any
      messages: [{ role: 'user', content: content as any }],
      tools: [TOOL_ANALISE],
      tool_choice: { type: 'tool', name: 'emitir_analise_fotos' },
    });

    const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const usage = { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
    const dados = toolUse?.input as { resumo?: string; indicadores?: unknown[] } | undefined;

    if (!dados?.resumo || !Array.isArray(dados.indicadores) || !dados.indicadores.length) {
      await registrarGeracao(db, { clientId, professionalId, status: 'falha_validacao', ...usage, erro: 'resposta sem resumo/indicadores' });
      return;
    }

    await db.from('analises_fotos_checkin').upsert(
      {
        checkin_id: checkin.id as string,
        subscription_id: checkin.subscription_id as string,
        checkin_anterior_id: anterior?.id ?? null,
        resumo: dados.resumo,
        indicadores: dados.indicadores,
      },
      { onConflict: 'checkin_id' },
    );

    await registrarGeracao(db, { clientId, professionalId, status: 'sucesso', ...usage });
  } catch (e) {
    await registrarGeracao(db, {
      clientId,
      professionalId,
      status: 'falha_api',
      erro: e instanceof Error ? e.message : String(e),
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return resposta({ ok: false, code: 'METODO_INVALIDO' }, 405);

  let body: { checkinId?: string };
  try {
    body = await req.json();
  } catch {
    return resposta({ ok: false, code: 'REQUISICAO_INVALIDA', message: 'JSON inválido.' }, 400);
  }
  const { checkinId } = body;
  if (!checkinId) {
    return resposta({ ok: false, code: 'REQUISICAO_INVALIDA', message: 'checkinId é obrigatório.' }, 400);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Cliente com o JWT de quem chamou — a RLS de `check_ins_select` (paciente dono ou
  // profissional vinculado) já é a checagem de autorização: se a linha não vier, não autorizado.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: checkin, error: checkinError } = await callerClient
    .from('check_ins')
    .select(
      'id, subscription_id, client_id, professional_id, created_at, foto_frente_path, foto_perfil_esquerdo_path, foto_perfil_direito_path, foto_costas_path',
    )
    .eq('id', checkinId)
    .maybeSingle();
  if (checkinError || !checkin) return resposta({ ok: false, code: 'NAO_AUTORIZADO' }, 403);

  const fotosAtuais = extrairFotos(checkin);
  if (!fotosAtuais.length) return resposta({ ok: true, disparado: false });

  // Daqui em diante, service role — baixar foto de bucket privado, ler check-in anterior e
  // gravar a análise não são operações que o JWT do paciente cobriria via RLS.
  const db = createClient(supabaseUrl, serviceRoleKey);

  // @ts-expect-error — EdgeRuntime é global só no runtime do Supabase, não no typecheck local.
  EdgeRuntime.waitUntil(analisar(db, checkin, fotosAtuais));

  return resposta({ ok: true, disparado: true });
});
