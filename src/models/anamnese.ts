/**
 * Schema do formulário de anamnese — respondido DENTRO do app, autenticado, no onboarding
 * (`OnboardingAnamnese`, ver `aluno/_layout.tsx`), não mais num link público (§12, 04/set).
 *
 * Fiel ao protótipo (`prototype/index.html`, array `PERGUNTAS_ANAMNESE`): mesmas seções,
 * mesmos campos, mesmo `id` — o `id` de cada campo é a chave gravada no JSONB
 * `anamnese.respostas_completas`, e a RPC `submeter_anamnese_autenticado` lê algumas dessas
 * chaves por nome exato (`nome_completo`, `telefone`, `data_nascimento`, `altura_cm`,
 * `peso_atual`, `objetivo_principal`, `pratica_atividade`, `limitacao_fisica`, `patologias`,
 * `medicamentos`, `cirurgias`, `historico_familiar`, `nao_consome`,
 * `intolerancias_alergias`, `observacoes_finais`). Não renomear sem atualizar a função SQL.
 *
 * Decisões de produto já tomadas no protótipo, preservadas aqui: sem paginação/wizard (uma
 * tela só, com scroll), sem campo obrigatório, sem lógica condicional entre perguntas.
 */

export type TipoCampoAnamnese = 'texto' | 'numero' | 'data' | 'hora' | 'area' | 'calculado';

export type CampoAnamnese = {
  id: string;
  label: string;
  tipo: TipoCampoAnamnese;
  placeholder?: string;
  /** Alternativas fechadas são renderizadas como botões, não como texto livre. */
  opcoes?: { valor: string; label: string }[];
  /** "Sim" revela o campo de detalhe; "Não" encerra a pergunta. */
  simNaoComDetalhe?: boolean;
};

export type SecaoAnamnese = {
  titulo: string;
  campos: CampoAnamnese[];
};

