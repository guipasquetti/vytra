import { supabase } from '@/lib/supabase';

export type StatusVerificacao = 'pendente' | 'aprovado' | 'rejeitado';

export type VerificacaoProfissional = {
  status: StatusVerificacao;
  motivoRejeicao: string | null;
  numeroRegistro: string;
  ufRegistro: string;
  bio: string | null;
};

/** Selo público (badge + bio) que um paciente vê do seu profissional — nunca CPF/documento. */
export type SeloProfissional = {
  verificado: boolean;
  bio: string | null;
};

export type SolicitacaoVerificacaoAdmin = {
  id: string;
  professionalId: string;
  professionalNome: string;
  professionalEmail: string | null;
  especialidade: string;
  cpf: string | null;
  numeroRegistro: string;
  ufRegistro: string;
  documentoPath: string | null;
  bio: string | null;
  status: StatusVerificacao;
  createdAt: string;
};

/**
 * Envia a carteirinha do conselho pro bucket privado `documentos-profissionais`
 * (§0/LGPD, 04/set — primeiro uso de Storage no projeto). Caminho sempre prefixado pelo
 * próprio `auth.uid()` — é o que a RLS de `storage.objects` confere pra liberar o upload.
 */
export async function uploadDocumentoVerificacao(
  userId: string,
  arquivo: { uri: string; name: string }
): Promise<string> {
  const extensao = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'pdf';
  const caminho = `${userId}/carteirinha.${extensao}`;
  const resposta = await fetch(arquivo.uri);
  const blob = await resposta.blob();
  const { error } = await supabase.storage
    .from('documentos-profissionais')
    .upload(caminho, blob, { upsert: true, contentType: blob.type || undefined });
  if (error) throw error;
  return caminho;
}

/** Cria conta de profissional + verificação pendente, tudo na RPC `cadastrar_profissional`. */
export async function cadastrarProfissional(params: {
  nome: string;
  especialidade: string;
  cpf: string;
  numeroRegistro: string;
  ufRegistro: string;
  documentoPath: string;
  bio?: string;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('cadastrar_profissional', {
    p_nome: params.nome,
    p_especialidade: params.especialidade,
    p_cpf: params.cpf,
    p_numero_registro: params.numeroRegistro,
    p_uf_registro: params.ufRegistro,
    p_documento_path: params.documentoPath,
    p_bio: params.bio,
  });
  if (error) throw error;
  return data === true;
}

/** Status da própria verificação — banner "pendente"/"rejeitado" no Painel (§12, 04/set). */
export async function obterMinhaVerificacao(professionalId: string): Promise<VerificacaoProfissional | null> {
  const { data } = await supabase
    .from('professional_verificacoes')
    .select('status, motivo_rejeicao, numero_registro, uf_registro, bio')
    .eq('professional_id', professionalId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status as StatusVerificacao,
    motivoRejeicao: data.motivo_rejeicao,
    numeroRegistro: data.numero_registro,
    ufRegistro: data.uf_registro,
    bio: data.bio,
  };
}

/**
 * Profissional pede alteração no próprio registro (ex.: tirou o CRN depois de já ter
 * cadastro aprovado só com CREF, ou quer atualizar UF/bio) — reenvia pra fila de aprovação do
 * admin. A RLS `professional_verificacoes_update_self` (§8/§44 do handoff) só aceita o update
 * se o resultado tiver `status = 'pendente'`, então isso é sempre explícito aqui: não dá pra
 * editar sem reabrir verificação, de propósito — evita profissional aprovado mudar o registro
 * sem passar por conferência humana de novo.
 */
export async function solicitarAlteracaoCadastro(
  professionalId: string,
  params: { numeroRegistro: string; ufRegistro: string; bio: string; documentoPath?: string },
): Promise<void> {
  const { error } = await supabase
    .from('professional_verificacoes')
    .update({
      numero_registro: params.numeroRegistro,
      uf_registro: params.ufRegistro,
      bio: params.bio || null,
      status: 'pendente',
      motivo_rejeicao: null,
      ...(params.documentoPath ? { documento_path: params.documentoPath } : {}),
    })
    .eq('professional_id', professionalId);
  if (error) throw error;
}

/**
 * Selo público em lote pro paciente — via RPC `obter_selo_profissionais` (SECURITY DEFINER),
 * não lê `professional_verificacoes` direto (RLS bloqueia paciente ali, de propósito, ver
 * migração `20260914_selo_profissional.sql`). Retorna só `verificado`/`bio`, nunca CPF/
 * registro/documento.
 */
export async function obterSelosProfissionais(
  professionalIds: string[],
): Promise<Map<string, SeloProfissional>> {
  if (!professionalIds.length) return new Map();
  const { data, error } = await supabase.rpc('obter_selo_profissionais', {
    p_professional_ids: professionalIds,
  });
  if (error || !data) return new Map();
  return new Map(data.map((row) => [row.professional_id, { verificado: row.verificado, bio: row.bio }]));
}

/** Admin: fila de solicitações pendentes, com o mínimo pra decidir (nunca dado de saúde). */
export async function listarVerificacoesPendentes(): Promise<SolicitacaoVerificacaoAdmin[]> {
  const { data: verificacoes } = await supabase
    .from('professional_verificacoes')
    .select('*')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true });

  const linhas = verificacoes ?? [];
  if (!linhas.length) return [];

  const ids = linhas.map((v) => v.professional_id);
  const [{ data: profissionais }, { data: perfis }] = await Promise.all([
    supabase.from('professionals').select('id, especialidade').in('id', ids),
    supabase.from('profiles').select('id, nome, email').in('id', ids),
  ]);

  return linhas.map((v) => ({
    id: v.id,
    professionalId: v.professional_id,
    professionalNome: perfis?.find((p) => p.id === v.professional_id)?.nome || 'Sem nome',
    professionalEmail: perfis?.find((p) => p.id === v.professional_id)?.email ?? null,
    especialidade: profissionais?.find((p) => p.id === v.professional_id)?.especialidade ?? '',
    cpf: v.cpf,
    numeroRegistro: v.numero_registro,
    ufRegistro: v.uf_registro,
    documentoPath: v.documento_path,
    bio: v.bio,
    status: v.status as StatusVerificacao,
    createdAt: v.created_at,
  }));
}

/** Admin: link temporário (1h) pra abrir o documento no bucket privado. */
export async function obterUrlDocumento(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('documentos-profissionais')
    .createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}

export async function aprovarVerificacao(id: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('professional_verificacoes')
    .update({ status: 'aprovado', reviewed_by: adminId, reviewed_at: new Date().toISOString(), motivo_rejeicao: null })
    .eq('id', id);
  if (error) throw error;
}

export async function rejeitarVerificacao(id: string, adminId: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from('professional_verificacoes')
    .update({ status: 'rejeitado', reviewed_by: adminId, reviewed_at: new Date().toISOString(), motivo_rejeicao: motivo })
    .eq('id', id);
  if (error) throw error;
}
