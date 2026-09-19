-- Campos estruturados da anamnese: sexo passa a atualizar o perfil e datas incompletas do
-- autosave não podem derrubar o envio. Mantém a mesma assinatura pública da RPC existente.
create or replace function public.submeter_anamnese_autenticado(
  p_respostas jsonb,
  p_plano_id uuid default null,
  p_foto_path text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_data_nascimento text := nullif(p_respostas->>'data_nascimento', '');
begin
  if v_uid is null then return false; end if;

  update public.profiles set
    nome = coalesce(nullif(p_respostas->>'nome_completo',''), nome),
    telefone = coalesce(nullif(p_respostas->>'telefone',''), telefone),
    data_nascimento = case
      when v_data_nascimento ~ '^\d{4}-\d{2}-\d{2}$'
        and to_char(to_date(v_data_nascimento, 'YYYY-MM-DD'), 'YYYY-MM-DD') = v_data_nascimento
        then v_data_nascimento::date
      when v_data_nascimento is null then null
      else data_nascimento
    end,
    altura_cm = case when nullif(p_respostas->>'altura_cm','') ~ '^\d+([.,]\d+)?$'
      then replace(p_respostas->>'altura_cm', ',', '.')::numeric else altura_cm end,
    peso_kg = case when nullif(p_respostas->>'peso_atual','') ~ '^\d+([.,]\d+)?$'
      then replace(p_respostas->>'peso_atual', ',', '.')::numeric else peso_kg end,
    sexo = case when p_respostas->>'sexo' in ('feminino', 'masculino', 'outro')
      then p_respostas->>'sexo' else sexo end
  where id = v_uid;

  insert into public.anamnese (client_id, objetivo_principal, nivel_atividade, lesoes_dores, condicoes_medicas,
    medicamentos, cirurgias, historico_familiar, restricoes_alimentares, alergias, observacoes,
    respostas_completas, foto_path, updated_at)
  values (v_uid,
    coalesce(p_respostas->>'objetivo_principal',''), coalesce(p_respostas->>'pratica_atividade',''),
    coalesce(p_respostas->>'limitacao_fisica',''), coalesce(p_respostas->>'patologias',''),
    coalesce(p_respostas->>'medicamentos',''), coalesce(p_respostas->>'cirurgias',''),
    coalesce(p_respostas->>'historico_familiar',''), coalesce(p_respostas->>'nao_consome',''),
    coalesce(p_respostas->>'intolerancias_alergias',''), coalesce(p_respostas->>'observacoes_finais',''),
    p_respostas, p_foto_path, now())
  on conflict (client_id) do update set
    objetivo_principal = excluded.objetivo_principal, nivel_atividade = excluded.nivel_atividade,
    lesoes_dores = excluded.lesoes_dores, condicoes_medicas = excluded.condicoes_medicas,
    medicamentos = excluded.medicamentos, cirurgias = excluded.cirurgias,
    historico_familiar = excluded.historico_familiar, restricoes_alimentares = excluded.restricoes_alimentares,
    alergias = excluded.alergias, observacoes = excluded.observacoes,
    respostas_completas = excluded.respostas_completas,
    foto_path = coalesce(excluded.foto_path, public.anamnese.foto_path), updated_at = now();

  if p_plano_id is not null then
    update public.subscriptions set plano_solicitado_id = p_plano_id
    where patient_id = v_uid and plan_id is null;
  end if;
  delete from public.anamnese_rascunho where client_id = v_uid;
  return true;
end;
$function$;
