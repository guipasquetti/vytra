import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AlunoTabs } from '@/components/aluno-tabs';
import {
  Body,
  Button,
  Caption,
  Card,
  Field,
  Loading,
  Pill,
  RemoveButton,
  Screen,
  SectionTitle,
} from '@/components/ui';
import {
  avisoDaRefeicao,
  ehAnotacao,
  itensReais,
  somaMacros,
  totalConferidoPeloNutricionista,
  type ItemRefeicao,
  type ItemSubstituicao,
  type Refeicao,
} from '@/models/domain';
import {
  calcularGET,
  calcularTMB,
  idadeApartirDe,
  sugerirMacros,
  type FormulaCalculo,
  type Objetivo,
} from '@/models/gastoEnergetico';
import { getProfile, type Profile } from '@/services/authService';
import { obterAnamnese } from '@/services/anamneseService';
import { gerarPlanoComIA } from '@/services/iaService';
import {
  adicionarSubstituicao,
  atualizarSubstituicao,
  itemDeTaco,
  novaRefeicao,
  novoItem,
  planoAlimentarParaEdicao,
  recalcularPorGramas,
  removerSubstituicao,
  salvarPlanoAlimentar,
  substituicaoDeTaco,
  type PlanoAlimentarEditavel,
} from '@/services/dietEditor';
import {
  buscarAlimentos,
  getAlimento,
  getPlanoAlimentar,
  type AlimentoTaco,
} from '@/services/nutritionService';
import { useAuthStore } from '@/store/authStore';
import { MacroColors, Palette, Radius, Spacing } from '@/theme';

const OPCOES_FORMULA: { valor: FormulaCalculo; label: string }[] = [
  { valor: 'mifflin_st_jeor', label: 'Mifflin-St Jeor' },
  { valor: 'harris_benedict', label: 'Harris-Benedict' },
  { valor: 'cunningham', label: 'Cunningham' },
];

const OPCOES_FATOR_ATIVIDADE = [
  { valor: '1.2', label: 'Sedentário (1.2)' },
  { valor: '1.375', label: 'Leve (1.375)' },
  { valor: '1.55', label: 'Moderado (1.55)' },
  { valor: '1.725', label: 'Intenso (1.725)' },
  { valor: '1.9', label: 'Muito intenso (1.9)' },
];

const OPCOES_OBJETIVO: { valor: Objetivo; label: string }[] = [
  { valor: 'deficit', label: 'Déficit' },
  { valor: 'manutencao', label: 'Manutenção' },
  { valor: 'superavit', label: 'Superávit' },
];

