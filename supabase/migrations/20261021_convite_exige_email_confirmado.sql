-- Convites: só e-mail CONFIRMADO vale como prova de que a pessoa é dona do endereço.
-- Revisão de código (21/out): as três RPCs de convite comparavam `auth.users.email` com
-- `convites.email` sem olhar `email_confirmed_at`. Com "Confirm email" desligado, qualquer um
-- se cadastra com o e-mail de outra pessoa, lê o convite dela e se vincula ao profissional.
-- Aqui o e-mail não confirmado vira "sem e-mail" (a RPC não acha convite nenhum).
-- Defesa em profundidade: o dashboard também precisa religar "Confirm email" (HANDOFF §73);
-- sem isso o Supabase já marca o e-mail como confirmado no cadastro e esta guarda não age.
-- Só troca a origem do e-mail; assinaturas e grants (endurece_acesso) ficam como estão.

create or replace function public.finalizar_cadastro_convite(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text;
  v_respostas jsonb;
  v_uid uuid := auth.uid();
  v_user_email text;
  v_created_by uuid;
  v_plan_id uuid;
  v_lead_id uuid;
begin
  if v_uid is null then return false; end if;
  select email into v_user_email from auth.users where id = v_uid and email_confirmed_at is not null;

  select email, respostas, created_by, plan_id, lead_id
    into v_email, v_respostas, v_created_by, v_plan_id, v_lead_id
  from public.convites
  where token = p_token and status = 'preenchido';

  if v_email is null or v_respostas is null or lower(v_email) <> lower(coalesce(v_user_email,'')) then
    return false;
  end if;

  update public.profiles set
    nome = coalesce(nullif(v_respostas->>'nome_completo',''), nome),
    telefone = coalesce(nullif(v_respostas->>'telefone',''), telefone),
    data_nascimento = nullif(v_respostas->>'data_nascimento','')::date,
    altura_cm = nullif(v_respostas->>'altura_cm','')::numeric,
    peso_kg = nullif(v_respostas->>'peso_atual','')::numeric
  where id = v_uid;

  insert into public.anamnese (client_id, objetivo_principal, nivel_atividade, lesoes_dores, condicoes_medicas,
    medicamentos, cirurgias, historico_familiar, restricoes_alimentares, alergias, observacoes,
    respostas_completas, updated_at)
  values (v_uid,
    coalesce(v_respostas->>'objetivo_principal',''),
    coalesce(v_respostas->>'pratica_atividade',''),
    coalesce(v_respostas->>'limitacao_fisica',''),
    coalesce(v_respostas->>'patologias',''),
    coalesce(v_respostas->>'medicamentos',''),
    coalesce(v_respostas->>'cirurgias',''),
    coalesce(v_respostas->>'historico_familiar',''),
    coalesce(v_respostas->>'nao_consome',''),
    coalesce(v_respostas->>'intolerancias_alergias',''),
    coalesce(v_respostas->>'observacoes_finais',''),
    v_respostas, now()
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
    updated_at = now();

  if v_created_by is not null
     and exists (select 1 from public.professionals where id = v_created_by)
     and not exists (
       select 1 from public.subscriptions
       where patient_id = v_uid and professional_id = v_created_by
     )
  then
    insert into public.subscriptions (patient_id, professional_id, plan_id, status)
    values (v_uid, v_created_by, v_plan_id, 'ativa');
  end if;

  if v_lead_id is not null then
    update public.leads set status = 'convertido', client_id = v_uid, updated_at = now()
    where id = v_lead_id;
  end if;

  update public.convites set status = 'concluido', client_id = v_uid where token = p_token;
  return true;
end;
$function$;

create or replace function public.obter_solicitacoes_pendentes()
returns table (token text, profissional_nome text, especialidade text, created_at timestamptz)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    c.token,
    coalesce(nullif(p.nome, ''), 'Seu profissional') as profissional_nome,
    prof.especialidade,
    c.created_at
  from public.convites c
  join public.professionals prof on prof.id = c.created_by
  join public.profiles p on p.id = prof.id
  where c.status = 'pendente'
    and lower(c.email) = lower(coalesce((
      select email from auth.users where id = auth.uid() and email_confirmed_at is not null
    ), ''))
  order by c.created_at desc;
$function$;

create or replace function public.recusar_convite(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text;
  v_user_email text := (
    select email from auth.users where id = auth.uid() and email_confirmed_at is not null
  );
begin
  if auth.uid() is null then return false; end if;

  select email into v_email from public.convites where token = p_token and status = 'pendente';
  if v_email is null or lower(v_email) <> lower(coalesce(v_user_email, '')) then
    return false;
  end if;

  update public.convites set status = 'recusado' where token = p_token;
  return true;
end;
$function$;
