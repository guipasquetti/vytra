# Vytra — Roadmap de produto

> Atualizado em 14 de outubro de 2026 (nova frente: amplitude de trabalho do profissional). Este arquivo consolida a direção ativa do produto; `HANDOFF.md` continua sendo a fonte canônica de estado técnico e decisões operacionais.

## Objetivo

Lançar uma plataforma SaaS white-label em que nutricionistas e educadores físicos verificados gerenciam os seus próprios pacientes, enquanto cada paciente recebe uma experiência única, porém claramente separada por profissional e serviço contratado.

## Princípios de produto

- Há **duas relações comerciais independentes**: profissional → Vytra (SaaS) e paciente → profissional (serviço clínico).
- A relação paciente ↔ profissional é N:N. Cada vínculo possui serviço, acesso, cobrança e dados de acompanhamento próprios.
- O núcleo operacional é compartilhado; as experiências clínicas são especializadas por função.
- Dados de saúde seguem mínimo acesso, RLS e consentimento por vínculo profissional. Nenhum painel pode expor dados de outro profissional sem necessidade clínica e autorização.
- A primeira entrega continua web-first; não ampliar para marketplace, white-label visual completo ou app nativo antes de validar o fluxo central.

## Estado atual

| Tema | Estado |
| --- | --- |
| Base multi-tenant, autenticação, RLS e cadastro verificado | Concluído |
| Leads, convite, onboarding do paciente, serviços comerciais e agenda | Concluído |
| Prescrição de treino e alimentação; execução de treino; lista de compras | Concluído para o piloto |
| Check-in, peso, fotos e alertas básicos | Em migração para escopo por assinatura |
| Painéis e dados especializados por função | Não iniciado |
| Cobrança recorrente do profissional e do paciente | Não iniciado |
| Amplitude de trabalho do profissional (biblioteca, modelos, versões, PDF e camadas 2 e 3) | Planejado em 14/out — Camada 1 detalhada, nada implementado |
| Lista de compras com carrinho de loja parceira patrocinadora (item 7) | Decisão de direção em 14/out — nada implementado, depende de política de privacidade e de parceiro |

## Progresso desta frente

| Frente | Situação | Restante |
| --- | --- | --- |
| Check-ins por acompanhamento | Publicado em produção | Validar o cenário real com paciente, nutricionista e treinador distintos |
| Painel de nutrição | Base publicada | Indicadores, alertas, anamnese e revisão nutricionais próprios |
| Painel de treino | Base publicada | Indicadores, alertas, avaliação física e progressão de treino próprios |
| Área unificada do paciente | Parcial | Identificar responsável e módulo em todos os planos, consultas e estados |
| Assinatura SaaS do profissional | Não iniciado | Definir gateway, planos, checkout, webhooks e portal de cobrança |
| Pagamento do serviço do paciente | Manual | Definir gateway e regras de ativação, renovação, falha e cancelamento |

**Leitura de escopo:** a fundação de dados foi publicada; a validação multi-profissional é o
único fechamento pendente desta entrega. Os painéis por especialidade e a cobrança ainda
representam a maior parte do trabalho planejado desta frente.

## Agora — Fundação de especialidades

### 1. Separar acompanhamento por profissional e função

**Resultado:** cada nutricionista e treinador acompanha somente os dados e ações do seu serviço.

**Status:** Publicado — migration aplicada em produção e bundle web promovido. Falta somente a
validação observacional com paciente atendido por nutricionista e treinador distintos.

- Formalizar `nutricionista` e `educador_fisico` como especialidades permitidas e definir uma especialidade principal por conta na v1.
- Vincular check-ins, evolução, alertas e permissões à assinatura paciente ↔ profissional, nunca ao primeiro profissional disponível.
- Delimitar anamnese comum, anamnese nutricional e avaliação física; revisar RLS e consentimento antes da migração.
- Preservar dados existentes e criar uma migração reversível, com prova de isolamento para o piloto.

**Dependências:** decisão de campos clínicos mínimos por especialidade; revisão de RLS/LGPD.

**Pontos abertos antes dos painéis:**

- Quais campos pertencem à anamnese comum, à nutricional e à avaliação física.
- Se fotos e medidas pertencem a um acompanhamento específico ou podem ser compartilhadas com consentimento explícito.
- Quais alertas são essenciais para cada especialidade no primeiro painel.
- Gateway de pagamento, regras de período de teste e política de bloqueio por inadimplência.

