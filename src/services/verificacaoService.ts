import { supabase } from '@/lib/supabase';

export type StatusVerificacao = 'pendente' | 'aprovado' | 'rejeitado';

/**
 * Catálogo de profissões (tabela `profissoes`, 19/set). Abrir profissão nova é uma linha no
 * banco, sem migração nem deploy: o app só lê o que está lá. `siglaSelo` é o rótulo do selo
 * (decisão 14/set: sigla compacta, NT/EF/FT); a sigla do conselho (CRN/CREF/CREFITO) aparece
 * só em formulário e na fila do admin, nunca pro paciente.
 */
export type Profissao = {
  codigo: string;
  nome: string;
  siglaSelo: string;
  conselhoSigla: string | null;
  conselhoNome: string | null;
  urlConsulta: string | null;
  modulos: string[];
  painel: string;
  ativo: boolean;
};

export async function listarProfissoes(apenasAtivas = true): Promise<Profissao[]> {
  let query = supabase.from('profissoes').select('*').order('ordem');
  if (apenasAtivas) query = query.eq('ativo', true);
  const { data } = await query;
  return (data ?? []).map((p) => ({
    codigo: p.codigo,
    nome: p.nome,
    siglaSelo: p.sigla_selo,
    conselhoSigla: p.conselho_sigla,
    conselhoNome: p.conselho_nome,
    urlConsulta: p.url_consulta,
    modulos: p.modulos,
    painel: p.painel,
    ativo: p.ativo,
  }));
}

/** Rótulo do selo a partir das siglas das áreas verificadas (ex.: "NT · EF"). */
export function rotuloSelo(areas: string[] | null | undefined): string | null {
  return areas && areas.length ? areas.join(' · ') : null;
}

/** Um registro em conselho do profissional. Cada um tem a própria verificação: somar ou
 *  corrigir um registro não derruba o selo dos outros já aprovados. */
export type RegistroProfissional = {
  id: string;
  profissao: string;
  numero: string;
  uf: string;
  status: StatusVerificacao;
  motivoRejeicao: string | null;
  documentoPath: string | null;
};

export async function listarMeusRegistros(professionalId: string): Promise<RegistroProfissional[]> {
  const { data } = await supabase
    .from('professional_registros')
    .select('id, profissao, numero, uf, status, motivo_rejeicao, documento_path')
    .eq('professional_id', professionalId)
    .order('created_at');
  return (data ?? []).map((r) => ({
    id: r.id,
    profissao: r.profissao,
    numero: r.numero,
    uf: r.uf,
    status: r.status as StatusVerificacao,
    motivoRejeicao: r.motivo_rejeicao,
    documentoPath: r.documento_path,
  }));
}

/** Cria ou atualiza um registro via RPC `solicitar_registro` (volta só ele pra pendente). */
export async function solicitarRegistro(params: {
  profissao: string;
  numero: string;
  uf: string;
  documentoPath?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('solicitar_registro', {
    p_profissao: params.profissao,
    p_numero: params.numero,
    p_uf: params.uf,
    p_documento_path: params.documentoPath,
  });
  if (error) throw error;
}

/** Bio não reabre verificação (antes derrubava o selo). */
export async function atualizarMinhaBio(bio: string): Promise<void> {
  const { error } = await supabase.rpc('atualizar_minha_bio', { p_bio: bio });
  if (error) throw error;
}

/**
 * Módulos (dieta/treino) cobertos por registros NÃO rejeitados do profissional, pelo catálogo.
 * Pendente conta, como já contava o `tipo_registro` antigo: a declaração de responsabilidade é
 * pra quem não tem registro na área, não pra quem está aguardando conferência.
 */
export async function obterModulosCobertos(professionalId: string): Promise<Set<string>> {
  const [registros, profissoes] = await Promise.all([
    listarMeusRegistros(professionalId),
    listarProfissoes(false),
  ]);
  const modulos = new Set<string>();
  for (const r of registros) {
    if (r.status === 'rejeitado') continue;
    profissoes.find((p) => p.codigo === r.profissao)?.modulos.forEach((m) => modulos.add(m));
  }
  return modulos;
}

export type VerificacaoProfissional = {
  status: StatusVerificacao;
  motivoRejeicao: string | null;
  numeroRegistro: string;
  ufRegistro: string;
  tipoRegistro: string | null;
  bio: string | null;
};

/** Selo público (badge + bio) que um paciente vê do seu profissional — nunca CPF/documento. */
export type SeloProfissional = {
  verificado: boolean;
  bio: string | null;
  tipoRegistro: string | null;
  /** Siglas das áreas com registro aprovado, na ordem do catálogo (ex.: ["NT", "EF"]). */
  areas: string[];
};

/** Admin: um registro aguardando conferência, com o mínimo pra decidir (nunca dado de saúde). */
export type SolicitacaoRegistroAdmin = {
  id: string;
  professionalId: string;
  professionalNome: string;
  professionalEmail: string | null;
  cpf: string | null;
  bio: string | null;
  profissaoNome: string;
  conselhoSigla: string | null;
  urlConsulta: string | null;
  numero: string;
  uf: string;
  documentoPath: string | null;
  /** Outras áreas já aprovadas do mesmo profissional: mostra que é um registro somado. */
  areasAprovadas: string[];
  createdAt: string;
};

/**
 * Envia a carteirinha do conselho pro bucket privado `documentos-profissionais`
 * (§0/LGPD, 04/set — primeiro uso de Storage no projeto). Caminho sempre prefixado pelo
 * próprio `auth.uid()` — é o que a RLS de `storage.objects` confere pra liberar o upload.
 */
export async function uploadDocumentoVerificacao(
  userId: string,
  arquivo: { uri: string; name: string },
  profissao?: string,
): Promise<string> {
  const extensao = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'pdf';
  // Um arquivo por registro: com mais de um conselho, `carteirinha.ext` sobrescreveria o outro.
  const caminho = `${userId}/${profissao ? `registro-${profissao}` : 'carteirinha'}.${extensao}`;
  const resposta = await fetch(arquivo.uri);
  const blob = await resposta.blob();
  const { error } = await supabase.storage
    .from('documentos-profissionais')
    .upload(caminho, blob, { upsert: true, contentType: blob.type || undefined });
  if (error) throw error;
  return caminho;
}

/** Cria conta de profissional + verificação pendente + primeiro registro, tudo na RPC
 *  `cadastrar_profissional`. `especialidade` (Painel) é derivada da profissão no banco. */
export async function cadastrarProfissional(params: {
  nome: string;
  profissao: string;
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
    p_profissao: params.profissao,
  });
  if (error) throw error;
  return data === true;
}