export const SECOES_ANAMNESE: SecaoAnamnese[] = [
  {
    titulo: 'Identificação',
    campos: [
      { id: 'nome_completo', label: 'Nome completo', tipo: 'texto' },
      { id: 'data_nascimento', label: 'Data de nascimento', tipo: 'data' },
      { id: 'sexo', label: 'Sexo', tipo: 'texto', opcoes: [
        { valor: 'feminino', label: 'Feminino' }, { valor: 'masculino', label: 'Masculino' }, { valor: 'outro', label: 'Outro' },
      ] },
      { id: 'telefone', label: 'Telefone com WhatsApp', tipo: 'texto', placeholder: '(11) 99999-9999' },
      { id: 'profissao', label: 'Profissão', tipo: 'texto' },
      { id: 'rotina_trabalho', label: 'Rotina de trabalho (horários, trabalho físico ou sedentário)', tipo: 'area' },
    ],
  },
  {
    titulo: 'Dados antropométricos',
    campos: [
      { id: 'peso_atual', label: 'Peso atual (kg)', tipo: 'numero' },
      { id: 'altura_cm', label: 'Altura (cm)', tipo: 'numero' },
      { id: 'peso_habitual', label: 'Peso habitual', tipo: 'texto' },
      { id: 'maior_peso', label: 'Maior peso já atingido', tipo: 'texto' },
      { id: 'menor_peso_adulto', label: 'Menor peso na vida adulta', tipo: 'texto' },
      { id: 'mudancas_peso', label: 'Mudanças recentes de peso (ganho/perda, quanto e em quanto tempo)', tipo: 'area' },
    ],
  },
  {
    titulo: 'Histórico de saúde',
    campos: [
      { id: 'patologias', label: 'Possui alguma patologia diagnosticada?', tipo: 'area', placeholder: 'Conte qual(is)', simNaoComDetalhe: true },
      { id: 'historico_familiar', label: 'Histórico familiar de doenças (diabetes, hipertensão, dislipidemia, obesidade, cardiovasculares, tireoide etc.)', tipo: 'area' },
      { id: 'cirurgias', label: 'Já realizou cirurgias?', tipo: 'area', placeholder: 'Quais e quando?', simNaoComDetalhe: true },
      { id: 'intolerancias_alergias', label: 'Possui intolerâncias ou alergias alimentares?', tipo: 'area', placeholder: 'Conte quais', simNaoComDetalhe: true },
      { id: 'sintomas_gastro', label: 'Tem sintomas gastrointestinais frequentes?', tipo: 'area', placeholder: 'Conte quais sintomas', simNaoComDetalhe: true },
    ],
  },
  {
    titulo: 'Medicamentos e suplementos',
    campos: [
      { id: 'medicamentos', label: 'Faz uso de algum medicamento?', tipo: 'area', placeholder: 'Qual(is), dose e horário', simNaoComDetalhe: true },
      { id: 'suplementos', label: 'Utiliza suplementos alimentares?', tipo: 'area', placeholder: 'Conte quais', simNaoComDetalhe: true },
      { id: 'fitoterapicos', label: 'Uso de fitoterápicos ou chás com frequência', tipo: 'area' },
    ],
  },
  {
    titulo: 'Hábitos alimentares',
    campos: [
      { id: 'refeicoes_por_dia', label: 'Quantas refeições faz por dia?', tipo: 'texto' },
      { id: 'horarios_refeicoes', label: 'Horários habituais das refeições', tipo: 'texto' },
      { id: 'cafe_manha', label: 'Café da manhã — o que costuma comer', tipo: 'area' },
      { id: 'lanche_manha', label: 'Lanche da manhã — o que costuma comer', tipo: 'area' },
      { id: 'almoco', label: 'Almoço — o que costuma comer', tipo: 'area' },
      { id: 'lanche_tarde', label: 'Lanche da tarde — o que costuma comer', tipo: 'area' },
      { id: 'jantar', label: 'Jantar — o que costuma comer', tipo: 'area' },
      { id: 'ceia', label: 'Ceia — o que costuma comer', tipo: 'area' },
      { id: 'beliscar', label: 'Costuma beliscar entre as refeições?', tipo: 'texto', opcoes: [{ valor: 'Sim', label: 'Sim' }, { valor: 'Não', label: 'Não' }] },
      { id: 'freq_ultraprocessados', label: 'Frequência de consumo de alimentos ultraprocessados', tipo: 'texto', opcoes: [{ valor: 'Nunca', label: 'Nunca' }, { valor: 'Às vezes', label: 'Às vezes' }, { valor: 'Frequentemente', label: 'Frequentemente' }] },
      { id: 'freq_doces_alcool', label: 'Frequência de doces, refrigerantes e bebidas alcoólicas', tipo: 'texto', opcoes: [{ valor: 'Nunca', label: 'Nunca' }, { valor: 'Às vezes', label: 'Às vezes' }, { valor: 'Frequentemente', label: 'Frequentemente' }] },
      { id: 'consumo_agua', label: 'Consumo diário de água (aproximado)', tipo: 'texto' },
    ],
  },
  {
    titulo: 'Preferências alimentares',
    campos: [
      { id: 'alimentos_gosta', label: 'Alimentos que gosta', tipo: 'area' },
      { id: 'alimentos_nao_gosta', label: 'Alimentos que não gosta', tipo: 'area' },
      { id: 'nao_consome', label: 'Alimentos que não consome por opção (vegetarianismo, veganismo, religião, cultura)', tipo: 'area', placeholder: 'Ex.: Nenhum' },
      { id: 'facilidade_cozinhar', label: 'Facilidade para cozinhar em casa', tipo: 'texto', opcoes: [{ valor: 'Fácil', label: 'Fácil' }, { valor: 'Moderada', label: 'Moderada' }, { valor: 'Difícil', label: 'Difícil' }] },
      { id: 'refeicoes_fora', label: 'Realiza refeições fora de casa com frequência?', tipo: 'texto', placeholder: 'Onde costuma comer?', simNaoComDetalhe: true },
    ],
  },
  {
    titulo: 'Atividade física',
    campos: [
      { id: 'pratica_atividade', label: 'Pratica atividade física?', tipo: 'area', placeholder: 'Qual(is) modalidade(s)?', simNaoComDetalhe: true },
      { id: 'tempo_treino', label: 'Tempo de treino (meses/anos)', tipo: 'texto' },
      { id: 'freq_musculacao', label: 'Frequência semanal de treino de força/musculação', tipo: 'texto' },
      { id: 'freq_cardio', label: 'Frequência semanal de cardio', tipo: 'texto' },
      { id: 'duracao_treinos', label: 'Duração média dos treinos', tipo: 'texto' },
      { id: 'intensidade', label: 'Intensidade percebida', tipo: 'texto', opcoes: [{ valor: 'Leve', label: 'Leve' }, { valor: 'Moderada', label: 'Moderada' }, { valor: 'Intensa', label: 'Intensa' }] },
      { id: 'limitacao_fisica', label: 'Possui alguma limitação física, dor ou lesão?', tipo: 'area', placeholder: 'Conte qual', simNaoComDetalhe: true },
    ],
  },
  {
    titulo: 'Sono e rotina',
    campos: [
      { id: 'horario_dormir', label: 'Horário que costuma dormir', tipo: 'hora' },
      { id: 'horario_acordar', label: 'Horário que costuma acordar', tipo: 'hora' },
      { id: 'horas_sono', label: 'Média de horas de sono por noite', tipo: 'calculado' },
      { id: 'qualidade_sono', label: 'Qualidade do sono', tipo: 'texto', opcoes: [{ valor: 'Boa', label: 'Boa' }, { valor: 'Regular', label: 'Regular' }, { valor: 'Ruim', label: 'Ruim' }] },
      { id: 'acorda_descansado', label: 'Acorda descansado?', tipo: 'texto', opcoes: [{ valor: 'Sim', label: 'Sim' }, { valor: 'Não', label: 'Não' }] },
    ],
  },
  {
    titulo: 'Objetivo com o acompanhamento',
    campos: [
      { id: 'objetivo_principal', label: 'Objetivo principal (emagrecimento, ganho de massa, saúde, desempenho esportivo, outro)', tipo: 'texto' },
      { id: 'prazo_objetivo', label: 'Prazo esperado para atingir o objetivo', tipo: 'texto' },
      { id: 'dieta_anterior', label: 'Já fez dieta antes? Qual foi a experiência?', tipo: 'area' },
      { id: 'dificuldade_seguir_dieta', label: 'Principal dificuldade em seguir um plano alimentar', tipo: 'area' },
    ],
  },
  {
    titulo: 'Observações finais',
    campos: [
      { id: 'observacoes_finais', label: 'Algo mais que considere importante informar', tipo: 'area' },
      { id: 'expectativas', label: 'Expectativas em relação ao acompanhamento', tipo: 'area' },
    ],
  },
];

