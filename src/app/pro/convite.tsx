import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Body, Button, Caption, Card, EmptyState, Field, Screen, SectionTitle } from '@/components/ui';
import { baseUrl } from '@/lib/baseUrl';
import { criarConvite, reenviarConvite } from '@/services/professionalService';
import { vincularConviteAoLead } from '@/services/leadsService';
import { useAuthStore } from '@/store/authStore';
import { Palette, Radius, RoleColors, Spacing, FontSize } from '@/theme';

/**
 * Convite só nasce de um lead (decisão do Guilherme, 04/set): antes da call de sensibilização
 * não tem nome/e-mail de verdade pra colocar aqui, e o lead não entenderia receber um link
 * "frio". `leadId` vem do card do lead em `pro/leads.tsx` — sem ele, a tela só orienta a criar
 * o lead primeiro, não deixa gerar convite às cegas.
 *
 * Sem plano aqui (04/set, segunda correção): o paciente escolhe o plano dentro do app, depois
 * de criar a conta — ver `OnboardingAnamnese`. Esta tela só identifica quem vai receber o link.
 *
 * Reenvio (14/set): quando vem `conviteId` na URL (botão "Reenviar convite" do lead que já
 * tinha convite), esta mesma tela regenera o token na linha existente em vez de criar convite
 * novo — nome/e-mail só exibidos, não editáveis, porque não fazem parte do reenvio.
 */
export default function ConviteScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const params = useLocalSearchParams<{ leadId?: string; conviteId?: string; nome?: string; email?: string }>();
  const reenviando = !!params.conviteId;
  const [nome, setNome] = useState(params.nome ?? '');
  const [email, setEmail] = useState(params.email ?? '');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function gerar() {
    if (!user || !params.leadId) return;

    if (reenviando) {
      setErro(null);
      setCriando(true);
      try {
        const token = await reenviarConvite(params.conviteId!);
        setLink(`${baseUrl()}/convite/${token}`);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não consegui reenviar o convite.');
      } finally {
        setCriando(false);
      }
      return;
    }

    if (!nome.trim() || !email.trim()) {
      setErro('Preenche nome e e-mail.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErro('E-mail parece inválido.');
      return;
    }
    setErro(null);
    setCriando(true);
    try {
      const convite = await criarConvite({
        professionalId: user.id,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        leadId: params.leadId,
      });
      await vincularConviteAoLead(params.leadId, convite.id);
      setLink(`${baseUrl()}/convite/${convite.token}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui gerar o convite.');
    } finally {
      setCriando(false);
    }
  }

  if (!params.leadId) {
    return (
      <Screen title="Convidar aluno" voltar>
        <EmptyState text="O convite parte de um lead — cria o lead e registra a call de sensibilização antes de gerar o link." />
        <Button label="Ir para Leads" onPress={() => router.push('/pro/leads')} />
      </Screen>
    );
  }

  if (link) {
    return (
      <Screen title={reenviando ? 'Convite reenviado' : 'Convite gerado'} voltar>
        <Card>
          <SectionTitle>Link do convite</SectionTitle>
          <Body>{nome}</Body>
          <Caption>{email}</Caption>
          <TextInput
            style={styles.linkInput}
            value={link}
            editable={false}
            selectTextOnFocus
            multiline
          />
          <Caption>
            {reenviando
              ? 'O link anterior parou de funcionar — mande esse pelo WhatsApp de sempre.'
              : 'Toque no link e copie — mande pelo WhatsApp de sempre. O plano é escolhido pelo próprio aluno dentro do app, depois de criar a conta.'}
          </Caption>
        </Card>
        <Button label="Voltar pros leads" onPress={() => router.push('/pro/leads')} />
      </Screen>
    );
  }

  return (
    <Screen
      title={reenviando ? 'Reenviar convite' : 'Convidar aluno'}
      subtitle={reenviando ? 'Gera um link novo pra este lead — o antigo para de funcionar' : 'Gera o link de acesso pra este lead'}
      voltar>
      <Card>
        <Field
          label="Nome"
          value={nome}
          onChangeText={setNome}
          placeholder="Nome do paciente"
          editable={!reenviando}
        />
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="email@paciente.com"
          keyboardType="default"
          editable={!reenviando}
        />
      </Card>

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
      <Button label={reenviando ? 'Reenviar convite' : 'Gerar convite'} onPress={gerar} loading={criando} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkInput: {
    backgroundColor: Palette.surfaceElevated,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: RoleColors.profissional,
    fontSize: FontSize.small,
  },
});
