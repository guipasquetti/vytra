/**
 * Template do check-in recorrente — a maior lacuna do benchmark (05/set, ver
 * `Fitness App Scouting Report`): 3-4 de 4 concorrentes pesquisados já automatizam isso,
 * a gente não tinha nada.
 *
 * ⚠️ Rascunho de primeira versão, não o texto literal do Live Clean. O que veio de fato
 * dos prints analisados em 03/set (HANDOFF §13) foram os TIPOS, ESCALAS e CATEGORIAS de
 * 22 das 23 perguntas — não a redação exata de cada pergunta/opção (só existe em
 * screenshot, não foi transcrita verbatim). A pergunta 19 nunca foi capturada, segue de
 * fora. Redação abaixo é meu melhor esforço a partir da estrutura documentada — precisa
 * de revisão do Tassis antes de ir pro ar de verdade, mesmo tratamento que a anamnese de
 * treino (§10) já recebe: "precisa do Tassis" antes de virar produção.
 *
 * Regras de modelagem que vieram do §13 e não podem ser "simplificadas":
 * - Guardar o VALOR de cada opção (`pontuacao`), nunca o rótulo — rótulo é só
 *   apresentação. A ordem das opções na lista não indica direção; cada uma carrega a
 *   própria pontuação (vegetais/frutas listam a melhor opção primeiro, sono/aderência
 *   listam a pior primeiro — inferir pela posição quebra a série).
 * - `categorica` nunca entra na pontuação — a pergunta de fome tem uma opção que foge da
 *   escala ("não sinto fome, tenho dificuldade pra comer") e é sinal de alerta clínico,
 *   não ruído a promediar.
 * - `dependeDe` é revelação condicional ENTRE perguntas (17 só aparece se 16 não foi "0
 *   dias"); `opcoes[].pedeDetalhe` é revelação condicional DENTRO da mesma pergunta
 *   (campo de texto que aparece ao escolher aquela opção).
 */

export type TipoPerguntaCheckin = 'ordinal' | 'escala' | 'categorica' | 'numero' | 'texto' | 'foto';

export type OpcaoCheckin = {
  valor: string;
  label: string;
  /** Pontuação 0-100 dessa opção — só usada quando a pergunta é `ordinal`. */
  pontuacao?: number;
  /** Quando presente, escolher esta opção revela um campo de texto com este placeholder. */
  pedeDetalhe?: string;
};

export type PerguntaCheckin = {
  id: string;
  /** Rótulo curto usado no resumo por categoria devolvido ao paciente. */
  categoria: string;
  texto: string;
  tipo: TipoPerguntaCheckin;
  /** `ordinal` | `categorica`. */
  opcoes?: OpcaoCheckin[];
  /** `escala`. */
  escalaMin?: number;
  escalaMax?: number;
  escalaRotuloMin?: string;
  escalaRotuloMax?: string;
  /** `escala`: se maior valor pontua mais (`crescente`) ou menos (`decrescente`). */
  escalaDirecao?: 'crescente' | 'decrescente';
  /** Some da tela até a pergunta referenciada ter uma resposta diferente de `ocultarSeValor`. */
  dependeDe?: { perguntaId: string; ocultarSeValor: string };
  opcional?: boolean;
};

const ESCALA_DISPOSICAO: OpcaoCheckin[] = [
  { valor: '1', label: 'Muito indisposto(a)', pontuacao: 0 },
  { valor: '2', label: 'Indisposto(a) na maior parte do tempo', pontuacao: 25 },
  { valor: '3', label: 'Neutro(a)', pontuacao: 50 },
  { valor: '4', label: 'Geralmente disposto(a)', pontuacao: 75 },
  { valor: '5', label: 'Muito disposto(a)', pontuacao: 100 },
];

