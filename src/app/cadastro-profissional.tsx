import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Body, Button, Caption, Card, Field, Pill, Screen, SectionTitle } from '@/components/ui';
import { signUp } from '@/services/authService';
import { cadastrarProfissional, uploadDocumentoVerificacao } from '@/services/verificacaoService';
import { Palette, Spacing } from '@/theme';

/**
 * Cadastro de profissional (§0, 04/set): "não podemos abrir isso pra qualquer um se
 * cadastrar" — CREF/CRN não têm API pública de verificação no Brasil, então o cadastro cria
 * conta liberada na hora (Painel/Leads/Planos funcionam), mas com verificação humana
 * pendente — banner visível até um admin conferir e aprovar. Rota pública, top-level (fora
 * de `/pro`), whitelisted em `src/app/_layout.tsx` igual à rota `/convite`.
 */

const ESPECIALIDADES = [
  { valor: 'personal_trainer', label: 'Educador físico (CREF)' },
  { valor: 'nutricionista', label: 'Nutricionista (CRN)' },
];

export default function CadastroProfissionalScreen() {
  const router = useRouter();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [especialidade, setEspecialidade] = useState<string | null>(null);
  const [cpf, setCpf] = useState('');
  const [numeroRegistro, setNumeroRegistro] = useState('');
  const [ufRegistro, setUfRegistro] = useState('');
  const [bio, setBio] = useState('');
  const [documento, setDocumento] = useState<{ uri: string; name: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolherDocumento() {
    const resultado = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (resultado.canceled || !resultado.assets?.[0]) return;
    const arquivo = resultado.assets[0];
    setDocumento({ uri: arquivo.uri, name: arquivo.name });
  }

  async function cadastrar() {
    if (!nome.trim() || !email.trim() || !senha || !especialidade) {
      setErro('Preenche nome, e-mail, senha e escolhe a especialidade.');
      return;
    }
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (cpf.replace(/\D/g, '').length !== 11) {
      setErro('CPF precisa ter 11 dígitos.');
      return;
    }
    if (!numeroRegistro.trim() || ufRegistro.trim().length !== 2) {
      setErro('Preenche o número do registro e a UF (2 letras).');
      return;
    }
    if (!documento) {
      setErro('Envia uma foto ou PDF da carteirinha do conselho.');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const { session, user } = await signUp(email.trim().toLowerCase(), senha, nome.trim());
      if (!session || !user) {
        setErro('Conta criada — confirme seu e-mail e depois entre normalmente pra concluir.');
        return;
      }
      const documentoPath = await uploadDocumentoVerificacao(user.id, documento);
      const ok = await cadastrarProfissional({
        nome: nome.trim(),
        especialidade,
        cpf: cpf.replace(/\D/g, ''),
        numeroRegistro: numeroRegistro.trim(),
        ufRegistro: ufRegistro.trim().toUpperCase(),
        documentoPath,
        bio: bio.trim() || undefined,
      });
      if (!ok) {
        setErro('Não consegui concluir o cadastro. Tenta de novo ou fala com a gente.');
        return;
      }
      setConcluido(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui criar seu cadastro.');
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <Screen title="Cadastro enviado" voltar>
        <Card>
          <SectionTitle>Falta pouco</SectionTitle>
          <Body>
            Sua conta já está liberada — você pode montar planos e convidar alunos agora.
          </Body>
          <Caption>
            Seu registro ({numeroRegistro}/{ufRegistro.toUpperCase()}) está em análise. Assim
            que confirmarmos, o aviso de verificação pendente some do seu Painel.
          </Caption>
          <Button label="Ir para o Painel" onPress={() => router.replace('/pro')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Cadastro de profissional"
      subtitle="Só pra quem tem registro válido no conselho"
      voltar>
      <Card>
        <Caption>
          Pra manter a confiança de quem usa o app, todo profissional passa por verificação
          manual do CREF/CRN antes de aparecer como verificado. Sua conta já funciona enquanto
          isso — é só uma etapa de confiança, não um bloqueio.
        </Caption>
      </Card>

      <Card>
        <SectionTitle>Seus dados</SectionTitle>
        <Field label="Nome completo" value={nome} onChangeText={setNome} placeholder="Seu nome" />
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
        />
        <Field
          label="Senha (mín. 8 caracteres)"
          value={senha}
          onChangeText={setSenha}
          placeholder="Crie uma senha"
        />
        <Field label="CPF" value={cpf} onChangeText={setCpf} placeholder="Só números" keyboardType="number-pad" />
      </Card>

      <Card>
        <SectionTitle>Especialidade</SectionTitle>
        <View style={styles.pills}>
          {ESPECIALIDADES.map((e) => (
            <Pill
              key={e.valor}
              label={e.label}
              active={especialidade === e.valor}
              onPress={() => setEspecialidade(e.valor)}
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
          label={documento ? `Documento: ${documento.name}` : 'Enviar foto/PDF da carteirinha'}
          variant="ghost"
          onPress={escolherDocumento}
        />
      </Card>

      <Card>
        <SectionTitle>Sobre você (opcional)</SectionTitle>
        <Field
          label="Conte como você atua"
          value={bio}
          onChangeText={setBio}
          placeholder="Especialidades, experiência, forma de atendimento..."
          multiline
        />
      </Card>

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
      <Button label="Criar cadastro" onPress={cadastrar} loading={enviando} />
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
