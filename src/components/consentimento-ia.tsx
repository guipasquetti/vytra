import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Caption, Card, SectionTitle } from '@/components/ui';
import {
  consentimentoIaVigente,
  registrarConsentimentoIa,
  revogarConsentimentoIa,
} from '@/services/consentimentoService';
import { Palette, Spacing } from '@/theme';

/**
 * Aceite opcional da análise das fotos por IA. Recusar não impede enviar as fotos: só o
 * profissional vê as imagens e a análise automática simplesmente não roda (a Edge Function
 * recusa sem consentimento vigente). Revisar o texto com o Guilherme antes de produção.
 */
export function ConsentimentoIa({ clientId }: { clientId: string }) {
  const [vigente, setVigente] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    consentimentoIaVigente(clientId)
      .then((v) => { if (!cancelado) setVigente(v); })
      .catch(() => { if (!cancelado) setVigente(false); });
    return () => { cancelado = true; };
  }, [clientId]);

  async function alternar() {
    if (vigente === null || salvando) return;
    setErro(null);
    setSalvando(true);
    try {
      if (vigente) await revogarConsentimentoIa(clientId);
      else await registrarConsentimentoIa(clientId);
      setVigente(!vigente);
    } catch {
      setErro('Não consegui salvar sua escolha. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  if (vigente === null) return null;

  return (
    <Card>
      <SectionTitle>Análise das fotos por IA</SectionTitle>
      <View style={styles.bloco}>
        <Caption>
          Se você permitir, suas fotos são enviadas ao serviço de IA da Anthropic (EUA) para gerar um
          resumo visual que só o seu profissional lê. É um apoio, nunca um diagnóstico. Se não
          permitir, seu profissional continua vendo as fotos normalmente, só não recebe esse resumo.
          Você pode revogar a qualquer momento aqui.
        </Caption>
        {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
        <Button
          label={vigente ? 'Revogar permissão de análise por IA' : 'Permitir análise por IA'}
          variant={vigente ? 'ghost' : undefined}
          onPress={alternar}
          loading={salvando}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: Spacing.sm },
});