### 2. Painéis profissionais especializados

**Resultado:** cada profissional abre o Vytra e vê prioridades coerentes com a sua prática.

**Status:** Em andamento — o painel já adapta linguagem, prescrição pendente e alertas de
inatividade à especialidade. Os indicadores e formulários clínicos próprios ainda precisam ser
construídos.

- Núcleo comum: Início, Pacientes, Leads, Serviços, Agenda, Perfil e cobrança.
- Painel de nutrição: adesão alimentar, revisões de plano, medidas, sintomas/sinais e próximos retornos.
- Painel de treino: frequência, cargas, treino pendente, evolução, recuperação/limitações e próximos retornos.
- Resumo do paciente mostra apenas módulos contratados e ações permitidas para aquele profissional.

**Dependência:** item 1.

### 3. Área unificada do paciente

**Resultado:** a pessoa entende em segundos o que deve fazer hoje, sem misturar os dois acompanhamentos.

- Home por módulos ativos: Nutrição e/ou Treino.
- Identidade explícita do profissional responsável em cada plano, check-in, consulta e conversa.
- Check-in e evolução específicos por acompanhamento; dados gerais aparecem apenas quando fizer sentido e houver consentimento.
- Estados claros para convite, serviço solicitado, pagamento pendente, plano em construção, plano publicado, pausa e encerramento.

**Dependências:** itens 1 e 2.

## Próximo — Receita e operação confiável

### 4. Assinatura SaaS do profissional

**Resultado:** profissional verificado contrata o Vytra, gerencia a assinatura e recebe o acesso correto.

- Planos SaaS, checkout hospedado, webhook idempotente, período de teste e portal de cobrança.
- Estados: pendente, ativo, em atraso, cancelado e bloqueado; acesso alinhado ao estado.
- Faturas, tentativa de recuperação e trilha de auditoria.

### 5. Cobrança do serviço do paciente

**Resultado:** paciente contrata e renova um serviço por profissional sem operação manual.

- Cobrança externa/tokenizada; o app nunca processa nem armazena dados de cartão.
- Pagamento, renovação, falha, pausa e cancelamento refletem a assinatura paciente ↔ profissional.
- Confirmação de serviço somente após pagamento/decisão operacional definida.

### 6. Comunicação e cadência

**Resultado:** os dois lados recebem a próxima ação no momento correto.

- Lembretes no app/e-mail para check-ins, consultas, renovação e pendências.
- Mensagens assíncronas por vínculo paciente ↔ profissional.
- Histórico longitudinal de orientações e mudanças de plano.

### 7. Lista de compras com carrinho de loja parceira patrocinadora

**Decisão do Guilherme (14/out):** o Vytra **não vende dentro do app**; facilita a compra por link,
e a compra termina no checkout da loja. A ideia é uma **loja ou mercado de produtos naturais** que
patrocine o **Vytra** (a plataforma), sem se prender a marcas. A Growth **fica fora** por enquanto
(decisão registrada no HANDOFF §75).

**Resultado:** o paciente toca em "Levar a lista para o carrinho" e a loja abre com os itens já no
carrinho. O pagamento e a entrega acontecem na loja.

- **Montagem do carrinho:** correspondência alimento da TACO → produto (SKU) da loja, e um link de
  carrinho com itens e quantidades. Lojas em Shopify e VTEX costumam aceitar esse formato (do meu
  conhecimento; **confirmar com cada loja**). Item sem correspondência fica fora do carrinho e a
  tela avisa, sem errar em silêncio.
- **Várias lojas**, e o paciente escolhe. Ordem de exibição transparente, nunca por pagamento.
- **Só alimentos na v1.** Suplementos ficam de fora (voltam o Art. 60 e o 63 do CFN e a regra da
  Anvisa).
- **O patrocínio não toca no clínico:** não altera o cardápio, o que o profissional prescreve nem o
  que a IA sugere. **Nenhum repasse ao profissional**, porque benefício a ele reativa o Art. 49 e o
  Art. 64 do código de ética (Res. CFN 599/2018, lida em 14/out).
- **Aviso de patrocínio** visível ("Parceiro patrocinador do Vytra") e opção de o profissional
  **desligar** o recurso para os próprios pacientes.
- **LGPD:** só sai do app a lista de itens e quantidades, **sem identificador do paciente**, e só
  quando o paciente aperta o botão. Mesmo assim uma lista de compras permite inferir a dieta:
  entra na política de privacidade e no rótulo de privacidade da App Store.
