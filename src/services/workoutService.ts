import { supabase } from '@/lib/supabase';
import { hojeISO, type DiaTreino, type Exercicio, type SetLog } from '@/models/domain';
import type { Tables } from '@/models/database.types';

/** Uma sessão registrada de um exercício. */
export type Sessao = { data: string; sets: SetLog[] };

export type PlanoTreino = Omit<Tables<'plans'>, 'dias'> & { dias: DiaTreino[] };

export type WorkoutData = {
  plano: PlanoTreino | null;
  /** Histórico por exercise_id, em ordem cronológica crescente. */
  historico: Record<string, Sessao[]>;
  /** Rascunho de hoje por exercise_id (séries já feitas, treino ainda incompleto). */
  rascunhos: Record<string, Sessao>;
};

export async function getWorkoutData(clientId: string): Promise<WorkoutData> {
  const [{ data: planoRow }, { data: logs }, { data: drafts }] = await Promise.all([
    supabase.from('plans').select('*').eq('client_id', clientId).maybeSingle(),
    supabase
      .from('workout_logs')
      .select('*')
      .eq('client_id', clientId)
      .order('session_date', { ascending: true }),
    supabase.from('workout_drafts').select('*').eq('client_id', clientId),
  ]);

  const historico: Record<string, Sessao[]> = {};
  for (const row of logs ?? []) {
    (historico[row.exercise_id] ??= []).push({
      data: row.session_date,
      sets: (row.sets ?? []) as SetLog[],
    });
  }

  const hoje = hojeISO();
  const rascunhos: Record<string, Sessao> = {};
  for (const row of drafts ?? []) {
    if (row.session_date === hoje) {
      rascunhos[row.exercise_id] = { data: row.session_date, sets: (row.sets ?? []) as SetLog[] };
    }
  }

  return {
    plano: planoRow ? { ...planoRow, dias: (planoRow.dias ?? []) as DiaTreino[] } : null,
    historico,
    rascunhos,
  };
}

export function concluidoHoje(historico: Sessao[] | undefined): boolean {
  return !!historico?.length && historico[historico.length - 1].data === hojeISO();
}