const ESCALA_QUALIDADE_SONO: OpcaoCheckin[] = [
  { valor: '1', label: 'Muito ruim — não descansei nada', pontuacao: 0 },
  { valor: '2', label: 'Ruim — acordei cansado(a) várias vezes', pontuacao: 25 },
  { valor: '3', label: 'Regular — dormi, mas sem descanso completo', pontuacao: 50 },
  { valor: '4', label: 'Boa — acordei descansado(a) na maior parte dos dias', pontuacao: 75 },
  { valor: '5', label: 'Muito boa — acordei descansado(a) todos os dias', pontuacao: 100 },
];

const ESCALA_PORCOES: OpcaoCheckin[] = [
  { valor: 'tres_mais', label: 'Três ou mais porções', pontuacao: 100 },
  { valor: 'uma_duas', label: 'Uma a duas porções', pontuacao: 50 },
  { valor: 'nenhuma', label: 'Nenhuma porção', pontuacao: 0 },
];

export const PERGUNTAS_CHECKIN: PerguntaCheckin[] = [
  {
    id: 'peso_corporal',
    categoria: 'Peso corporal',
    texto: 'Qual seu peso em jejum hoje?',
    tipo: 'numero',
  },
  {
    id: 'disposicao',
    categoria: 'Disposição',
    texto: 'Como está sua disposição durante o dia?',
    tipo: 'ordinal',
    opcoes: ESCALA_DISPOSICAO,
  },
  {
    id: 'desempenho_exercicios',
    categoria: 'Desempenho',
    texto: 'Como foi seu desempenho nos treinos essa semana?',
    tipo: 'ordinal',
    opcoes: [
      { valor: '1', label: 'Muito abaixo do esperado', pontuacao: 0 },
      { valor: '2', label: 'Abaixo do esperado', pontuacao: 25 },
      { valor: '3', label: 'Dentro do esperado', pontuacao: 50 },
      { valor: '4', label: 'Acima do esperado', pontuacao: 75 },
      { valor: '5', label: 'Muito acima do esperado', pontuacao: 100 },
    ],
  },
  {
    id: 'horas_sono',
    categoria: 'Sono',
    texto: 'Quantas horas você dormiu, em média, essa semana?',
    tipo: 'escala',
    escalaMin: 1,
    escalaMax: 10,
    escalaRotuloMin: 'Pouco',
    escalaRotuloMax: 'Muito',
    escalaDirecao: 'crescente',
  },
  {
    id: 'qualidade_sono',
    categoria: 'Qualidade do sono',
    texto: 'Como você avalia a qualidade do seu sono?',
    tipo: 'ordinal',
    opcoes: ESCALA_QUALIDADE_SONO.map((o) => ({ ...o })),
  },
  {
    id: 'aderencia_plano',
    categoria: 'Aderência',
    texto: 'Como foi seguir o plano essa semana?',
    tipo: 'ordinal',
    opcoes: [
      { valor: 'perfeita', label: 'Segui perfeitamente', pontuacao: 100 },
      { valor: 'maior_parte', label: 'Segui na maior parte', pontuacao: 66 },
      {
        valor: 'dificuldade',
        label: 'Tive dificuldade',
        pontuacao: 33,
        pedeDetalhe: 'Quais foram suas dificuldades?',
      },
      {
        valor: 'nao_consegui',
        label: 'Não consegui seguir',
        pontuacao: 0,
        pedeDetalhe: 'Quais foram suas dificuldades?',
      },
    ],
  },
  {
    id: 'refeicoes_fora_do_plano',
    categoria: 'Refeições fora do plano',
    texto: 'Quantas refeições fora do plano você fez essa semana?',
    tipo: 'escala',
    escalaMin: 0,
    escalaMax: 9,
    escalaRotuloMin: 'Nenhuma',
    escalaRotuloMax: '9 ou mais',
    escalaDirecao: 'decrescente',
  },
  {
    id: 'pular_refeicoes',
    categoria: 'Refeições puladas',
    texto: 'Você pulou alguma refeição prevista?',
    tipo: 'ordinal',
    opcoes: [
      { valor: 'nunca', label: 'Nunca pulei', pontuacao: 100 },
      { valor: 'as_vezes', label: 'Pulei uma ou duas vezes', pontuacao: 50 },
      { valor: 'frequente', label: 'Pulei com frequência', pontuacao: 0 },
    ],
  },
  {
    id: 'niveis_fome',
    categoria: 'Fome',
    texto: 'Como estiveram seus níveis de fome nessa semana?',
    tipo: 'categorica',
    opcoes: [
      { valor: 'baixo', label: 'Baixo' },
      { valor: 'medio', label: 'Médio' },
      { valor: 'alto', label: 'Alto' },
      { valor: 'sem_fome', label: 'Não sinto fome e tenho dificuldade para comer' },
    ],
  },
  {
    id: 'ingestao_liquidos',
    categoria: 'Hidratação',
    texto: 'Quantos litros de água você bebeu, em média, por dia?',
    tipo: 'escala',
    escalaMin: 0,
    escalaMax: 5,
    escalaRotuloMin: 'Pouco',
    escalaRotuloMax: '5 ou mais',
    escalaDirecao: 'crescente',
  },
  {
    id: 'consumo_vegetais',
    categoria: 'Vegetais',
    texto: 'Quantas porções de vegetais você consumiu por dia, em média?',
    tipo: 'ordinal',
    opcoes: ESCALA_PORCOES.map((o) => ({ ...o })),
  },
  {
    id: 'consumo_frutas',
    categoria: 'Frutas',
    texto: 'Quantas porções de frutas você consumiu por dia, em média?',
    tipo: 'ordinal',
    opcoes: ESCALA_PORCOES.map((o) => ({ ...o })),
  },
  {
    id: 'desconforto_abdominal',
    categoria: 'Digestão',
    texto: 'Sentiu desconforto abdominal essa semana?',
    tipo: 'ordinal',
    opcoes: [
      { valor: 'nenhum', label: 'Nenhum', pontuacao: 100 },
      {
        valor: 'leve',
        label: 'Leve, ocasional',
        pontuacao: 50,
        pedeDetalhe: 'Pode descrever o desconforto?',
      },
      {
        valor: 'frequente',
        label: 'Frequente ou intenso',
        pontuacao: 0,
        pedeDetalhe: 'Pode descrever o desconforto?',
      },
    ],
  },
  {
    id: 'consistencia_fezes',
    categoria: 'Consistência',
    texto: 'Como está a consistência das suas evacuações?',
    tipo: 'categorica',
    opcoes: [
      { valor: 'normal', label: 'Normal' },
      { valor: 'ressecada', label: 'Ressecada' },
      { valor: 'amolecida', label: 'Amolecida' },
    ],
  },
  {
    id: 'frequencia_intestinal',
    categoria: 'Frequência intestinal',
    texto: 'Qual a frequência das suas evacuações?',
    tipo: 'ordinal',
    opcoes: [
      { valor: 'regular', label: 'Regular (1x ou mais por dia)', pontuacao: 100 },
      { valor: 'dois_dias', label: 'A cada 2 dias', pontuacao: 50 },
      { valor: 'tres_mais_dias', label: '3 dias ou mais sem evacuar', pontuacao: 0 },
    ],
  },
  {
    id: 'dias_alcool',
    categoria: 'Álcool',
    texto: 'Em quantos dias da semana você consumiu álcool?',
    tipo: 'escala',
    escalaMin: 0,
    escalaMax: 7,
    escalaRotuloMin: 'Nenhum dia',
    escalaRotuloMax: 'Todos os dias',
    escalaDirecao: 'decrescente',
  },
  {
    id: 'quantidade_alcool',
    categoria: 'Álcool',
    texto: 'Num dia típico que bebeu, quantas doses consumiu?',
    tipo: 'ordinal',
    dependeDe: { perguntaId: 'dias_alcool', ocultarSeValor: '0' },
    opcoes: [
      { valor: 'uma_duas', label: '1–2 doses', pontuacao: 66 },
      { valor: 'tres_quatro', label: '3–4 doses', pontuacao: 33 },
      { valor: 'cinco_mais', label: '5 ou mais doses', pontuacao: 0 },
    ],
  },
  {
    id: 'alteracoes_cardapio',
    categoria: 'Pedido de revisão',
    texto: 'Quer incluir, adicionar ou modificar algum alimento no seu plano?',
    tipo: 'texto',
    opcional: true,
  },
  // Pergunta 19 do Live Clean nunca foi capturada nos prints (§13) — fora por enquanto.
  {
    id: 'foto_frente',
    categoria: 'Progresso visual',
    texto: 'Foto de frente',
    tipo: 'foto',
    opcional: true,
  },
  {
    id: 'foto_perfil_esquerdo',
    categoria: 'Progresso visual',
    texto: 'Foto de perfil — lado esquerdo',
    tipo: 'foto',
    opcional: true,
  },
  {
    id: 'foto_perfil_direito',
    categoria: 'Progresso visual',
    texto: 'Foto de perfil — lado direito',
    tipo: 'foto',
    opcional: true,
  },
  {
    id: 'foto_costas',
    categoria: 'Progresso visual',
    texto: 'Foto de costas',
    tipo: 'foto',
    opcional: true,
  },
  {
    id: 'feedback_aberto',
    categoria: 'Feedback',
    texto: 'Algo mais que queira compartilhar?',
    tipo: 'texto',
    opcional: true,
  },
];