export default function EditorDietaScreen() {
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [nomeAluno, setNomeAluno] = useState('');
  const [perfilAluno, setPerfilAluno] = useState<Profile | null>(null);
  const [nivelAtividadeAnamnese, setNivelAtividadeAnamnese] = useState('');
  const [plano, setPlano] = useState<PlanoAlimentarEditavel | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clientId) return;
    const [perfil, atual, anamnese] = await Promise.all([
      getProfile(clientId),
      getPlanoAlimentar(clientId),
      obterAnamnese(clientId),
    ]);
    setNomeAluno(perfil?.nome || 'Aluno');
    setPerfilAluno(perfil);
    setNivelAtividadeAnamnese(anamnese?.respostasCompletas.pratica_atividade ?? '');
    setPlano(planoAlimentarParaEdicao(atual, profile?.nome || ''));
  }, [clientId, profile?.nome]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!plano) return <Loading />;

  function atualizarRefeicao(indice: number, mudanca: Partial<Refeicao>) {
    setPlano((atual) =>
      atual
        ? {
            ...atual,
            refeicoes: atual.refeicoes.map((r, i) => (i === indice ? { ...r, ...mudanca } : r)),
          }
        : atual,
    );
  }

  function atualizarItem(refIndice: number, itemIndice: number, item: ItemRefeicao) {
    setPlano((atual) =>
      atual
        ? {
            ...atual,
            refeicoes: atual.refeicoes.map((r, i) =>
              i === refIndice
                ? { ...r, itens: r.itens.map((it, j) => (j === itemIndice ? item : it)) }
                : r,
            ),
          }
        : atual,
    );
  }

  async function salvar() {
    if (!user || !clientId || !plano) return;
    setErro(null);
    setMensagem(null);
    setSalvando(true);
    try {
      await salvarPlanoAlimentar(clientId, user.id, plano);
      setMensagem('Dieta salva.');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar a dieta.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarPublicacao() {
    if (!user || !clientId || !plano) return;
    setErro(null);
    setMensagem(null);
    setPublicando(true);
    try {
      const novoPlano = { ...plano, publicado: !plano.publicado, geradoPorIa: false };
      await salvarPlanoAlimentar(clientId, user.id, novoPlano);
      setMensagem(
        novoPlano.publicado
          ? 'Dieta publicada — o aluno já pode ver.'
          : 'Dieta despublicada — some da tela do aluno até publicar de novo.',
      );
      setPlano(novoPlano);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui atualizar a publicação.');
    } finally {
      setPublicando(false);
    }
  }

  async function gerarComIA() {
    if (!clientId || !plano) return;

    const temConteudo = plano.refeicoes.some((r) => itensReais(r.itens).length > 0);
    if (temConteudo) {
      Alert.alert(
        'Gerar com IA',
        'Isso substitui a dieta atual por uma sugestão da IA — revise antes de publicar. Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Gerar', style: 'destructive', onPress: executarGeracao },
        ],
      );
      return;
    }
    await executarGeracao();
  }

  async function executarGeracao() {
    if (!clientId) return;
    setErro(null);
    setMensagem(null);
    setGerando(true);
    try {
      const resultado = await gerarPlanoComIA(clientId, 'dieta');
      if (resultado.ok) {
        setMensagem('Dieta gerada — revise e publique quando estiver de acordo.');
        await carregar();
      } else {
        setErro(resultado.bloqueio.message);
      }
    } finally {
      setGerando(false);
    }
  }

  const totalDia = somaMacros(plano.refeicoes.flatMap((r) => itensReais(r.itens)));

  return (
    <Screen title={nomeAluno} subtitle="Plano alimentar">
      <AlunoTabs clientId={clientId!} ativo="dieta" />

      <Card>
        <View style={styles.statusRow}>
          <Pill
            label={plano.publicado ? 'Publicado' : 'Rascunho'}
            active
            color={plano.publicado ? Palette.green : Palette.orange}
          />
          <View style={styles.statusActions}>
            <Button label="Gerar com IA" variant="ghost" onPress={gerarComIA} loading={gerando} />
            <Button
              label={plano.publicado ? 'Despublicar' : 'Publicar'}
              variant="ghost"
              color={plano.publicado ? Palette.orange : Palette.green}
              onPress={alternarPublicacao}
              loading={publicando}
            />
          </View>
        </View>
        <Caption>
          {plano.publicado
            ? 'Visível pro aluno. Edições ficam visíveis assim que salvas.'
            : 'Invisível pro aluno até você publicar — ele vê "seu plano está sendo montado".'}
        </Caption>
      </Card>

      {plano.geradoPorIa && (
        <Card>
          <Caption color={Palette.orange}>
            Sugestão de IA — revise antes de publicar. Qualquer alteração ou publicação já marca
            a dieta como sua.
          </Caption>
        </Card>
      )}

      <Card>
        <View style={styles.totalHeader}>
          <SectionTitle>Total montado</SectionTitle>
          <Caption color={MacroColors.kcal}>
            {Math.round(totalDia.kcal)}
            {plano.meta_kcal ? ` / ${plano.meta_kcal}` : ''} kcal
          </Caption>
        </View>
        <Caption>
          P {Math.round(totalDia.proteina_g)}g · C {Math.round(totalDia.carboidrato_g)}g · G{' '}
          {Math.round(totalDia.lipideos_g)}g
        </Caption>
      </Card>

      <CalculadoraMetaCalorica
        perfilAluno={perfilAluno}
        nivelAtividadeAnamnese={nivelAtividadeAnamnese}
        plano={plano}
        onCalcular={(patch) => setPlano({ ...plano, ...patch })}
      />

      <Card>
        <Field
          label="Período"
          value={plano.periodo}
          onChangeText={(periodo) => setPlano({ ...plano, periodo })}
          placeholder="Ex.: Set/Out 2026"
        />
        <Field
          label="Nutricionista"
          value={plano.nutricionista}
          onChangeText={(nutricionista) => setPlano({ ...plano, nutricionista })}
        />
        <SectionTitle>Metas do dia</SectionTitle>
        <View style={styles.linha}>
          <Field
            label="kcal"
            value={plano.meta_kcal}
            keyboardType="decimal-pad"
            onChangeText={(meta_kcal) => setPlano({ ...plano, meta_kcal })}
          />
          <Field
            label="Proteína (g)"
            value={plano.meta_proteina_g}
            keyboardType="decimal-pad"
            onChangeText={(meta_proteina_g) => setPlano({ ...plano, meta_proteina_g })}
          />
        </View>
        <View style={styles.linha}>
          <Field
            label="Carbo (g)"
            value={plano.meta_carboidrato_g}
            keyboardType="decimal-pad"
            onChangeText={(meta_carboidrato_g) => setPlano({ ...plano, meta_carboidrato_g })}
          />
          <Field
            label="Gordura (g)"
            value={plano.meta_gordura_g}
            keyboardType="decimal-pad"
            onChangeText={(meta_gordura_g) => setPlano({ ...plano, meta_gordura_g })}
          />
        </View>
      </Card>

      {plano.refeicoes.map((refeicao, ri) => (
        <RefeicaoCard
          key={ri}
          refeicao={refeicao}
          podeRemover={plano.refeicoes.length > 1}
          onMudar={(mudanca) => atualizarRefeicao(ri, mudanca)}
          onMudarItem={(ii, item) => atualizarItem(ri, ii, item)}
          onRemover={() =>
            setPlano({ ...plano, refeicoes: plano.refeicoes.filter((_, i) => i !== ri) })
          }
        />
      ))}

      <Button
        label="+ Refeição"
        variant="ghost"
        onPress={() => setPlano({ ...plano, refeicoes: [...plano.refeicoes, novaRefeicao()] })}
      />

      <Card>
        <Field
          label="Observações"
          value={plano.observacoes}
          onChangeText={(observacoes) => setPlano({ ...plano, observacoes })}
          placeholder="Orientações gerais"
        />
      </Card>

      {erro ? <Caption color={Palette.danger}>{erro}</Caption> : null}
      {mensagem ? <Caption color={Palette.green}>{mensagem}</Caption> : null}

      <Button label="Salvar dieta" color={Palette.purple} onPress={salvar} loading={salvando} />
    </Screen>
  );
}