/** Um dia antes de `iso` (YYYY-MM-DD), em aritmética de calendário (UTC), não fuso local. */
function diaAnteriorISO(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Dias seguidos com pelo menos um exercício registrado (`workout_logs`, qualquer exercício),
 * contando pra trás a partir de hoje. Se ainda não treinou hoje, o streak "de ontem" continua
 * valendo (não zera só por ainda não ter aberto o app hoje) — mesma lógica de streak de hábito
 * já usada em apps de fitness.
 */
export function streakTreino(historico: Record<string, Sessao[]>): number {
  const dias = new Set<string>();
  for (const sessoes of Object.values(historico)) {
    for (const s of sessoes) dias.add(s.data);
  }
  if (!dias.size) return 0;

  let cursor = dias.has(hojeISO()) ? hojeISO() : diaAnteriorISO(hojeISO());
  if (!dias.has(cursor)) return 0;

  let streak = 0;
  while (dias.has(cursor)) {
    streak++;
    cursor = diaAnteriorISO(cursor);
  }
  return streak;
}

/**
 * Persistência da semana em percentual: dias com pelo menos um exercício registrado nos
 * últimos 7 dias corridos (hoje + 6 pra trás) dividido pelo nº de treinos esperados por
 * semana. Diferente de `streakTreino`, não quebra/reinicia num dia sem sessão — é assim que
 * um dia de descanso agendado no cronograma deixa de "zerar o ciclo" a cada semana.
 */
export function persistenciaSemanal(
  historico: Record<string, Sessao[]>,
  treinosSemana: number,
): number {
  if (treinosSemana <= 0) return 0;

  const dias = new Set<string>();
  for (const sessoes of Object.values(historico)) {
    for (const s of sessoes) dias.add(s.data);
  }

  let cursor = hojeISO();
  let batidos = 0;
  for (let i = 0; i < 7; i++) {
    if (dias.has(cursor)) batidos++;
    cursor = diaAnteriorISO(cursor);
  }

  return Math.min(100, Math.round((batidos / treinosSemana) * 100));
}

/**
 * Qual dia do plano (A/B/C...) é "o de hoje" — o app não tem calendário de treino, é o
 * aluno quem escolhe a ordem, então "hoje" é o próximo da sequência depois do último dia
 * batido, ciclando de volta ao início. Antes disso, tanto o Início quanto a aba Treino
 * assumiam sempre `dias[0]` (§8/09-set do handoff, "simplificação aceita") — parava de bater
 * com o progresso real assim que o aluno passava do primeiro dia do plano.
 *
 * Se já tem série registrada OU rascunho aberto hoje num dia, esse dia "ganha" e continua
 * sendo o de hoje (não pula pro próximo enquanto o dia de hoje ainda pode ser completado).
 * Sem histórico nenhum, começa no primeiro dia do plano.
 */
export function proximoDiaTreino(
  dias: DiaTreino[],
  historico: Record<string, Sessao[]>,
  rascunhos: Record<string, Sessao>,
): DiaTreino | null {
  if (!dias.length) return null;

  const hoje = hojeISO();
  const emAndamentoHoje = dias.find((dia) =>
    dia.ex.some((ex) => historico[ex.id]?.some((s) => s.data === hoje) || rascunhos[ex.id]),
  );
  if (emAndamentoHoje) return emAndamentoHoje;

  let indiceUltimo = -1;
  let dataUltimo = '';
  dias.forEach((dia, i) => {
    for (const ex of dia.ex) {
      const sessoes = historico[ex.id];
      if (!sessoes?.length) continue;
      const data = sessoes[sessoes.length - 1].data;
      if (data > dataUltimo) {
        dataUltimo = data;
        indiceUltimo = i;
      }
    }
  });

  if (indiceUltimo === -1) return dias[0];
  return dias[(indiceUltimo + 1) % dias.length];
}

/** Séries já registradas hoje — do log (se concluído) ou do rascunho. */
export function seriesDeHoje(
  historico: Sessao[] | undefined,
  rascunho: Sessao | undefined,
): SetLog[] {
  if (concluidoHoje(historico)) return historico![historico!.length - 1].sets;
  return rascunho?.sets ?? [];
}

/** Sessão anterior à de hoje, usada como referência de progressão. */
export function sessaoAnterior(historico: Sessao[] | undefined): Sessao | null {
  const h = historico ?? [];
  if (!h.length) return null;
  return concluidoHoje(h) ? (h.length > 1 ? h[h.length - 2] : null) : h[h.length - 1];
}

export type Avaliacao = { tipo: 'novo' | 'up' | 'hold'; texto: string };

/** Leitura da última sessão: manter carga ou subir. Mesma regra do protótipo. */
export function avaliar(ex: Exercicio, anterior: Sessao | null): Avaliacao {
  if (!anterior) {
    return {
      tipo: 'novo',
      texto: `Primeiro registro: escolha uma carga em que você falhe entre ${ex.min} e ${ex.max}${
        ex.tempo ? ' segundos.' : ' repetições.'
      }`,
    };
  }
  if (ex.tempo) {
    return { tipo: 'hold', texto: `Buscar mais tempo que da última vez: ${anterior.sets[0].r}s.` };
  }
  const cargas = anterior.sets.map((s) => s.p);
  const mesmaCarga = cargas.every((p) => p === cargas[0]);
  const noTopo = anterior.sets.every((s) => s.r >= ex.max);
  if (noTopo && mesmaCarga) {
    return {
      tipo: 'up',
      texto: `Consolidou ${ex.max} reps em todas as séries → suba 1 a 2 kg de cada lado e volte a buscar ${ex.min}.`,
    };
  }
  return {
    tipo: 'hold',
    texto: `Mesma carga de ${cargas[0]}kg, tentar 1 repetição a mais que da última vez.`,
  };
}

function passoPeso(p: number): number {
  return p >= 20 ? 2.5 : 1;
}

function incrementarPeso(p: number, dir: number): number {
  const passo = passoPeso(p);
  return Math.max(0, +(p + dir * passo).toFixed(1));
}

export function ajustarPeso(p: number, dir: number): number {
  return incrementarPeso(p, dir);
}

/** Sugestão de peso/reps pra próxima série, a partir do histórico. */
export function sugerirSerie(ex: Exercicio, logadas: SetLog[], anterior: Sessao | null): SetLog {
  const idx = logadas.length;

  if (idx === 0) {
    if (!anterior) return { p: 0, r: ex.min };
    if (ex.tempo) return { p: 0, r: anterior.sets[0].r + 5 };
    const av = avaliar(ex, anterior);
    if (av.tipo === 'up') return { p: incrementarPeso(anterior.sets[0].p, 1), r: ex.min };
    return { p: anterior.sets[0].p, r: Math.min(anterior.sets[0].r + 1, ex.max) };
  }

  const anteriorSet = anterior?.sets[idx] ?? null;
  const ultima = logadas[idx - 1];
  return {
    p: ultima.p,
    r: ex.tempo ? ultima.r : anteriorSet ? Math.min(anteriorSet.r + 1, ex.max) : ultima.r,
  };
}

/**
 * Registra uma série. Enquanto o exercício não completa todas as séries prescritas, fica
 * em `workout_drafts`; ao completar, vira um `workout_logs` e o rascunho é apagado.
 */
export async function registrarSerie(
  clientId: string,
  ex: Exercicio,
  seriesAtuais: SetLog[],
  nova: SetLog,
): Promise<{ concluido: boolean }> {
  const hoje = hojeISO();
  const sets = [...seriesAtuais, nova];

  if (sets.length >= ex.sets) {
    const { error } = await supabase
      .from('workout_logs')
      .upsert(
        { client_id: clientId, exercise_id: ex.id, session_date: hoje, sets },
        { onConflict: 'client_id,exercise_id,session_date' },
      );
    if (error) throw error;
    await supabase
      .from('workout_drafts')
      .delete()
      .eq('client_id', clientId)
      .eq('exercise_id', ex.id);
    return { concluido: true };
  }

  const { error } = await supabase
    .from('workout_drafts')
    .upsert({ client_id: clientId, exercise_id: ex.id, session_date: hoje, sets });
  if (error) throw error;
  return { concluido: false };
}

/** Remove a última série registrada hoje, devolvendo-a para correção. */
export async function corrigirUltimaSerie(
  clientId: string,
  ex: Exercicio,
  historico: Sessao[] | undefined,
  rascunho: Sessao | undefined,
): Promise<SetLog | null> {
  const hoje = hojeISO();

  if (concluidoHoje(historico)) {
    const sets = historico![historico!.length - 1].sets.slice();
    const removida = sets.pop() ?? null;
    await supabase
      .from('workout_logs')
      .delete()
      .eq('client_id', clientId)
      .eq('exercise_id', ex.id)
      .eq('session_date', hoje);
    if (sets.length) {
      await supabase
        .from('workout_drafts')
        .upsert({ client_id: clientId, exercise_id: ex.id, session_date: hoje, sets });
    }
    return removida;
  }

  if (rascunho?.sets.length) {
    const sets = rascunho.sets.slice();
    const removida = sets.pop() ?? null;
    if (sets.length) {
      await supabase
        .from('workout_drafts')
        .upsert({ client_id: clientId, exercise_id: ex.id, session_date: hoje, sets });
    } else {
      await supabase
        .from('workout_drafts')
        .delete()
        .eq('client_id', clientId)
        .eq('exercise_id', ex.id);
    }
    return removida;
  }

  return null;
}
