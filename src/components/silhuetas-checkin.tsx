import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { View } from 'react-native';

import type { AnguloFoto } from '@/components/camera-guiada';
import { Palette } from '@/theme';

/**
 * Silhueta-guia por ângulo (pedido do Guilherme, 12/set — substitui a moldura genérica por
 * uma silhueta de pessoa). Só 2 formas de verdade: **frontal** (frente e costas — o contorno
 * de alguém parado de frente ou de costas é o mesmo traço, a diferença é só a instrução de
 * texto) e **lateral** (perfil — usada nos dois lados, espelhada via `scaleX` pra direito).
 * Traço só, sem preenchimento — mesma linguagem de "cor é o único sinal" do §19/§32.
 */
export function SilhuetaGuia({ tipo }: { tipo: AnguloFoto }) {
  const conteudo = tipo === 'esquerdo' || tipo === 'direito' ? <SilhuetaLateral /> : <SilhuetaFrontal />;
  const espelhar = tipo === 'esquerdo';
  return <View style={espelhar ? { transform: [{ scaleX: -1 }] } : undefined}>{conteudo}</View>;
}

const TRACO = { stroke: Palette.accent, strokeWidth: 2, fill: 'none', opacity: 0.65 } as const;

function SilhuetaFrontal() {
  return (
    <Svg width={180} height={360} viewBox="0 0 200 400">
      <Circle cx={100} cy={34} r={26} {...TRACO} />
      <Rect x={48} y={90} width={18} height={115} rx={9} {...TRACO} />
      <Rect x={134} y={90} width={18} height={115} rx={9} {...TRACO} />
      <Path
        d="M84,58 L116,58 L134,86 L124,180 L136,215 L130,300 L122,380 L106,380 L112,235 L100,228 L88,235 L94,380 L78,380 L70,300 L64,215 L76,180 L66,86 Z"
        {...TRACO}
      />
    </Svg>
  );
}

function SilhuetaLateral() {
  return (
    <Svg width={180} height={360} viewBox="0 0 200 400">
      <Circle cx={104} cy={40} r={24} {...TRACO} />
      <Rect x={96} y={92} width={18} height={115} rx={9} {...TRACO} />
      <Path
        d="M100,64 L108,88 L104,160 L114,195 L110,270 L112,345 L108,380 L146,380 L142,358 L118,350 L124,275 L106,215 L96,175 L92,135 L98,98 L92,68 Z"
        {...TRACO}
      />
    </Svg>
  );
}
