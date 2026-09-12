import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CameraGuiada, type AnguloFoto } from '@/components/camera-guiada';
import { Body, Button, Caption, Card, Field, Pill, Screen, SectionTitle, Stat, StepperButton } from '@/components/ui';
import { perguntasVisiveis, type PerguntaCheckin, type RespostasCheckin, type ResumoCheckin } from '@/models/checkin';
import { corrigirCheckin, submeterCheckin, uploadFotoCheckin, type CheckIn } from '@/services/checkinService';
import { Palette, Spacing } from '@/theme';

type Fotos = { frente?: string; esquerdo?: string; direito?: string; costas?: string };

function tipoFoto(perguntaId: string): AnguloFoto {
  if (perguntaId.includes('frente')) return 'frente';
  if (perguntaId.includes('esquerdo')) return 'esquerdo';
  if (perguntaId.includes('direito')) return 'direito';
  return 'costas';
}

/** Se a pergunta já tem resposta — fotos vivem em `fotos`, o resto em `respostas`. */
function respondida(pergunta: PerguntaCheckin, respostas: RespostasCheckin, fotos: Fotos): boolean {
  if (pergunta.tipo === 'foto') return Boolean(fotos[tipoFoto(pergunta.id)]);
  return Boolean(respostas[pergunta.id]?.trim());
}

/**
 * Check-in recorrente — todas as perguntas visíveis de uma vez (pedido do Guilherme, 12/set;
 * era uma por cartão até aqui). Paciente responde na ordem que quiser; só pode enviar quando
 * toda pergunta OBRIGATÓRIA (`!opcional`) tiver resposta — as opcionais (fotos, texto livre de
 * revisão/feedback) podem ficar em branco. `perguntasVisiveis` já recalcula a cada resposta,
 * então `dependeDe` (ex.: `quantidade_alcool` só aparece se `dias_alcool` não for "0") some/
 * aparece ao vivo na mesma tela, sem precisar avançar pra revelar.
 */
