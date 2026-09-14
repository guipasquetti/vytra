import { supabase } from '@/lib/supabase';
import { listarAlunos, type AlunoVinculado } from '@/services/professionalService';
import { listarAgenda, type TeleconsultaComPaciente } from '@/services/teleconsultaService';

export type ResumoAluno = AlunoVinculado & {
  temPlanoTreino: boolean;
  temPlanoDieta: boolean;
  flagSaude: string | null;
  /** Data do check-in mais recente respondido por esse aluno, ou null se nunca respondeu. */
  ultimoCheckin: string | null;
  objetivoAnamnese: string | null;
  alergiasAnamnese: string | null;
};

export type EspecialidadePainel = 'nutricionista' | 'personal_trainer';

export type PainelGestao = {
  especialidade: EspecialidadePainel;
  totalAlunos: number;
  ativos: number;
  semPlano: number;
  semTreino7d: number;
  leadsPendentes: number;
  /** Pediu um plano no onboarding (§12) mas o profissional ainda não confirmou. */
  solicitacoesPendentes: number;
  /** Nunca respondeu check-in, ou já passou 14 dias do último. */
  checkinsAtrasados: number;
  /** Agenda completa (todos os status), ordenada por data — a tela decide o que mostrar. */
  agenda: TeleconsultaComPaciente[];
  alunos: ResumoAluno[];
};

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const hoje = new Date();
  const data = new Date(iso);
  return Math.round((hoje.getTime() - data.getTime()) / 86_400_000);
}

/**
 * Agrega dado que já existe em outras tabelas — não cria nenhuma tabela nova. Cada consulta
 * já é filtrada pela RLS existente (is_professional_of / professional_id = auth.uid()), então
 * isso só devolve o que o profissional já podia ver espalhado em outras telas.
 */
export async function obterPainelGestao(professionalId: string): Promise<PainelGestao> {
  const alunos = await listarAlunos(professionalId);
  const clientIds = alunos.map((a) => a.clientId);

  const [{ data: profissional }, { data: comTreino }, { data: comDieta }, { data: anamneses }, { data: convites }, { data: checkins }, agenda] =
    await Promise.all([
      supabase.from('professionals').select('especialidade').eq('id', professionalId).maybeSingle(),
      supabase.from('plans').select('client_id').eq('professional_id', professionalId),
      supabase.from('planos_alimentares').select('client_id').eq('professional_id', professionalId),
      clientIds.length
        ? supabase
            .from('anamnese')
            .select('client_id, condicoes_medicas, lesoes_dores, objetivo_principal, alergias')
            .in('client_id', clientIds)
        : Promise.resolve({
            data: [] as {
              client_id: string;
              condicoes_medicas: string;
              lesoes_dores: string;
              objetivo_principal: string;
              alergias: string;
            }[],
          }),
      supabase
        .from('convites')
        .select('id')
        .eq('created_by', professionalId)
        .eq('status', 'pendente'),
      supabase
        .from('check_ins')
        .select('client_id, created_at')
        .eq('professional_id', professionalId)
        .order('created_at', { ascending: false }),
      listarAgenda(professionalId),
    ]);

  const especialidade: EspecialidadePainel = profissional?.especialidade === 'nutricionista' ? 'nutricionista' : 'personal_trainer';

  const treinoSet = new Set((comTreino ?? []).map((p) => p.client_id));
  const dietaSet = new Set((comDieta ?? []).map((p) => p.client_id));
  const anamnesePorCliente = new Map((anamneses ?? []).map((a) => [a.client_id, a]));

  // Ordenado desc — a primeira ocorrência de cada client_id já é o check-in mais recente.
  const ultimoCheckinPorCliente = new Map<string, string>();
  for (const c of checkins ?? []) {
    if (!ultimoCheckinPorCliente.has(c.client_id)) ultimoCheckinPorCliente.set(c.client_id, c.created_at);
  }

  const resumos: ResumoAluno[] = alunos.map((aluno) => {
    const anamnese = anamnesePorCliente.get(aluno.clientId);
    const sinaisSaude = [anamnese?.condicoes_medicas, anamnese?.lesoes_dores]
      .filter((v) => v && v.trim() && v.trim().toLowerCase() !== 'não')
      .join(' · ');
    return {
      ...aluno,
      temPlanoTreino: treinoSet.has(aluno.clientId),
      temPlanoDieta: dietaSet.has(aluno.clientId),
      flagSaude: sinaisSaude || null,
      ultimoCheckin: ultimoCheckinPorCliente.get(aluno.clientId) ?? null,
      objetivoAnamnese: anamnese?.objetivo_principal?.trim() || null,
      alergiasAnamnese: anamnese?.alergias?.trim() || null,
    };
  });

  return {
    especialidade,
    totalAlunos: alunos.length,
    ativos: alunos.filter((a) => a.status === 'ativa').length,
    // Por paciente, não por especialidade do profissional (§45 do handoff): um profissional
    // pode vender planos mistos (ex.: nutricionista que também monta treino por experiência,
    // sem CREF) — cada aluno só conta como "sem plano" pro que o plano DELE realmente inclui.
    semPlano: resumos.filter((a) => (a.incluiDieta && !a.temPlanoDieta) || (a.incluiTreino && !a.temPlanoTreino))
      .length,
    semTreino7d: alunos.filter((a) => {
      if (!a.incluiTreino) return false;
      const dias = diasDesde(a.ultimoTreino);
      return dias === null || dias > 7;
    }).length,
    leadsPendentes: convites?.length ?? 0,
    solicitacoesPendentes: resumos.filter((a) => !a.planoNome && a.planoSolicitadoId).length,
    checkinsAtrasados: resumos.filter((a) => {
      const dias = diasDesde(a.ultimoCheckin);
      return dias === null || dias > 14;
    }).length,
    agenda,
    alunos: resumos,
  };
}
