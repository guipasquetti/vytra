// Edge Function: análise automática da foto da anamnese por IA com visão (HANDOFF §59, mesmo
// padrão de `analyze-checkin-photos`, §56). Dispara sozinha ao concluir o upload da foto da
// anamnese (`src/services/anamneseService.ts`, fire-and-forget, nunca trava o upload). Diferente
// do check-in (série de envios), a anamnese tem só 1 foto "atual" — reanalisa (upsert por
// `client_id`) sempre que o paciente trocar a foto, sem conceito de "anterior" pra comparar.
//
// LGPD: manda FOTO do paciente pra Anthropic, mesma nota pendente do §56 — sign-off do
// Guilherme antes de uso real com paciente (ver HANDOFF §56/§59).

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1';

const MODELO = 'claude-sonnet-5';
const BUCKET = 'fotos-anamnese';

function resposta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Uint8Array -> base64 em blocos, mesmo helper de `analyze-checkin-photos`, pra não estourar a
 * pilha de `String.fromCharCode` com foto grande. */
function paraBase64(bytes: Uint8Array): string {
  let binario = '';
  const tamanhoBloco = 0x8000;
  for (let i = 0; i < bytes.length; i += tamanhoBloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + tamanhoBloco));
  }
  return btoa(binario);
}

async function registrarGeracao(
  db: ReturnType<typeof createClient>,
  args: {
    clientId: string;
    professionalId: string | null;
    status: 'sucesso' | 'falha_validacao' | 'falha_api';
    inputTokens?: number;
    outputTokens?: number;
    erro?: string;
  },
) {
  // `ia_geracoes.professional_id` é not null — sem assinatura ainda (paciente sem nenhum
  // vínculo registrado), não tem contra quem auditar o custo; não deveria acontecer no fluxo
  // normal (assinatura já existe antes da anamnese, ver `finalizar_cadastro_convite`), mas não
  // trava a análise por causa disso.
  if (!args.professionalId) return;
  await db.from('ia_geracoes').insert({
    client_id: args.clientId,
    professional_id: args.professionalId,
    tipo: 'analise_foto_anamnese',
    modelo: MODELO,
    status: args.status,
    input_tokens: args.inputTokens ?? null,
    output_tokens: args.outputTokens ?? null,
    erro: args.erro ?? null,
  });
}

const TOOL_ANALISE = {
  name: 'emitir_analise_foto_anamnese',
  description: 'Emite análise textual e indicadores qualitativos a partir da foto anexada à anamnese do paciente.',
  input_schema: {
    type: 'object' as const,
    properties: {
      resumo: {
        type: 'string' as const,
        description:
          'Parágrafo com impressão visual geral do paciente, como ponto de partida pro profissional que vai montar o plano.',
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
              description: 'Ex.: "Composição corporal aparente", "Postura", "Simetria".',
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

const SYSTEM = `Você analisa a foto anexada à anamnese de um paciente em português do Brasil, no app Vytra — ponto de partida visual pro profissional (educador físico ou nutricionista) que vai montar o plano dele. O texto que você gera é lido só pelo profissional, nunca direto pelo paciente.

Regras obrigatórias:
- Nunca dê diagnóstico médico. Nunca estime peso ou percentual de gordura como número exato — é uma foto, não exame. Fale em termos qualitativos ("aparenta", "sugere", "vale observar").
- Diferente da foto de check-in (que segue pose/ângulo padronizados pra comparação), esta é só uma foto livre anexada na anamnese — trate como ponto de partida geral, nunca como comparação com nada.
- Considere proporções, postura e sinais visuais relevantes pro trabalho de quem monta treino (ex.: assimetria muscular, postura) ou dieta (ex.: sinais visuais de composição corporal) — nunca invente o que a foto não mostra.
- Nunca comente sobre identidade, rosto ou qualquer coisa fora do escopo de treino/nutrição.`;

async function analisar(
  db: ReturnType<typeof createClient>,
  clientId: string,
  professionalId: string | null,
  fotoPath: string,
) {
  try {
    const { data, error } = await db.storage.from(BUCKET).download(fotoPath);
    if (error || !data) {
      await registrarGeracao(db, { clientId, professionalId, status: 'falha_validacao', erro: 'download falhou' });
      return;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    const base64 = paraBase64(bytes);
    const mediaType = data.type || 'image/jpeg';

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
    const msg = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Analise a foto acima e emita a análise.' },
          ],
        },
      ],
      tools: [TOOL_ANALISE],
      tool_choice: { type: 'tool', name: 'emitir_analise_foto_anamnese' },
    });

    const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const usage = { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
    const dados = toolUse?.input as { resumo?: string; indicadores?: unknown[] } | undefined;

    if (!dados?.resumo || !Array.isArray(dados.indicadores) || !dados.indicadores.length) {
      await registrarGeracao(db, {
        clientId,
        professionalId,
        status: 'falha_validacao',
        ...usage,
        erro: 'resposta sem resumo/indicadores',
      });
      return;
    }

    await db.from('analise_foto_anamnese').upsert(
      {
        client_id: clientId,
        foto_path: fotoPath,
        resumo: dados.resumo,
        indicadores: dados.indicadores,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' },
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

  let body: { fotoPath?: string };
  try {
    body = await req.json();
  } catch {
    return resposta({ ok: false, code: 'REQUISICAO_INVALIDA', message: 'JSON inválido.' }, 400);
  }
  const { fotoPath } = body;
  if (!fotoPath) {
    return resposta({ ok: false, code: 'REQUISICAO_INVALIDA', message: 'fotoPath é obrigatório.' }, 400);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Cliente com o JWT de quem chamou — só o dono da foto dispara a própria análise (o
  // profissional nunca faz upload aqui, só lê o resultado depois via RLS de
  // `analise_foto_anamnese`). O caminho no bucket já é prefixado pelo uid de quem enviou, então
  // conferir que `fotoPath` pertence ao chamador é a checagem de autorização inteira — mesmo
  // raciocínio da RLS de `storage.objects` pra este bucket (`fotos_anamnese_insert`).
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return resposta({ ok: false, code: 'NAO_AUTORIZADO' }, 403);
  const clientId = userData.user.id;
  if (!fotoPath.startsWith(`${clientId}/`)) return resposta({ ok: false, code: 'NAO_AUTORIZADO' }, 403);

  // Daqui em diante, service role — baixar foto de bucket privado, ler a assinatura do paciente
  // (pra saber contra qual profissional auditar o custo) e gravar a análise não são operações
  // que o JWT do paciente cobriria via RLS.
  const db = createClient(supabaseUrl, serviceRoleKey);
  const { data: sub } = await db
    .from('subscriptions')
    .select('professional_id')
    .eq('patient_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const professionalId = sub?.professional_id ?? null;

  // @ts-expect-error — EdgeRuntime é global só no runtime do Supabase, não no typecheck local.
  EdgeRuntime.waitUntil(analisar(db, clientId, professionalId, fotoPath));

  return resposta({ ok: true, disparado: true });
});