/**
 * Calculadora de meta calórica — puro cálculo determinístico (`gastoEnergetico.ts`), o
 * profissional escolhe fórmula/fator/objetivo e SEMPRE revisa o resultado antes de publicar:
 * "Calcular sugestão" só preenche os campos de meta já existentes, nunca salva sozinho.
 */
function CalculadoraMetaCalorica({
  perfilAluno,
  nivelAtividadeAnamnese,
  plano,
  onCalcular,
}: {
  perfilAluno: Profile | null;
  nivelAtividadeAnamnese: string;
  plano: PlanoAlimentarEditavel;
  onCalcular: (patch: Partial<PlanoAlimentarEditavel>) => void;
}) {
  const [formula, setFormula] = useState<FormulaCalculo>(plano.formulaCalculo ?? 'mifflin_st_jeor');
  const [fatorAtividade, setFatorAtividade] = useState(plano.fatorAtividade || '1.55');
  const [percentualGordura, setPercentualGordura] = useState(plano.percentualGordura);
  const [objetivo, setObjetivo] = useState<Objetivo>('manutencao');

  const sexo = perfilAluno?.sexo as 'feminino' | 'masculino' | 'outro' | null;
  const faltaDado =
    !perfilAluno?.peso_kg ||
    !perfilAluno?.altura_cm ||
    !perfilAluno?.data_nascimento ||
    !sexo ||
    (formula === 'cunningham' && !percentualGordura);

  function calcular() {
    if (!perfilAluno?.peso_kg || !perfilAluno?.altura_cm || !perfilAluno?.data_nascimento || !sexo) return;
    const idade = idadeApartirDe(perfilAluno.data_nascimento);
    const tmb = calcularTMB(formula, {
      pesoKg: perfilAluno.peso_kg,
      alturaCm: perfilAluno.altura_cm,
      idade,
      sexo,
      percentualGordura: percentualGordura ? Number(percentualGordura.replace(',', '.')) : undefined,
    });
    if (tmb == null) return;
    const fator = Number(fatorAtividade.replace(',', '.'));
    const get = calcularGET(tmb, fator);
    const macros = sugerirMacros(get, objetivo, perfilAluno.peso_kg);
    onCalcular({
      formulaCalculo: formula,
      fatorAtividade,
      percentualGordura,
      tmbCalculada: Math.round(tmb),
      getCalculado: get,
      meta_kcal: String(macros.kcal),
      meta_proteina_g: String(macros.proteinaG),
      meta_carboidrato_g: String(macros.carboidratoG),
      meta_gordura_g: String(macros.lipideosG),
    });
  }

  return (
    <Card>
      <SectionTitle>Calculadora de meta calórica</SectionTitle>
      {faltaDado && !(formula === 'cunningham' && !percentualGordura) ? (
        <Caption color={Palette.orange}>
          Complete peso, altura, data de nascimento e sexo no perfil do paciente antes de calcular.
        </Caption>
      ) : null}
      {nivelAtividadeAnamnese ? (
        <Caption color={Palette.textTertiary}>Atividade relatada na anamnese: {nivelAtividadeAnamnese}</Caption>
      ) : null}

      <Caption>Fórmula</Caption>
      <View style={styles.linhaPills}>
        {OPCOES_FORMULA.map((opcao) => (
          <Pill
            key={opcao.valor}
            label={opcao.label}
            active={formula === opcao.valor}
            onPress={() => setFormula(opcao.valor)}
          />
        ))}
      </View>

      {formula === 'cunningham' ? (
        <Field
          label="% de gordura corporal"
          value={percentualGordura}
          keyboardType="decimal-pad"
          onChangeText={setPercentualGordura}
          placeholder="Ex.: 18"
        />
      ) : null}

      <Caption>Fator de atividade</Caption>
      <View style={styles.linhaPills}>
        {OPCOES_FATOR_ATIVIDADE.map((opcao) => (
          <Pill
            key={opcao.valor}
            label={opcao.label}
            active={fatorAtividade === opcao.valor}
            onPress={() => setFatorAtividade(opcao.valor)}
          />
        ))}
      </View>

      <Caption>Objetivo</Caption>
      <View style={styles.linhaPills}>
        {OPCOES_OBJETIVO.map((opcao) => (
          <Pill
            key={opcao.valor}
            label={opcao.label}
            active={objetivo === opcao.valor}
            onPress={() => setObjetivo(opcao.valor)}
          />
        ))}
      </View>

      {plano.tmbCalculada && plano.getCalculado ? (
        <Caption color={Palette.textTertiary}>
          Último cálculo: TMB {plano.tmbCalculada} kcal · GET {plano.getCalculado} kcal
        </Caption>
      ) : null}

      <Button label="Calcular sugestão" variant="ghost" onPress={calcular} disabled={faltaDado} />
    </Card>
  );
}

