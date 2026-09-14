import { Image, StyleSheet, View } from 'react-native';

import type { AnguloFoto } from '@/components/camera-guiada';

const GUIAS = {
  feminino: {
    frente: require('../../assets/checkin-guides/feminino-frente.png'),
    costas: require('../../assets/checkin-guides/feminino-costas.png'),
    perfil: require('../../assets/checkin-guides/feminino-perfil.png'),
  },
  masculino: {
    frente: require('../../assets/checkin-guides/masculino-frente.png'),
    costas: require('../../assets/checkin-guides/masculino-costas.png'),
    perfil: require('../../assets/checkin-guides/masculino-perfil.png'),
  },
} as const;

const REFERENCIAS_FOTO = {
  feminino: {
    frente: require('../../assets/checkin-references/feminino-frente.png'),
    costas: require('../../assets/checkin-references/feminino-costas.png'),
    perfil: require('../../assets/checkin-references/feminino-perfil.png'),
  },
  masculino: {
    frente: require('../../assets/checkin-references/masculino-frente.png'),
    costas: require('../../assets/checkin-references/masculino-costas.png'),
    perfil: require('../../assets/checkin-references/masculino-perfil.png'),
  },
} as const;

function posePara(
  tipo: AnguloFoto,
  sexo: string | null | undefined,
  colecao: typeof GUIAS,
) {
  const modelo = sexo === 'masculino' ? colecao.masculino : colecao.feminino;
  return tipo === 'frente' ? modelo.frente : tipo === 'costas' ? modelo.costas : modelo.perfil;
}

/**
 * Guia de enquadramento com os mesmos modelos das ilustrações de exercício.
 * Perfil direito é o espelho exato do perfil esquerdo para preservar proporção e postura.
 */
export function SilhuetaGuia({
  tipo,
  sexo,
}: {
  tipo: AnguloFoto;
  sexo?: string | null;
}) {
  const pose = posePara(tipo, sexo, GUIAS);

  return (
    <View style={tipo === 'direito' ? styles.espelhado : undefined}>
      <Image source={pose} style={styles.modelo} resizeMode="contain" accessibilityLabel="" />
    </View>
  );
}

/**
 * Referência de postura exibida antes de abrir a câmera. A pessoa continua livre para
 * usar traje de banho ou roupa de treino ajustada; a imagem serve só para padronizar
 * ângulo e enquadramento entre check-ins.
 */
export function ModeloReferenciaFoto({
  tipo,
  sexo,
}: {
  tipo: AnguloFoto;
  sexo?: string | null;
}) {
  const pose = posePara(tipo, sexo, REFERENCIAS_FOTO);

  return (
    <View style={tipo === 'direito' ? styles.espelhado : undefined}>
      <Image
        source={pose}
        style={styles.referencia}
        resizeMode="contain"
        accessibilityLabel={`Referência de foto ${tipo}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  modelo: {
    width: 214,
    height: 330,
    opacity: 0.72,
  },
  referencia: {
    width: 244,
    height: 366,
  },
  espelhado: {
    transform: [{ scaleX: -1 }],
  },
});