export type RespostasAnamnese = Record<string, string>;

/** Calcula a duração do sono, inclusive quando a pessoa dorme antes da meia-noite. */
export function calcularMediaSono(horarioDormir: string, horarioAcordar: string): string {
  const paraMinutos = (horario: string): number | null => {
    const partes = /^(\d{2}):(\d{2})$/.exec(horario.trim());
    if (!partes) return null;
    const horas = Number(partes[1]);
    const minutos = Number(partes[2]);
    return horas < 24 && minutos < 60 ? horas * 60 + minutos : null;
  };
  const dormir = paraMinutos(horarioDormir);
  const acordar = paraMinutos(horarioAcordar);
  if (dormir == null || acordar == null) return '';
  let duracao = acordar - dormir;
  if (duracao <= 0) duracao += 24 * 60;
  const horas = Math.floor(duracao / 60);
  const minutos = duracao % 60;
  return minutos ? `${horas}h ${minutos}min` : `${horas}h`;
}

/**
 * Colunas fixas da tabela `anamnese`, extraídas do jsonb de respostas.
 *
 * Replica EXATAMENTE o mapeamento feito pela RPC `submeter_anamnese_autenticado`
 * (`supabase/migrations/20260904_anamnese_pos_login.sql`) — mesmos campos de origem,
 * mesmo `coalesce(..., '')` pra vazio (nunca `null`, sempre string vazia). Usada por
 * `anamneseService.salvarAnamneseComoProfissional`, que grava direto na tabela (não
 * pode chamar a RPC — ela é `security definer` escopada em `auth.uid()` do paciente).
 * Se este mapeamento divergir do SQL, paciente e profissional passam a gravar dado
 * diferente nas mesmas colunas silenciosamente — não alterar um lado sem o outro.
 */
export function extrairColunasAnamnese(respostas: RespostasAnamnese) {
  return {
    objetivo_principal: respostas.objetivo_principal ?? '',
    nivel_atividade: respostas.pratica_atividade ?? '',
    lesoes_dores: respostas.limitacao_fisica ?? '',
    condicoes_medicas: respostas.patologias ?? '',
    medicamentos: respostas.medicamentos ?? '',
    cirurgias: respostas.cirurgias ?? '',
    historico_familiar: respostas.historico_familiar ?? '',
    restricoes_alimentares: respostas.nao_consome ?? '',
    alergias: respostas.intolerancias_alergias ?? '',
    observacoes: respostas.observacoes_finais ?? '',
  };
}