- **Modelo comercial:** começar por **afiliado, sem custo fixo**; negociar cota ou destaque só com
  escala. Hoje o Vytra tem um profissional e um piloto.
- **Lojas e pagamento:** pagamento fora do app (Apple 3.1.3(e), lido em fonte secundária). O app só
  abre o link `https://` validado.

**Dependências:** política de privacidade e termos (pendência 4 do HANDOFF §73), F4b (compartilhar
a lista), ao menos uma loja parceira com link de carrinho, e uma consulta ao CRN sobre patrocínio da
plataforma. **Nada disto é parecer jurídico**; o Tassis deve confirmar com o conselho ou com um
advogado do setor.

**Perguntas para a loja:** aceita link de carrinho com itens e quantidades? Fornece catálogo (feed
ou API) com preço e disponibilidade? Qual comissão, e como atribui a venda sem identificar o
paciente? Exige exclusividade? (Recusar no início.)

## Frente transversal — Amplitude de trabalho do profissional (benchmark de 14/out)

**Por que existe.** Hoje o profissional prescreve e acompanha, mas **não consegue aprofundar o
próprio trabalho dentro do app**: não reutiliza o que fez, não busca exercício, não entrega o plano
em arquivo, não revisita o que prescreveu e não mede o paciente além do peso. O objetivo é o
Vytra ser a ferramenta **mais completa do mercado** para nutricionista e educador físico, sem
perder o que já o diferencia.

