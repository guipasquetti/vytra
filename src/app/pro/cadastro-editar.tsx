import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Body, Button, Caption, Card, Field, Loading, Pill, Screen, SectionTitle } from '@/components/ui';
import {
  obterMinhaVerificacao,
  solicitarAlteracaoCadastro,
  uploadDocumentoVerificacao,
  type TipoRegistro,
} from '@/services/verificacaoService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Spacing } from '@/theme';

const TIPOS_REGISTRO: { valor: TipoRegistro; label: string }[] = [
  { valor: 'CREF', label: 'CREF — Educador físico' },
  { valor: 'CRN', label: 'CRN — Nutricionista' },
];

/**
 * Solicitar alteração de cadastro profissional (Guilherme, 14/set): antes disso não tinha
 * como um profissional já aprovado corrigir/completar registro (ex.: tirou o CRN depois de já
 * ter cadastro só com CREF). Reusa a mesma fila de aprovação do admin — submeter aqui sempre
 * volta o status pra `pendente` (RLS força isso, ver `verificacaoService.ts`), então o selo de
 * verificado some até reaprovar. Isso é intencional, não bug: ver §44 do handoff.
 */
export default function CadastroEditarScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [carregando, setCarregando] = useState(true);
  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro | null>(null);
  const [numeroRegistro, setNumeroRegistro] = useState('');
  const [ufRegistro, setUfRegistro] = useState('');
  const [bio, setBio] = useState('');
  const [statusAtual, setStatusAtual] = useState<string | null>(null);
  const [documento, setDocumento] = useState<{ uri: string; name: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    obterMinhaVerificacao(user.id).then((v) => {
      if (v) {
        setTipoRegistro(v.tipoRegistro === 'CREF' || v.tipoRegistro === 'CRN' ? v.tipoRegistro : null);
        setNumeroRegistro(v.numeroRegistro);
        setUfRegistro(v.ufRegistro);
        setBio(v.bio ?? '');
        setStatusAtual(v.status);
      }
      setCarregando(false);
    });
  }, [user?.id]);

  async function escolherDocumento() {
    const resultado = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const arquivo = resultado.assets[0];
    setDocumento({ uri: arquivo.uri, name: arquivo.name });
  }

  async function enviar() {
    if (!user) return;
    if (!tipoRegistro) {
      setErro('Escolhe o conselho do registro (CREF ou CRN).');
      return;
    }
    if (!numeroRegistro.trim() || ufRegistro.trim().length !== 2) {
      setErro('Preenche o número do registro e a UF (2 letras).');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const documentoPath = documento ? await uploadDocumentoVerificacao(user.id, documento) : undefined;
      await solicitarAlteracaoCadastro(user.id, {
        tipoRegistro,
        numeroRegistro: numeroRegistro.trim(),
        ufRegistro: ufRegistro.trim().toUpperCase(),
        bio: bio.trim(),
        documentoPath,
      });
      setConcluido(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar a alteração.');
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) return <Loading />;

  if (concluido) {
    return (
      <Screen title="Alteração enviada" voltar>
        <Card>
          <SectionTitle>Em análise</SectionTitle>
          <Body>Seu cadastro voltou pra fila de verificação.</Body>
          <Caption>
            O selo de verificado fica indisponível até um admin confirmar os dados novos.
            Painel e assinaturas continuam funcionando normalmente enquanto isso.
          </Caption>
          <Button label="Voltar ao perfil" onPress={() => router.replace('/pro/perfil')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Alterar cadastro" subtitle="Registro no conselho e bio" voltar>
      <Card>
        <Caption>
          Enviar essa alteração reabre a verificação: o selo de verificado some até um admin
          confirmar de novo. Painel e assinaturas continuam funcionando enquanto isso.
          {statusAtual === 'rejeitado' ? ' Seu cadastro está rejeitado — corrige e reenvia.' : ''}
        </Caption>
      </Card>

      <Card>
        <SectionTitle>Conselho</SectionTitle>
        <Caption>Qual registro este número é? Some um segundo registro depois se precisar.</Caption>
        <View style={styles.pills}>
          {TIPOS_REGISTRO.map((t) => (
            <Pill
              key={t.valor}
              label={t.label}
              active={tipoRegistro === t.valor}
              onPress={() => setTipoRegistro(t.valor)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle>Registro no conselho</SectionTitle>
        <Field
          label="Número do CREF/CRN"
          value={numeroRegistro}
          onChangeText={setNumeroRegistro}
          placeholder="Ex.: 012345-G"
        />
        <Field label="UF do registro" value={ufRegistro} onChangeText={setUfRegistro} placeholder="Ex.: SP" />
        <Button
          label={documento ? `Novo documento: ${documento.name}` : 'Enviar novo documento (opcional)'}
          variant="ghost"
          onPress={escolherDocumento}
        />
      </Card>

      <Card>
        <SectionTitle>Sobre você</SectionTitle>
        <Field
          label="Conte como você atua"
          value={bio}
          onChangeText={setBio}
          placeholder="Especialidades, experiência, forma de atendimento..."
          multiline
        />
      </Card>

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
      <Button label="Enviar pra aprovação" onPress={enviar} loading={enviando} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