function RefeicaoCard({
  refeicao,
  podeRemover,
  onMudar,
  onMudarItem,
  onRemover,
}: {
  refeicao: Refeicao;
  podeRemover: boolean;
  onMudar: (mudanca: Partial<Refeicao>) => void;
  onMudarItem: (indice: number, item: ItemRefeicao) => void;
  onRemover: () => void;
}) {
  const itensReaisComIndice = refeicao.itens
    .map((item, indice) => ({ item, indice }))
    .filter(({ item }) => !ehAnotacao(item));
  const total = somaMacros(itensReais(refeicao.itens));
  const conferido = totalConferidoPeloNutricionista(refeicao.itens);
  const aviso = avisoDaRefeicao(refeicao.itens);

  return (
    <Card>
      <View style={styles.refeicaoHeader}>
        <Field
          value={refeicao.nome}
          onChangeText={(nome) => onMudar({ nome })}
          placeholder="Nome da refeição"
        />
        <Caption color={MacroColors.kcal}>{Math.round(total.kcal)} kcal</Caption>
      </View>

      {conferido || aviso ? (
        <Caption color={conferido ? Palette.green : Palette.orange}>
          {conferido
            ? `✓ Total conferido (registrado direto no banco): ${Math.round(conferido.kcal)} kcal`
            : aviso}
        </Caption>
      ) : null}

      {itensReaisComIndice.map(({ item, indice: ii }) => (
        <ItemEditor
          key={ii}
          item={item}
          onMudar={(novo) => onMudarItem(ii, novo)}
          onRemover={() => onMudar({ itens: refeicao.itens.filter((_, i) => i !== ii) })}
        />
      ))}

      <BuscaTaco onEscolher={(item) => onMudar({ itens: [...refeicao.itens, item] })} />

      <Button
        label="+ Item sem TACO"
        variant="ghost"
        onPress={() => onMudar({ itens: [...refeicao.itens, novoItem()] })}
      />

      {podeRemover && <RemoveButton label="Remover refeição" onPress={onRemover} />}
    </Card>
  );
}

