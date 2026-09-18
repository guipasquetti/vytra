# Vytra — Roadmap de produto

> Atualizado em 12 de setembro de 2026. Este arquivo consolida a direção ativa do produto; `HANDOFF.md` continua sendo a fonte canônica de estado técnico e decisões operacionais.

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
- Versionamento completo de planos e comparação de evolução por ciclo.
- Indicadores agregados de negócio e aderência por profissional.
- White-label visual, integrações de saúde, marketplace/diretório e apps nativos.

## Itens explicitamente fora deste ciclo

- Compartilhamento indiscriminado de anamnese/dados de saúde entre profissionais.
- Marketplace e descoberta pública de profissionais.
- Cobrança processada dentro do aplicativo.

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
- Situação de pagamento corresponde ao acesso concedido para profissional e paciente.