export type RespostasCheckin = Record<string, string>;

/** Pontuação 0-100 de uma resposta, ou `null` quando a pergunta não entra no cálculo. */
export function pontuacaoResposta(pergunta: PerguntaCheckin, valor: string | undefined): number | null {
  if (!valor) return null;

  if (pergunta.tipo === 'ordinal') {
    return pergunta.opcoes?.find((o) => o.valor === valor)?.pontuacao ?? null;
  }

  if (pergunta.tipo === 'escala') {
    const min = pergunta.escalaMin ?? 0;
    const max = pergunta.escalaMax ?? 1;
    const n = Number(valor);
    if (Number.isNaN(n) || max === min) return null;
    const normalizado = Math.min(1, Math.max(0, (n - min) / (max - min)));
    const pct = normalizado * 100;
    return pergunta.escalaDirecao === 'decrescente' ? 100 - pct : pct;
  }

  return null;
}

export type ResumoCategoria = { categoria: string; pontuacao: number; rotulo: string };
export type ResumoCheckin = { pontuacaoGeral: number | null; categorias: ResumoCategoria[] };

export function rotuloQualitativo(pontuacao: number): string {
  if (pontuacao >= 80) return 'Ótimo';
  if (pontuacao >= 60) return 'Bom';
  if (pontuacao >= 40) return 'Neutro';
  if (pontuacao >= 20) return 'Ruim';
  return 'Crítico';
}

/** Pontuação geral + resumo por categoria — devolvido na hora pro paciente (§13: "devolutiva imediata"). */
export function calcularResumo(respostas: RespostasCheckin): ResumoCheckin {
  const categorias: ResumoCategoria[] = [];
  for (const pergunta of PERGUNTAS_CHECKIN) {
    const pontuacao = pontuacaoResposta(pergunta, respostas[pergunta.id]);
    if (pontuacao === null) continue;
    categorias.push({ categoria: pergunta.categoria, pontuacao, rotulo: rotuloQualitativo(pontuacao) });
  }
  const pontuacaoGeral = categorias.length
    ? categorias.reduce((soma, c) => soma + c.pontuacao, 0) / categorias.length
    : null;
  return { pontuacaoGeral, categorias };
}

/** Perguntas visíveis nesta resposta — resolve os `dependeDe` contra o estado atual. */
export function perguntasVisiveis(respostas: RespostasCheckin): PerguntaCheckin[] {
  return PERGUNTAS_CHECKIN.filter((p) => {
    if (!p.dependeDe) return true;
    return respostas[p.dependeDe.perguntaId] !== p.dependeDe.ocultarSeValor;
  });
}
