import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Body, Button, Caption } from '@/components/ui';
import { ModeloReferenciaFoto, SilhuetaGuia } from '@/components/silhuetas-checkin';
import { Palette, Spacing } from '@/theme';

export type AnguloFoto = 'frente' | 'esquerdo' | 'direito' | 'costas';
type DuracaoTimer = 3 | 5 | 10;

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
  sexo,
  onFoto,
  onCancelar,
}: {
  tipo: AnguloFoto;
  sexo?: string | null;
  onFoto: (arquivo: { uri: string; name: string }) => void;
  onCancelar: () => void;
}) {
  const [permissao, solicitarPermissao] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturando, setCapturando] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null);
  const [duracaoTimer, setDuracaoTimer] = useState<DuracaoTimer>(3);
  const [escolhendoTimer, setEscolhendoTimer] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; format: string } | null>(null);
  const [verReferencia, setVerReferencia] = useState(true);
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

  // O timer é local à câmera: não cria nova permissão nem guarda informação do paciente.
  // Ao chegar a 1, dispara a mesma rotina do obturador manual para manter qualidade e preview.
  const capturarRef = useRef(capturar);
  capturarRef.current = capturar;
  useEffect(() => {
    if (segundosRestantes == null) return;
    const timer = setTimeout(() => {
      if (segundosRestantes === 1) {
        setSegundosRestantes(null);
        void capturarRef.current();
      } else {
        setSegundosRestantes((atual) => (atual == null ? null : atual - 1));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [segundosRestantes]);

  function abrirOuCancelarTimer() {
    if (capturando) return;
    if (segundosRestantes != null) {
      setSegundosRestantes(null);
      return;
    }
    setEscolhendoTimer((atual) => !atual);
  }

  function iniciarTimer(duracao: DuracaoTimer) {
    setDuracaoTimer(duracao);
    setEscolhendoTimer(false);
    setSegundosRestantes(duracao);
  }

  function usarFoto() {
    if (!preview) return;
    onFoto({ uri: preview.uri, name: `${tipo}.${preview.format}` });
  }

  // A referência aparece antes mesmo do pedido de permissão: a pessoa entende a pose
  // que será solicitada antes de expor a câmera do aparelho.
  if (verReferencia) {
    return (
      <View style={styles.referencia}>
        <View style={styles.referenciaCabecalho}>
          <Body style={styles.referenciaTitulo}>Como tirar esta foto</Body>
          <Caption color={Palette.textTertiary}>{rotulo.titulo}</Caption>
        </View>
        <ModeloReferenciaFoto tipo={tipo} sexo={sexo} />
        <View style={styles.referenciaTexto}>
          <Body style={styles.referenciaInstrucao}>{rotulo.instrucao}</Body>
          <Caption color={Palette.textTertiary} style={styles.referenciaLegenda}>
            Deixe o corpo inteiro visível. Traje de banho ou roupa de treino ajustada ajuda a acompanhar sua evolução.
          </Caption>
        </View>
        <View style={styles.referenciaAcoes}>
          <Button label="Abrir câmera" onPress={() => setVerReferencia(false)} />
          <Button label="Cancelar" variant="ghost" onPress={onCancelar} />
        </View>
      </View>
    );
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
          <SilhuetaGuia tipo={tipo} sexo={sexo} />
        </View>
      </View>

      <View style={styles.controles}>
        <Button label="Cancelar" variant="ghost" onPress={onCancelar} />
        <View style={styles.disparo}>
          <Pressable style={styles.obturador} onPress={() => { setSegundosRestantes(null); setEscolhendoTimer(false); void capturar(); }} disabled={capturando} accessibilityLabel="Tirar foto">
            <View style={styles.obturadorMiolo} />
          </Pressable>
          <Pressable style={styles.timerBotao} onPress={abrirOuCancelarTimer} disabled={capturando} accessibilityRole="button" accessibilityLabel={segundosRestantes == null ? 'Escolher duração do timer' : 'Cancelar timer'}>
            <Caption color={segundosRestantes == null ? Palette.text : Palette.accent}>{segundosRestantes == null ? `Timer ${duracaoTimer}s` : 'Cancelar'}</Caption>
          </Pressable>
        </View>
        <Button
          label="Virar"
          variant="ghost"
          onPress={() => setFacing((atual) => (atual === 'back' ? 'front' : 'back'))}
        />
      </View>
      {escolhendoTimer ? (
        <View style={styles.opcoesTimer} accessibilityLabel="Escolha o tempo do timer">
          {([3, 5, 10] as DuracaoTimer[]).map((duracao) => (
            <Pressable
              key={duracao}
              onPress={() => iniciarTimer(duracao)}
              style={[styles.opcaoTimer, duracao === duracaoTimer && styles.opcaoTimerAtiva]}
              accessibilityRole="button"
              accessibilityLabel={`Timer de ${duracao} segundos`}>
              <Caption color={duracao === duracaoTimer ? Palette.accent : Palette.text}>{duracao}s</Caption>
            </Pressable>
          ))}
        </View>
      ) : null}
      {segundosRestantes != null ? (
        <View pointerEvents="none" style={styles.contagem}>
          <Body style={styles.contagemTexto}>{segundosRestantes}</Body>
          <Caption color={Palette.text}>Prepare-se</Caption>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: Palette.background },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, backgroundColor: Palette.background },
  referencia: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl * 2,
    paddingBottom: Spacing.lg,
    backgroundColor: Palette.background,
  },
  referenciaCabecalho: { alignItems: 'center', gap: Spacing.xs },
  referenciaTitulo: { color: Palette.text, fontWeight: '700' },
  referenciaTexto: { alignItems: 'center', gap: Spacing.xs, maxWidth: 320 },
  referenciaInstrucao: { textAlign: 'center', fontWeight: '600' },
  referenciaLegenda: { textAlign: 'center' },
  referenciaAcoes: { width: '100%', gap: Spacing.xs },
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
  disparo: { alignItems: 'center', gap: Spacing.xs },
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
  timerBotao: {
    minWidth: 78,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  opcoesTimer: {
    position: 'absolute',
    bottom: Spacing.xl + 110,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    padding: Spacing.xs,
    borderRadius: 999,
    backgroundColor: Palette.surface,
  },
  opcaoTimer: {
    minWidth: 52,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
  },
  opcaoTimerAtiva: { borderWidth: 1, borderColor: Palette.accent },
  contagem: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    backgroundColor: Palette.background,
  },
  contagemTexto: { color: Palette.accent, fontSize: 56, fontWeight: '800', lineHeight: 64 },
  preview: { flex: 1 },
  rodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
});