**Como medir "mais completo".** Não é uma promessa de marketing, é uma lista verificável: **paridade
nas funções que o nicho trata como básicas** (camadas 1 e 2) **mais os diferenciais abaixo**
(camada 3 e o que só o Vytra tem). O benchmark é refeito a cada trimestre; o artifact
[`Benchmark de Concorrentes`](https://claude.ai/code/artifact/bb96e86e-042e-4231-a89e-263f9f0e18da)
e o HANDOFF §30 e §74 guardam as fontes. As referências abaixo vêm de páginas oficiais lidas em
14/out; onde a página não confirmou a função, isso está dito.

**Estado de partida (conferido no código em 14/out).**
- **Treino:** exercício é texto livre (séries, faixa de repetições, descanso, aquecimento, feeder,
  observação, vídeo por link, cronometrado, sensível ao ombro). Um plano por aluno. Sem biblioteca
  no editor (38 ilustrações estáticas e uma lista de nomes copiada à mão na Edge Function), sem
  modelos, sem carga prescrita (RPE/RIR, %, cadência), sem métodos (bi-set, circuito, drop), sem
  periodização nem regra de progressão (a sugestão de carga é fixa, §11).
- **Dieta:** só a tabela TACO. A TACO **já guarda fibra, sódio, cálcio e ferro**, mas o tipo
  `Macros` do app carrega só kcal, proteína, carboidrato e lipídeo, então essa informação é
  descartada. Substituição manual, sem receitas, sem modelos, sem equivalentes automáticos.
- **Geral:** sem PDF, sem versões do plano, sem antropometria, sem diário alimentar, sem
  formulários além da anamnese, sem mensagens, sem equipe.

### Camada 1 — Produtividade (começa primeiro; sem dado clínico novo)

Plano de implementação em [`docs/produto/camada-1-ferramentas-profissional.md`](docs/produto/camada-1-ferramentas-profissional.md).

| Fase | Entrega | Referência de mercado | Dependência |
| --- | --- | --- | --- |
| F1 | Biblioteca de exercícios pesquisável, com exercício próprio; vira a fonte única do catálogo da IA | TrueCoach (milhares de vídeos e exercício próprio) | build 6 validado |
| F2 | Modelos próprios de treino e de cardápio; aplicar sempre cria rascunho | TrueCoach (modelos copiáveis), WebDiet (100+ modelos), Nutrium | F1 |
| F3 | Histórico de versões do plano: ver, comparar, restaurar como rascunho | não confirmado nos concorrentes lidos | confirmar rascunho/publicado em `planos_alimentares` |
| F4 | PDF de treino e de dieta, com identidade do profissional | WebDiet, TrueCoach | web primeiro; nativo exige novo build |
| F4b | Compartilhar a lista de compras como texto (abre a folha de compartilhamento do sistema) | Dietbox (lista no app do paciente) | nenhuma |
| F5 | Mais de um plano por vínculo | Trainerize (multi-treinador) | **bloqueada**: item 1 e item 3 desta lista e nova chave de histórico |

**Não entra na Camada 1:** modelos "starter" da Vytra (responsabilidade clínica), upload de vídeo
próprio, compartilhar modelo entre profissionais.

### Camada 2 — Profundidade clínica e de treino

| # | Entrega | Referência de mercado | Risco e dependência |
| --- | --- | --- | --- |
| 5 | **Antropometria completa:** medidas, circunferências, dobras, protocolos de composição corporal, %G, massa magra, relação cintura-quadril, gráficos e comparação entre datas | Nutrium (equações preditivas), WebDiet (composição por fotos) | dado de saúde novo: tabela por vínculo, RLS por assinatura, consentimento; escopo por profissão |
| 6 | **Dieta de verdade:** carregar fibra, sódio, cálcio e ferro (já na TACO), totais diários, segunda tabela de alimentos, **receitas próprias** com cálculo, **equivalentes automáticos** | Nutrium, WebDiet | verificar licença e dados da TBCA antes de importar; ampliar `Macros` de forma aditiva |
| 7 | **Treino de verdade:** RPE/RIR, % de carga, cadência, métodos (bi-set, circuito, drop, cluster), blocos e **periodização** com datas e deload, **progressão configurável**, analytics do profissional (volume por grupo, recordes, adesão) | espaço em aberto: a página do TrueCoach não lista RPE, progressão nem volume | campos aditivos em `plans.dias`; `workout_logs` já tem a base de dados |
| 8 | **Diário alimentar livre e recordatório de 24h** | Dietbox, Trainerize, Nutrium | gap já ranqueado no HANDOFF §30 (2/5) |
| 9 | **Formulários personalizados** (triagem, pré-consulta, avaliação própria) com respostas por vínculo | WebDiet, Everfit | reaproveitar o motor da anamnese e do check-in |
| 10 | **Exames laboratoriais e suplementos** | Dietbox (exames e fitoterápicos), WebDiet (interpretação por IA) | **regra do conselho por profissão** e LGPD alta; decidir antes de qualquer tabela |

### Camada 3 — Inteligência, operação e negócio

| # | Entrega | Referência de mercado | Risco e dependência |
| --- | --- | --- | --- |
| 11 | **Risco de abandono e relatório semanal** automáticos, usando check-in, treino e dieta que já existem | TrueCoach (alerta de adesão), Trainerize (relatório semanal e tags automáticas) | baixo: só leitura de dado existente |
| 12 | **IA clínica assistida:** interpretar exames, resumir consulta, revisar anamnese; sempre com revisão obrigatória do profissional | WebDiet, Nutrium | LGPD (§0), teto de custo diário (§73), consentimento; prolonga o §40 |
| 13 | **Mensagens por vínculo e automações:** fim de plano, paciente sumido, aniversário, lembretes; WhatsApp | LiveClin, Dietbox, Trainerize | API oficial do WhatsApp, custo por mensagem e base legal para dado de saúde em canal de terceiro |
| 14 | **Equipe e secretária**, com financeiro opcional por profissional | Dietbox, Nutrium | modelo de permissão por papel em cima do multi-tenant |
| 15 | **Cobrança** do paciente e do profissional; depois **marca própria** | Everfit, TrueCoach, Trainerize | itens 4 e 5 acima; bloqueada por CNPJ |
| 16 | **Indicadores do negócio** (retenção, receita por profissional) | Everfit, TrueCoach | depende do item 15 |

### O que o Vytra já tem e não deve perder

Funil lead → convite → cadastro automático; análise por IA das fotos de check-in e da anamnese
(§56, §64); geração de plano a partir da anamnese com revisão e **com as fórmulas do próprio
profissional** (§40); selo de profissional verificado e declaração de responsabilidade (§45, §48);
calculadora de gasto energético com três fórmulas (§27); prontuário evolutivo e anexos (§33, §35).
**Correção do benchmark de 11/set:** a lista de compras **não é exclusiva** do Vytra, pois a página
do Dietbox a lista no app do paciente. Falta comparar se a deles é dinâmica como a nossa antes de
tratar isso como diferencial.

**O diferencial a aprofundar:** um paciente atendido por **nutricionista e treinador no mesmo
lugar**, com dado compartilhado só com consentimento (itens 1 e 3 acima). Nos concorrentes lidos
não vi isso como função central. É onde a "equipe multiprofissional" pode virar o argumento de
venda, e por isso a F5 e a Camada 2 devem respeitar o escopo por vínculo.

### Regras desta frente

- **Segurança e LGPD primeiro** (HANDOFF §0): cada item que toca dado de saúde registra quem lê,
  que superfície cria e qual base legal usa antes de virar tabela.
- **Não copiar:** vídeos, textos, telas ou código de concorrente. A lista de referências serve para
  não deixar passar função básica, não para reproduzir produto.
- **Escopo por profissão:** antropometria, exame e suplemento seguem o que cada conselho permite;
  fisioterapia continua inativa no catálogo (§58) até decisão do Guilherme e do Tassis.
- **Uma fase por vez**, cada uma com migração reversível, verificação de RLS e atualização do
  HANDOFF.

## Depois — Expansão validada

- **Biblioteca visual inclusiva de modelos e referências** — criar variações consistentes de
  pele/etnia, traços e cabelo para ilustrações de exercícios, guias de câmera e imagens de
  onboarding. A seleção será definida pelo contexto visual da tela e por uma rotação curada da
  biblioteca, para que a experiência não fique predominantemente branca; nunca inferir,
  registrar ou exigir raça/etnia do paciente para escolher uma imagem. Dependências: sistema de
  direção de arte, revisão de acessibilidade/representação e revalidação clínica das poses.
  **Status: Em andamento — biblioteca inicial de 16 referências (quatro ângulos para quatro
  representações) criada e primeiro lote com quatro exercícios diversos integrado ao catálogo
  estático. Regra adotada: novos exercícios devem alternar representações de forma equilibrada;
  faltam outras representações e a regra de curadoria/rotação no app.**
- Versionamento completo de planos e comparação de evolução por ciclo. **O recorte essencial
  (histórico, comparar e restaurar como rascunho) foi puxado para a Camada 1, fase F3**; fica aqui
  só a comparação de evolução clínica entre ciclos.
- Indicadores agregados de negócio e aderência por profissional.
- White-label visual, integrações de saúde, marketplace/diretório e apps nativos.

## Itens explicitamente fora deste ciclo

- Compartilhamento indiscriminado de anamnese/dados de saúde entre profissionais.
- Marketplace e descoberta pública de profissionais.
- Cobrança processada dentro do aplicativo.
- **Vitrine de suplementos ou de marca patrocinadora do profissional** (a Growth, do Tassis, fica fora, decisão de 14/out): indicar ou divulgar marca por quem prescreve esbarra nos Arts. 49, 60, 63 e 64 do código de ética do nutricionista. Reabrir só com resposta do CRN e com o contrato do profissional em mãos.

## IA para sugestão de dieta/treino (decisão 11/set)

Reaberta como direção do produto — não é mais "fora de ciclo". Guilherme quer o profissional
revisando (não digitando do zero) uma sugestão de dieta/treino que a IA (Claude API) monta a
partir da anamnese. Condição explícita dele: toda sugestão tem que se basear nas fórmulas e
parâmetros que o próprio profissional configura no painel — a IA nunca decide sozinha o cálculo
de meta calórica. Sequenciamento escolhido: primeiro os painéis completos e a calculadora
determinística de meta calórica (HANDOFF.md §27, Entrega 2), depois a IA entra em cima desse
dado real e dessa configuração já existente. Ainda não iniciado — nenhuma chamada a IA/LLM
existe no código.

## Métricas de validação

- 100% dos pacientes com dois profissionais veem módulos e check-ins corretamente separados.
- Nenhum profissional visualiza dados clínicos fora de seu vínculo autorizado.
- Tempo para localizar a próxima ação no painel inferior a um minuto em teste observacional.
- Profissional verificado consegue contratar, ativar e manter o Vytra sem intervenção manual.
- Montar o treino ou o cardápio de um aluno novo a partir de um modelo próprio leva menos de 3 minutos.
- Nenhum modelo, exercício próprio ou histórico de versão é visível a outro profissional (teste de RLS com dois profissionais).
- O profissional consegue entregar o plano em PDF sem sair do app e sem que o arquivo fique guardado no servidor.
- O benchmark de concorrentes é refeito a cada trimestre, e cada lacuna encontrada vira item nesta lista ou decisão registrada de não fazer.
- Situação de pagamento corresponde ao acesso concedido para profissional e paciente.
