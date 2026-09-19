import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Body, Button, Caption, Card, Field, Loading, Pill, Screen, SectionTitle } from '@/components/ui';
import {
  atualizarMinhaBio,
  listarMeusRegistros,
  listarProfissoes,
  obterMinhaVerificacao,
  solicitarRegistro,
  uploadDocumentoVerificacao,
  type Profissao,
  type RegistroProfissional,
} from '@/services/verificacaoService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Spacing } from '@/theme';

const ROTULOS_STATUS: Record<string, string> = {
  pendente: 'Em análise',
  aprovado: 'Verificado',
  rejeitado: 'Rejeitado',
};

type Formulario = {
  profissao: Profissao;
  numero: string;
  uf: string;
  documento: { uri: string; name: string } | null;
  existente: boolean;
};

/**
 * Registros e bio do profissional (19/set, catálogo de profissões). Cada registro em conselho
 * tem a própria verificação: somar um novo ou corrigir um existente volta só aquele registro
 * pra fila do admin, e o selo das áreas já aprovadas continua no perfil. A bio é salva à parte
 * e não reabre verificação nenhuma.
 */
export default function CadastroEditarScreen() {
  const user = useAuthStore((s) => s.user);

  const [carregando, setCarregando] = useState(true);
  const [profissoes, setProfissoes] = useState<Profissao[]>([]);
  const [registros, setRegistros] = useState<RegistroProfissional[]>([]);
  const [bio, setBio] = useState('');
  const [salvandoBio, setSalvandoBio] = useState(false);
  const [bioSalva, setBioSalva] = useState(false);
  const [form, setForm] = useState<Formulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [versao, setVersao] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    Promise.all([listarProfissoes(false), listarMeusRegistros(userId), obterMinhaVerificacao(userId)]).then(
      ([lista, meus, verificacao]) => {
        setProfissoes(lista);
        setRegistros(meus);
        if (versao === 0) setBio(verificacao?.bio ?? '');
        setCarregando(false);
      },
    );
  }, [userId, versao]);

  const disponiveis = profissoes.filter((p) => p.ativo && !registros.some((r) => r.profissao === p.codigo));

  function abrirEdicao(registro: RegistroProfissional) {
    const profissao = profissoes.find((p) => p.codigo === registro.profissao);
    if (!profissao) return;
    setAviso(null);
    setErro(null);
    setForm({ profissao, numero: registro.numero, uf: registro.uf, documento: null, existente: true });
  }

  function abrirNovo(profissao: Profissao) {
    setAviso(null);
    setErro(null);
    setForm({ profissao, numero: '', uf: '', documento: null, existente: false });
  }

  async function escolherDocumento() {
    const resultado = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (resultado.canceled || !resultado.assets?.[0] || !form) return;
    const arquivo = resultado.assets[0];
    setForm({ ...form, documento: { uri: arquivo.uri, name: arquivo.name } });
  }

  async function enviarRegistro() {
    if (!user || !form) return;
    if (!form.numero.trim() || form.uf.trim().length !== 2) {
      setErro('Preenche o número do registro e a UF (2 letras).');
      return;
    }
    if (!form.existente && !form.documento) {
      setErro('Envia uma foto ou PDF da carteirinha do conselho.');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const documentoPath = form.documento
        ? await uploadDocumentoVerificacao(user.id, form.documento, form.profissao.codigo)
        : undefined;
      await solicitarRegistro({
        profissao: form.profissao.codigo,
        numero: form.numero.trim(),
        uf: form.uf.trim().toUpperCase(),
        documentoPath,
      });
      setForm(null);
      setAviso(`Registro de ${form.profissao.nome} enviado pra conferência.`);
      setVersao((v) => v + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar o registro.');
    } finally {
      setEnviando(false);
    }
  }

  async function salvarBio() {
    setSalvandoBio(true);
    setBioSalva(false);
    try {
      await atualizarMinhaBio(bio.trim());
      setBioSalva(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar a bio.');
    } finally {
      setSalvandoBio(false);
    }
  }

  if (carregando) return <Loading />;

  return (
    <Screen title="Registros e bio" subtitle="Conselhos profissionais e apresentação" voltar>
      <Card>
        <Caption>
          Cada registro é conferido separadamente. Somar ou corrigir um registro não tira o selo
          das áreas que já estão verificadas.
        </Caption>
      </Card>

      <Card>
        <SectionTitle>Seus registros</SectionTitle>
        {registros.length ? (
          registros.map((r) => {
            const profissao = profissoes.find((p) => p.codigo === r.profissao);
            return (
              <View key={r.id} style={styles.registro}>
                <View style={styles.registroTexto}>
                  <Body>
                    {profissao?.nome ?? r.profissao}
                    {profissao?.conselhoSigla ? ` · ${profissao.conselhoSigla}` : ''}
                  </Body>
                  <Caption>
                    {r.numero} / {r.uf} · {ROTULOS_STATUS[r.status] ?? r.status}
                  </Caption>
                  {r.status === 'rejeitado' && r.motivoRejeicao ? (
                    <Caption color={Palette.danger}>{r.motivoRejeicao}</Caption>
                  ) : null}
                </View>
                <Button label="Atualizar" variant="ghost" onPress={() => abrirEdicao(r)} />
              </View>
            );
          })
        ) : (
          <Caption>Nenhum registro enviado ainda.</Caption>
        )}
      </Card>

      {disponiveis.length && !form ? (
        <Card>
          <SectionTitle>Somar registro</SectionTitle>
          <Caption>Tem registro em outra área? Envie pra conferência.</Caption>
          <View style={styles.pills}>
            {disponiveis.map((p) => (
              <Pill
                key={p.codigo}
                label={p.conselhoSigla ? `${p.nome} (${p.conselhoSigla})` : p.nome}
                active={false}
                onPress={() => abrirNovo(p)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {form ? (
        <Card>
          <SectionTitle>
            {form.existente ? 'Atualizar' : 'Novo'} registro · {form.profissao.nome}
          </SectionTitle>
          {form.existente ? (
            <Caption>Enviar volta este registro pra conferência. Os outros não mudam.</Caption>
          ) : null}
          <Field
            label={form.profissao.conselhoSigla ? `Número do ${form.profissao.conselhoSigla}` : 'Número do registro'}
            value={form.numero}
            onChangeText={(numero) => setForm({ ...form, numero })}
            placeholder="Ex.: 012345-G"
          />
          <Field
            label="UF do registro"
            value={form.uf}
            onChangeText={(uf) => setForm({ ...form, uf })}
            placeholder="Ex.: SP"
          />
          <Button
            label={
              form.documento
                ? `Documento: ${form.documento.name}`
                : form.existente
                  ? 'Enviar novo documento (opcional)'
                  : 'Enviar foto/PDF da carteirinha'
            }
            variant="ghost"
            onPress={escolherDocumento}
          />
          <View style={styles.acoes}>
            <Button label="Enviar pra conferência" onPress={enviarRegistro} loading={enviando} />
            <Button label="Cancelar" variant="ghost" onPress={() => setForm(null)} disabled={enviando} />
          </View>
        </Card>
      ) : null}

      {aviso ? <Caption color={Palette.accent}>{aviso}</Caption> : null}

      <Card>
        <SectionTitle>Sobre você</SectionTitle>
        <Field
          label="Conte como você atua"
          value={bio}
          onChangeText={(texto) => {
            setBio(texto);
            setBioSalva(false);
          }}
          placeholder="Especialidades, experiência, forma de atendimento..."
          multiline
        />
        <Button label={bioSalva ? 'Bio salva' : 'Salvar bio'} variant="ghost" onPress={salvarBio} loading={salvandoBio} />
      </Card>

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  registro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  registroTexto: {
    flex: 1,
    gap: 2,
  },
  acoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
