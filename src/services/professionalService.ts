import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/models/database.types';

export type PlanoProfissional = Tables<'professional_plans'>;

export type AlunoVinculado = {
  subscriptionId: string;
  clientId: string;
  nome: string;
  status: string;
  planoNome: string | null;
  /** Plano que o próprio paciente pediu no onboarding (§12) — ainda não confirmado. */
  planoSolicitadoId: string | null;
  planoSolicitadoNome: string | null;
  /** Data da última série registrada, se houver. */
  ultimoTreino: string | null;
};

/** Alunos do profissional, com sinal de atividade recente (quem sumiu aparece sem data). */
export async function listarAlunos(professionalId: string): Promise<AlunoVinculado[]> {
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('professional_id', professionalId);

  const subscriptions = subs ?? [];
  if (!subscriptions.length) return [];

  const clientIds = subscriptions.map((s) => s.patient_id);
  const planIds = [
    ...subscriptions.map((s) => s.plan_id),
    ...subscriptions.map((s) => s.plano_solicitado_id),
  ].filter((id): id is string => !!id);

  const [{ data: perfis }, { data: planos }, { data: logs }] = await Promise.all([
    supabase.from('profiles').select('id, nome').in('id', clientIds),
    planIds.length
      ? supabase.from('professional_plans').select('id, nome').in('id', planIds)
      : Promise.resolve({ data: [] as Pick<PlanoProfissional, 'id' | 'nome'>[] }),
    supabase
      .from('workout_logs')
      .select('client_id, session_date')
      .in('client_id', clientIds)
      .order('session_date', { ascending: false }),
  ]);

  const ultimoPorCliente = new Map<string, string>();
  for (const log of logs ?? []) {
    if (!ultimoPorCliente.has(log.client_id)) ultimoPorCliente.set(log.client_id, log.session_date);
  }

  return subscriptions.map((sub) => ({
    subscriptionId: sub.id,
    clientId: sub.patient_id,
    nome: perfis?.find((p) => p.id === sub.patient_id)?.nome || 'Aluno',
    status: sub.status,
    planoNome: planos?.find((p) => p.id === sub.plan_id)?.nome ?? null,
    planoSolicitadoId: sub.plano_solicitado_id,
    planoSolicitadoNome: planos?.find((p) => p.id === sub.plano_solicitado_id)?.nome ?? null,
    ultimoTreino: ultimoPorCliente.get(sub.patient_id) ?? null,
  }));
}

export type ProfissionalVinculado = {
  subscriptionId: string;
  professionalId: string;
  nome: string;
  especialidade: string;
  planoNome: string | null;
  status: string;
};

/** Profissionais que atendem este aluno — pode ser mais de um (relação N:N). */
export async function listarMeusProfissionais(clientId: string): Promise<ProfissionalVinculado[]> {
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('patient_id', clientId)
    .eq('status', 'ativa');

  const subscriptions = subs ?? [];
  if (!subscriptions.length) return [];

  const professionalIds = subscriptions.map((s) => s.professional_id);
  const planIds = subscriptions.map((s) => s.plan_id).filter((id): id is string => !!id);

  const [{ data: perfis }, { data: profissionais }, { data: planos }] = await Promise.all([
    supabase.from('profiles').select('id, nome').in('id', professionalIds),
    supabase.from('professionals').select('id, especialidade').in('id', professionalIds),
    planIds.length
      ? supabase.from('professional_plans').select('id, nome').in('id', planIds)
      : Promise.resolve({ data: [] as Pick<PlanoProfissional, 'id' | 'nome'>[] }),
  ]);

  return subscriptions.map((sub) => ({
    subscriptionId: sub.id,
    professionalId: sub.professional_id,
    nome: perfis?.find((p) => p.id === sub.professional_id)?.nome || 'Profissional',
    especialidade:
      profissionais?.find((p) => p.id === sub.professional_id)?.especialidade ?? '',
    planoNome: planos?.find((p) => p.id === sub.plan_id)?.nome ?? null,
    status: sub.status,
  }));
}

/**
 * Confirma o plano pedido pelo paciente no onboarding — grava em `plan_id`, o campo que
 * realmente libera treino/dieta (§12, 04/set). RLS já permite: `subscriptions_write` deixa o
 * profissional dono (`professional_id = auth.uid()`) escrever na própria assinatura.
 */
export async function confirmarPlanoSolicitado(subscriptionId: string, planoId: string): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update({ plan_id: planoId })
    .eq('id', subscriptionId);
  if (error) throw error;
}

/** Se algum profissional já confirmou um plano pra este paciente — gate de treino/dieta. */
export async function temPlanoConfirmado(clientId: string): Promise<boolean> {
  const profissionais = await listarMeusProfissionais(clientId);
  return profissionais.some((p) => p.planoNome);
}

export async function listarPlanos(professionalId: string): Promise<PlanoProfissional[]> {
  const { data } = await supabase
    .from('professional_plans')
    .select('*')
    .eq('professional_id', professionalId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function criarPlano(plano: TablesInsert<'professional_plans'>): Promise<void> {
  const { error } = await supabase.from('professional_plans').insert(plano);
  if (error) throw error;
}

export async function alternarPlanoAtivo(planoId: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from('professional_plans')
    .update({ ativo })
    .eq('id', planoId);
  if (error) throw error;
}

export type ConviteCriado = { id: string; token: string };

/**
 * Cria o convite (só nome/e-mail do futuro paciente) e devolve o token — o banco gera o
 * token (`gen_random_uuid()`, ver migração `20260904_convite_token_default`), não o client.
 * RLS confere que `created_by` é o próprio profissional autenticado.
 *
 * Sempre nasce de um lead (§12, decisão de 04/set): não existe convite "frio" — é o `leadId`
 * que o RPC de fechamento usa pra marcar o lead como convertido. Plano deixou de ser
 * escolhido aqui (04/set, segunda correção): o paciente escolhe o plano dentro do app,
 * autenticado, depois de criar a conta (ver `onboardingService.ts`) — o profissional confirma
 * depois (`confirmarPlanoSolicitado`).
 */
export async function criarConvite(params: {
  professionalId: string;
  nome: string;
  email: string;
  leadId: string;
}): Promise<ConviteCriado> {
  const { data, error } = await supabase
    .from('convites')
    .insert({
      nome: params.nome,
      email: params.email,
      created_by: params.professionalId,
      lead_id: params.leadId,
    })
    .select('id, token')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Reenvia o convite de um lead que já tinha recebido um — regenera o token na MESMA linha de
 * `convites` (via RPC `reenviar_convite`, ver migração `20260914_reenviar_convite`), o link
 * antigo para de funcionar. Não cria convite novo nem mexe em `leads.convite_id`.
 */
export async function reenviarConvite(conviteId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reenviar_convite', { p_convite_id: conviteId });
  if (error) throw error;
  if (!data) throw new Error('Não consegui reenviar o convite.');
  return data;
}

export async function atualizarPlano(
  planoId: string,
  updates: TablesUpdate<'professional_plans'>
): Promise<void> {
  const { error } = await supabase.from('professional_plans').update(updates).eq('id', planoId);
  if (error) throw error;
}
