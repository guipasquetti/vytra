import { supabase } from '@/lib/supabase';
import type { Tables } from '@/models/database.types';

export type Anexo = Tables<'anexos_paciente'>;
export type CategoriaAnexo = Anexo['categoria'];

/** Envia o arquivo pro bucket privado — caminho sempre prefixado pelo próprio uid. */
export async function uploadAnexo(
  clientId: string,
  subscriptionId: string,
  arquivo: { uri: string; name: string },
): Promise<string> {
  const caminho = `${clientId}/${subscriptionId}/${Date.now()}-${arquivo.name}`;
  const resposta = await fetch(arquivo.uri);
  const blob = await resposta.blob();
  const { error } = await supabase.storage
    .from('anexos-paciente')
    .upload(caminho, blob, { contentType: blob.type || undefined });
  if (error) throw error;
  return caminho;
}

export async function registrarAnexo(params: {
  clientId: string;
  professionalId: string;
  subscriptionId: string;
  categoria: CategoriaAnexo;
  nomeArquivo: string;
  storagePath: string;
  observacao?: string;
}): Promise<void> {
  const { error } = await supabase.from('anexos_paciente').insert({
    client_id: params.clientId,
    professional_id: params.professionalId,
    subscription_id: params.subscriptionId,
    categoria: params.categoria,
    nome_arquivo: params.nomeArquivo,
    storage_path: params.storagePath,
    observacao: params.observacao?.trim() || null,
  });
  if (error) throw error;
}

/** Histórico do próprio paciente num acompanhamento, mais recente primeiro. */
export async function listarAnexosDaAssinatura(subscriptionId: string): Promise<Anexo[]> {
  const { data } = await supabase
    .from('anexos_paciente')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** Visto pelo profissional — RLS já escopa por assinatura ativa dele. */
export async function listarAnexosDoAluno(clientId: string): Promise<Anexo[]> {
  const { data } = await supabase
    .from('anexos_paciente')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** Link temporário (1h) pra abrir o anexo do bucket privado. */
export async function obterUrlAnexo(caminho: string): Promise<string | null> {
  const { data } = await supabase.storage.from('anexos-paciente').createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}

export async function removerAnexo(id: string, storagePath: string): Promise<void> {
  await supabase.storage.from('anexos-paciente').remove([storagePath]);
  const { error } = await supabase.from('anexos_paciente').delete().eq('id', id);
  if (error) throw error;
}
