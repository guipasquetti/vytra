import type { Database } from "@/models/database.types";
import { baseUrl } from "@/lib/baseUrl";
import { supabase } from "@/lib/supabase";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string, nome: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nome } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Dispara o e-mail de recuperação de senha (SMTP próprio, Resend — ver HANDOFF §16, resolvido
 * 14/set). O `redirectTo` leva pra `redefinir-senha.tsx`, que lê o token da URL e troca a senha.
 * Mesma resposta (sucesso) exista ou não o e-mail — a API do Supabase não diferencia, o que já
 * evita enumeração de conta por aqui; a tela nunca deve mostrar "e-mail não encontrado".
 */
export async function solicitarRedefinicaoSenha(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl()}/redefinir-senha`,
  });
  if (error) throw error;
}

/** Troca a senha na sessão de recuperação já estabelecida por `redefinir-senha.tsx`. */
export async function redefinirSenha(novaSenha: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) throw error;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) return null;
  return data;
}

export async function isProfessional(userId: string): Promise<boolean> {
  const { data } = await supabase.from("professionals").select("id").eq("id", userId).maybeSingle();
  return data !== null;
}

export type DadosPerfil = Pick<Profile, "nome" | "telefone" | "data_nascimento" | "peso_kg" | "altura_cm" | "sexo">;

/** Só campos editáveis pelo próprio usuário — nunca is_admin/role/email (também bloqueados por trigger no banco). */
export async function atualizarPerfil(userId: string, dados: DadosPerfil): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update(dados)
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
