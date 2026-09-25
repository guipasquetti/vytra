import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/models/database.types';
import { obterSelosProfissionais } from '@/services/verificacaoService';

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
  /**
   * Do plano CONFIRMADO (`sub.plan_id`), não do solicitado — o que o par paciente↔profissional
   * realmente contratou (§45 do handoff). Falso/falso enquanto não há plano confirmado; não
   * usar `professionals.especialidade` pra isso, um profissional pode vender planos mistos
   * (ex.: nutricionista que também monta treino por experiência, sem CREF).
   */
  incluiTreino: boolean;
  incluiDieta: boolean;
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
      ? supabase.from('professional_plans').select('id, nome, inclui_treino, inclui_dieta').in('id', planIds)
      : Promise.resolve({
          data: [] as Pick<PlanoProfissional, 'id' | 'nome' | 'inclui_treino' | 'inclui_dieta'>[],
        }),
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

  return subscriptions.map((sub) => {
    const planoConfirmado = planos?.find((p) => p.id === sub.plan_id);
    return {
      subscriptionId: sub.id,
      clientId: sub.patient_id,
      nome: perfis?.find((p) => p.id === sub.patient_id)?.nome || 'Aluno',
      status: sub.status,
      planoNome: planoConfirmado?.nome ?? null,
      planoSolicitadoId: sub.plano_solicitado_id,
      planoSolicitadoNome: planos?.find((p) => p.id === sub.plano_solicitado_id)?.nome ?? null,
      ultimoTreino: ultimoPorCliente.get(sub.patient_id) ?? null,
      incluiTreino: planoConfirmado?.inclui_treino ?? false,
      incluiDieta: planoConfirmado?.inclui_dieta ?? false,
    };
  });
}

export type ProfissionalVinculado = {
  subscriptionId: string;
  professionalId: string;
  nome: string;
  especialidade: string;
  planoNome: string | null;
  status: string;
  verificado: boolean;
  bio: string | null;
  /** CREF/CRN do registro verificado — legado, o selo usa `areas` desde 19/set. */
  tipoRegistro: string | null;
  /** Siglas das áreas com registro aprovado (catálogo `profissoes`), ex.: ["NT", "EF"]. */
  areas: string[];
  incluiTreino: boolean;
  incluiDieta: boolean;
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

  const [{ data: perfis }, { data: profissionais }, { data: planos }, selos] = await Promise.all([
    supabase.from('profiles').select('id, nome').in('id', professionalIds),
    supabase.from('professionals').select('id, especialidade').in('id', professionalIds),
    planIds.length
      ? supabase.from('professional_plans').select('id, nome, inclui_treino, inclui_dieta').in('id', planIds)
      : Promise.resolve({
          data: [] as Pick<PlanoProfissional, 'id' | 'nome' | 'inclui_treino' | 'inclui_dieta'>[],
        }),
    obterSelosProfissionais(professionalIds),
  ]);

  return subscriptions.map((sub) => {
    const plano = planos?.find((p) => p.id === sub.plan_id);
    return {
      subscriptionId: sub.id,
      professionalId: sub.professional_id,
      nome: perfis?.find((p) => p.id === sub.professional_id)?.nome || 'Profissional',
      especialidade:
        profissionais?.find((p) => p.id === sub.professional_id)?.especialidade ?? '',
      planoNome: plano?.nome ?? null,
      status: sub.status,
      verificado: selos.get(sub.professional_id)?.verificado ?? false,
      bio: selos.get(sub.professional_id)?.bio ?? null,
      tipoRegistro: selos.get(sub.professional_id)?.tipoRegistro ?? null,
      areas: selos.get(sub.professional_id)?.areas ?? [],
      incluiTreino: plano?.inclui_treino ?? false,
      incluiDieta: plano?.inclui_dieta ?? false,
    };
  });
}

/**
 * O que o aluno tem contratado, olhando TODAS as assinaturas ativas (§45 — pode ter mais de um
 * profissional, cada um cobrindo uma parte). União: se qualquer assinatura ativa inclui treino,
 * o aluno tem acesso a treino — usado pra decidir quais abas mostrar em `aluno/_layout.tsx`.
 * Enquanto nenhuma assinatura tem plano CONFIRMADO ainda (`plan_id` nulo — onboarding em
 * andamento, profissional ainda não confirmou), devolve os dois `true`: nada pra esconder
 * ainda, mesmo comportamento de antes desta mudança.
 */
export async function obterCapacidadesAluno(clientId: string): Promise<{ treino: boolean; dieta: boolean }> {
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('plan_id')
    .eq('patient_id', clientId)
    .eq('status', 'ativa');

  const planIds = (subs ?? []).map((s) => s.plan_id).filter((id): id is string => !!id);
  if (!planIds.length) return { treino: true, dieta: true };

  const { data: planos } = await supabase
    .from('professional_plans')
    .select('inclui_treino, inclui_dieta')
    .in('id', planIds);

  return {
    treino: (planos ?? []).some((p) => p.inclui_treino),
    dieta: (planos ?? []).some((p) => p.inclui_dieta),
  };
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

/**
 * `subscriptions.status` é texto livre (sem CHECK), mesmo padrão de `convites.status` — dá
 * pra estender sem migração. `ativa` é o único valor lido pelas RLS (`is_professional_of()`/
 * `is_client_of()`, ver §5 do handoff): qualquer outro valor já tira o par paciente↔profissional
 * do resto do app (treino, dieta, check-in, anamnese) sem precisar de RLS nova. `Filtro` em
 * `pro/pacientes.tsx` já previa `pausada`/`encerrada`, só faltava como escrever.
 */
export type StatusAssinatura = 'ativa' | 'pausada' | 'encerrada';

/**
 * Pausar/encerrar/reativar aluno — item pendente do §10 do handoff ("gestão de subscriptions").
 * RLS já permite: `subscriptions_write` deixa o profissional dono (`professional_id =
 * auth.uid()`) escrever na própria assinatura, mesma policy que `confirmarPlanoSolicitado` já
 * usa. Não apaga nada (histórico de treino/check-in/anamnese continua intacto no banco) — é
 * reversível a qualquer momento reativando.
 *
 * ⚠️ Efeito colateral do RLS (intencional, não é bug): como `is_professional_of()` só retorna
 * true com `status = 'ativa'` (§5 do handoff), pausar/encerrar tira o acesso do PRÓPRIO
 * profissional aos dados clínicos desse paciente (anamnese, plans, planos_alimentares,
 * check_ins) até reativar — não é só o paciente que deixa de ver treino/dieta. `subscriptions`
 * em si continua visível (`subscriptions_select` não depende de status), por isso a linha do
 * paciente continua aparecendo em `pro/pacientes.tsx` e o botão "Reativar" continua acessível.
 */
export async function atualizarStatusAssinatura(
  subscriptionId: string,
  status: StatusAssinatura,
): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update({ status })
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
