// Edge Function: gera ilustração de exercício sob demanda via OpenAI (gpt-image-1), cache
// global por nome normalizado. HANDOFF §40. Chamada por `src/services/illustrationService.ts`
// (fire-and-forget, todo save de plano manual) e pela outra Edge Function (`generate-ai-plan`,
// depois de gravar um treino gerado por IA). Nunca trava quem chamou: `EdgeRuntime.waitUntil`
// roda a geração de verdade em background, a resposta HTTP volta assim que a fila é montada.

import { createClient } from 'npm:@supabase/supabase-js@2';
import OpenAI, { toFile } from 'npm:openai@4';

import { normalizarNomeExercicio } from '../../../src/lib/exerciseNormalize.ts';

const BUCKET = 'exercicios-ilustracoes';
const MODELO = 'gpt-image-1';

// Mesma lista de `supabase/functions/generate-ai-plan/index.ts` (cópia intencional, ver comentário
// lá) — nomes que já têm ilustração estática no app, nunca precisam de geração.
const EXERCICIOS_CATALOGO_NORMALIZADOS = [
  'Abdominal banco 45', 'Abdominal infra', 'Agachamento smith', 'Búlgaro', 'Cadeira abdutora',
  'Cadeira adutora', 'Cadeira extensora', 'Cadeira flexora', 'Crucifixo inverso',
  'Crucifixo máquina', 'Desenvolvimento máquina', 'Elevação frontal', 'Elevação lateral na polia',
  'Elevação lateral', 'Elevação pélvica', 'Hiperextensão lombar', 'Panturrilha em pé',
  'Leg press', 'Mesa flexora', 'Prancha', 'Pull down', 'Puxada alta barra reta',
  'Puxada alta pegada neutra', 'Remada com peito apoiado', 'Remada máquina cotovelos altos',
  'Remada serrote', 'Rosca martelo', 'Rosca unilateral', 'Stiff', 'Supino declinado',
  'Supino reto', 'Tríceps coice', 'Tríceps corda',
].map(normalizarNomeExercicio);

function jaTemIlustracaoEstatica(nomeNormalizado: string): boolean {
  // Aproximação por substring do mesmo jeito que `getExerciseIllustration` casa alias — não é a
  // lista completa de aliases (essa vive em `exerciseIllustrations.ts`, que faz `require()` de
  // PNG e não roda em Deno), então um alias muito diferente do nome canônico pode escapar dessa
  // checagem e gerar uma ilustração nova pra algo que já tinha — reduplicação inofensiva, não bug.
  return EXERCICIOS_CATALOGO_NORMALIZADOS.some(
    (canonico) => nomeNormalizado.includes(canonico) || canonico.includes(nomeNormalizado),
  );
}

/**
 * Lê uma imagem de referência bundled junto com a function (base64, não PNG binário direto —
 * `deploy_edge_function` só aceita `content: string`, então o binário vai como texto base64).
 * Gerado a partir de duas ilustrações reais do catálogo (`scripts` não versionado — foi um
 * `base64 -i assets/exercises/<nome>.png -o reference/<ref>.b64.txt` local, uma vez só).
 */
async function lerImagemReferencia(caminhoRelativo: string): Promise<Uint8Array | null> {
  try {
    const texto = await Deno.readTextFile(new URL(caminhoRelativo, import.meta.url));
    return Uint8Array.from(atob(texto.trim()), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function gerarImagem(
  db: ReturnType<typeof createClient>,
  openai: OpenAI,
  nomeOriginal: string,
  nomeNormalizado: string,
  referencias: Uint8Array[],
) {
  try {
    const prompt = `Ilustração técnica de exercício de musculação: "${nomeOriginal}". Estilo flat/monoline,
traço fino, sem preenchimento colorido (só um tom de destaque), fundo transparente, mesma
linguagem visual das imagens de referência anexadas — diagrama técnico, não foto, sem texto
escrito na imagem.`;

    const arquivosReferencia = await Promise.all(
      referencias.map((bytes, i) => toFile(bytes, `referencia-${i}.png`, { type: 'image/png' })),
    );

    const resultado = arquivosReferencia.length
      ? await openai.images.edit({ model: MODELO, image: arquivosReferencia, prompt, size: '1024x1024' })
      : await openai.images.generate({ model: MODELO, prompt, size: '1024x1024' });

    const b64 = resultado.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI não devolveu imagem.');

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const storagePath = `${nomeNormalizado.replace(/ /g, '-')}.png`;

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });
    if (uploadError) throw uploadError;

    await db
      .from('exercicios_ilustracoes')
      .update({ status: 'pronta', storage_path: storagePath, modelo: MODELO, atualizado_em: new Date().toISOString() })
      .eq('nome_normalizado', nomeNormalizado);
  } catch (e) {
    await db
      .from('exercicios_ilustracoes')
      .update({ status: 'falha', atualizado_em: new Date().toISOString() })
      .eq('nome_normalizado', nomeNormalizado);
    console.error(`Falha gerando ilustração de "${nomeOriginal}":`, e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });

  let body: { nomes?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, message: 'JSON inválido.' }), { status: 400 });
  }
  const nomes = Array.isArray(body.nomes) ? body.nomes.filter((n) => typeof n === 'string' && n.trim()) : [];
  if (!nomes.length) return new Response(JSON.stringify({ ok: true, disparados: [] }));

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const porNormalizado = new Map<string, string>(); // normalizado -> nome original (1º visto)
  for (const nome of nomes) {
    const norm = normalizarNomeExercicio(nome);
    if (!porNormalizado.has(norm) && !jaTemIlustracaoEstatica(norm)) porNormalizado.set(norm, nome);
  }
  if (!porNormalizado.size) return new Response(JSON.stringify({ ok: true, disparados: [] }));

  const { data: existentes } = await db
    .from('exercicios_ilustracoes')
    .select('nome_normalizado')
    .in('nome_normalizado', [...porNormalizado.keys()]);
  const jaExistem = new Set((existentes ?? []).map((r: { nome_normalizado: string }) => r.nome_normalizado));

  const novos = [...porNormalizado.entries()].filter(([norm]) => !jaExistem.has(norm));
  if (!novos.length) return new Response(JSON.stringify({ ok: true, disparados: [] }));

  // Insere todas as linhas `gerando` de uma vez — se outra requisição concorrente já inseriu
  // alguma (corrida rara), o upsert com `ignoreDuplicates` só ignora essa, não falha o lote.
  const { data: inseridos } = await db
    .from('exercicios_ilustracoes')
    .upsert(
      novos.map(([nome_normalizado]) => ({ nome_normalizado, status: 'gerando' as const, modelo: MODELO })),
      { onConflict: 'nome_normalizado', ignoreDuplicates: true },
    )
    .select('nome_normalizado');

  const disparados = (inseridos ?? []).map((r: { nome_normalizado: string }) => r.nome_normalizado);
  if (!disparados.length) return new Response(JSON.stringify({ ok: true, disparados: [] }));

  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
  const referencias = (
    await Promise.all([
      lerImagemReferencia('./reference/ref1.b64.txt'),
      lerImagemReferencia('./reference/ref2.b64.txt'),
    ])
  ).filter((r): r is Uint8Array => r !== null);

  for (const norm of disparados) {
    const nomeOriginal = porNormalizado.get(norm)!;
    // @ts-expect-error — EdgeRuntime é global só no runtime do Supabase, não no typecheck local.
    EdgeRuntime.waitUntil(gerarImagem(db, openai, nomeOriginal, norm, referencias));
  }

  return new Response(JSON.stringify({ ok: true, disparados }));
});