/** Status da própria verificação — banner "pendente"/"rejeitado" no Painel (§12, 04/set). */
export async function obterMinhaVerificacao(professionalId: string): Promise<VerificacaoProfissional | null> {
  const { data } = await supabase
    .from('professional_verificacoes')
    .select('status, motivo_rejeicao, numero_registro, uf_registro, tipo_registro, bio')
    .eq('professional_id', professionalId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status as StatusVerificacao,
    motivoRejeicao: data.motivo_rejeicao,
    numeroRegistro: data.numero_registro,
    ufRegistro: data.uf_registro,
    tipoRegistro: data.tipo_registro,
    bio: data.bio,
  };
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
  return new Map(
    data.map((row) => [
      row.professional_id,
      { verificado: row.verificado, bio: row.bio, tipoRegistro: row.tipo_registro, areas: row.areas ?? [] },
    ]),
  );
}

/** Admin: fila de registros pendentes (§ catálogo de profissões, 19/set). */
export async function listarRegistrosPendentes(): Promise<SolicitacaoRegistroAdmin[]> {
  const { data: pendentes } = await supabase
    .from('professional_registros')
    .select('*')
    .eq('status', 'pendente')
    .order('updated_at', { ascending: true });

  const linhas = pendentes ?? [];
  if (!linhas.length) return [];

  const ids = [...new Set(linhas.map((r) => r.professional_id))];
  const [{ data: perfis }, { data: verificacoes }, { data: aprovados }, profissoes] = await Promise.all([
    supabase.from('profiles').select('id, nome, email').in('id', ids),
    supabase.from('professional_verificacoes').select('professional_id, cpf, bio').in('professional_id', ids),
    supabase.from('professional_registros').select('professional_id, profissao').eq('status', 'aprovado').in('professional_id', ids),
    listarProfissoes(false),
  ]);

  return linhas.map((r) => {
    const profissao = profissoes.find((p) => p.codigo === r.profissao);
    const verificacao = verificacoes?.find((v) => v.professional_id === r.professional_id);
    const perfil = perfis?.find((p) => p.id === r.professional_id);
    return {
      id: r.id,
      professionalId: r.professional_id,
      professionalNome: perfil?.nome || 'Sem nome',
      professionalEmail: perfil?.email ?? null,
      cpf: verificacao?.cpf ?? null,
      bio: verificacao?.bio ?? null,
      profissaoNome: profissao?.nome ?? r.profissao,
      conselhoSigla: profissao?.conselhoSigla ?? null,
      urlConsulta: profissao?.urlConsulta ?? null,
      numero: r.numero,
      uf: r.uf,
      documentoPath: r.documento_path,
      areasAprovadas: (aprovados ?? [])
        .filter((a) => a.professional_id === r.professional_id)
        .map((a) => profissoes.find((p) => p.codigo === a.profissao)?.nome ?? a.profissao),
      createdAt: r.updated_at,
    };
  });
}

/** Aprova/rejeita um registro (RPC admin-only). Aprovar o primeiro também aprova a conta. */
export async function revisarRegistro(id: string, aprovar: boolean, motivo?: string): Promise<void> {
  const { error } = await supabase.rpc('revisar_registro', {
    p_registro_id: id,
    p_aprovar: aprovar,
    p_motivo: motivo,
  });
  if (error) throw error;
}

/** Admin: link temporário (1h) pra abrir o documento no bucket privado. */
export async function obterUrlDocumento(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('documentos-profissionais')
    .createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}
