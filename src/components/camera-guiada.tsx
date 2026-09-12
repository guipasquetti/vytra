import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Body, Button, Caption } from '@/components/ui';
import { SilhuetaGuia } from '@/components/silhuetas-checkin';
import { Palette, Spacing } from '@/theme';

export type AnguloFoto = 'frente' | 'esquerdo' | 'direito' | 'costas';

const ROTULO: Record<AnguloFoto, { titulo: string; instrucao: string }> = {
  frente: { titulo: 'Frente', instrucao: 'Fique de frente pra câmera' },
  esquerdo: { titulo: 'Perfil esquerdo', instrucao: 'Vire o lado esquerdo do corpo pra câmera' },
  direito: { titulo: 'Perfil direito', instrucao: 'Vire o lado direito do corpo pra câmera' },
  costas: { titulo: 'Costas', instrucao: 'Fique de costas pra câmera' },
};

/**
 * Câmera com guia de enquadramento (item 5 do benchmark, ampliado a pedido do Guilherme,
 * 12/set): a comparação de fotos (`obterComparacaoFotos`) só é útil se cada envio ficar no
 * mesmo enquadramento — a moldura marca posição/distância, não tenta reconhecer o corpo.
 * Câmera nova no projeto (`expo-camera`) — o check-in usava só `expo-document-picker` até
 * aqui (decisão de 06/set foi não abrir essa frente de permissão sem necessidade); aqui a
 * guia exige câmera ao vivo, então a permissão passa a ser necessária pra essa tela.
 */
export function CameraGuiada({
  tipo,
  onFoto,
  onCancelar,
}: {
  tipo: AnguloFoto;
  onFoto: (arquivo: { uri: string; name: string }) => void;
  onCancelar: () => void;
}) {
  const [permissao, solicitarPermissao] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturando, setCapturando] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; format: string } | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const rotulo = ROTULO[tipo];

  async function capturar() {
    if (!cameraRef.current || capturando) return;
    setCapturando(true);
    try {
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (foto) setPreview({ uri: foto.uri, format: foto.format ?? 'jpg' });
    } finally {
      setCapturando(false);
    }
  }

  function usarFoto() {
    if (!preview) return;
    onFoto({ uri: preview.uri, name: `${tipo}.${preview.format}` });
  }

  if (!permissao) return null;

  if (!permissao.granted) {
    return (
      <View style={styles.centro}>
        <Body>Precisamos da câmera pra tirar a foto com a guia.</Body>
        <Caption color={Palette.textTertiary}>{rotulo.instrucao}</Caption>
        <Button label="Permitir câmera" onPress={solicitarPermissao} />
        <Button label="Cancelar" variant="ghost" onPress={onCancelar} />
      </View>
    );
  }

  if (preview) {
    return (
      <View style={styles.raiz}>
        <Image source={{ uri: preview.uri }} style={styles.preview} resizeMode="contain" />
        <View style={styles.rodape}>
          <Button label="Tirar de novo" variant="ghost" onPress={() => setPreview(null)} />
          <Button label="Usar essa foto" onPress={usarFoto} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.raiz}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.topo}>
          <Body style={styles.titulo}>{rotulo.titulo}</Body>
          <Caption color={Palette.textTertiary}>{rotulo.instrucao}</Caption>
        </View>
        <View style={styles.silhueta}>
          <SilhuetaGuia tipo={tipo} />
        </View>
      </View>

      <View style={styles.controles}>
        <Button label="Cancelar" variant="ghost" onPress={onCancelar} />
        <Pressable style={styles.obturador} onPress={capturar} disabled={capturando}>
          <View style={styles.obturadorMiolo} />
        </Pressable>
        <Button
          label="Virar"
          variant="ghost"
          onPress={() => setFacing((atual) => (atual === 'back' ? 'front' : 'back'))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: Palette.background },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, backgroundColor: Palette.background },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center' },
  topo: { marginTop: Spacing.xl * 2, alignItems: 'center', gap: Spacing.xs },
  titulo: { color: Palette.text, fontWeight: '700' },
  silhueta: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controles: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  obturador: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: Palette.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  obturadorMiolo: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Palette.accent,
  },
  preview: { flex: 1 },
  rodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
});