function ItemEditor({
  item,
  onMudar,
  onRemover,
}: {
  item: ItemRefeicao;
  onMudar: (item: ItemRefeicao) => void;
  onRemover: () => void;
}) {
  const [gramas, setGramas] = useState(item.quantidade_g ? String(item.quantidade_g) : '');
  const [recalculando, setRecalculando] = useState(false);

  async function aplicarGramas(valor: string) {
    setGramas(valor);
    const n = Number(valor);
    if (!item.taco_id || !n) return;
    setRecalculando(true);
    try {
      const alimento = await getAlimento(item.taco_id);
      onMudar(recalcularPorGramas(item, n, alimento ?? undefined));
    } finally {
      setRecalculando(false);
    }
  }

  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <Caption color={Palette.textTertiary}>
          {item.taco_id ? 'TACO' : 'livre'}
          {item.substituicoes.length ? ` · ${item.substituicoes.length} substituição(ões)` : ''}
        </Caption>
        <RemoveButton label="✕" onPress={onRemover} />
      </View>

      <Field
        value={item.nome}
        onChangeText={(nome) => onMudar({ ...item, nome })}
        placeholder="Nome do alimento"
      />

      {item.taco_id ? (
        <Field
          label={recalculando ? 'Gramas (recalculando…)' : 'Gramas'}
          value={gramas}
          keyboardType="decimal-pad"
          onChangeText={aplicarGramas}
        />
      ) : (
        <Field
          label="Quantidade"
          value={item.quantidade}
          onChangeText={(quantidade) => onMudar({ ...item, quantidade })}
          placeholder="Ex.: 2 fatias (50g)"
        />
      )}

      {item.macros ? (
        <Caption color={Palette.textTertiary}>
          {Math.round(item.macros.kcal)} kcal · P {item.macros.proteina_g}g · C{' '}
          {item.macros.carboidrato_g}g · G {item.macros.lipideos_g}g
        </Caption>
      ) : (
        <Caption color={Palette.orange}>Sem macros — não entra no total do dia</Caption>
      )}

      {item.obs ? <Caption color={Palette.textTertiary}>{item.obs}</Caption> : null}

      <Caption>Substituições</Caption>
      {item.substituicoes.map((sub, si) => (
        <SubstituicaoEditor
          key={si}
          substituicao={sub}
          onMudar={(patch) => onMudar(atualizarSubstituicao(item, si, patch))}
          onRemover={() => onMudar(removerSubstituicao(item, si))}
        />
      ))}
      <View style={styles.linha}>
        <Button
          label="+ Substituição"
          variant="ghost"
          onPress={() => onMudar(adicionarSubstituicao(item))}
        />
      </View>
    </View>
  );
}