export function CheckinFlow({
  clientId,
  professionalId,
  subscriptionId,
  checkinParaCorrigir,
  onConcluido,
}: {
  clientId: string;
  professionalId: string;
  subscriptionId: string;
  /** Presente quando é correção do check-in recém-enviado (12/set), não um envio novo. */
  checkinParaCorrigir?: CheckIn;
  onConcluido: (resumo: ResumoCheckin) => void;
}) {
  const [respostas, setRespostas] = useState<RespostasCheckin>(
    () => (checkinParaCorrigir?.respostas as RespostasCheckin | null) ?? {},
  );
  const [fotos, setFotos] = useState<Fotos>(() => ({
    frente: checkinParaCorrigir?.foto_frente_path ?? undefined,
    esquerdo: checkinParaCorrigir?.foto_perfil_esquerdo_path ?? undefined,
    direito: checkinParaCorrigir?.foto_perfil_direito_path ?? undefined,
    costas: checkinParaCorrigir?.foto_costas_path ?? undefined,
  }));
  const [enviandoFoto, setEnviandoFoto] = useState<AnguloFoto | null>(null);
  const [cameraAberta, setCameraAberta] = useState<AnguloFoto | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const visiveis = perguntasVisiveis(respostas);
  const obrigatorias = visiveis.filter((p) => !p.opcional);
  const obrigatoriasRespondidas = obrigatorias.filter((p) => respondida(p, respostas, fotos)).length;
  const podeEnviar = obrigatoriasRespondidas === obrigatorias.length;

  function responder(pergunta: PerguntaCheckin, valor: string) {
    setRespostas((atual) => {
      const novas = { ...atual, [pergunta.id]: valor };
      const opcaoAtual = pergunta.opcoes?.find((o) => o.valor === valor);
      if (!opcaoAtual?.pedeDetalhe) delete novas[`${pergunta.id}_detalhe`];
      return novas;
    });
  }

  function responderDetalhe(pergunta: PerguntaCheckin, texto: string) {
    setRespostas((atual) => ({ ...atual, [`${pergunta.id}_detalhe`]: texto }));
  }

  function ajustarEscala(pergunta: PerguntaCheckin, delta: number) {
    const min = pergunta.escalaMin ?? 0;
    const max = pergunta.escalaMax ?? 10;
    const atual = Number(respostas[pergunta.id] ?? min);
    const novo = Math.min(max, Math.max(min, (Number.isNaN(atual) ? min : atual) + delta));
    setRespostas((r) => ({ ...r, [pergunta.id]: String(novo) }));
  }

  async function enviarFoto(tipo: AnguloFoto, arquivo: { uri: string; name: string }) {
    setEnviandoFoto(tipo);
    try {
      const caminho = await uploadFotoCheckin(clientId, tipo, arquivo);
      setFotos((atual) => ({ ...atual, [tipo]: caminho }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar a foto.');
    } finally {
      setEnviandoFoto(null);
    }
  }

  async function escolherDaGaleria(tipo: AnguloFoto) {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      setErro('Sem acesso às fotos — permite o acesso nas configurações pra escolher da galeria.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const arquivo = resultado.assets[0];
    await enviarFoto(tipo, { uri: arquivo.uri, name: arquivo.fileName ?? `${tipo}.jpg` });
  }

  async function enviar() {
    if (!podeEnviar || enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const resumo = checkinParaCorrigir
        ? await corrigirCheckin(checkinParaCorrigir.id, respostas, fotos)
        : await submeterCheckin(clientId, professionalId, subscriptionId, respostas, fotos);
      onConcluido(resumo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar seu check-in.');
      setEnviando(false);
    }
  }

  return (
    <View style={styles.raiz}>
      <Screen
        title={checkinParaCorrigir ? 'Corrigir check-in' : 'Check-in'}
        subtitle="Responda na ordem que quiser">
      <Card>
        <Stat
          value={`${obrigatoriasRespondidas}/${obrigatorias.length}`}
          label="obrigatórias respondidas"
          color={podeEnviar ? Palette.accent : Palette.textTertiary}
        />
      </Card>

      {visiveis.map((pergunta) => (
        <Card key={pergunta.id}>
          <View style={styles.cabecalhoPergunta}>
            <Caption color={Palette.textTertiary}>{pergunta.categoria}</Caption>
            {pergunta.opcional ? <Pill label="Opcional" active={false} /> : null}
          </View>
          <Body>{pergunta.texto}</Body>

          {(pergunta.tipo === 'ordinal' || pergunta.tipo === 'categorica') && (
            <View style={styles.bloco}>
              <View style={styles.opcoes}>
                {pergunta.opcoes?.map((opcao) => (
                  <Pill
                    key={opcao.valor}
                    label={opcao.label}
                    active={respostas[pergunta.id] === opcao.valor}
                    onPress={() => responder(pergunta, opcao.valor)}
                  />
                ))}
              </View>
              {(() => {
                const opcaoAtual = pergunta.opcoes?.find((o) => o.valor === respostas[pergunta.id]);
                if (!opcaoAtual?.pedeDetalhe) return null;
                return (
                  <Field
                    value={respostas[`${pergunta.id}_detalhe`] ?? ''}
                    onChangeText={(t) => responderDetalhe(pergunta, t)}
                    placeholder={opcaoAtual.pedeDetalhe}
                    multiline
                  />
                );
              })()}
            </View>
          )}

          {pergunta.tipo === 'escala' && (
            <View style={styles.escala}>
              <View style={styles.escalaRotulos}>
                <Caption>{pergunta.escalaRotuloMin}</Caption>
                <Caption>{pergunta.escalaRotuloMax}</Caption>
              </View>
              <View style={styles.stepperRow}>
                <StepperButton icon="remove" onPress={() => ajustarEscala(pergunta, -1)} />
                <Body style={styles.escalaValor}>
                  {respostas[pergunta.id] ?? pergunta.escalaMin ?? 0}
                </Body>
                <StepperButton icon="add" onPress={() => ajustarEscala(pergunta, 1)} />
              </View>
            </View>
          )}

          {(pergunta.tipo === 'numero' || pergunta.tipo === 'texto') && (
            <Field
              value={respostas[pergunta.id] ?? ''}
              onChangeText={(t) => setRespostas((r) => ({ ...r, [pergunta.id]: t }))}
              keyboardType={pergunta.tipo === 'numero' ? 'decimal-pad' : 'default'}
              placeholder={pergunta.tipo === 'numero' ? 'Ex.: 78,5' : 'Opcional'}
              multiline={pergunta.tipo === 'texto'}
            />
          )}

          {pergunta.tipo === 'foto' &&
            (() => {
              const tipo = tipoFoto(pergunta.id);
              return (
                <View style={styles.bloco}>
                  <Button
                    label={fotos[tipo] ? 'Foto enviada — tirar de novo' : 'Tirar foto com a guia'}
                    onPress={() => setCameraAberta(tipo)}
                    loading={enviandoFoto === tipo}
                  />
                  <Button
                    label="Ou escolher da galeria"
                    variant="ghost"
                    onPress={() => escolherDaGaleria(tipo)}
                    loading={enviandoFoto === tipo}
                  />
                </View>
              );
            })()}
        </Card>
      ))}

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}

      <Button
        label={checkinParaCorrigir ? 'Salvar correção' : 'Enviar check-in'}
        onPress={enviar}
        disabled={!podeEnviar}
        loading={enviando}
      />
      {!podeEnviar ? (
        <Caption color={Palette.textTertiary}>
          Responda todas as perguntas obrigatórias pra poder enviar.
        </Caption>
      ) : null}
      </Screen>

      {cameraAberta ? (
        <View style={styles.cameraOverlay}>
          <CameraGuiada
            tipo={cameraAberta}
            onCancelar={() => setCameraAberta(null)}
            onFoto={async (arquivo) => {
              const tipo = cameraAberta;
              setCameraAberta(null);
              await enviarFoto(tipo, arquivo);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Tela de resumo mostrada assim que o check-in é enviado (§13: "devolutiva imediata"). */
export function CheckinResumo({ resumo, onFechar }: { resumo: ResumoCheckin; onFechar: () => void }) {
  return (
    <Screen title="Check-in enviado">
      <Card>
        <SectionTitle>Sua pontuação</SectionTitle>
        <Body style={styles.pontuacaoGrande}>
          {resumo.pontuacaoGeral !== null ? `${Math.round(resumo.pontuacaoGeral)}%` : '—'}
        </Body>
      </Card>

      {resumo.categorias.map((c) => (
        <Card key={c.categoria}>
          <View style={styles.resumoLinha}>
            <Caption color={Palette.text}>{c.categoria}</Caption>
            <Caption color={Palette.text}>{c.rotulo}</Caption>
          </View>
        </Card>
      ))}

      <Button label="Voltar" onPress={onFechar} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  cameraOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bloco: { gap: Spacing.md },
  cabecalhoPergunta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  escala: { gap: Spacing.md },
  escalaRotulos: { flexDirection: 'row', justifyContent: 'space-between' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  escalaValor: { minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pontuacaoGrande: { fontSize: 40, fontWeight: '800', textAlign: 'center' },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between' },
});
