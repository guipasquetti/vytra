import type { ImageSourcePropType } from 'react-native';

import { normalizarNomeExercicio } from './exerciseNormalize';

type ExerciseIllustration = {
  aliases: readonly string[];
  source: ImageSourcePropType;
};

/**
 * Resolve uma ilustração local pelo nome da prescrição.
 *
 * A escolha é propositalmente estática: a instrução visual não pode depender de geração
 * dinâmica, rede ou do banco. Aliases mantêm compatibilidade com pequenas variações de
 * grafia que o profissional já possa ter salvo em `plans.dias`.
 */
const illustrations: readonly ExerciseIllustration[] = [
  {
    aliases: ['abdominal banco 45', 'abdominal no banco 45', 'abdominal banco 45 graus'],
    source: require('../../assets/exercises/abdominal-banco-45.png'),
  },
  {
    aliases: ['abdominal infra', 'abdominal inferior'],
    source: require('../../assets/exercises/abdominal-infra.png'),
  },
  {
    aliases: ['agachamento smith', 'agachamento hack', 'agachamento livre'],
    source: require('../../assets/exercises/agachamento-smith-hack-ou-livre.png'),
  },
  {
    aliases: ['agachamento goblet', 'goblet squat'],
    source: require('../../assets/exercises/agachamento-goblet.png'),
  },
  { aliases: ['bulgaro', 'afundo bulgaro'], source: require('../../assets/exercises/bulgaro.png') },
  { aliases: ['cadeira abdutora'], source: require('../../assets/exercises/cadeira-abdutora.png') },
  { aliases: ['cadeira adutora'], source: require('../../assets/exercises/cadeira-adutora.png') },
  { aliases: ['cadeira extensora'], source: require('../../assets/exercises/cadeira-extensora.png') },
  { aliases: ['cadeira flexora'], source: require('../../assets/exercises/cadeira-flexora.png') },
  {
    aliases: ['crucifixo inverso'],
    source: require('../../assets/exercises/crucifixo-inverso-maquina-ou-halter.png'),
  },
  { aliases: ['crucifixo maquina'], source: require('../../assets/exercises/crucifixo-maquina.png') },
  {
    aliases: ['desenvolvimento maquina', 'desenvolvimento smith'],
    source: require('../../assets/exercises/desenvolvimento-maquina-ou-smith.png'),
  },
  {
    aliases: ['elevacao frontal'],
    source: require('../../assets/exercises/elevacao-frontal-unilateral-cabo-ou-halter.png'),
  },
  {
    aliases: ['elevacao lateral na polia', 'elevacao lateral cabo'],
    source: require('../../assets/exercises/elevacao-lateral-na-polia.png'),
  },
  {
    aliases: ['elevacao lateral'],
    source: require('../../assets/exercises/elevacao-lateral-com-halter.png'),
  },
  { aliases: ['elevacao pelvica', 'hip thrust'], source: require('../../assets/exercises/elevacao-pelvica.png') },
  {
    aliases: ['hiperextensao lombar', 'hiperextensao'],
    source: require('../../assets/exercises/hiperextensao-lombar-com-sobrecarga.png'),
  },
  {
    aliases: ['panturrilha em pe', 'panturrilha no leg press', 'panturrilha legpress'],
    source: require('../../assets/exercises/panturrilha-em-pe-ou-no-legpress.png'),
  },
  { aliases: ['leg press', 'legpress'], source: require('../../assets/exercises/legpress.png') },
  { aliases: ['mesa flexora'], source: require('../../assets/exercises/mesa-flexora.png') },
  { aliases: ['prancha'], source: require('../../assets/exercises/prancha-isometrica.png') },
  { aliases: ['pull down', 'pulldown'], source: require('../../assets/exercises/pull-down.png') },
  {
    aliases: ['puxada alta barra reta', 'puxada barra reta'],
    source: require('../../assets/exercises/puxada-alta-barra-reta.png'),
  },
  {
    aliases: ['puxada alta pegada neutra', 'puxada neutra'],
    source: require('../../assets/exercises/puxada-alta-pegada-neutra.png'),
  },
  {
    aliases: ['remada com peito apoiado', 'remada peito apoiado'],
    source: require('../../assets/exercises/remada-com-peito-apoiado-maquina.png'),
  },
  {
    aliases: ['remada maquina sentado cotovelos altos', 'remada maquina cotovelos altos', 'remada cotovelos altos'],
    source: require('../../assets/exercises/remada-maquina-sentado-cotovelos-altos.png'),
  },
  { aliases: ['remada serrote'], source: require('../../assets/exercises/remada-serrote-com-halter.png') },
  {
    aliases: ['remada curvada', 'remada curvada barra'],
    source: require('../../assets/exercises/remada-curvada-com-barra.png'),
  },
  {
    aliases: ['rosca martelo'],
    source: require('../../assets/exercises/rosca-martelo-unilateral-com-halter.png'),
  },
  {
    aliases: ['rosca direta', 'rosca barra ez', 'rosca direta barra ez'],
    source: require('../../assets/exercises/rosca-direta-barra-ez.png'),
  },
  {
    aliases: ['rosca unilateral', 'rosca com halter'],
    source: require('../../assets/exercises/rosca-unilateral-com-halter.png'),
  },
  { aliases: ['stiff'], source: require('../../assets/exercises/stiff.png') },
  {
    aliases: ['supino declinado'],
    source: require('../../assets/exercises/supino-declinado-maquina-ou-banco.png'),
  },
  {
    aliases: ['supino inclinado', 'supino inclinado halter', 'supino inclinado com halteres'],
    source: require('../../assets/exercises/supino-inclinado-com-halteres.png'),
  },
  {
    aliases: ['supino reto'],
    source: require('../../assets/exercises/supino-reto-maquina-ou-barra.png'),
  },
  {
    aliases: ['triceps coice'],
    source: require('../../assets/exercises/triceps-coice-unilateral-no-cabo.png'),
  },
  { aliases: ['triceps corda'], source: require('../../assets/exercises/triceps-corda.png') },
];

const tricepsCordaDiaD = require('../../assets/exercises/triceps-corda-dia-d.png');

export function getExerciseIllustration(nome: string, diaId?: string): ImageSourcePropType | undefined {
  const normalizado = normalizarNomeExercicio(nome);

  if (normalizado.includes('triceps corda') && diaId?.trim().toUpperCase() === 'D') {
    return tricepsCordaDiaD;
  }

  return illustrations.find((illustration) =>
    illustration.aliases.some((alias) => normalizado.includes(alias)),
  )?.source;
}
