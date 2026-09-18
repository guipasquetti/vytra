-- Profissional pede pro paciente atualizar a anamnese (Guilherme, 18/set) — sem chat/
-- notificação no app ainda (gap conhecido, §30 do handoff): o pedido fica visível de forma
-- passiva quando o paciente abre a própria anamnese ou o Perfil, mesmo padrão de outras
-- solicitações no projeto (ex.: selo de verificado sumindo até aprovação, §45).
alter table public.anamnese add column solicitada_atualizacao_em timestamptz;

-- Sem RLS nova: `anamnese_update_professional` (baseline, `is_professional_of(client_id)`) já
-- libera UPDATE de qualquer coluna da tabela pro profissional vinculado — a coluna nova entra
-- nesse guarda-chuva sozinha.

-- `submeter_anamnese_autenticado` precisa limpar o pedido quando o paciente responde de novo —
-- só essa RPC (security definer, escopada no auth.uid() do paciente) grava a própria anamnese
-- pelo lado dele; senão o aviso "atualize sua anamnese" ficaria preso mesmo depois de atendido.
create or replace function public.submeter_anamnese_autenticado(p_respostas jsonb, p_plano_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;

  update public.profiles set
    nome = coalesce(nullif(p_respostas->>'nome_completo',''), nome),
    telefone = coalesce(nullif(p_respostas->>'telefone',''), telefone),
    data_nascimento = nullif(p_respostas->>'data_nascimento','')::date,
    altura_cm = nullif(p_respostas->>'altura_cm','')::numeric,
    peso_kg = nullif(p_respostas->>'peso_atual','')::numeric
  where id = v_uid;

  insert into public.anamnese (client_id, objetivo_principal, nivel_atividade, lesoes_dores, condicoes_medicas,
    medicamentos, cirurgias, historico_familiar, restricoes_alimentares, alergias, observacoes,
    respostas_completas, updated_at)
  values (v_uid,
    coalesce(p_respostas->>'objetivo_principal',''),
    coalesce(p_respostas->>'pratica_atividade',''),
    coalesce(p_respostas->>'limitacao_fisica',''),
    coalesce(p_respostas->>'patologias',''),
    coalesce(p_respostas->>'medicamentos',''),
    coalesce(p_respostas->>'cirurgias',''),
    coalesce(p_respostas->>'historico_familiar',''),
    coalesce(p_respostas->>'nao_consome',''),
    coalesce(p_respostas->>'intolerancias_alergias',''),
    coalesce(p_respostas->>'observacoes_finais',''),
    p_respostas, now()
  )
  on conflict (client_id) do update set
    objetivo_principal = excluded.objetivo_principal,
    nivel_atividade = excluded.nivel_atividade,
    lesoes_dores = excluded.lesoes_dores,
    condicoes_medicas = excluded.condicoes_medicas,
    medicamentos = excluded.medicamentos,
    cirurgias = excluded.cirurgias,
    historico_familiar = excluded.historico_familiar,
    restricoes_alimentares = excluded.restricoes_alimentares,
    alergias = excluded.alergias,
    observacoes = excluded.observacoes,
    respostas_completas = excluded.respostas_completas,
    solicitada_atualizacao_em = null,
    updated_at = now();

  if p_plano_id is not null then
    update public.subscriptions
    set plano_solicitado_id = p_plano_id
    where patient_id = v_uid and plan_id is null;
  end if;

  return true;
end;
$function$;