function SubstituicaoEditor({
  substituicao,
  onMudar,
  onRemover,
}: {
  substituicao: ItemSubstituicao;
  onMudar: (patch: Partial<ItemSubstituicao>) => void;
  onRemover: () => void;
}) {
  return (
    <View style={styles.substituicao}>
      <View style={styles.linha}>
        <Field
          value={substituicao.nome}
          onChangeText={(nome) => onMudar({ nome })}
          placeholder="Nome da substituição"
        />
        <RemoveButton label="✕" onPress={onRemover} />
      </View>
      <View style={styles.linha}>
        <Field
          value={substituicao.quantidade}
          onChangeText={(quantidade) => onMudar({ quantidade })}
          placeholder="Ex.: 100g"
        />
        <BuscaTacoInline
          onEscolher={(alimento) => onMudar(substituicaoDeTaco(alimento, 100))}
        />
      </View>
      {substituicao.macros ? (
        <Caption color={Palette.textTertiary}>
          {Math.round(substituicao.macros.kcal)} kcal · P {substituicao.macros.proteina_g}g · C{' '}
          {substituicao.macros.carboidrato_g}g · G {substituicao.macros.lipideos_g}g
        </Caption>
      ) : null}
    </View>
  );
}

function BuscaTacoInline({ onEscolher }: { onEscolher: (alimento: AlimentoTaco) => void }) {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<AlimentoTaco[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);

  async function buscar() {
    setBuscando(true);
    try {
      setResultados(await buscarAlimentos(termo));
    } finally {
      setBuscando(false);
    }
  }

  if (!aberto) {
    return <Button label="TACO" variant="ghost" onPress={() => setAberto(true)} />;
  }

  return (
    <View style={styles.busca}>
      <View style={styles.linha}>
        <Field value={termo} onChangeText={setTermo} placeholder="Buscar na TACO" />
        <Button label="Buscar" variant="ghost" onPress={buscar} loading={buscando} />
      </View>
      {resultados.map((alimento) => (
        <Card
          key={alimento.id}
          style={styles.resultado}
          onPress={() => {
            onEscolher(alimento);
            setResultados([]);
            setTermo('');
            setAberto(false);
          }}>
          <Body>{alimento.nome}</Body>
        </Card>
      ))}
    </View>
  );
}

function BuscaTaco({ onEscolher }: { onEscolher: (item: ItemRefeicao) => void }) {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<AlimentoTaco[]>([]);
  const [buscando, setBuscando] = useState(false);

  async function buscar() {
    setBuscando(true);
    try {
      setResultados(await buscarAlimentos(termo));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <View style={styles.busca}>
      <View style={styles.linha}>
        <Field
          value={termo}
          onChangeText={setTermo}
          placeholder="Buscar alimento na TACO"
        />
        <Button label="Buscar" variant="ghost" onPress={buscar} loading={buscando} />
      </View>

      {resultados.map((alimento) => (
        <Card
          key={alimento.id}
          style={styles.resultado}
          onPress={() => {
            onEscolher(itemDeTaco(alimento, 100));
            setResultados([]);
            setTermo('');
          }}>
          <Body>{alimento.nome}</Body>
          <Caption>
            {Math.round(alimento.kcal ?? 0)} kcal/100g · P {alimento.proteina_g ?? 0}g · C{' '}
            {alimento.carboidrato_g ?? 0}g · G {alimento.lipideos_g ?? 0}g
          </Caption>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  totalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linha: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-end',
  },
  linhaPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  refeicaoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  item: {
    backgroundColor: Palette.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  busca: {
    gap: Spacing.sm,
  },
  substituicao: {
    backgroundColor: Palette.surfaceElevated,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  resultado: {
    backgroundColor: Palette.surfaceElevated,
    padding: Spacing.md,
    gap: 2,
  },
});
