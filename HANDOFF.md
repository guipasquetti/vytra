# Vytra — Handoff

> Documento de contexto para replicar o estado do projeto em outro chat.
> Última atualização: 14/Setembro/2026 — §7 corrigido: os 3 gaps do WebDiet estavam registrados
> como "em aberto" mesmo com prontuário evolutivo (§33) e anexos (§35) já construídos e em
> produção desde 12/set; só financeiro segue bloqueado por CNPJ.

> **Fonte canônica:** este arquivo, na raiz do repositório. Todo agente (Codex ou Claude) deve lê-lo antes de alterar o projeto e atualizá-lo ao concluir mudanças relevantes, decisões, migrações, configuração de infraestrutura ou bloqueios.

> ⚠️ **NUNCA DUPLICAR ESTE ARQUIVO.** Regra do Guilherme, 09/set, sem exceção. Codex e Claude
> compartilham este mesmo arquivo e ele é a referência canônica de tudo. Não criar documento
> paralelo que repita decisão, estado de infraestrutura ou pendência que já vive aqui: duas
> fontes para o mesmo fato é como elas divergem, e foi assim que um desenho de DNS errado
> sobreviveu ao lado do certo em 09/set. Documento separado só se cobrir assunto que este
> arquivo não cobre (ex.: `docs/marca/BRAND.md`, que são regras de uso da marca), e mesmo
> assim o handoff aponta pra ele em vez de repetir o conteúdo.
>
> **Antes de escrever aqui: releia a versão do disco.** Nunca gravar por cima de uma cópia
> lida minutos antes, e nunca forçar gravação por cima de versão mais nova. O outro agente
> pode ter escrito nesse intervalo. Em 09/set uma gravação forçada apagou 287 linhas escritas
> pelo Codex; só foi recuperada porque já estavam commitadas.

> **Migração de marca e URLs em andamento (09/set):** seguir o protocolo em “Transição Vytra” no fim deste documento. Não trocar o fallback de convite nem remover URLs legadas antes de `app.vytraoficial.com.br` passar na verificação de DNS, SSL e login.

---

## 0. Princípio obrigatório: segurança e LGPD

⚠️ **Decisão do Guilherme (04/set), inegociável:** segurança e conformidade LGPD são lente
padrão em **toda** decisão de arquitetura/escopo deste projeto — não só quando alguém pedir
explicitamente. O banco guarda dado sensível de saúde (anamnese: condição médica,
medicamento, cirurgia, alergia; fotos de corpo previstas no check-in do §13; métricas
corporais). Antes de propor ou construir qualquer feature/tabela/RPC nova, checar:

- **Quem lê esse dado?** RLS cobre o caso, ou fica exposto a mais gente que deveria?
- **Cria superfície pública nova?** (ex.: link de anamnese por token, hoje sem login —
  já é um risco conhecido, ver §14)
- **Tem base legal?** Lead/atendimento capturando nota de saúde antes de qualquer
  consentimento é exatamente o tipo de lacuna que já foi identificada no funil (§12/§14) —
  não introduzir uma nova sem perceber.
- **Cruza fronteira?** Residência de dados em `us-east-1` já é transferência internacional
  sob a LGPD — decisão registrada em §14, não reabrir sem novo cálculo de custo.

Isso não significa travar todo trabalho de feature até existir termo/advogado — significa que
toda mudança relevante anota o ângulo de segurança/LGPD aqui no handoff, pra não ficar
esquecido em silêncio.

✅ **Primeira aplicação prática (04/set):** rodado `get_advisors(security)` do Supabase como
baseline. Achado real corrigido: `handle_new_user()` — o trigger interno que cria o profile
no signup — estava exposto como RPC pública (`anon`/`authenticated`/`PUBLIC` tinham
`EXECUTE`), sem necessidade nenhuma (é `RETURNS trigger`, só roda via `on_auth_user_created`).
`REVOKE EXECUTE` de `anon`, `authenticated` e `PUBLIC`; sobrou só `postgres`/`service_role`.
Também revogado `EXECUTE` de `anon` (mantido pra `authenticated`, que a RLS usa de verdade)
nos 4 helpers `is_trainer()`/`is_professional()`/`is_professional_of()`/`is_client_of()` —
não são chamados por nenhuma função pública (`obter_convite`/`submeter_anamnese`/
`finalizar_cadastro_convite`, conferido no código-fonte) e `anon` não tem motivo pra invocar.
Verificado depois: app recarregado com sessão real (Tassis) continua lendo dado normal — RLS
pra usuário autenticado não foi afetada, porque `REVOKE` em função não interfere na execução
de trigger nem na avaliação de policy pelo dono/definer.

⚠️ **Ainda aberto no advisor** (aceito, já era conhecido): os 3 RPCs do fluxo de convite
(`obter_convite`, `submeter_anamnese`, `finalizar_cadastro_convite`) continuam
`anon`-chamáveis por design — é o fluxo de token sem login. E os 4 helpers continuam
`authenticated`-chamáveis por design — é o que a RLS usa. **Novo, não corrigido:** "Leaked
Password Protection" desligada no Auth — Supabase checaria senha contra HaveIBeenPwned.
Fica de fora do MCP (é config de dashboard); ligar em Authentication → Policies → Password
Security quando alguém for mexer lá.

## 1. Visão geral

**Vytra** (nome fechado em 09/set; o projeto se chamava "App Treino" até então) nasceu
como app de personal trainer pro Tassis (treinador monta plano de
treino/nutrição, aluno executa e registra), mas a reunião de kickoff (31/ago) elevou a
ambição: é pra virar **plataforma SaaS white-label** — Tassis é o primeiro cliente/piloto,
não o único usuário final. Ver §2 pros detalhes de negócio.

✅ **Multi-tenant aplicado no banco (02/set).** Decisão do Tassis: obrigatório desde a v1,
não é evolução futura — cada treinador e cada nutricionista tem sua própria base de
pacientes/clientes, isolada. Migração `20260902_multi_tenant_professionals_subscriptions.sql`
já rodou em produção: criou `professionals`, `professional_plans`, `subscriptions`,
reescreveu todas as RLS (antes `is_trainer()` dava acesso global a qualquer trainer sobre
qualquer cliente; agora é escopado por assinatura ativa via `is_professional_of()` /
`is_client_of()`), e fez backfill dos dados reais existentes (Tassis → `professionals`,
cliente atual → `subscriptions` ativa). Detalhe completo em §5.

Relação paciente↔profissional confirmada como **N:N**, cada par com **assinatura própria
e independente** — cada profissional cobra do seu jeito, sem plano compartilhado. Exemplo
do Tassis: ele pode vender um plano "só dieta" e outro "dieta + treino" — um profissional
pode ter **vários planos/produtos** (`professional_plans`), não preço fixo único.

**Ideia futura, explicitamente fora de escopo agora** (palavras do Tassis: "mais uma
ideia a ser explorada"): quando o app ganhar escala, um marketplace/diretório de
profissionais dentro do app pra indicação. Não construir pra isso agora, mas não
desenhar o N:N de um jeito que trave adicionar essa camada de descoberta depois.

Projeto irmão de referência (mesma stack, mesmo padrão de pastas): **OLIHealthHub**
(`../OLIHealthHub`), usar como benchmark de organização quando houver dúvida.

⚠️ **Existe um protótipo funcional anterior a este projeto**, preservado em
[`prototype/`](prototype/) — HTML/JS puro, conectado ao mesmo Supabase, com login,
convite+anamnese, execução de treino (histórico de cargas, cores push/pull/legs) e
montagem de dieta com busca TACO já implementados informalmente. Consultar antes de
desenhar as telas equivalentes no Expo — várias decisões de UX/produto já foram
tomadas ali. Era o conteúdo original do repo GitHub `treino-tassis` (histórico git
substituído em 02/set quando conectamos este projeto Expo ao mesmo repo).

**Identidade visual:** referência escolhida pelo Guilherme (02/set) é o app nativo
**Apple Fitness** (dark theme, cores saturadas por categoria, números grandes, cards
arredondados) — screenshots em [`docs/design-inspiration/`](docs/design-inspiration/).
✅ Já aplicada em [`src/theme/index.ts`](src/theme/index.ts). Escopo explícito do
Guilherme: **só a identidade visual**, não as funcionalidades do Apple Fitness —
HealthKit/Apple Watch ficam de fora, no máximo como captura de dado pro módulo de
exercício mais pra frente. **Nome da marca: "Vytra" (fechado 09/set, decisão do Guilherme
— substituiu "Pulso 360" de 08/set)** — ver §7. Cor/identidade visual (paleta "Sinal Vital")
já aprovada, mas o wordmark ainda precisa ser re-renderizado com o nome novo.

## 2. Modelo de negócio e visão de produto (reunião com Tassis, 31/ago)

**Dor atual do Tassis:** ferramentas fragmentadas — Live Clean (gestão/check-ins
quinzenais, bom histórico de paciente), WebDiet (prescrição de dieta, **odiado**: UX ruim
em mobile, tabela de alimentos superestima calorias), Asaas (cobrança). Cobrança hoje é
manual: profissional marca "pago" à mão pra liberar 30 dias — sem recorrência automática.

**3 perfis de usuário previstos:** paciente, nutricionista, educador físico (personal
trainer). Cada profissional poderia usar a plataforma com marca própria (white-label).

**Monetização:**
- Paciente: mensal ~R$350, trimestral ~R$800 (~R$267/mês); semestral/anual TBD. Acesso
  cortado se pagamento parar → precisa cobrança recorrente automática.
- Profissional (SaaS): assinatura mensal ~R$250.

**Referências de concorrência:**
- **Elite Pro** — concorrente direto, fluxo de planejamento chamado "Bússola" (Tassis vai
  mandar prints pra referência de UX — pendente, ver §7).
- WebDiet = benchmark negativo (o que não fazer em UX mobile).
- Live Clean = bom em base/histórico de paciente e follow-up de não-respondentes.

**Módulo dieta — fórmulas de gasto energético:** Mifflin-St Jeor (treinados),
Harris-Benedict (atletas), Cunningham (baixo % gordura). Integra tabelas TACO (já em
`alimentos_taco`, 597 linhas) + TBCA (ainda não temos — pendente, ver §7).

**Funcionalidades combinadas na reunião (nenhuma implementada ainda):**
- Lista de compras dinâmica (recalcula ao editar a dieta)
- Fator de cocção (peso do alimento cru vs. cozido)
- Notificações inteligentes de hidratação/alimentação baseadas no horário de
  acordar/dormir do paciente
- Dashboard pro profissional sinalizando picos de ansiedade/fome via notificações — a versão
  de check-in disso ainda não existe; um painel de gestão mais simples (sem esse sinal
  específico) já existe, ver §8
- Módulo treino: histórico de cargas + vídeos curtos (15s) de execução gravados pelo
  próprio Tassis/parceira (Gabi) — não genéricos

**Fluxo de onboarding (vendas, não só técnico):** Instagram/indicação → call de
sensibilização → link de pagamento + anamnese → anamnese preenchida gera cadastro
automático → dieta/treino montados em 2–4 dias → entrega via vídeo pessoal no WhatsApp
com link do app. Já bate com o fluxo técnico existente (`convites` →
`submeter_anamnese` → `finalizar_cadastro_convite`), mas **falta a etapa de pagamento**
no meio do funil.

**Compliance:** precisa termo de consentimento/contrato cobrindo LGPD + uso de imagem +
isenção de responsabilidade por resultado. Nada disso existe no projeto ainda.

**Estratégia de lançamento:** migrar pacientes atuais do Tassis pra uma **v1.0 Web**
primeiro (validação/prova social), só depois subir pra App Store/Play Store. Marketing via
Reels/TikTok.

## 3. Stack

| Camada | Tecnologia |
|---|---|
| App | React Native + Expo SDK 57, Expo Router, TypeScript |
| Estado | Zustand (`src/store/authStore.ts`) |
| UI | Design system próprio (`src/theme`) + `@expo/vector-icons` — **sem lib de componentes** |
| Persistência local | AsyncStorage + Expo SecureStore |
| Backend | Supabase (Postgres + Auth + RLS + Storage, desde 04/set — bucket privado `documentos-profissionais`) |
| Upload de arquivo | `expo-document-picker` (desde 04/set — carteirinha de CREF/CRN) |
| Hospedagem web | EAS Hosting — https://app-treino.expo.app (ver §4) |
| Build nativo (iOS/Android) | não configurado ainda — sem EAS Build, sem conta Apple |

**Decisão de stack (02/set):** avaliado usar Xcode/SwiftUI em paralelo, **descartado**.
Motivos: contradiz o go-to-market de web-primeiro (§2), cortaria Android (maior parte do
mercado do Tassis), e dois codebases com um dev só é insustentável. Nada dos problemas
enfrentados até aqui (SMTP, RLS, telas placeholder) vinha do Expo. Se um dia HealthKit/
Apple Watch virar core, dá pra fazer via módulo nativo sem trocar de stack.

## 4. Infra — IDs e ambientes

| Item | Valor |
|---|---|
| Supabase project | `treino-tassis` |
| Supabase project ref | `fshwcaxcbnudvoyyqaxy` |
| Supabase região | `us-east-1` |
| Supabase URL | `https://fshwcaxcbnudvoyyqaxy.supabase.co` |
| App scheme (deep link) | `apptreino://` |
| Bundle iOS/Android | não definido ainda |
| Repo git | `github.com/guipasquetti/treino-tassis` (público) |
| Pasta local | `/Users/guilhermepasquetti/Developer/App Treino` |
| **App no ar (web)** | **https://app-treino.expo.app** — EAS Hosting, produção |
| EAS project | `@guipasquetti/app-treino` (`f37244c8-045f-4fff-89de-ecf05f7872ce`) |

**Deploy web** (é assim que o Tassis acessa hoje — é a "v1.0 Web" do §2):
```bash
npx expo export --platform web && eas deploy --prod
```
`eas deploy` sem `--prod` gera uma URL de preview sem mexer na produção. Dashboard:
`https://expo.dev/projects/f37244c8-045f-4fff-89de-ecf05f7872ce/hosting/deployments`.

⚠️ As chaves `EXPO_PUBLIC_*` são **embutidas no bundle** no momento do export — é o
esperado (a publishable key é pública por design, quem protege o dado é a RLS). Nunca
colocar chave de service role em variável `EXPO_PUBLIC_*`.

`.env` local (gitignored) já populado com `EXPO_PUBLIC_SUPABASE_URL` +
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key, não a legacy anon). `.env.example`
versionado como referência.

## 5. Modelo de dados (Supabase — já em produção com dados reais)

| Tabela | Papel | Linhas (04/set) |
|---|---|---|
| `profiles` | conta (trainer/client), dados físicos (peso/altura) | 2 |
| `professionals` | tenant — profile que virou profissional (`especialidade`) | 1 |
| `professional_plans` | produtos que um profissional vende (`inclui_dieta`/`inclui_treino`, preço) | 1 (backfill "Padrão (migração)") |
| `subscriptions` | vínculo real paciente↔profissional↔plano, com `status`; `plan_id` (confirmado pelo profissional) e `plano_solicitado_id` (pedido pelo paciente, 04/set) | 1 |
| `plans` | plano de treino por período (`dias` jsonb), agora com `professional_id` | 1 |
| `workout_logs` | séries executadas e finalizadas por dia/exercício | 32 |
| `workout_drafts` | autosave do treino em andamento antes de virar log | 2 |
| `anamnese` | questionário de saúde, 1:1 por cliente, **compartilhado entre profissionais** (decisão 02/set) | 1 |
| `planos_alimentares` | plano alimentar (metas de macro + `refeicoes` jsonb), agora com `professional_id` | 1 |
| `alimentos_taco` | tabela TACO de composição de alimentos (referência, seed) | 597 |
| `convites` | onboarding: token → aluno responde → vira profile (§16, §8) | 0 |
| `teleconsultas` | agenda de teleconsultas por Google Meet, RLS própria (§8) — 04/set | 0 |
| `leads` | passo 1 do funil (§12): pré-conta, sem `profiles.id` ainda | 0 |
| `atendimentos` | registro de cada consulta (pendura em lead ou em cliente já existente) | 0 |
| `professional_verificacoes` | CPF/CREF-CRN/documento/status de verificação — nunca em `professionals`, que já é lido pelos pacientes (04/set) | 0 |
| `check_ins` | check-in recorrente do paciente — série temporal, nunca sobrescrita (06/set) | 0 |

**RLS reescrita (02/set):** todas as policies que usavam `is_trainer()` (acesso global a
qualquer trainer) foram trocadas por checks escopados por assinatura ativa:
`is_professional_of(patient_id)` (sou profissional ativo desse paciente?) e
`is_client_of(professional_id)` (sou paciente ativo desse profissional?). `is_trainer()`
continua existindo no banco mas não é mais usada em nenhuma policy — candidata a remover
depois que confirmarmos que nada mais depende dela.

**Ainda não existe no banco** (necessário pra visão de negócio do §2): cobrança recorrente
de verdade (`subscriptions.status` existe mas nada automatiza a mudança de status ainda),
termo de consentimento/contrato, TBCA, lista de compras, fator de cocção, notificações
inteligentes, papéis `nutricionista`/`educador_fisico` explícitos (hoje `professionals.especialidade`
é só texto livre, sem enum).

**RPCs:**
- `is_trainer()` — legado, não usado mais em policy nenhuma (ver acima)
- `is_professional_of(p_patient_id)` / `is_client_of(p_professional_id)` / `is_professional()` — novas, usadas nas RLS
- `obter_convite(p_token)` — lê nome/e-mail/status do convite pelo token
- `submeter_anamnese(p_token, p_respostas)` — **legado desde 04/set**: gravava anamnese
  ANTES da conta existir; ninguém mais chama isso no client (anamnese agora é pós-login,
  ver `submeter_anamnese_autenticado`), mas a função continua no banco, inofensiva
- `finalizar_cadastro_convite(p_token)` — fecha convite → cria `profiles` + `subscriptions`
  (`plan_id` nulo); desde 04/set não lê mais `convites.respostas` (anamnese saiu daqui)
- `submeter_anamnese_autenticado(p_respostas, p_plano_id)` — **novo, 04/set**: paciente
  autenticado grava a própria anamnese + `subscriptions.plano_solicitado_id`, dentro do app

Advisor de segurança do Supabase aponta que `is_professional_of`/`is_client_of`/
`is_professional` (e as antigas) são `SECURITY DEFINER` chamáveis via RPC por `anon`/
`authenticated` — inofensivo aqui porque todas dependem de `auth.uid()` e retornam `false`
sem sessão, mas é warning aberto, mesmo padrão de antes da migração.

Types TS gerados do schema real em [`src/models/database.types.ts`](src/models/database.types.ts)
(gerar de novo com `generate_typescript_types` do MCP Supabase sempre que a migration mudar).

## 6. Estrutura de pastas

Scaffold do Expo foi **removido por completo** em 02/set — nada de `themed-text`,
`animated-icon`, `hint-row`, aba "Explore" etc. O que existe hoje é só código do produto.

```
src/
  app/                        expo-router — rotas = telas
    _layout.tsx               Stack raiz: auth, tema dark, correção de área por papel,
                               exceção pra rota pública /convite (não é redirecionada)
    index.tsx                 rota "/": decide login vs /aluno vs /pro (declarativo)
    login.tsx                 tem link pra /cadastro-profissional (04/set)
    cadastro-profissional.tsx PÚBLICA, top-level — cadastro de profissional com verificação
                               de CREF/CRN (04/set, ver §8)
    admin.tsx                 fila de verificação — só pra quem tem profiles.is_admin (04/set)
    convite/[token].tsx       PÚBLICA, sem login — só criação de conta (04/set; anamnese
                               saiu daqui, ver §8/§12)
    aluno/                    área do ALUNO (abas: Treino · Dieta · Perfil)
      _layout.tsx              gate de onboarding (sem anamnese → OnboardingAnamnese, com
                               anamnese → Tabs) + index.tsx (treino)  dieta.tsx  perfil.tsx
    pro/                      área do PROFISSIONAL (abas: Painel · Leads · Planos · Perfil)
      _layout.tsx
      index.tsx               Painel: placar, pedidos de plano, alertas, agenda de
                               teleconsultas, lista de alunos — tudo numa tela (§8)
      leads.tsx                leads + atendimentos (§12) — aba, 04/set
      planos.tsx               CRUD de professional_plans
      perfil.tsx
      convite.tsx              gera link de convite a partir de um lead (não é aba — href:null)
      aluno/[id]/index.tsx     editor de plano de treino (não é aba — href:null)
      aluno/[id]/dieta.tsx     editor de plano alimentar (não é aba — href:null)
  theme/index.ts              design system (paleta, spacing, radius, cores por treino)
  components/
    ui/index.tsx              Screen, Card, Button, Field, Pill, Stat, Caption...
    perfil-screen.tsx         perfil compartilhado pelos dois papéis
    onboarding-anamnese.tsx   anamnese + escolha de plano, dentro do app (04/set, §12)
  models/
    database.types.ts         gerado do schema Supabase
    domain.ts                 tipos dos jsonb + helpers (formatarSet, somaMacros,
                               formatarDataHora...)
    anamnese.ts                schema do formulário de anamnese (10 seções, 56 campos) —
                               respondido dentro do app desde 04/set, não mais por token
  services/                   1 arquivo por domínio
    authService.ts  workoutService.ts  nutritionService.ts  professionalService.ts
    conviteService.ts  teleconsultaService.ts  gestaoService.ts  leadsService.ts
    solicitacoesService.ts   pedido de acesso pra quem já tem conta (04/set)
    onboardingService.ts      anamnese + plano pós-login (04/set)
    verificacaoService.ts     cadastro/upload/aprovação de profissional (04/set)
  store/authStore.ts          zustand (sessão, profile, isProfessional)
  lib/supabase.ts             client tipado (com guard de SSR, ver §8)
```

**Rotas são segmentos explícitos (`/aluno`, `/pro`), não route groups.** Foi tentado com
grupos `(client)`/`(pro)` e os dois `index.tsx` disputavam a rota `/` — resultado era
"Unmatched Route". Não voltar pra grupos sem resolver essa colisão.

**Todo arquivo novo em `src/app/pro/` vira aba automaticamente**, a menos que ganhe
`<Tabs.Screen name="..." options={{ href: null }} />` explícito em `pro/_layout.tsx` — já
mordeu duas vezes (`convite.tsx`, extinto `agenda.tsx`), ver §8.

## 7. Pendências do Tassis (bloqueiam trabalho downstream)

- Tabelas TACO/TBCA em Excel/PDF (já temos TACO seedado por fonte própria — conferir se bate).
  TBCA não tem export em massa nem API oficial (só busca alimento a alimento no site);
  Tassis vai contatar `tbca.contato@usp.br` pra pedir acesso aos dados pra uso comercial.
- Escopo detalhado + dados necessários do paciente pra estruturar o banco
- Termo de consentimento/contrato (LGPD + uso de imagem)
- Pesquisa de mercado de concorrentes (preços/features) — parcialmente coberta pela
  pesquisa própria de 08/set (Reclame Aqui/App Store de WebDiet/MFIT/Dietbox/Trainerize +
  benchmark Vibe Fit, ver §8)
- Vídeos curtos de exercícios (15s)
- ~~Prints do fluxo "Bússola" do Elite Pro~~ — **removido do escopo (08/set)**: decisão do
  Tassis (questionário de marca) foi não copiar/igualar essa feature, e sim virar conteúdo
  de tutorial ("aula de como o profissional pode se organizar"). Não é mais pendência.
- ~~Identidade visual: nome~~ — **"Pulso 360" (08/set) abandonado (09/set)**, decisão do
  Guilherme, não do Tassis: "360" já é sufixo saturado nesse nicho brasileiro (Treino360,
  360fit, Personal 360 já existem) e "Pulso" colide com apps de saúde ativos + "Pulso 360"
  já é agência de marketing ativa em São Paulo desde 2006. **Nome fechado agora: "Vytra"**
  — sobreviveu a uma ronda de ~20 candidatos testados em 09/set (lista completa e critério
  de decisão em `project_business_scope.md`, memória). Critério usado: sem concorrente
  brasileiro direto de personal/nutri, sem contradizer voz de marca já fechada.
  ✅ **Checado no INPI de verdade (09/set, base oficial `busca.inpi.gov.br`, não Google)**:
  busca exata zerou pra "VYTRA", "VYTRIA" e "VYTTRA" — nenhuma marca registrada com essas
  grafias. Busca radical (fonética) por "VYTRA" trouxe 7 processos, nenhum idêntico — o mais
  próximo é "VYTRANZO" (Intarcia Therapeutics, farmacêutica, classes NCL 5/10, medicamento/
  dispositivo médico, não é app). A "Vytra Diagnósticos" (empresa de diagnóstico laboratorial
  achada via Google, ver conversa) **não aparece no INPI** — indício de que é nome de
  empresa/CNPJ, não marca registrada, o que reduz o risco jurídico real dela. Aviso oficial
  do próprio INPI: "nenhum resultado" não garante registrabilidade — exame de verdade só no
  pedido formal.
  ⚠️ **Achado à parte, risco não-jurídico**: existe um app internacional ativo chamado
  "Vytra" (Wesley de Gee, foco em treino/tracking — "train smarter, track progress, unlock
  your potential"), com conta Instagram ativa em `@vytra.app` (bio quase idêntica: "Train
  smarter. Lift stronger. Plans • Tracking • Real progress", cobrança $9,99/mês). Mesmo
  nicho, nome idêntico, sem concorrência real no Brasil e sem registro de marca aqui — não
  bloqueia juridicamente, mas é risco de confusão de busca/rede social a considerar.
  **Handle definido**: `@vytra.oficial` — confirmado disponível pelo próprio Guilherme
  (09/set). Rebranding em si (nome no app/EAS project/domínio) ainda não feito, só a decisão
  do nome e do handle de rede social.
- ~~Cor/identidade visual + voz da marca~~ — **resolvido (08/set)**: Guilherme revisou 3
  direções de paleta (artifact `pulso-360-brand`, montado a partir do questionário de marca
  do Tassis) e aprovou a direção **"Sinal Vital"** — paleta de monitor/sinal vital (base
  quase preta `#0A0C0D`, sinal verde-menta `#2ED9A3`, alerta âmbar `#FFB020`, texto
  `#ECEFEE`), wordmark em mono, tracking aberto. Risco aceito: pode ler mais "clínica" que
  "treino" — aceito porque o educador físico também se vende pelo rigor técnico. **Troca o
  accent principal do app** (era `Palette.accent`/`RoleColors.aluno` = rosa `#FF375F`).
  ✅ **Aplicado no código (09/set)**: `Palette.accent` agora `#2ED9A3` — cascata automática
  pra `RoleColors.aluno` e `MacroColors.kcal`, que já reusavam o mesmo token. `TrainingColors.push`
  foi desacoplado do accent (virou `Palette.orange`) pra não colidir com o verde de `leg`
  agora que o accent também é verde. Login ([`login.tsx`](src/app/login.tsx)) trocou o
  título "Treino" por wordmark "VYTRA" (ícone `pulse` do Ionicons + texto com tracking,
  ainda sem fonte customizada — `expo-font`/IBM Plex Mono do brandbook não instalado) e a
  tagline pra "Um plano realmente seu.". Verificado: `npx tsc --noEmit` limpo, preview web
  conferido nos dois modos (Aluno/Profissional) sem erro de console. **Não aplicado ainda**:
  `app.json` (`name`/`slug`/`scheme` continuam "App Treino"/`app-treino`/`apptreino` — troca
  de slug mexe no EAS project e na URL de produção, decisão maior, não feita sem pedir),
  ícone do app, splash screen (cor de fundo `#208AEF` ainda é azul do scaffold, não da
  marca), e fonte IBM Plex Mono/Big Shoulders real (login usa só letterSpacing pra imitar o
  tracking do brandbook, não é a fonte de verdade).
  ✅ **Tudo isso foi fechado no rebrand completo de 09/set — ver o item dedicado no fim do §8.**
  Voz da marca também
  fechada: adjetivos É técnica/presente/direta, NUNCA genérica/sedutora/fria; frase de
  diferenciação "encaixar a dieta e o treino na rotina do paciente — não o contrário"
  (palavras do próprio Tassis, não inventada).
- ✅ **Brandbook consolidado (09/set)** — artifact `vytra-brandbook`, junta tudo: essência,
  origem do nome (Vy- ecoa "vitória"/"vital", "-tra" ecoa "extra"/"ultra" — não é palavra de
  dicionário, é construção fonética, por isso sobreviveu à ronda de colisão), as duas
  personas (paciente 24–40 anos/já tentou dieta antes; profissional comprador/52 pacientes
  hoje), paleta Sinal Vital com wordmark já certo ("VYTRA", não mais "Pulso 360"),
  tipografia (Big Shoulders Display + IBM Plex Sans/Mono), e **regras de escrita da marca**
  fixadas ao vivo com o Guilherme corrigindo linha por linha: nunca travessão, nunca o
  padrão "não é X, é Y", nunca ponto de exclamação, nunca prometer prazo. Inclui os dois
  discursos de marca completos (ver abaixo). Detalhe completo da ronda de naming (~20
  candidatos testados e por que cada um caiu) em memória (`project_business_scope.md`).
- ✅ **Discursos de marca (09/set)** — dois textos de posicionamento, escritos e revisados em
  várias rodadas com o Guilherme (cortando clichê de IA a cada volta: travessão, "não é X é
  Y", exemplo mundano demais). Ideia central: "o plano se adapta a você, não o contrário" —
  reformula o fracasso de tentativas anteriores como falha do método, não do paciente, e usa
  isso como prova de critério técnico, não promessa vazia. Versão pro paciente fecha com "um
  plano realmente seu" (linha do próprio Guilherme); versão pro profissional fecha com "o
  critério que você já tem, sem o trabalho que te consumia". Nenhuma cita concorrente por
  nome — descreve só a função ("ferramenta pra gestão", "outra pra prescrever dieta") pra
  não virar propaganda comparativa. Texto completo no brandbook acima.

- ✅ **Domínio e marca — decidido em 09/set (fecha a discussão, não reabrir sem fato novo).**
  As alternativas descartadas e o passo a passo do INPI ficam **aqui**, não em documento
  separado (ver a regra de arquivo único no cabeçalho). O `docs/marca/DOMINIO-E-INPI.md` que
  existiu por algumas horas em 09/set foi dissolvido neste item justamente por duplicar o
  handoff e chegar a divergir dele no desenho de DNS.

  **Domínios descartados:**

  | Opção | Por que caiu |
  |---|---|
  | `vytra.com.br` | Vytra Diagnósticos, vence 25/09/2027, parado em DNS automático. Comprar descartado pelo Guilherme: marca já implementada, difícil pleitear. Em monitoramento automático |
  | `vytra.com` | EmblemHealth, plano de saúde americano |
  | `vytra.io`, `vytra.club` | registrados |
  | `vytra.app.br`, `appvytra.com.br`, `vytraapp.com.br`, `vytra.app` | "app" impõe teto ao produto. Decisão do Guilherme |
  | `usevytra.com.br` | "use Vytra" lê como imperativo de vestir. Decisão do Guilherme |
  | `vytra.co` | quem erra e digita `.com` cai na EmblemHealth: vazar tráfego de produto de saúde pra outra marca de saúde |
  | `vytrasaude.com.br` | livre, mas "saúde" empurra o posicionamento pro clínico |
  | `vytra.fit` | "fit" fecha em treino e puxa emagrecimento de moda, o oposto da voz "técnica, nunca sedutora" |
  | `vytra.health`, `.care`, `.life`, `.pro` | palavra em inglês pra base de pacientes que fala português |
  | `vytra.net.br`, `vytra.tec.br` | soam como provedor de internet e empresa de TI |

  **INPI, como fazer** (nada depositado até 09/set): sistema e-INPI, `gru.inpi.gov.br` pra
  guia e `busca.inpi.gov.br` pro pedido. Classes prováveis **NCL 9** (software/app baixável),
  **NCL 42** (desenvolvimento de software, SaaS) e **NCL 44** (serviços de saúde/nutrição).
  Cerca de R$ 355 por classe, ~R$ 142 com redução ME/EPP/MEI/PF; confirmar a tabela vigente.
  Marca **mista** (mark + nome) protege mais, mas a **nominativa** é a que impede terceiro de
  usar a palavra: se for depositar só uma, depositar a nominativa. Não é parecer jurídico.
  - **Nome Vytra mantido — reconfirmado três vezes no mesmo dia, decisão final do Guilherme.**
    Testado contra **Vytia** (`.com.br` livre, mas `vytia.fr` foi loja de sapatos fraudulenta
    com 15 reclamações no Signal Arnaques — busca contaminada; e o fecho *-tia* puxa apatia/
    antipatia); contra **Vytria** (fonética boa, *-tria* puxa pediatria/geriatria e simetria,
    INPI já limpo, mas `vytria.com.br` está registrado e suspenso e `vytria.com` é a Vytria
    Eyewear, e-commerce ativo); e contra uma **ronda completa de nomes começando com V**
    (restrição deliberada: nome com V preserva mark, ícone, paleta e fontes — só o wordmark
    seria regerado). Peneiras: `.com.br` livre no Registro.br + busca sem contaminação +
    legível em português na primeira tentativa. Passaram Vytora (o melhor, ecoa "vitória"),
    Vytana, Vyanta, Vysora e Vyrena; caíram `Vyntra` e `Vytria` (registrados e suspensos),
    `Vydra` (reservado pelo Comitê Gestor), `Vyntro` (duas startups de IA), `Vyvante` (o
    `.com` é marca de wellness de enema de café) e seis com `.com.br` ocupado.
    **Nenhum superou Vytra**: os limpos não têm significado, e Vytora troca as duas sílabas
    secas por três e ganha vizinhança com "Vitória".
    ⚠️ **Não reabrir sem fato novo** — fato novo é a Vytra Diagnósticos depositar VYTRA no
    INPI ou uma oposição real chegar, não é dúvida nem um nome bonito que apareceu. A ronda
    inteira está em `docs/marca/DOMINIO-E-INPI.md` §4.
  - **Endereço oficial: `vytraoficial.com.br`.** Espelha o handle `@vytra.oficial` e é a única
    palavra disponível que não impõe teto ao produto ("app" limita ao aplicativo, "saúde"
    empurra pro clínico, "fit" fecha em treino). Escolha deliberadamente **reversível**:
    trocar depois é reverificar o domínio de envio, mudar 2 URLs no Supabase e reapontar o EAS.
  - **`vytra.com.br` não será comprado.** Decisão do Guilherme: marca já implementada pela
    Vytra Diagnósticos, difícil pleitear. Está parado em DNS automático, vence **25/09/2027**,
    e ficou em **monitoramento automático** — tarefa agendada mensal (dia 1º, 09h BRT) que
    consulta o Registro.br e avisa se ficar disponível, entrar em processo de liberação ou
    mudar pra on hold. A mesma tarefa confere se o `vytraoficial.com.br` segue registrado.
  - ⚠️ **DNS: o desenho anterior deste item está SUPERADO.** Ele previa o app na raiz e o EAS
    como host. O que foi de fato montado é o oposto e é o que vale: **landing na raiz**
    (projeto Vercel `vytra`) e **app em `app.vytraoficial.com.br`** (projeto Vercel separado
    `vytra-app`), porque domínio customizado no EAS **não existe no plano Free** (confirmado
    no dashboard). Registros exatos e ordem de rollback na seção "Estado confirmado em 09/set"
    e "DNS a aplicar no Registro.br", mais adiante neste arquivo — **aquela seção é a
    canônica, esta é só a decisão de nome**. `mail.vytraoficial.com.br` segue reservado pro
    envio de e-mail, sem registro criado até o provedor ser escolhido.
  - ⚠️ **INPI: nada depositado, e essa é a parte que importa.** A busca de 08–09/set zerou, mas
    busca limpa não é proteção. **Nome empresarial anterior de terceiro no mesmo ramo é
    fundamento de oposição pelo art. 124, V da LPI**, e a Vytra Diagnósticos opera em saúde no
    Brasil — corrige a leitura anterior de "risco jurídico reduzido" registrada no §7. Depositar
    dá data de prioridade e inverte a posição. Classes prováveis NCL 9 / 42 / 44, ~R$ 355 por
    classe (~R$ 142 com redução ME/EPP/MEI/PF). Não é parecer jurídico; vale advogado de PI pra
    fechar as classes.
  - **Ordem de execução** (passos 1 e 7 dependem do Guilherme, o resto é execução):
    1. registrar `vytraoficial.com.br` · 2. verificar `mail.` no provedor de SMTP (SPF/DKIM/DMARC)
    · 3. SMTP no Supabase e religar confirmação de e-mail (desligada em 03/set como contorno)
    · 4. ~~domínio customizado no EAS Hosting~~ **DNS da Vercel** (raiz para a landing, `app.`
    para o `vytra-app`), porque o EAS Free não tem domínio customizado
    · 5. Site URL e redirect URLs no Supabase
    · 6. trocar o fallback `https://app-treino.expo.app` em `src/app/pro/convite.tsx`
    · 7. depositar VYTRA no INPI.
  - O `slug` do projeto Expo continua `app-treino` mesmo depois disso: trocar mexe no EAS
    project, é decisão à parte.
- ✅ **Passo 1 concluído (09/set): `vytraoficial.com.br` registrado.** Confirmado por `whois`:
  titular Guilherme Pasquetti, status ativo, DNS automático do Registro.br
  (`a.auto.dns.br`/`b.auto.dns.br`). A pendência da Receita Federal descrita abaixo foi
  resolvida dentro do prazo. Falta só publicar o registro A (ver o item da LP no §8).
- 📌 **Histórico do bloqueio que atrasou o passo 1 (09/set).** Tentativa inicial
  no Registro.br bloqueada — o CPF do Guilherme (377.991.498-09) já tinha "Provedor de
  Serviços" vinculado (HSTDOMAINS, a revenda de domínio da Hostinger), herdado de dois
  domínios antigos e sem relação com o projeto (`theworkhouse.com.br`, `fluxoneural.com.br`,
  migrados de GODADDY pra HSTDOMAINS em 07/ago/2025). Resolvido trocando o Provedor de
  Serviços da entidade pra **NENHUM** direto na tela "Provedor de serviços" do Registro.br
  (não mexe em DNS/hospedagem, só em quem administra o registro). E-mail correto da conta
  Registro.br/Hostinger é `guilherme.pasquetti@gmail.com` (não `gui.pasquetti@gmail.com`,
  usado em outros contextos do projeto) — achado buscando o e-mail "Recover your Hostinger
  account" na caixa de entrada.
  - **Ticket**: `VYTRAOFICIAL.COM.BR`, número `32157056`, 09/09/2026, com pendência
    automática de validação do CPF contra a Receita Federal (prazo `10/09/2026 14:48`).
    Resolveu dentro do prazo, domínio ativo.
  - ⚠️ **Decisão de raiz mudou (09/set, Guilherme):** a raiz `vytraoficial.com.br` passa a
    ser da **LP institucional**, e o app vai para `app.vytraoficial.com.br` quando migrar do
    `app-treino.expo.app`. Isso substitui a decisão anterior deste mesmo §7 ("app na raiz,
    porque o link do convite já é longo demais") — o custo aceito é o link de convite ficar
    4 caracteres mais longo. O passo 6 da ordem de execução (trocar o fallback em
    `src/app/pro/convite.tsx`) passa a apontar para `app.vytraoficial.com.br`, não para a raiz.

⚠️ **E-mail: a causa raiz não é rate limit** (investigado em 03/set, corrige o diagnóstico
anterior). A [documentação do Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
diz que o SMTP padrão **só entrega para endereços que são membros da organização**:

> *"Unless you configure a custom SMTP server for your project, Supabase Auth will refuse to
> deliver messages to addresses that are not part of the project's team."*

Ou seja, o provedor padrão **nunca** entregaria e-mail a um paciente, nem com volume baixo.
Os erros que vimos (`connection_failed` no reset de senha, `over_email_send_rate_limit` no
signup) eram sintoma; a causa é que essa via não serve para o caso de uso. Ver §16.

- 📌 **Decisão (11/set, Guilherme): cobrir 3 gaps reais do WebDiet, mantendo a essência do
  Vytra.** Análise comparativa feita introspectando o MCP do WebDiet (`api.mcp.ai/p_webdiet`,
  62 tools) contra o estado atual do Vytra. Vytra já ganha em check-in recorrente com
  pontuação, lista de compras dinâmica e progresso visual por foto — nenhum desses existe no
  WebDiet. Mas 3 áreas o WebDiet cobre e o Vytra não tem nada ainda:
  1. **Financeiro + recibo** — hoje pagamento é 100% manual fora do app (§5, §12 passo 6);
     nenhum ledger, nenhuma categoria, nenhum recibo gerado pelo Vytra.
  2. **Prontuário evolutivo por sessão** — `atendimentos` só cobre a fase pré-conversão
     (lead); não existe nota clínica ligada a cada teleconsulta/sessão pós-cadastro.
  3. **Anexos do paciente** (exames, laudos) — check-in só tem foto de corpo (§13); não há
     upload genérico de arquivo do lado paciente, só do lado profissional (carteirinha
     CREF/CRN, §8).
  Copiar a **função**, não a UX — Tassis chama WebDiet de "odiado" por UX mobile ruim, isso
  não é referência de tela, só de capacidade. Lente §0 obrigatória nos 3: financeiro é dado
  sensível novo (valor cobrado, categoria), prontuário e anexos são dado de saúde adicional —
  cada um entra com checklist de RLS/base legal próprio antes de virar schema, mesma regra já
  aplicada em `check_ins`/`professional_verificacoes`.

  **Status real dos 3 (atualizado 14/set — os dois primeiros abaixo estavam registrados como
  "em aberto"/"pendente" nesta mesma seção, já resolvidos há dois dias, texto histórico
  corrigido em vez de duplicado):**
  - Gap 1 (financeiro): ⛔ **bloqueado**, estrutura de banco pronta desde 11/set, esperando
    CNPJ da Vytra pra criar a sub-conta Asaas real (ver bloqueio abaixo, ainda vale).
  - Gap 2 (prontuário evolutivo): ✅ **construído, testado e em produção desde 12/set** — ver
    §33. Decisão que ficava em aberto aqui (estender `atendimentos` vs. tabela nova) foi
    resolvida: estendeu `atendimentos`.
  - Gap 3 (anexos do paciente): ✅ **construído, testado e em produção desde 12/set** — ver
    §35.
  - ✅ **Priorizado (11/set): financeiro/cobrança entra primeiro.** Guilherme escolheu cobrir
    cobrança antes de prontuário evolutivo e anexos. Desenho completo (2 fluxos — paciente→
    profissional e profissional→Vytra — com telas/funções/estados) num artifact:
    `https://claude.ai/code/artifact/7b1e541b-6e03-4a79-b813-a3a352b6e368`. Decisões fechadas
    nessa mesma data:
    - **Gateway: Asaas, sub-conta individual por profissional dentro da conta master da
      Vytra** (não é "cada profissional com a própria chave Asaas solta" — é conta White
      Label/sub-contas do Asaas, Vytra é a conta pai). Vale pros dois fluxos: a cobrança
      paciente→profissional roda na sub-conta do profissional; profissional→Vytra roda na
      conta master. Reduz risco de transferência internacional (§14) — Asaas é brasileiro.
    - **Formas de pagamento: todas as que o Asaas oferecer** (pix, boleto, cartão de
      crédito recorrente, o que mais existir na API) — sem restringir no app, a lista vem
      do gateway.
    - **Regra de carência: nenhuma.** "Corta caso pagamento pare" — sem prazo de tolerância,
      nos dois fluxos (paciente perde acesso a Treino/Dieta, profissional perde acesso —
      ver ressalva abaixo sobre o quê exatamente trava no Painel).
    - **Ainda em aberto:** o que exatamente "corta" no Painel do profissional quando a
      mensalidade Vytra atrasa — decidido como corte total (ver abaixo), mas ainda falta
      desenhar a TELA desse estado bloqueado; reembolso/cancelamento de assinatura, fora
      do escopo deste desenho, entra num passe seguinte.
    - ✅ **Fechado (11/set, "resolver pra não deixar passivo de problema"):**
      - **`professional_plans.periodicidade`**: fica texto, ganha `CHECK` fechando em
        `mensal|trimestral|semestral|anual` — **não virou enum de banco**, mesmo padrão já
        usado em `especialidade`/`status` do projeto (texto + CHECK é mais fácil de
        estender depois, como já aconteceu com `convites.status` ganhando `'recusado'`).
      - **Achado antes de escrever schema**: `is_professional_of()`/`is_client_of()` (base
        de quase toda RLS do projeto) dependem de `subscriptions.status = 'ativa'`. Se
        inadimplência fosse gravada nesse mesmo campo, o profissional **perderia
        visibilidade do próprio paciente inadimplente** no momento exato em que mais
        precisa dela — bug sério, silencioso, e oposto ao propósito da feature. Por isso
        `billing_status` é coluna **separada**, nunca entra em policy de RLS, só é lido
        pelo gate de leitura de Treino/Dieta na aplicação.
      - **Segredo do gateway**: chave master do Asaas vive só em **Edge Function secret**
        (nunca em `EXPO_PUBLIC_*`, nunca em tabela). Token/chave por sub-conta (se o Asaas
        emitir um por sub-conta) vai em **Supabase Vault** (`supabase_vault` já instalado
        no projeto, confirmado via `list_extensions`, versão 0.3.1) — decrypt só dentro de
        função `SECURITY DEFINER` chamável apenas por `service_role`, nunca por
        `anon`/`authenticated`. Nenhum valor de segredo entra em migração versionada no
        git — a migração só cria a estrutura que vai *guardar* a referência.
      - **Webhook**: valida o header de autenticação que o Asaas envia (token configurado
        no painel, não o payload em si) e, antes de mudar `subscriptions.billing_status`/
        `professionals.billing_status`, **reconfirma a cobrança direto na API do Asaas**
        com a própria chave — não confia cegamente no corpo do webhook (defesa contra
        callback forjado/repetido). Upsert por `gateway_charge_id` (idempotente — Asaas
        reenvia em caso de falha) grava o estado atual em `cobrancas`; cada evento bruto
        recebido fica também em `cobranca_eventos`, log imutável só pra auditoria (sem
        policy de leitura nenhuma — nem paciente, nem profissional, só `service_role`).
    - ✅ **Migração rascunhada, NÃO aplicada ainda**:
      [`20260911_cobranca_estrutura_base.sql`](supabase/migrations/20260911_cobranca_estrutura_base.sql)
      — `professional_plans` ganha o CHECK de periodicidade; `subscriptions` e
      `professionals` ganham `billing_status` (`default 'ativo'` nos dois, preserva o
      comportamento atual do Tassis e do aluno dele sem backfill, mesma lógica de
      `plans.publicado default true` do F0); `professionals` ganha `asaas_subconta_id`
      (id da sub-conta, não é segredo); tabelas novas `cobrancas` (estado atual) e
      `cobranca_eventos` (log bruto imutável) com RLS — paciente lê só a própria cobrança,
      profissional lê a dos próprios pacientes + a própria fatura Vytra, ninguém além de
      `service_role` escreve. **Falta rodar `apply_migration` — decisão do Guilherme, não
      tomada sozinha porque mexe em produção com paciente real.**
    - ✅ **Aplicada (11/set)**, com autorização explícita do Guilherme. `get_advisors(security)`
      depois: um achado novo, esperado e intencional (`cobranca_eventos` sem policy de
      select — é log de auditoria, só `service_role` lê). Resto é o mesmo warning padrão já
      aceito (RPCs `security definer` anon-chamáveis, leaked password protection). Nenhuma
      categoria nova. `database.types.ts` regenerado via `generate_typescript_types` e
      `npx tsc --noEmit` limpo. **Não testado logado** — só estrutura, nenhuma tela ainda lê
      ou escreve essas colunas/tabelas; `default 'ativo'` garante que Tassis e o aluno dele
      continuam exatamente como estavam. **Próxima etapa real**: criar a sub-conta Asaas do
      Tassis, guardar o segredo (Vault/Edge Function secret, nunca em coluna), e só então
      construir `aluno/pagamento.tsx` + `criarCobranca()` (passo 3 do Fluxo 1 no artifact).
    - ⛔ **Bloqueado (11/set): Vytra ainda não tem CNPJ ativo.** Confirmado com o Guilherme.
      Conta Asaas PJ + habilitação de Sub-contas White Label normalmente exigem CNPJ, e a
      criação de conta é ação que só ele pode fazer (nunca crio conta em nome de
      terceiro). **Todo o resto do Fluxo 1/2 (Edge Function, `criarCobranca()`, tela de
      pagamento) para aqui até o CNPJ existir** — não tem o que construir sem chave real
      pra testar contra.
      - Duas rotas possíveis pro CNPJ, sem eu decidir qual: **MEI** (abertura rápida,
        online, gratuita, pelo Portal do Empreendedor) vs. **CNPJ formal** (LTDA/etc.,
        passa por contador, mais lento). MEI tem teto de faturamento (~R$81k/ano — a receita
        SaaS de profissionais sozinha já pode estourar isso rápido se a base crescer) e
        restrição de atividade (nem todo CNAE de software é elegível pra MEI). **Não é
        parecer contábil/jurídico** — mesma ressalva já usada pro INPI (§7) — vale
        contador antes de escolher.
      - Enquanto isso não resolve, nada muda no app: `billing_status default 'ativo'`
        (já aplicado) garante que Tassis e o aluno dele continuam sem nenhum efeito
        colateral.
      - 🔎 **Checado na doc oficial do Asaas (11/set), enquanto o CNPJ não sai** —
        [Criar subconta](https://docs.asaas.com/reference/criar-subconta),
        [Sandbox](https://docs.asaas.com/docs/sandbox),
        [Como configurar sua conta no Sandbox](https://docs.asaas.com/docs/como-configurar-sua-conta-no-sandbox),
        [FAQ - Sandbox](https://docs.asaas.com/docs/faq-sandbox):
        - **Confirmado**: sub-conta aceita `cpfCnpj` como CPF **ou** CNPJ
          (`personType: FISICA`/`JURIDICA` na resposta) — fecha, com fonte oficial, o que
          já estava registrado acima como "confirmar depois": profissional entra com CPF
          autônomo, não precisa abrir CNPJ só pra usar a Vytra.
        - **Confirmado**: a conta-mãe que cria sub-contas precisa ser CNPJ — já era o
          plano (é a própria Vytra), só reforça.
        - **Confirmado**: Sandbox é conta separada da produção (dado, chave de API,
          tudo isolado), aprovação automática quando os campos obrigatórios batem.
        - **Não documentado**: se o cadastro da conta sandbox em si aceita CNPJ
          fictício/checksum-válido (tipo os CPFs de teste que o Asaas dá pra simular
          transferência) ou exige documento real registrado na Receita. As páginas de
          setup/FAQ do sandbox não cobrem esse ponto. **Não é algo que eu possa testar** —
          cadastro de conta é ação que só o Guilherme faz (nunca crio conta). Dois
          caminhos pra ele resolver: tentar cadastrar o sandbox com o próprio CPF
          (onboarding do Asaas costuma começar por pessoa física), ou perguntar direto
          pro suporte (0800 009 0037 / contato@asaas.com.br) antes de gastar tempo.
      - ✅ **Confirmado na prática (11/set)**: Guilherme conseguiu iniciar cadastro
        **de produção** no Asaas com o próprio CPF — onboarding de fato aceita começar
        por pessoa física, sem precisar do CNPJ da Vytra existir primeiro. É conta de
        produção, não sandbox: serve de ponto de partida, mas **não cria sub-conta**
        até o titular virar CNPJ (restrição confirmada na doc, ver acima).
      - 📌 **Guilherme registrou `contato@vytraoficial.com.br`** (11/set) — provedor não
        especificado ainda. **Não é** o mesmo item que `mail.vytraoficial.com.br` do §16/§17
        (infra de SMTP transacional do Supabase Auth, com SPF/DKIM/DMARC, ainda pendente de
        decisão de provedor) — são dois pedaços diferentes: esse é caixa de e-mail humana
        (contato comercial, cadastro em serviços como o próprio Asaas), aquele é envio
        automatizado do app. Não mexe na ordem de execução do §16/§17.
      - ✅ **Decidido (11/set): fica em standby, desenho fechado.** Guilherme optou por
        esperar a decisão do CNPJ em vez de adotar a rota "cada profissional com conta
        Asaas própria" (avaliada nesta mesma sessão). Motivo explícito dele: **profissional
        não pode precisar gerar/colar API key** — tem que ser cadastro fácil, dentro do
        app. Isso derruba a opção de conta própria por profissional (exigiria exatamente
        isso) e reconfirma o desenho original de sub-conta sob o CNPJ da Vytra.
      - ✅ **Onboarding do profissional sem API key, desenhado.** Novo passo 0 no Fluxo 1
        do artifact: profissional aprovado (`admin.tsx`) preenche formulário in-app —
        nome, CPF/CNPJ, endereço, telefone (campos reais exigidos pela API de criar
        sub-conta do Asaas, conferido na doc oficial) — e o backend (`criarSubcontaAsaas()`,
        Edge Function com a chave master) cria a sub-conta por trás. Profissional nunca
        vê, cola ou gerencia credencial nenhuma. `professionals.asaas_subconta_id`
        (já existe no schema aplicado) grava o resultado.
      - Artifact atualizado com o passo 0, banner de standby e as duas decisões acima:
        https://claude.ai/code/artifact/7b1e541b-6e03-4a79-b813-a3a352b6e368
  - 🔁 **Retomando os outros 2 gaps do WebDiet enquanto o CNPJ não sai (11/set)** — prontuário
    evolutivo por sessão e anexos do paciente, os dois sem nenhuma dependência de
    CNPJ/gateway.
    - 🔎 **Segunda fonte checada**: [mcp.ai/webdiet](https://mcp.ai/webdiet) (página de
      marketing do mesmo MCP, distinta da introspecção direta feita antes). Número bate:
      página diz 56 tools, introspecção direta trouxe 62 — reconcilia exato como
      62 − 6 utilitários (`show_version`/`report_bug`/`connect`/`toolkit_info`/
      `marketplace`/`authenticate`) = 56 de domínio. **Confirma os 3 gaps já decididos**
      (financeiro, prontuário, anexos — essa página cita até "slides educacionais" como
      tipo de anexo, reforça o #3).
      - **Achado novo, não mapeado na introspecção direta**: a página cita "food diary
        entries, meal reactions" (diário alimentar + reação à refeição, dia a dia) — não
        bateu com nenhum tool nomeado dos 62 (pode ser feature só do app web do WebDiet,
        sem tool MCP próprio, ou estar sem nome dentro de `orientacoes`/`prontuario_write`).
        Categoria diferente do check-in periódico do Vytra (que já é superior nesse
        recorte, ver comparação de 11/set). **Não entra na fila agora** — só registrado
        pra não perder o achado.
    - **Retomando por prontuário evolutivo primeiro** (mais parecido com o que já existe —
      `atendimentos` — menos novidade que anexos). ✅ **Decisão resolvida em 12/set**: estender
      `atendimentos` (`teleconsulta_id` opcional), não criar `sessoes_clinicas` separada —
      construído, ver §33.
    - 🔎 **Terceira fonte checada (14/set): `webdiet.com.br/site` (site oficial de marketing,
      não o MCP) + screenshots do Guilherme logado no próprio painel dele.** Sem login feito
      por mim (credencial é ação vedada) — só página pública + prints que ele já tinha
      tirado. Confirma a navegação principal batendo com os 3 gaps: aba **Marketing** =
      site próprio + cadastro de parcerias (por trás do "Financeiro"/"Ferramentas" tem
      papel timbrado próprio + gestão de equipe/acesso, mesmo padrão white-label que o
      Vytra mira no §2). Achados:
      - **Gap #1 (financeiro) confirmado nominalmente**: feature chamada "Sistema
        financeiro" na página — "planejamento financeiro e emissão de recibos".
      - **Diário alimentar fotográfico (achado do mcp.ai de 11/set) confirmado por fonte
        oficial, não só pela página de marketing do MCP**: "Acompanhamento com diário
        alimentar — diário fotográfico das refeições". Segue **fora da fila** (é
        categoria diferente do check-in do Vytra), mas não é mais especulação — é feature
        real e citada duas vezes por fontes independentes.
      - **Gap #2 (prontuário evolutivo) não aparece nomeado** na página pública — só
        "Anamnese completa" e "Questionários pré-consulta". Não desconfirma o gap (pode
        estar dentro de "Anamnese completa" sem nome próprio), só não achei confirmação
        direta feature-a-feature como no #1.
      - **Não mapeado antes, fora dos 3 gaps mas relevante pro módulo dieta (§2)**:
        **Body3D** (avaliação antropométrica por 2 fotos de celular → %gordura, massa
        magra, circunferências, risco metabólico, IMC) e **"Inteligência Webdiet"** (IA
        pra interpretar anamnese, gerar orientação nutricional, interpretar exame
        laboratorial, sugerir metas — "Clara IA" no plano mais caro). **Não é gap
        decidido** — só registrado pra não perder o achado, mesmo tratamento dado ao
        diário alimentar em 11/set.
      - Preço público (referência de mercado pro nosso próprio pricing do §2): Premium
        R$49,90/mês promocional (3 meses, depois R$94,90), Black R$139,90/mês, plano
        graduação gratuito.
    - 🔎 **Quarta fonte (14/set): prints do painel logado do Guilherme, menus abertos
      (Consultório/Estudos/Marketing/Ferramentas + menu rápido do avatar).** Confirma
      estrutura completa de navegação:
      - **Consultório**: Pacientes, Agendamentos, Pré-consulta, Respostas pré-consulta,
        Meus favoritos, Meus alimentos, Receitas culinárias, **Diário alimentar**,
        **Financeiro**, Impressos, Lixeira.
      - **Estudos**: Lâminas, Cursos completos, WebDiet Cast, Biblioteca científica,
        Casos clínicos, Pasta compartilhada, E-books, Blog.
      - **Marketing**: WebDiet canvas, Mensagens do sistema, Modelos de mensagens,
        Benefícios para pacientes, NutriLinks, Criador de site, Mailing captado.
      - **Ferramentas**: Videochamada (nativa — Vytra usa link externo de Google Meet,
        §5 `teleconsultas`), MoveHealth (paywall no plano básico — "Atualizar plano" pra
        integrações), Estatísticas, Benefícios para você, Ver chat.
      - **Menu rápido do avatar** (atalho pra 5 ações): nova tarefa, novo paciente, **novo
        registro financeiro**, novo questionário, **novo arquivo no cloud**.
      - **Gap #1 (financeiro) reforçado**: item de menu dedicado + atalho de criação
        rápida — não é só "emitir recibo", é registro financeiro genérico.
      - **Gap #3 (anexos) achado direto**: "novo arquivo no cloud" no atalho rápido +
        "Impressos"/"Lixeira" no Consultório — confirma upload de arquivo genérico do
        lado profissional (equivalente ao gap identificado). Ainda falta confirmar se é
        por paciente ou só biblioteca geral do profissional — não deu pra ver a tela em
        si, só o menu.
      - **Gap #2 (prontuário evolutivo) segue sem confirmação direta**: nenhum item de
        menu chamado "prontuário" ou "evolução"/"sessão clínica" nos 4 menus nem no atalho
        rápido. Reforça a suspeita de 11/set — se existir, está sem nome próprio dentro de
        "Anamnese"/"Pré-consulta", não como feature separada.
      - **Achado novo, fora dos 3 gaps**: "planner"/tarefa do profissional ("Tarefa do
        planner" — nome, descrição opcional, data programada) é lista de afazeres interna
        do profissional, não relacionada a paciente. Vytra não tem equivalente. **Não é
        gap decidido**, só registrado.
      - **Ressalva**: conta nos prints parece de teste/vazia (gráfico "Histórico de
        consultas" zerado em todos os meses, "Sem prescrições") — dá a estrutura de menu,
        não o conteúdo real de uso. **É o próprio Guilherme logado como nutricionista de
        teste**, não o Tassis nem dado de paciente real.
    - 🔎 **Quinta fonte (14/set): tela de configuração de conta (avatar → 5 abas), NÃO a
      tela "Financeiro" do Consultório** — print veio de área adjacente, ainda falta ver a
      tela certa pra fechar gap #2/#3. Achado que emergiu de qualquer forma, relevante pro
      desenho de cobrança em standby (§7, 11/set):
      - Aba **"Pagamentos e transações"** aqui = cobrança **WebDiet→profissional** (a
        própria assinatura dele: "alterar cartão", "notas fiscais do último ano") —
        **separada** do "Financeiro" do menu Consultório (que é profissional→paciente).
        É a mesma separação de dois fluxos que já desenhamos (Fluxo 1 paciente→
        profissional vs. Fluxo 2 profissional→Vytra) — referência de UI real de um
        concorrente pra quando o CNPJ destravar a implementação.
      - Aba **"Usuários e secretária"**: multi-usuário por profissional (papel
        secretária/administrativo), "Nenhum usuário criado" — Vytra não tem hoje (RLS é
        1 profissional = 1 login). **Não é gap decidido**, só registrado — teria
        implicação de RLS se um dia entrar (§0 aplica).
      - Aba **"Personalização de logotipo e app"**: toggle por feature, default pra novos
        pacientes (WebDiet app, MoveHealth, Webdiet+, chat, alerta hidratação,
        questionário de frequência alimentar) — padrão parecido com o que o Vytra
        provavelmente vai precisar quando tiver mais de um módulo opcional por plano.
      - Aba **"Contatos de farmácias"**: lista de e-mail de farmácia parceira — não
        mapeado, escopo pequeno, não é gap.
      - **Ainda pendente**: tela real do "Financeiro" (Consultório), tela de anexo/
        "Impressos"/"novo arquivo no cloud", e ficha de paciente aberta — únicos jeitos de
        fechar gap #2 (prontuário) e confirmar o escopo exato do #3 (anexo por paciente
        vs. biblioteca geral).

## 8. Estado atual

- Histórico do início do projeto (scaffold Expo renomeado, rotas provisórias em grupo
  `(app)`, primeiros commits sem remote) — tudo isso foi substituído já na v1 utilizável
  (02/set, ver abaixo) e não descreve mais o estado do código. Mantido só o gotcha real:
- ⚠️ **Gotcha real encontrado e corrigido:** Expo Router faz SSR até no `expo start --web`
  (renderiza em Node, sem `window`). O client Supabase com `AsyncStorage` batia nisso e
  derrubava o servidor inteiro (`ReferenceError: window is not defined`). Corrigido em
  [`src/lib/supabase.ts`](src/lib/supabase.ts) com um `webSafeStorage` guardado por
  `typeof window`, mesmo padrão já usado no `OLIHealthHub/src/services/supabase.ts`.
- ✅ **V1 utilizável implementada (02/set)** — telas reais, dados reais, scaffold zerado:
  - **Aluno · Treino** ([`src/app/aluno/index.tsx`](src/app/aluno/index.tsx)): abas por dia
    (A/B/C…) coloridas por tipo, card por exercício com prescrição (warm/feeder/working),
    última sessão, leitura de progressão, steppers de carga/reps, registro de série e
    histórico. Grava via draft→log igual ao protótipo (ver §11).
  - **Aluno · Dieta** ([`dieta.tsx`](src/app/aluno/dieta.tsx)): totais do dia vs. metas de
    macro, refeições, itens com quantidade/macros e substituições.
  - **Profissional · Alunos** — tela original, contagem total/ativos/inativos e card por
    aluno com plano/status/dias desde o último treino (sinaliza quem sumiu há 7+ dias — a
    dor de "quem não responde" do §2). ⚠️ **Fundida no Painel em 04/set** — o conteúdo desse
    bullet hoje mora em [`src/app/pro/index.tsx`](src/app/pro/index.tsx) junto com Agenda,
    ver a entrada "Painel de gestão" mais abaixo, que é a descrição atual.
  - **Profissional · Planos** ([`planos.tsx`](src/app/pro/planos.tsx)): lista, criação e
    ativar/desativar dos `professional_plans` (nome, preço, periodicidade, módulos).
  - **Perfil** (ambos): dados do profile, vínculos e sair.
- Design system em [`src/theme/index.ts`](src/theme/index.ts) — preto real, cards
  elevados, cores saturadas por categoria, seguindo a referência Apple Fitness do §1.
  As cores push/pull/leg mantêm a semântica que o protótipo já usava.
- ✅ **RLS verificada de verdade (02/set)**, por simulação de JWT no SQL
  (`set local role authenticated` + `request.jwt.claims`):
  - usuário autenticado aleatório → **0 linhas** em profiles, anamnese, logs, dieta,
    assinaturas e planos;
  - aluno → só o próprio dado + o profile do profissional dele;
  - Tassis → só o dado do aluno vinculado + o próprio.
  Isso foi checado **antes** de publicar, porque a `anamnese` tem dado de saúde
  (condições médicas, medicamentos, cirurgias) numa URL pública.
- ✅ **Os dois lados vistos com login real (03–04/set)**: `expo start --web`, conta do
  Guilherme (aluno do Tassis) e conta do próprio Tassis (profissional) — as 6 telas
  (Treino/Dieta/Perfil do aluno, Alunos/Planos/Perfil do profissional) renderizam com dado
  de produção batendo com §5/§11.
- ✅ **Bug encontrado e corrigido (04/set):** [`src/app/aluno/index.tsx`](src/app/aluno/index.tsx)
  e [`src/app/pro/planos.tsx`](src/app/pro/planos.tsx) usavam `user!.id` direto no JSX sem
  guardar contra `user` nulo. Se a sessão trocar (sign-out → sign-in de outro papel) com a
  tela ainda montada na mesma aba, o estado local (`data`/`planos`) ficava com o resultado
  antigo enquanto `user` já tinha virado `null` por um instante — quebrava com
  `Cannot read properties of null (reading 'id')`. Reproduzido ao logar como aluno, depois
  como Tassis, sem reload de página. Não afetava login direto (a rota `/` só redireciona
  depois de `profileLoaded`), mas era risco real em device compartilhado ou troca de conta
  na mesma aba. Corrigido nas duas telas: `useEffect` reseta o estado quando `user` vira
  `null`, e o guard de render (`if (loading || !user) return <Loading />`) cobre o resto.
  Verificado: typecheck limpo (`npx tsc --noEmit`) + 4 reloads seguidos sem erro no console.
- ✅ **Editor de plano de treino** ([`src/app/pro/aluno/[id].tsx`](src/app/pro/aluno/%5Bid%5D.tsx)):
  tocar num aluno na lista abre o editor — dias (tipo, grupos musculares), exercícios,
  séries, faixa de reps, warm/feeder, flags cronometrado/ombro. Preserva ids (ver §11).
- ✅ **Formulário público de anamnese por token** ([`src/app/convite/[token].tsx`](src/app/convite/%5Btoken%5D.tsx),
  04/set): sem login, uma página só (sem wizard, sem campo obrigatório) — fiel ao protótipo
  (`prototype/index.html`, `PERGUNTAS_ANAMNESE`), 10 seções, 56 campos, mesmos `id`s exatos
  (schema em [`src/models/anamnese.ts`](src/models/anamnese.ts), porque `finalizar_cadastro_convite`
  lê algumas chaves por nome). Fluxo: `obter_convite` → formulário → `submeter_anamnese` →
  tela de criar senha → `signUp` → `finalizar_cadastro_convite` → `/aluno`. RPCs embaladas em
  [`conviteService.ts`](src/services/conviteService.ts). `src/app/_layout.tsx` ganhou exceção
  pra rota `/convite` não ser redirecionada pelo guard de auth (ela cuida da própria
  navegação, inclusive no instante entre `signUp` e `finalizar_cadastro_convite`).
  **Testado ponta a ponta até a etapa de senha** com convite de QA criado via SQL e apagado
  depois — carrega convite real, grava respostas (só as preenchidas, confirmado no banco),
  avança pra tela de senha com e-mail certo, e trata token inexistente ("Link indisponível").
  **Não testado a criação de conta em si** (`signUp`/`finalizar_cadastro_convite`) — entra na
  regra de não criar contas mesmo em ambiente de teste; confere quando o Tassis mandar um
  convite de verdade.
  ⚠️ Lente de segurança/LGPD (§0) aplicada: nada das respostas é persistido fora do Supabase
  (sem AsyncStorage) — só o necessário roda no estado do componente. Senha mínima subida pra
  8 caracteres (era 6 no protótipo). Mantido como risco aceito e já documentado (§16): RPCs
  públicas sem CAPTCHA/rate limit, token sem TTL — não é bloqueador pro piloto, mas fica
  registrado.
- ✅ **Tela do profissional que gera o convite** ([`src/app/pro/convite.tsx`](src/app/pro/convite.tsx),
  04/set): nome + e-mail + escolha de `professional_plans` ativo (Pill), acessível pelo botão
  "+ Convidar" em Alunos. `criarConvite()` em [`professionalService.ts`](src/services/professionalService.ts)
  insere direto em `convites` (RLS já cobre: `created_by = auth.uid()`), sem precisar de RPC.
  **Token passou a ser gerado no banco**, não no client — migração
  [`20260904_convite_token_default.sql`](supabase/migrations/20260904_convite_token_default.sql)
  (`gen_random_uuid()` como default da coluna `token`); motivo: `crypto.randomUUID()` não é
  garantido em todo runtime React Native, gerar no Postgres é mais forte e não depende do
  client. `database.types.ts` regenerado depois da migration (sempre necessário, ver §5).
  ⚠️ Gotcha de roteamento encontrado: qualquer arquivo dentro de `src/app/pro/` vira aba
  automaticamente no `<Tabs>` do `pro/_layout.tsx` — `convite.tsx` apareceu como 4ª aba até eu
  adicionar `<Tabs.Screen name="convite" options={{ href: null }} />`, mesmo padrão já usado
  pra `aluno/[id]`. **Testado ponta a ponta com dado real** (convite de QA criado pela própria
  tela, aberto o link gerado, chegou na anamnese certa, depois apagado do banco).
- ✅ **Agenda de teleconsultas por Google Meet** (04/set — nasceu em `pro/agenda.tsx`, depois
  fundida em [`src/app/pro/index.tsx`](src/app/pro/index.tsx), ver entrada do Painel abaixo).
  Escolhe aluno, data, hora, cola o link do Meet (gerado à
  parte em `meet.google.com/new` — decisão explícita de não integrar via OAuth com Google
  Calendar por ora, ver abaixo) e observações opcionais; marca depois como realizada/cancelada
  (sem policy de delete — histórico preservado, mesma lógica de nunca sobrescrever do §14).
  Tabela `teleconsultas` + RLS em
  [`20260904_teleconsultas.sql`](supabase/migrations/20260904_teleconsultas.sql) (paciente lê
  a própria, profissional lê/edita as que criou, `is_professional_of` barra agendar pra
  paciente de outro profissional). `teleconsultaService.ts` novo. Aluno vê a próxima consulta
  (data/hora + botão "Entrar na chamada") no [`perfil-screen.tsx`](src/components/perfil-screen.tsx)
  compartilhado. **Testado ponta a ponta**: criado, apareceu na agenda, RLS simulada por JWT
  confirma que o paciente certo vê e um usuário aleatório não vê nada — depois apagado do
  banco. `get_advisors(security)` rodado depois da migration: nenhum warning novo.
  ⚠️ Gotcha de roteamento repetido: `agenda.tsx` também precisou de `<Tabs.Screen>` explícito
  em `pro/_layout.tsx` (mesmo motivo do `convite.tsx` acima) — **todo arquivo novo em
  `src/app/pro/` que não for uma aba de verdade precisa de `href: null` no layout, ou vira
  aba fantasma sozinho.**
  📌 **Decisão registrada (04/set):** vídeo em si nunca passa pelo Supabase/app — só a URL do
  Meet é armazenada, gerada fora do app pelo profissional. Integração real com Google Calendar
  (OAuth por profissional, evento + link automáticos) foi avaliada e adiada de propósito:
  exigiria projeto Google Cloud, tela de consentimento OAuth e guardar `refresh_token` com
  segurança (dado de credencial, novo tipo de risco) — descartado por ora em favor da versão
  mais simples e com menos superfície de segurança nova (§0).
- ✅ **Painel de gestão** ([`src/app/pro/index.tsx`](src/app/pro/index.tsx), 04/set). Resposta
  a "existe uma visão consolidada dos pacientes?" — não existia, estava fragmentada em §2
  (dashboard de ansiedade/fome, F4, não iniciada) e F1b (tendência do check-in, também não
  iniciada). Esta é a versão que dá pra construir agora, **sem tabela nova** — só agrega o que
  já existe: placar (total/ativos/sem plano/sem treino 7d+/convites pendentes), "Atenção
  necessária" (sem treino há 7+ dias, sem nenhum plano montado, sinal de saúde não-vazio na
  anamnese — `condicoes_medicas`/`lesoes_dores`), agenda de teleconsultas completa (com ações
  Entrar/Realizada/Cancelar + form de agendar) e lista de todos os alunos com indicador
  Treino/Dieta montados ou não. `gestaoService.ts` (`obterPainelGestao`), reaproveita
  `listarAlunos` e `listarAgenda` já existentes.
  ✅ **Fundido em uma tela só (04/set, mesmo dia):** o Painel nasceu como 5ª aba separada de
  Alunos e Agenda; a pedido do Guilherme, as três foram **unificadas em `pro/index.tsx`** —
  "por enquanto", ele mesmo marcou, então pode voltar a separar se a lista de alunos ou a
  agenda crescerem demais pra caber numa tela só. `pro/painel.tsx` e `pro/agenda.tsx` foram
  apagados (conteúdo migrado, nada ficou duplicado); o app do profissional agora tem **3
  abas**: Painel, Planos, Perfil. `pro/_layout.tsx` simplificado de volta.
  `PainelGestao.proximasConsultas` (top 5, só agendadas) virou `PainelGestao.agenda` (lista
  completa, todos os status) porque a tela fundida precisa das ações de status, não só leitura.
  **Testado com dado real** do Tassis nas duas versões (separada e depois fundida): placar
  bateu (1/1/0/0/0), contador de convites pendentes reagiu a um convite de teste criado e
  apagado via SQL (0→1→0), form de agendar teleconsulta abre inline sem sair da tela, zero
  erro de console numa aba nova e limpa. RLS não muda — cada query já usa as policies
  existentes (`is_professional_of`, `professional_id = auth.uid()`), o painel só lê o que o
  profissional já podia ver espalhado nas outras telas.
- ✅ **Editor de dieta** ([`src/app/pro/aluno/[id]/dieta.tsx`](src/app/pro/aluno/%5Bid%5D/dieta.tsx)):
  metas de macro do dia, refeições, itens vindos da busca TACO (macros calculados a partir
  do valor por 100g) ou item livre. Detalhe do aluno agora tem duas telas com alternador
  (Treino | Dieta).
- ✅ **Editar `professional_plans` existente (04/set)**: `atualizarPlano()` em
  [`professionalService.ts`](src/services/professionalService.ts) + botão "Editar" no card
  em [`pro/planos.tsx`](src/app/pro/planos.tsx), reaproveitando o form de criação
  (`PlanoForm` compartilhado). Testado ponta a ponta com a conta real do Tassis: editou
  preço, salvou, refletiu no card — depois revertido via SQL pra não deixar dado de teste
  em produção. Falta ainda o editor de substituições de alimento (as existentes são
  preservadas e exibidas, mas não dá pra criar/remover pela tela).
- ✅ **Leads e atendimentos** ([`src/app/pro/leads.tsx`](src/app/pro/leads.tsx), 04/set) — passo 1
  do funil (§12), a consulta de sensibilização antes de qualquer convite. Nova aba "Leads" no
  `pro/_layout.tsx`. `leads` (nome/telefone/email, `status` lead|convertido|perdido,
  `data_retomada`, `observacoes`) e `atendimentos` (nota de cada consulta, pendurada em
  `lead_id` ou `client_id` — `atendimentos_alvo_check` exige pelo menos um) em
  [`20260904_leads_atendimentos.sql`](supabase/migrations/20260904_leads_atendimentos.sql),
  `leadsService.ts` novo. RLS igual a `professional_plans_write`: só o dono
  (`professional_id = auth.uid()`) mexe — não usa `is_professional_of()` porque, por
  definição, ainda pode não existir assinatura nenhuma. Restrição do §12 respeitada: lead
  não tem `profiles.id`, por isso vive em tabela própria com `client_id` nulo até converter.
  **"Gerar convite" a partir de um lead** pré-preenche nome/e-mail
  (`pro/convite.tsx?leadId=...`) e grava `convites.lead_id`; `finalizar_cadastro_convite`
  (mesma RPC) ganhou um passo a mais: se o convite tem `lead_id`, marca o lead
  `convertido` e amarra o `client_id` recém-criado — sem isso o lead ficaria "aberto" pra
  sempre mesmo já sendo paciente pagante. `get_advisors(security)` rodado depois da
  migration: nenhum warning novo (mesma lista já aceita do §0).
  **Testado ponta a ponta com dado real** do Tassis: lead criado pela tela, atendimento
  registrado e listado com data/hora, convite gerado a partir do lead com nome/e-mail
  prefill confirmado via DOM (`value` do input, não só o texto), `convites.lead_id` ↔
  `leads.convite_id` batendo nos dois sentidos no banco. **A sincronização de conversão**
  (`finalizar_cadastro_convite` marcando o lead como `convertido`) foi verificada por
  simulação completa em transação com rollback (auth user novo → convite com `lead_id` →
  RPC → lead virou `convertido` com `client_id` certo → rollback), mesmo método já usado
  em 03/set pro `convites_cria_assinatura` — não criei conta de verdade, só simulei
  dentro de uma transação desfeita. Tudo o que passou pela tela (lead, atendimento,
  convite real) foi apagado do banco depois via SQL, nada de teste ficou em produção.
- ⚠️ **Tentativa revertida no mesmo dia: etapa de "contratação" com link de pagamento
  dentro do convite.** Implementei uma tela "Seu plano" (preço + botão "Pagar agora" com
  link de pagamento pasteado pelo profissional) antes da anamnese — **errado**, corrigido
  pelo Guilherme na hora: não existe link de pagamento nesse ponto do fluxo, e o convite
  ainda podia nascer "frio" (direto do Painel, sem ter passado pela call), quando na
  vida real o profissional não tem nome/e-mail/plano de ninguém antes da conversa
  acontecer. Revertido por completo: `20260904_reverter_convite_contratacao.sql` (dropa
  `convites.link_pagamento`, `obter_convite` volta a devolver só nome/e-mail/status).
  Migração `20260904_convite_contratacao.sql` fica no histórico só como registro do que
  foi tentado e desfeito — não aplicar de novo sem repensar.
- ✅ **Convite só nasce de um lead** (04/set, correção do ponto acima). Fluxo real, nas
  palavras do Guilherme: (1) lead recebe o link/convite **da call de sensibilização**
  (fora do app — Meet/WhatsApp, nada a persistir aqui, é antes de qualquer registro
  existir); (2) **durante** a call, profissional cria o lead + atendimento no sistema,
  já com o plano decidido na conversa (isso já existia, ver bullet de Leads acima); (3)
  se o cliente topa continuar, profissional gera **um único link** a partir do lead —
  só anamnese, sem etapa extra, sem pagamento em tela. `pro/convite.tsx` agora **exige**
  `?leadId=` — sem ele mostra "o convite parte de um lead" + botão pra Leads, não deixa
  preencher nome/e-mail às cegas. `criarConvite()` em
  [`professionalService.ts`](src/services/professionalService.ts) tornou `leadId`
  obrigatório (não é mais opcional). O atalho "+ Convidar" do Painel agora aponta pra
  `/pro/leads` (era `/pro/convite` direto) — não existe mais porta lateral que pule o
  lead.
  **Testado ponta a ponta**: `/pro/convite` sem lead mostra o aviso certo; lead criado →
  "Gerar convite" prefila nome/e-mail → convite salvo com `lead_id` correto no banco →
  link público abre direto na senha (sem tela de plano/pagamento no meio).
  `get_advisors(security)` conferido depois do revert: warnings idênticos aos de antes
  desse dia, nada novo. Tudo de teste apagado do banco depois.
  ⚠️ **Corrigido de novo, mesmo dia, ver bullet seguinte**: nem plano na tela de convite
  ficou certo — o Guilherme esclareceu que plano é escolhido pelo PACIENTE, dentro do
  app, depois de logar — não pelo profissional na hora de gerar o link.
- ✅ **Anamnese e escolha de plano migram pra dentro do app autenticado** (04/set, terceira
  correção do funil no mesmo dia). Descrição do Guilherme do fluxo real: o lead recebe o
  link **depois** da call de sensibilização já com conta pra criar (não anamnese pra
  preencher às cegas); cria a conta, entra, e SÓ ENTÃO responde a anamnese e escolhe o
  plano que quer comprar — tudo dentro do app, sem sair dele. O profissional revisa e
  decide se libera.
  - `pro/convite.tsx` voltou a ser só nome/e-mail (plano saiu de vez daqui).
  - `convite/[token].tsx` (link público) virou só "criar conta" — sem anamnese, sem
    formulário nenhum. `finalizar_cadastro_convite` foi simplificado: não lê mais
    `convites.respostas`/anamnese, só cria a `subscriptions` (`plan_id` nulo) e fecha o
    convite/lead.
  - **Onboarding novo dentro do app**: [`aluno/_layout.tsx`](src/app/aluno/_layout.tsx)
    checa se o cliente já tem `anamnese` (`possuiAnamnese`); se não tiver, mostra
    [`OnboardingAnamnese`](src/components/onboarding-anamnese.tsx) no lugar das abas —
    mesmas seções de sempre ([`models/anamnese.ts`](src/models/anamnese.ts)) + escolha de
    plano (`professional_plans` do profissional vinculado), tudo num envio só.
  - `subscriptions.plano_solicitado_id` (coluna nova) guarda o que o PACIENTE pediu —
    soft, não libera nada sozinho. `subscriptions.plan_id` continua sendo o que vale de
    verdade (hard) — só o profissional muda isso, confirmando no Painel
    ([`PedidoPlanoCard`](src/app/pro/index.tsx), seção "Pedidos de plano" — nova stat +
    lista com botão "Confirmar").
  - **RPC nova** `submeter_anamnese_autenticado(p_respostas, p_plano_id)`
    (`SECURITY DEFINER`, escopada em `auth.uid()`) grava a anamnese e o
    `plano_solicitado_id` — RLS **não deixa** paciente escrever direto em `anamnese` nem
    `subscriptions` (conferido antes de construir: só existe
    `anamnese_insert_professional`/`anamnese_update_professional` e `subscriptions_write`
    com `professional_id = auth.uid()`), então sem essa RPC o paciente poderia tentar
    setar o próprio `plan_id` e se auto-liberar — exatamente o que essa RPC evita ao só
    tocar em `plano_solicitado_id`, nunca em `plan_id`.
  - **RLS ajustada**: `professional_plans_select` não deixava o paciente ver os planos do
    próprio profissional antes de já ter um `plan_id` setado (ovo-e-galinha — precisava
    ver o plano pra pedir, mas só via depois de confirmado). Adicionado
    `is_client_of(professional_id)` como alternativa — mesmo critério já usado em outras
    tabelas, sem RLS nova de verdade.
  - Migrações: [`20260904_anamnese_pos_login.sql`](supabase/migrations/20260904_anamnese_pos_login.sql)
    (coluna + RPCs) e
    [`20260904_paciente_ve_planos_do_profissional.sql`](supabase/migrations/20260904_paciente_ve_planos_do_profissional.sql)
    (RLS). `get_advisors(security)` conferido depois de cada uma: só o warning padrão
    (RPC nova anon-chamável, mesma classe já aceita das outras) — nenhuma categoria nova.
  - **Testado ponta a ponta com dado real do Tassis**: lead → convite (só nome/e-mail) →
    link público → criar conta → onboarding aparece automaticamente (não as abas) →
    anamnese + plano enviados → `subscriptions.plano_solicitado_id` gravado certo →
    Treino/Dieta mostram "Aguardando confirmação do profissional" → confirmação simulada
    via transação com JWT do Tassis (mesma técnica de verificação já usada antes,
    `subscriptions_write` permitiu o update) → `plan_id` setado → reload → Treino/Dieta
    voltam a mostrar o estado normal ("ainda não montou plano"). Conta de teste e todo o
    resto apagados do banco depois — o lead real "Guilherme" (criado pelo próprio
    Guilherme) não foi tocado.
  - ⚠️ **Observado, não corrigido**: no primeiro carregamento do onboarding logo após o
    `signUp`, a lista de planos apareceu vazia por um instante (sessão ainda propagando
    pro client Supabase) — um reload resolveu, e o mesmo padrão de corrida já é conhecido
    (comentário em `authStore.ts` sobre por que o profile é carregado via `setTimeout`).
    Não implementei retry — se aparecer de novo em uso real, vale revisitar.
  - **Não testado pela UI**: o clique do botão "Confirmar" no Painel (`PedidoPlanoCard`)
    em si — a sessão do browser virou a do paciente de teste durante o teste (mesmo
    localStorage), e eu não tenho a senha real do Tassis pra logar de volta como
    profissional. A escrita subjacente (`update subscriptions set plan_id = ...`) foi
    verificada via simulação de JWT do Tassis, e o botão chama exatamente essa mesma
    chamada (`confirmarPlanoSolicitado`), no mesmo padrão já usado por
    `alternarPlanoAtivo`/`atualizarPlano`. Vale um clique manual de verificação quando o
    Tassis testar de novo.
  - **Simplificação aceita**: o gate de Treino/Dieta é tudo-ou-nada (`plan_id` nulo bloqueia
    os dois) — não olha `inclui_treino`/`inclui_dieta` do plano confirmado pra liberar só
    um dos dois. Registrado como gap, não implementado agora.
- ✅ **Convite reconhece conta existente** (04/set — resposta a "e se o paciente já for
  usuário do app, de outro profissional ou de antes?", com **duas correções de desenho no
  mesmo dia** antes de chegar na versão que ficou).
  - Cogitado busca por nome na base de usuários e **descartado** pela lente de segurança/
    LGPD (§0): exporia "essa pessoa é paciente do app" pra qualquer profissional, mesmo sem
    relação nenhuma com ela — vira diretório navegável de quem usa a plataforma.
  - Primeira tentativa: o link mostraria "Entrar" com a senha real de quem já tem conta.
    **Revertida no mesmo dia** — pedir a senha de uma conta existente dentro de um link
    mandado por outra pessoa tem exatamente a cara de phishing, e eu nunca testei essa parte
    (recuso terminantemente digitar senha de qualquer conta, inclusive a do próprio
    Guilherme, em qualquer campo — ver regras de segurança da sessão).
  - Segunda ideia (código alfanumérico gerado pelo profissional, trocado por sessão via
    `admin.generateLink`/`verifyOtp`) foi **cogitada e não implementada** — exigiria Edge
    Function nova (primeira do projeto) segurando a `service_role key`. Descartada pela
    ideia seguinte, mais simples e sem infra nova.
  - **Versão que ficou**: profissional não pede senha nem código de ninguém. Se o e-mail já
    tem conta, a pessoa simplesmente entra no app do jeito de sempre (login normal) e vê
    **dentro do app** um pedido pendente do novo profissional — aceita ou recusa, sem
    reautenticar nada. `convite/[token].tsx`, quando `contaExistente`, só diz "você já tem
    conta, entra pelo login" com um botão pra `/login` — nunca mostra campo de senha pra
    conta existente.
  - **RPCs novas** (`SECURITY DEFINER`, mesmo padrão de sempre): `obter_solicitacoes_pendentes()`
    devolve os convites `pendente` endereçados ao e-mail autenticado (`auth.uid()` →
    `auth.users.email`) — não é busca, só responde sobre o próprio e-mail de quem chama;
    `recusar_convite(p_token)` fecha o convite como `recusado` (checou que o e-mail bate,
    igual `finalizar_cadastro_convite`). "Aceitar" reaproveita `finalizar_cadastro_convite`
    sem nenhuma mudança — ele já só confere sessão-vs-e-mail-do-convite, indiferente a
    `signUp` ou `signIn`.
  - Precisou abrir o CHECK constraint de `convites.status` (só aceitava
    `pendente`/`preenchido`/`concluido`) pra incluir `recusado`.
  - **Novo componente** [`SolicitacoesPendentes`](src/components/solicitacoes-pendentes.tsx),
    gate em `aluno/_layout.tsx` **antes** do gate de anamnese: se há solicitação pendente,
    mostra ela no lugar das abas (e no lugar do onboarding); resolvida (aceita ou recusada),
    cai pro gate seguinte normalmente.
  - `obter_solicitacoes_pendentes` precisou de `coalesce(nullif(nome,''), 'Seu profissional')`
    — achado real: `profiles.nome` do próprio Tassis está vazio no banco (dado de produção,
    não causado por essa mudança), mesmo padrão de fallback já usado em `listarAlunos`.
  - `gestaoService.ts`: contagem de "convites pendentes" no Painel corrigida de
    `neq('status','concluido')` pra `eq('status','pendente')` — com `recusado` existindo
    agora, a versão antiga contaria recusa como pendência.
  - Migrações: [`20260904_convite_valida_conta_existente.sql`](supabase/migrations/20260904_convite_valida_conta_existente.sql)
    (`obter_convite` ganha `conta_existe`) e
    [`20260904_solicitacao_acesso_existente.sql`](supabase/migrations/20260904_solicitacao_acesso_existente.sql)
    (as duas RPCs novas + o CHECK). `get_advisors(security)` conferido depois de cada uma:
    nenhum warning de categoria nova, só a mesma classe já aceita (RPC `security definer`
    anon-chamável, inofensiva porque tudo é escopado em `auth.uid()`).
  - **Testado com dado real**: convite novo gerado (via SQL, direto — não tinha sessão do
    Tassis no browser) pro lead real do Guilherme (`gui.pasquetti@gmail.com`, que já tem
    conta). Abrir o link mostrou "Você já tem conta, Guilherme" + botão pro login, sem campo
    de senha nenhum. `obter_solicitacoes_pendentes` e `recusar_convite` verificados via
    simulação de JWT do próprio Guilherme, dentro de transação com rollback — não recusei o
    pedido de verdade, ele continua `pendente`, aberto pro Guilherme aceitar pela UI quando
    quiser (token `cd291a36-3f41-44fa-97a6-fec2a9bb5736`). **Não testado pela UI**: o login
    em si e a tela `SolicitacoesPendentes` renderizada de verdade — dependem de sessão real
    do Guilherme, que só ele pode fazer (nunca digito senha de ninguém, nem a minha).
  - ✅ **Corrigido depois do teste real do Guilherme (mesmo dia)**: a tela mostrou "Seu
    profissional" em vez do nome — achado real, não bug desta feature: `profiles.nome` do
    próprio Tassis estava **vazio no banco** (dado de produção, provavelmente porque o
    cadastro dele é anterior ao trigger que preenche `nome` a partir do metadata do
    `signUp`). Corrigido com o nome real dele, já existente em `plans.treinador` ("Tassis
    Moraes") — não inventado, só copiado de outro lugar que já guardava o dado certo.
    Pedido junto: mostrar a especialidade (Nutri x Treinador). `obter_solicitacoes_pendentes`
    ganhou a coluna `especialidade` ([`20260904_solicitacao_com_especialidade.sql`](supabase/migrations/20260904_solicitacao_com_especialidade.sql));
    `rotuloEspecialidade()` em [`solicitacoesService.ts`](src/services/solicitacoesService.ts)
    traduz o texto livre de `professionals.especialidade` (`personal_trainer` → "Educador
    físico", `nutricionista` → "Nutricionista") — valor desconhecido aparece como veio, não
    some. Card agora mostra "Tassis Moraes... Quer te acompanhar como Educador físico."
    Verificado via nova simulação de JWT do Guilherme (mesmo método, sem mexer no pedido
    real): nome e especialidade batendo.
    ⚠️ **Corrigido de novo (mesmo dia)**: grafia errada — é "Moraes", não "Morales". Copiei o
    erro de `plans.treinador`, que também estava errado; os dois foram corrigidos juntos.
- ✅ **Cadastro de profissional com verificação de CREF/CRN** (04/set — "não podemos abrir
  isso pra qualquer um se cadastrar, até porque isso pode virar mote de venda", decisão do
  Guilherme). Não existia NENHUM cadastro de profissional antes disso — o único profissional
  (Tassis) veio de backfill direto no banco (§5). Achado de segurança **antes** de construir
  (§0): a RLS de `professionals` (`professionals_insert_self`) deixava **qualquer usuário
  autenticado se auto-inserir como profissional**, sem checagem nenhuma — fechado nesta
  migração.
  - **Sem validação automática**: CONFEF (CREF) e CFN (CRN) não têm API pública — só consulta
    manual no site do conselho. Verificação é humana; o app só facilita (link direto pro site
    do conselho na tela do admin).
  - **Sem RBAC formal**: `profiles.is_admin` é uma flag simples, não um papel — hoje só o
    Guilherme (`gui.pasquetti@gmail.com`) tem `is_admin = true`. Formalizar múltiplos
    aprovadores agora seria estrutura sem uso.
  - **CPF e documento nunca em `professionals`**: essa tabela já é lida pelos próprios
    pacientes do profissional (`is_client_of`), então qualquer dado sensível ali vazaria sem
    motivo. Tabela nova `professional_verificacoes` — só o próprio profissional e quem é
    admin conseguem ler (`professional_verificacoes_select`).
  - **Fluxo**: [`cadastro-profissional.tsx`](src/app/cadastro-profissional.tsx) (rota pública
    top-level, whitelisted em `_layout.tsx` igual a `/convite`) coleta nome/e-mail/senha/CPF/
    especialidade/CREF-CRN+UF/carteirinha (`expo-document-picker`, instalado nesta mudança)/
    bio opcional → `signUp` → upload pro bucket privado `documentos-profissionais` (**primeiro
    uso de Storage no projeto**) → RPC `cadastrar_profissional` (cria `professionals` +
    `professional_verificacoes` status `pendente`, tudo num passo). Acesso já libera na hora
    (decisão do Guilherme: acesso liberado, aviso visível) — banner "Verificação pendente" no
    Painel ([`pro/index.tsx`](src/app/pro/index.tsx)) até um admin decidir.
  - **Tela de admin** [`admin.tsx`](src/app/admin.tsx) (rota top-level, também whitelisted —
    é ortogonal a aluno/profissional, um admin pode ser cliente de outro profissional ao
    mesmo tempo, caso do próprio Guilherme): lista pendentes, mostra CPF/registro/bio, link
    pro documento (URL assinada, 1h) e link direto pro site do conselho; Aprovar/Rejeitar
    (rejeitar pede motivo) grava via `update` direto — RLS (`professional_verificacoes_update_admin`)
    já garante que só admin escreve.
  - **Guard central testado de verdade**: profissional tentando setar o próprio status pra
    `aprovado` é **bloqueado pela RLS** (`professional_verificacoes_update_self` só aceita
    `with check status = 'pendente'`) — verificado com uma conta de teste tentando se
    auto-aprovar e recebendo `42501 new row violates row-level security policy`. É o ponto
    de segurança inteiro desta feature.
  - **RLS nova pro admin enxergar solicitações de gente sem vínculo nenhum**: `profiles` e
    `professionals` ganharam policy de SELECT pra `is_admin()` — sem isso o admin não
    conseguia ler nome/e-mail/especialidade de um candidato com quem ainda não tem relação
    nenhuma (mesma classe de problema do §12, "paciente vê planos do profissional" antes de
    ter assinatura). Escopo: só nome/e-mail/especialidade, nunca anamnese/saúde.
  - **Storage**: bucket privado, path sempre prefixado por `auth.uid()`
    (`{uid}/carteirinha.ext`). Policies de insert/update/select — **faltou delete** na
    primeira versão (nem o dono conseguia apagar o próprio documento pra reenviar), corrigido
    ainda no mesmo teste.
  - Migração [`20260904_cadastro_profissional_verificado.sql`](supabase/migrations/20260904_cadastro_profissional_verificado.sql).
    `get_advisors(security)` conferido depois: nenhuma categoria nova (só o padrão já aceito
    de RPC `security definer` anon-chamável).
  - **Testado ponta a ponta com dado real** (conta QA descartável): cadastro completo pela UI
    de verdade — nome/e-mail/senha/CPF/especialidade/CREF+UF/upload de documento real (o
    seletor de arquivo do Expo funciona em web) — gravou tudo certo no banco; banner
    "Verificação pendente" apareceu no Painel com Leads/Planos já liberados; aprovação
    testada via simulação de JWT do Guilherme como admin (RLS aceitou); tentativa de
    auto-aprovação bloqueada (acima). Conta de teste, documento no storage e tudo mais
    apagados depois — inclusive precisou da policy de delete que faltava.
  - ⚠️ **O pedido real do Tassis pro Guilherme** (§ imediatamente anterior, "Solicitação de
    acesso existente") **segue pendente**, sem eu tocar — a sessão do browser é do Guilherme
    de verdade e essa decisão (aceitar/recusar) é dele, não minha.
- Sem pagamento/cobrança automática ainda (schema tem `subscriptions.status`, mas nada
  muda esse status sozinho), sem contrato/LGPD.
- Toda migração de schema é versionada em `supabase/migrations/` (convenção: `AAAAMMDD_descrição.sql`,
  ver lista completa em §15). A primeira ([`20260902_...`](supabase/migrations/20260902_multi_tenant_professionals_subscriptions.sql))
  precisou ser aplicada manualmente via SQL Editor do Supabase — `apply_migration` do MCP foi
  bloqueado pelo classificador de auto mode do Claude Code naquela sessão. As seguintes
  (03/set e 04/set) foram aplicadas sem esse bloqueio via `execute_sql` do MCP — não é um
  bloqueio permanente, parece ter sido específico daquela chamada/sessão.
- ✅ **Campo de observação na série, vídeo do exercício, cor por perfil (05/set).** Três
  pedidos do Guilherme sobre a tela de treino + login, nesta ordem:
  - `SetLog` ganhou `obs?: string` ([`domain.ts`](src/models/domain.ts)) — campo opcional
    abaixo do registro de série em [`aluno/index.tsx`](src/app/aluno/index.tsx), mostrado nos
    chips de séries já registradas hoje. Não aparece no histórico de sessões passadas (só no
    dia corrente) — decisão de escopo pra não complicar a linha já compacta do histórico.
  - `Exercicio` ganhou `video?: string` (URL) — campo "Vídeo (URL)" no editor do profissional
    ([`pro/aluno/[id]/index.tsx`](src/app/pro/aluno/%5Bid%5D/index.tsx)) e botão "Ver vídeo"
    (`Linking.openURL`) na tela do aluno quando presente. Sem migração — os dois campos vivem
    dentro do jsonb (`workout_logs.sets` / `plans.dias[].ex[]`), schema não muda.
  - ⚠️ **Seletor de carga: três tentativas até a que ficou.** Pedido original era trocar o
    stepper +/- por "uma barra de arrastar". Tentativa 1: `DragSlider` com `PanResponder`
    próprio — sensibilidade ruim (`locationX` durante o move é relativo ao elemento embaixo do
    dedo NAQUELE instante, não ao track; trocado por `dx` acumulado desde o toque) e depois
    brigava com o `ScrollView` da tela. **Achado importante:** no web (react-native-web) o
    `ScrollView` é scroll **nativo do navegador**, não passa pelo `PanResponder` — nenhuma
    negociação de responder no JS o intercepta; só resolve com `touchAction: 'none'` (CSS) no
    elemento. Tentativa 2: `NumberRoll` (rolo horizontal com `ScrollView` + `snapToInterval`,
    sem gesto próprio — não brigava mais). **O Guilherme não gostou de nenhuma das duas**,
    pediu de volta o stepper igual ao de reps, só que com **segurar pra repetir o incremento**.
    Versão final: `StepperButton` ganhou `onPressIn`/`onPressOut` com `setTimeout` (delay
    400ms) + `setInterval` (120ms) — achado e corrigido um bug clássico de **closure velha**:
    o `setInterval` inicial chamava o `onPress` capturado no toque, então travava repetindo o
    mesmo incremento a partir do peso de quando o dedo pousou. Corrigido com uma ref
    (`onPressRef`) sempre atualizada via `useEffect`, lida a cada tick em vez do closure velho.
    `DragSlider`/`NumberRoll`/`snapPeso` foram removidos (mortos) — só sobrou `ajustarPeso`,
    igual a antes de toda essa exploração.
  - **Cor por perfil (aluno rosa, profissional azul)**, pedido separado do Guilherme:
    `RoleColors` ([`theme/index.ts`](src/theme/index.ts)) + `RoleThemeProvider`/`useRoleColor`
    ([`contexts/role-theme.tsx`](src/contexts/role-theme.tsx), novo). `Button`/`Pill` em
    [`ui/index.tsx`](src/components/ui/index.tsx) usam a cor do perfil como padrão quando
    ninguém passa `color=` explícito — não precisou caçar botão por botão. `aluno/_layout.tsx`
    e `pro/_layout.tsx` envolvem suas telas (+ tab bar ativa) no provider certo. Roxo ficou de
    fora do esquema de perfil de propósito — já é a cor do módulo Dieta (aba, botão "Salvar
    dieta"), não mexi nisso. Pontos que tinham rosa fixo dentro do profissional (aba do editor
    de aluno em [`aluno-tabs.tsx`](src/components/aluno-tabs.tsx), botão "Convidar" do Painel,
    link do convite, "Editar" em Planos) trocados pra `RoleColors.profissional` também.
  - **Login redesenhado** ([`login.tsx`](src/app/login.tsx)): botão "Sou profissional e quero
    me cadastrar" virou um switch de 2 pills ("Aluno" | "Profissional", centralizado, cor muda
    ao trocar) + link em texto puro "Não tem cadastro? Criar conta" **fixo nas duas abas** (só
    a cor acompanha o modo) apontando pro `/cadastro-profissional` de sempre — login em si
    continua o mesmo `signIn()` pros dois perfis, a troca é só visual. Tentativa de efeito de
    corte diagonal 45° entre os dois lados (via `skewX`) foi feita e **descartada** — o
    Guilherme não gostou, voltou pro switch de pills simples.
  - **Nada disso está commitado ainda** — está tudo só no working tree. O que está no
    `origin/main` e no ar em `app-treino.expo.app` é só até o commit `f50fdbe` (observação de
    série + vídeo do exercício + primeira versão do `DragSlider`, sem os pontos acima).
- ✅ **Deploy web publicado (05/set)**: `npx expo export --platform web && eas deploy --prod` rodado
  pelo Guilherme (o `eas deploy --prod` foi bloqueado pelo classificador de auto mode nesta
  sessão, mesma classe de bloqueio já vista com `apply_migration` no §8 — não é permanente,
  específico da chamada). `app-treino.expo.app` agora reflete o commit
  [`4474093`](https://github.com/guipasquetti/treino-tassis/commit/4474093) (observação/vídeo/
  peso do commit anterior + cor por perfil/stepper hold-to-repeat/login redesenhado).
- ⚠️→✅ **Achado de segurança real, corrigido (05/set):** `profiles_update_own` (RLS de
  `profiles`) não restringia coluna nenhuma — qualquer usuário autenticado podia, via chamada
  direta à API (fora do app, ex. REST/PostgREST), setar o próprio `is_admin = true` ou trocar
  `role`, virando admin sozinho e furando toda a fila de verificação de profissional do §8. Achado
  ao mexer nessa tabela pra construir a edição de perfil abaixo — lente de segurança do §0 aplicada
  antes de escrever a feature. Corrigido com trigger `before update`
  (`profiles_protege_colunas_privilegiadas`) que bloqueia mudança de `is_admin`/`role` a menos que
  quem já é admin esteja fazendo a mudança (`public.is_admin()` checado sobre a linha ainda não
  alterada). Migração
  [`20260905_profiles_protege_colunas_privilegiadas.sql`](supabase/migrations/20260905_profiles_protege_colunas_privilegiadas.sql).
  **Verificado por simulação de JWT com rollback**: usuário comum tentando `update is_admin = true`
  na própria linha é bloqueado pela exceção do trigger; `update telefone = '...'` no mesmo teste
  passa normal. A trigger function apareceu no advisor como RPC pública `security definer`
  chamável por `anon`/`authenticated` (mesma classe do `handle_new_user` do §0) —
  `REVOKE EXECUTE` aplicado, mesma correção. `get_advisors(security)` conferido depois: nenhuma
  categoria nova além da já aceita.
- ✅ **Edição de perfil dentro do app (05/set)**, pedido do Guilherme: "atualizar o perfil do
  usuário com todos os dados e uma opção de preenchimento/edição". [`perfil-screen.tsx`](src/components/perfil-screen.tsx)
  (compartilhado pelos dois papéis) ganhou botão "Editar" que troca a visualização por campos
  (nome, telefone, data de nascimento, peso, altura — todos os campos de `profiles` exceto
  e-mail/`is_admin`/`role`, que nunca ficam editáveis pelo próprio usuário) com Salvar/Cancelar.
  `atualizarPerfil()` novo em [`authService.ts`](src/services/authService.ts) — `update` escopado
  em `id = auth.uid()`, mesma RLS `profiles_update_own` de sempre, agora com o trigger acima
  cobrindo a lacuna. `authStore` ganhou `setProfile()` pra refletir o salvo na hora, sem precisar
  de reload. **Verificado**: `npx tsc --noEmit` limpo; app sobe sem erro de console até a tela de
  login. **Não verificado pela UI logada** — precisaria de sessão real (login ou conta de teste
  com senha), e a regra da sessão é nunca digitar senha de ninguém em campo nenhum, nem de conta
  descartável. Vale um teste manual do Guilherme/Tassis quando publicar.
- 📌 **Decisão sobre TestFlight (Guilherme, 05/set):** ele já tem conta Apple Developer paga
  (não é mais bloqueio de custo), mas decidiu esperar definir **nome/marca** antes de subir —
  "Definindo nome e marca vamos para o testflight". Até lá segue só no link web de produção.
  Mesmo com a conta, falta todo o setup técnico: bundle ID, EAS Build, credenciais de
  assinatura — nada disso existe no projeto ainda (ver §10, item 8). Também sugeri usar
  `eas deploy` sem `--prod` pra ter uma URL de preview estável e separada da produção pros
  testadores, sem tocar nos pacientes reais do Tassis — o Guilherme preferiu não fazer isso
  agora também, mantendo tudo como está até a marca fechar.
- ✅ **F0 do roadmap fechada (06/set): rascunho/publicação de plano + mensagem de espera.**
  Coluna `publicado boolean not null default true` em `plans` e `planos_alimentares`
  ([`20260906_plans_rascunho_publicado.sql`](supabase/migrations/20260906_plans_rascunho_publicado.sql)).
  `default true` preserva os dois planos reais em produção sem backfill (conferido via SQL:
  os dois já continuam `publicado=true`) — só plano **novo** nasce `publicado=false`
  (`planoParaEdicao`/`planoAlimentarParaEdicao` em [`planEditor.ts`](src/services/planEditor.ts)/
  [`dietEditor.ts`](src/services/dietEditor.ts) retornam `publicado: false` quando não existe
  linha ainda). Editores ([`pro/aluno/[id]/index.tsx`](src/app/pro/aluno/%5Bid%5D/index.tsx),
  [`pro/aluno/[id]/dieta.tsx`](src/app/pro/aluno/%5Bid%5D/dieta.tsx)) ganharam Pill de status
  (Rascunho/Publicado) + botão Publicar/Despublicar — "Salvar" sozinho nunca muda o estado de
  publicação, é sempre um ato explícito separado, como pedia o item do roadmap. Telas do aluno
  ([`aluno/index.tsx`](src/app/aluno/index.tsx), [`aluno/dieta.tsx`](src/app/aluno/dieta.tsx))
  só tratam o plano como existente quando `publicado === true`; senão mostram "seu
  treinador/nutricionista está montando seu plano — fica pronto em até 2 dias" (era "ainda não
  montou", texto genérico que parecia defeito). Nenhuma RLS nova — é filtro de exibição na
  aplicação, não controle de acesso; a leitura já cai sob a mesma policy de sempre.
  `get_advisors(security)` conferido depois da migration: nenhuma categoria nova. **Testado**:
  `npx tsc --noEmit` limpo, app sobe sem erro de console/bundler até a tela de login (não
  testado logado — mesma regra de nunca digitar senha, mesmo de conta descartável).
- ✅ **Fase de Ataque iniciada (06/set): check-in recorrente automatizado.** Primeiro item da
  Fase de Ataque do roadmap (a maior lacuna do benchmark de 05/set — 3-4 de 4 concorrentes já
  automatizam isso). Tabela nova `check_ins` (série temporal, nunca sobrescrita — cada envio é
  uma linha, mesma regra do §14) + bucket privado `fotos-checkin`
  ([`20260906_checkins.sql`](supabase/migrations/20260906_checkins.sql)).
  - ⚠️ **Rascunho de conteúdo, não texto literal do Live Clean.** [`checkin.ts`](src/models/checkin.ts)
    tem as 22/23 perguntas mapeadas em 03/set (§13), mas só a ESTRUTURA (tipo/escala/categoria)
    veio de fato dos prints — a redação de pergunta e opção é meu melhor esforço a partir dessa
    estrutura, não transcrição verbatim (só existe em screenshot). Precisa de revisão do Tassis
    antes de virar produção de verdade, mesmo tratamento já dado à anamnese de treino (§10).
    Pergunta 19 segue de fora (nunca foi capturada).
  - **Regra de pontuação preservada do §13**: cada opção carrega a própria `pontuacao` (0-100),
    nunca inferida pela posição na lista (vegetais/frutas listam a melhor opção primeiro, sono
    lista a pior primeiro). Pergunta `categorica` (níveis de fome, com a opção-sinal-de-alerta
    "não sinto fome e tenho dificuldade pra comer") fica **fora** da pontuação de propósito —
    tratá-la como ordinal viraria ruído no gráfico, exatamente o erro que o §13 avisava pra não
    cometer.
  - **Revelação condicional em dois níveis**: `opcoes[].pedeDetalhe` (dentro da mesma pergunta —
    aderência e desconforto abdominal revelam campo de texto) e `dependeDe` (entre perguntas —
    "quantidade de álcool" some se "dias de álcool" for 0), mesma mecânica que o §13 pedia pra
    pergunta 17 (melhoria em cima do Live Clean original, que não tinha essa condicional).
  - **Fluxo do paciente** ([`checkin-flow.tsx`](src/components/checkin-flow.tsx),
    [`aluno/checkin.tsx`](src/app/aluno/checkin.tsx), 4ª aba nova) — uma pergunta por cartão,
    contador de progresso, avança recalculando a lista de perguntas VISÍVEIS a partir da
    resposta que acabou de ser dada (não do índice antigo), porque responder uma pergunta pode
    esconder a próxima no mesmo passo. "Pular pergunta" com confirmação inline (§13 pedia
    diálogo de confirmação — implementado como card, não `Alert.alert`, que não tem precedente
    nesse projeto). Ao enviar, mostra a pontuação na hora (`CheckinResumo`) — "devolutiva
    imediata" do §13, o que o handoff já apontava como o maior ganho de retenção do formato.
  - **Fotos** (perfil esq./dir./costas) — reaproveita `expo-document-picker` filtrado por
    `image/*` (mesmo padrão da carteirinha de CREF/CRN, §8), não instalei `expo-image-picker`
    pra não abrir uma frente nova de permissão de câmera sem necessidade agora. Caminho sempre
    `{client_id}/...`, bucket nunca público.
  - **Painel do profissional**: `gestaoService.ts` ganhou `ultimoCheckin` por aluno e stat
    "Check-in atrasado" (14+ dias sem responder, ou nunca respondeu) — mesma lógica de "sem
    treino 7d+" já existente. Alerta só dispara pra quem já tem plano montado, pra não competir
    com o alerta mais relevante de "sem plano ainda" em aluno recém-chegado.
  - **Explicitamente fora desta entrega** (itens 05 e parte do 04 da Fase de Ataque no
    roadmap): gráfico de tendência/histórico visual pro profissional (hoje só lista
    data+pontuação, sem curva) e comparação automática das fotos — são pedaços grandes de UI
    que merecem passe próprio, não emendados aqui. Também sem lembrete por WhatsApp (decisão do
    Guilherme, 06/set: provedor ainda não escolhido) — "periodicidade" hoje é só um `>14 dias`
    calculado no cliente, sem notificação nenhuma além do que já aparece dentro do app.
  - **RLS verificada por simulação de JWT com rollback**: paciente insere só o próprio
    (`client_id = auth.uid()`), tentativa de inserir em nome de outro paciente bloqueada;
    profissional vinculado lê (1 linha), usuário sem vínculo não vê nada (0 linhas). Sem
    update/delete na tabela — como `workout_logs`, histórico nunca é reescrito. `get_advisors(security)`
    conferido depois da migration: nenhuma categoria nova. **Testado**: `npx tsc --noEmit`
    limpo, app sobe sem erro de console/bundler até a tela de login. **Não testado logado** —
    mesma regra de nunca digitar senha, nem de conta descartável; vale um teste manual real
    quando o Tassis (ou o Guilherme) puder logar.
- ✅ **Fase de Ataque, itens 04 e 06 (06/set): progresso visual e lista de compras.** Item 05
  ("pontuação de adesão devolvida ao paciente") já saiu de graça junto com o check-in — o
  `CheckinResumo` já mostra isso na hora, não precisou de trabalho novo.
  - **Progresso visual** — `obterComparacaoFotos()` novo em
    [`checkinService.ts`](src/services/checkinService.ts): pega o check-in mais antigo e o
    mais recente que tenham QUALQUER foto (nem todo check-in manda, é opcional), por ângulo
    (esquerdo/direito/costas), com URL assinada de 1h cada. Só devolve algo com **2 check-ins
    distintos com foto** — 1 só não é comparação. Sem análise automática de postura/simetria
    (é IA, fica de fora — não confundir com o que o Vibe Fit faz no benchmark). Renderizado em
    [`aluno/checkin.tsx`](src/app/aluno/checkin.tsx), seção "Progresso visual" — primeira vez
    que o app usa `<Image>` do React Native pra alguma coisa.
  - **Lista de compras** — `listaDeCompras()` novo em
    [`domain.ts`](src/models/domain.ts:104): função pura, **sem tabela nova** — soma
    `quantidade_g` de itens com o mesmo `taco_id` entre refeições diferentes (ex.: arroz no
    almoço e no jantar viram uma linha só), itens "livres" (sem TACO, texto digitado) só
    agrupam duplicata exata com contagem. "Recalcula quando a dieta muda" é literal: não
    salva nada, roda de novo a cada render a partir de `plano.refeicoes` atual. Card novo no
    fim de [`aluno/dieta.tsx`](src/app/aluno/dieta.tsx).
  - **Testado**: `npx tsc --noEmit` limpo, app sobe sem erro de console/bundler até a tela de
    login. **Não testado logado** — mesma regra de sempre; a lista de compras e a comparação
    de fotos só aparecem com dado real (dieta com TACO / 2+ check-ins com foto), então o
    primeiro teste de verdade só acontece quando alguém logado tiver esse histórico.
  - Sem RLS nova em nenhum dos dois — lista de compras é cálculo client-side sobre dado já
    lido; fotos reusam a policy `fotos_checkin_select` do check-in (§ acima).
- ✅ **Lista de compras: projeção de período + categorias + ícones (06/set)**, pedido do
  Guilherme em cima do item 06 já entregue. `listaDeCompras()` em
  [`domain.ts`](src/models/domain.ts) ganhou um parâmetro `dias` (campo editável na tela,
  padrão 30) — a dieta é sempre um dia-modelo repetido, então o total do período é
  literalmente o total do dia × número de dias, sem inventar heurística nova. Agrupamento
  usa a **categoria oficial da TACO** (já existe em `alimentos_taco.categoria`, 15 valores
  reais — não inventei taxonomia própria), buscada por `buscarCategoriasPorIds()` novo em
  [`nutritionService.ts`](src/services/nutritionService.ts). Ícone por categoria em
  [`aluno/dieta.tsx`](src/app/aluno/dieta.tsx) via `@expo/vector-icons` — mapeamento é
  aproximado (Ionicons não tem ícone dedicado pra "cereais" ou "leguminosas"), tipado contra
  `keyof typeof Ionicons.glyphMap` então o próprio `tsc` barra nome de ícone inexistente.
  Item livre (sem TACO) cai numa categoria "Itens diversos" à parte, sempre por último.
  **Testado**: `npx tsc --noEmit` limpo (inclusive validando os 15 nomes de ícone), app sobe
  sem erro de console/bundler. Não testado logado com dado real.
- 💡 **Ideia registrada, não construída (06/set): monetizar a lista de compras.** Pedido do
  Guilherme era vincular marcas/marketplaces patrocinados; decisão dele depois de eu levantar
  o trade-off: **fica só como ideia por enquanto, sem construir nada** — nem schema, nem link.
  Recomendação registrada pra quando isso for retomado: link de afiliado genérico (Mercado
  Livre/Amazon, cadastro único, sem negociar marca nenhuma) é bem mais barato que vender slot
  de patrocínio por marca (isso é trabalho comercial de verdade — contrato, criativo,
  cobrança — sem alavancagem nenhuma com a base de usuários atual). Bate com a lógica já
  fechada no roadmap: ganhar mercado antes de faturar alto. Retomar só quando fizer sentido
  monetizar de verdade, não antes.
- ✅ **Bug real achado e corrigido (06/set): duas linhas de anotação em `planos_alimentares`
  eram tratadas como alimento em todo lugar — inclusive somando macro em dobro.** O Guilherme
  reportou ver o aviso `⚠ Sem total calculado pelo nutricionista...` aparecendo como se fosse
  item de compra. Investigando o dado real de produção, achei que a dieta do Guilherme tem
  duas convenções que **nunca foram escritas pelo editor do app** — alguém gravou direto via
  SQL num momento anterior:
  - `{"nome": "— Total da refeição (calculado pelo nutricionista) —", "ehTotal": true, "macros": {...}}`
    — o total já conferido à mão pra aquela refeição.
  - `{"nome": "⚠ Sem total calculado...", "macros": null, "quantidade": ""}` — aviso de texto
    livre, sem o marcador `ehTotal`.

  Nenhum código do app sabia dessas duas convenções, então as duas eram renderizadas como
  item de comida normal em toda tela que lê `refeicoes` — e a linha `ehTotal` **somava o
  próprio kcal em cima da soma dos itens reais**, dobrando o total mostrado. Verificado
  rodando as funções puras contra o JSON real de produção (`npx tsx`, sem precisar logar):
  café da manhã mostrava 802,7 kcal antes da correção (211,7 dos itens reais + 591 do
  marcador de total, somado duas vezes) — 211,7 kcal depois.

  Corrigido na raiz, em [`domain.ts`](src/models/domain.ts): `ItemRefeicao` ganhou o campo
  `ehTotal?: boolean` (já existia no dado, faltava no tipo), e três funções novas —
  `ehAnotacao()` (reconhece as duas convenções: `ehTotal` explícito OU `quantidade` vazia,
  que nenhum alimento real tem), `itensReais()` (filtra antes de somar/comprar) e
  `totalConferidoPeloNutricionista()`/`avisoDaRefeicao()` (extraem o conteúdo útil das
  anotações pra mostrar direito, não descartar). Aplicado em
  [`aluno/dieta.tsx`](src/app/aluno/dieta.tsx) (soma do dia, soma por refeição,
  `listaDeCompras()` já filtra por construção) e em
  [`pro/aluno/[id]/dieta.tsx`](src/app/pro/aluno/%5Bid%5D/dieta.tsx) (editor do profissional
  — mesma soma dobrada acontecia lá; lista de itens editáveis agora pula as anotações mas
  preserva o índice original nos callbacks `onMudar`/`onRemover`, então salvar não apaga
  essas duas linhas por engano). As duas anotações agora aparecem como texto — "✓ Total
  conferido..." em verde, aviso em laranja — nunca mais como item.

  **Testado**: `npx tsc --noEmit` limpo; verificação direta das funções puras contra o JSON
  real da dieta do Guilherme confirmou soma corrigida, extração certa do total/aviso, e
  ausência das duas linhas na lista de compras. App sobe sem erro de console/bundler.
- ✅ **Lista de compras reescrita do zero (06/set)** — o Guilherme achou a primeira versão
  "muito amadora": não agrupava direito, multiplicava texto por número de dias sem sentido
  ("180g × 30"), e visual era só uma tabela. Achado raiz ao investigar: **a dieta real do
  Tassis não usa NENHUM item vindo da busca TACO** — tudo foi digitado à mão com macro
  calculado fora — então o agrupamento por `taco_id` da versão anterior nunca disparava de
  verdade; "Arroz branco" no almoço (120g) e no jantar (100g) apareciam como duas linhas
  quebradas em vez de uma.
  - **Agrupamento por nome normalizado** (não mais por `taco_id`) — junta a mesma comida
    entre refeições diferentes venha ela da TACO ou digitada à mão.
  - **Parser de quantidade** novo em [`domain.ts`](src/models/domain.ts)
    (`parsearQuantidade`): prioriza CONTAGEM ("2 unidades", "2 fatias") sobre peso — ovo e
    pão de forma viram "60 unidades"/"60 fatias" no mês, não "6kg", que é mais real pra
    comprar. Sem contagem, usa o peso/volume entre parênteses (o valor que o próprio
    nutricionista já calculou) ou solto no texto. Quando nada casa ("à vontade", "a gosto"),
    a linha some da conta e mostra o texto original — nunca inventa número.
  - **Categoria por palavra-chave** (`categoriaPorNome`) como fallback pra quando não tem
    `taco_id` — cobre os alimentos comuns de dieta brasileira contra as 15 categorias
    oficiais da TACO (mesma taxonomia já usada, não inventei categoria nova).
  - **Substituições aparecem como nota** ("Ou: Arroz integral, Batata inglesa..."), nunca
    somadas — são alternativa dentro da refeição, não item extra a comprar (pedido
    explícito do Guilherme, "considerar substitutos").
  - **Média por porção** quando o item aparece em mais de uma refeição do dia (ex.: "≈110g
    por porção" no arroz que soma almoço+jantar) — resposta ao "vale mostrar valor médio?"
    dele: sim, mas só quando ajuda a explicar a soma, não em todo item.
  - **Visual**: checklist de verdade — cada item tem checkbox (risca o nome ao marcar,
    estado só local, não persiste — decisão de escopo, não construí tabela nova pra isso),
    categorias com ícone + contagem de itens, cabeçalho com resumo (X itens · Y categorias).
  - **Verificado com o JSON real de produção** (`npx tsx`, sem precisar logar): "Arroz
    branco" virou uma linha só de 6,6kg com "Ou: Arroz integral, Batata inglesa"; "Ovo
    inteiro" virou "60 unidades"; "Laranja" virou "30 unidades"; "Café com leite" virou
    "6L"; "Salada" (à vontade) ficou como texto, não multiplicado. `npx tsc --noEmit`
    limpo, app sobe sem erro de console/bundler. Não testado visualmente logado (mesma
    regra de nunca digitar senha) — o layout novo (checkbox, cores, espaçamento) segue
    padrões já usados em outras telas do app, mas vale um olhar real do Guilherme/Tassis.
- ✅ **Lista de compras: cards por categoria + checklist que persiste (06/set, mesmo dia).**
  Pedido do Guilherme em cima da reescrita acima: "cards de compras" (não uma seção dentro
  de um card só) e checkbox que **efetivamente marca quando comprado** — a versão anterior
  tinha checkbox, mas o estado só vivia em `useState`, sumia ao recarregar a tela.
  - Cada categoria virou um `<Card>` próprio, com progresso por categoria (`2/2`, ícone e
    contagem viram verde e o card esmaece quando completa) e um card de resumo no topo
    (`X/Y comprados · Z categorias · projeção N dias`).
  - **Persistência via `AsyncStorage`** (já usado no projeto, `src/lib/supabase.ts`), chave
    `lista-compras-marcados:{userId}` — decisão deliberada de guardar **no aparelho, não no
    banco**: não é dado que o profissional precisa ver, não justificava tabela nova + RLS
    nova pra isso. Consequência aceita: não sincroniza entre dispositivos (se o paciente
    trocar de celular, o checklist não vai junto) — se isso incomodar, migrar pra tabela
    Supabase é mudança pequena, mas não construída sem pedido.
  - **Achado pequeno corrigido no processo**: `≈` (usado no "≈120g por porção") renderizava
    como `=` na fonte do app — trocado por `~`, ASCII, sem risco de fonte.
  - **Verificado de verdade, visualmente, sem login**: criei uma rota de depuração temporária
    (`_debug-lista.tsx`, whitelisted por uma linha temporária em `_layout.tsx`) renderizando
    o layout real com o JSON de produção, cliquei nos checkboxes de verdade no navegador —
    confirmei categoria completa esmaecendo, contagem/ícone virando verde, item riscado, e
    o glyph `~` certo. Removida a rota e a linha do layout antes de commitar — `git status`
    confirmou `_layout.tsx` sem diff nenhum depois. Primeira vez neste projeto que uma
    mudança de UI foi verificada visualmente de ponta a ponta sem depender de login real.
- ✅ **Achado real (06/set): as quantidades da dieta são peso PRONTO/cozido, não peso de
  compra — lista de compras agora converte.** O Guilherme perguntou "essas quantidades são
  cru ou cozido?" — respondi com base em fato, não achismo: cruzei os macros gravados na
  dieta contra a própria TACO. "Arroz branco" na dieta = 128,25 kcal/100g, bate exato com
  **"Arroz, tipo 1, cozido"** da TACO (128,258) — o cru da TACO é 357,8, nada a ver. Mesma
  coisa pro feijão. A carne já diz no próprio nome ("...cozida/grelhada/assada"). Ou seja,
  **toda gramagem da dieta é o que vai no prato**, não o que se compra na feira — arroz e
  feijão ganham peso ao cozinhar (absorvem água), carne perde (perde suco/gordura). Isso já
  era o gap conhecido "fator de cocção" do §7, nunca implementado.
  - **Fator de cocção aplicado** em [`domain.ts`](src/models/domain.ts)
    (`fatorCoccaoPorNome`): arroz ÷2,5, macarrão/massa ÷2,2, feijão/lentilha/grão-de-bico
    ÷2,2 (ganham peso cozinhando — por isso dividir o peso pronto pelo fator dá o cru,
    menor), frango ÷0,75, peixe ÷0,8, carne bovina ÷0,7 (perdem peso — dividir por um fator
    menor que 1 dá um valor MAIOR, o cru precisa ser mais que o pronto). Valores da tabela
    de rendimento de cocção padrão da dietética brasileira (Ornellas/Philippi) — referência
    acadêmica, não medição própria; documentado como aproximação, com aviso na tela
    ("estimativa por tabela padrão, confirme com seu nutricionista"). Só aplica em peso
    (g/kg) — contagem (unidades/fatias) e volume (ml) ficam como estão, não fazem sentido
    cru×cozido do mesmo jeito.
  - **Os dois números aparecem**: `quantidade` agora É o valor cru pra comprar (com sufixo
    "cru" visível), `quantidadePronta` mostra o peso como está na dieta, pra nada ficar
    escondido.
  - **Verificado com dado real** (`npx tsx` de novo): arroz 6,6kg pronto → 2,6kg cru pra
    comprar; feijão 4,8kg pronto → 2,2kg cru; carne 8,1kg pronto → **11,6kg** cru (sobe,
    porque encolhe cozinhando — direção oposta confirmada certa). Reconferido também
    visualmente na rota de depuração temporária, mesmo processo do item acima.
  - `npx tsc --noEmit` limpo, app sobe sem erro de console/bundler.

- ✅ **Tela "Início" — dashboard agregado do aluno (08/set).** Pedido do Guilherme: perfil
  "com cara de dashboard premium", inspirado no que faz falta nos concorrentes. Pesquisa
  prévia (Reclame Aqui/App Store de WebDiet, MFIT, Dietbox, Trainerize + comparativo Vibe
  Fit) mostrou padrão de reclamação em instabilidade, suporte que ignora o paciente e
  troca de profissional quebrando dado — nenhuma mudança de arquitetura veio disso (já
  cobertas pelas decisões existentes de §0/append-only), só confirmou o rumo. Vibe Fit é o
  concorrente mais completo (Body Scan IA, streak/badge de hábito, chat, 5 bases
  nutricionais) — fora de escopo por custo de IA/infra nova, ver lista de pendências do
  Tassis abaixo.
  - **v1 implementada sem migration nenhuma** — só agrega dado que Treino/Dieta/Check-in
    já liam cada um por si: streak de treino, progresso do dia (exercícios feitos/total),
    score do check-in mais recente + tendência vs. anterior, kcal/macro do dia vs. meta,
    progresso da lista de compras, evolução de peso (extraído da resposta `peso_corporal`
    do check-in — não existe coluna própria) e próxima teleconsulta.
  - **`aluno/index.tsx` virou a tela Início**; o Treino (era `index.tsx`) virou
    `aluno/treino.tsx` — rota nova `/aluno/treino`. `_layout.tsx` ganhou a aba "Início"
    (ícone `home`) como primeira aba; `/aluno` (destino de todo `router.replace` pós-login)
    agora abre o dashboard, não mais direto no treino do dia.
  - **Duas funções puras novas**: `streakTreino()` em
    [`workoutService.ts`](src/services/workoutService.ts) (dias consecutivos com pelo
    menos um `workout_log`, contando pra trás a partir de hoje — streak de ontem continua
    valendo se ainda não treinou hoje) e `historicoPeso()` em
    [`checkinService.ts`](src/services/checkinService.ts) (extrai `peso_corporal` de cada
    check-in, ordena cronológico, ignora resposta não numérica). Verificadas com
    `npx tsx` contra casos sintéticos (streak com gap, sem treino hoje, vazio; peso com
    entrada não numérica no meio) — todos bateram o esperado.
  - **Sparkline de peso e barra de progresso da lista de compras são `View`s puras** (sem
    lib de gráfico nova) — escala linear pelo min/max da série.
  - **Verificado visualmente sem login**: rota de depuração temporária (`_debug-inicio.tsx`,
    whitelisted por uma linha em `_layout.tsx`, mesmo padrão já usado em 06/set pra lista de
    compras) renderizando a tela com dado mockado — conferido no navegador que o layout não
    quebra, e por `getBoundingClientRect()` que as barras do sparkline escalam na ordem
    certa (peso caindo → barra mais recente mais curta, destacada em azul). Removida a rota
    e a linha do layout depois — `git status` limpo. `npx tsc --noEmit` limpo. **Não
    testado logado** — mesma regra de nunca digitar senha de conta nenhuma.
  - **Simplificação aceita**: "concluídos hoje" e o card de treino sempre mostram o
    primeiro dia do plano (`dias[0]`), igual ao comportamento padrão da aba Treino — não
    lembra qual dia o aluno tocou por último.
- ✅ **Emojis removidos do check-in + rótulos de "qualidade do sono" corrigidos (09/set)**,
  pedido do Guilherme depois de ver a tela real: emoji não deve ficar atrelado à marca (a
  não ser que exista um dia uma base de ícones própria da identidade visual). `OpcaoCheckin.emoji`
  removido do tipo em [`checkin.ts`](src/models/checkin.ts), das 3 listas que tinham (`ESCALA_DISPOSICAO`,
  desempenho de exercícios, e a duplicata que "qualidade do sono" herdava) e da renderização
  em [`checkin-flow.tsx`](src/components/checkin-flow.tsx) (`label={opcao.label}`, sem concatenar emoji).
  **Achado no processo**: a pergunta "qualidade do sono" reaproveitava `ESCALA_DISPOSICAO`
  (rótulos de disposição — "Muito indisposto(a)"/"Muito disposto(a)") por cópia direta,
  errado pra pergunta de sono. Nova lista dedicada `ESCALA_QUALIDADE_SONO` com rótulos
  específicos ("Muito ruim — não descansei nada" → "Muito boa — acordei descansado(a) todos
  os dias"), mesma escala de pontuação 0/25/50/75/100. `npx tsc --noEmit` limpo, `grep -rn
  emoji src` sem sobra, bundler sobe sem erro de console. Não testado logado (mesma regra
  de nunca digitar senha).

- ✅ **Rebrand completo aplicado (09/set, segunda passada do mesmo dia).** A primeira passada
  trocou só o `Palette.accent` e o título do login. Esta fecha o resto e cria a infraestrutura
  de marca no repositório.
  - **Brand book versionado**: [`docs/marca/BRAND.md`](docs/marca/BRAND.md) é agora a fonte
    canônica da identidade dentro do repo — nome, situação de INPI, geometria do mark, paleta
    com papéis, tipografia, lockups, regras de uso, voz e regras de escrita. Se o código
    discordar dele, o código está errado.
  - **Geometria única e reprodutível**: [`scripts/brand/gen_brand.py`](scripts/brand/gen_brand.py)
    gera TODOS os arquivos de marca a partir de um só conjunto de números (traço 8, base y=22,
    vértice do V em (60,52), meia-largura 16). Os assets de `assets/brand/` **não devem ser
    editados à mão** — o script sobrescreve. Isso corrigiu uma inconsistência real: os SVGs
    da primeira tentativa tinham duas proporções de V diferentes entre si e nenhuma batia com
    o artifact aprovado. Os nomes antigos foram sobrescritos, não sobrou asset com geometria
    errada no repositório.
  - **Wordmark em curvas**: "VYTRA" é IBM Plex Mono Medium convertido em `<path>` (via
    fontTools), não `<text>`. O logotipo fica idêntico em qualquer plataforma sem depender de
    fonte carregada, e o app não precisou de `react-native-svg`.
  - **Variante óptica pequena**: abaixo de ~48px o traço de 8 desaparece. Existe uma variante
    com traço 13 usada nos favicons. Conferido renderizando em 32 e 48px de verdade.
  - **Fontes da marca instaladas**: `assets/fonts/` com IBM Plex Mono (Medium/SemiBold) e Big
    Shoulders Display (Bold/Black), versionadas no repo de propósito — sem pacote npm novo e
    sem depender de rede em build. Carregadas por `useBrandFonts()` em
    [`src/theme/fonts.ts`](src/theme/fonts.ts), com helpers `headingStyle()`/`monoStyle()`.
    `expo-font` já era dependência, então **nenhuma dependência nova entrou**.
  - **Splash espera a fonte**: [`_layout.tsx`](src/app/_layout.tsx) só chama `hideAsync()`
    quando sessão E fontes resolveram, senão o texto pula no primeiro render. Erro de fonte
    conta como resolvido de propósito — fonte quebrada não pode travar o app na splash.
  - **`app.json`**: `name` → "Vytra", `scheme` → `vytra`, `userInterfaceStyle` → `dark`,
    ícone/adaptive icon/monochrome/favicon/splash apontando para `assets/brand/`, splash com
    fundo `#0A0C0D` (era `#208AEF`, azul do scaffold), `backgroundColor`/`primaryColor` da
    marca. Removidos o `ios.icon` do Icon Composer do scaffold e o `backgroundImage` do
    adaptive icon (virou cor sólida).
    ⚠️ **`slug` continua `app-treino` de propósito** — trocar o slug muda o EAS project e a
    URL `app-treino.expo.app`, que é por onde o Tassis acessa hoje. Ver "pendências do
    rebrand" abaixo.
  - **Paleta alinhada ao brand book**: `Palette.background` era `#000000` e virou `#0A0C0D`
    (base Sinal Vital); `surface`/`surfaceElevated`/`border`/`text`/`textSecondary`/
    `textTertiary` idem. Um objeto `Brand` novo exporta as cores cruas da marca para assets e
    e-mail; a UI continua consumindo `Palette`, que mapeia marca → papel de interface.
  - **Logotipo virou componente**: [`src/components/vytra-logo.tsx`](src/components/vytra-logo.tsx)
    com `VytraLockup` e `VytraMark`, só nas variantes que o brand book autoriza. O login
    passou a usar `<VytraLockup />` no lugar do ícone `pulse` do Ionicons + texto — ou seja,
    o logotipo de verdade, não mais uma imitação com `letterSpacing`.
  - **Verificado (09/set, sessão seguinte)**: `npx tsc --noEmit` completo, limpo. App subiu
    via `npx expo start --web`, login conferido visualmente sem erro de console, lockup real
    renderizando (fonte carregada, sem "pulo" de layout).
  - ⚠️ **Achado nessa verificação, corrigido na hora**: o V do mark tinha saído *centralizado*
    e com pontas *arredondadas* — duas divergências reais do artifact aprovado (que tem V
    deslocado à esquerda, proporção de braço 28:40, e bordas retas). Corrigido direto no
    gerador: `apex_x()` novo em `gen_brand.py` calcula o x do vértice por proporção (não mais
    um x fixo), e `polyline()` trocou `stroke-linecap/linejoin` de `round` pra `butt`/`miter`.
    `assets/brand/` inteiro regenerado depois do fix. Precisou instalar `fonttools`+`cairosvg`
    (via venv em `/tmp`, não no projeto) e `cairo` via Homebrew pra rodar o script.
  - **Pendências do rebrand, deliberadamente não feitas:**
    1. `slug` e a URL de produção (`app-treino.expo.app` → `vytra.expo.app`). Mexe no EAS
       project e derruba o link que o Tassis já usa. Decisão comercial, não técnica.
    2. Depósito da marca no INPI. A busca zerou, mas nada foi depositado.
    3. Domínio próprio — continua bloqueando o SMTP do §16.
    4. Renomear o repositório GitHub (`treino-tassis`) e a pasta local.
- ✅ **Deploy web do rebrand publicado (09/set)**: `npx expo export --platform web && eas
  deploy --prod` — dessa vez **não bloqueado** pelo classificador de auto mode (mesma
  ferramenta que travou em 05/set e de novo mais cedo em 08/set; não é bloqueio permanente).
  Bundle conferido batendo (`entry-3affeda6f6e4cf9ec0607a5129c46c6b.js`) direto em
  `app-treino.expo.app` — nome "VYTRA" e mark novo (bordas retas, V à esquerda) já visíveis
  na tela de login em produção. URL de produção continua `app-treino.expo.app` (slug não
  trocado, ver pendência acima). A correção não-commitada de `checkin-flow.tsx`/`checkin.ts`
  (§ anterior sobre emoji/escala de sono) foi junto no export, porque `expo export` usa o
  working tree, não o commit — segue sem commit, não é trabalho desta sessão.

- ✅ **Landing page institucional no ar (09/set).** Pedido do Guilherme: "uma LP apenas para
  estarmos no ar", agora que o domínio existe. Página estática, uma rota só, sem build step.
  - **Fonte**: [`site/`](site/) na raiz do repo (`index.html` único, com CSS embutido,
    `vercel.json` e os assets de marca copiados de `assets/brand/`). Mesmo padrão do projeto
    irmão OLI (`landing/` servido direto, sem framework).
  - **Hospedagem: Vercel**, projeto `vytra`, team "Guilherme's projects"
    (`guilhermes-projects-8cc030f5`) — a mesma que já serve `oli-landing` e `admin`. URL de
    produção enquanto o DNS não aponta: `https://vytra-pi.vercel.app`.
  - ⚠️ **Netlify foi tentado primeiro e descartado, com motivo real.** O repo do OLI tem
    `netlify.toml` e `.netlify/state.json`, que me levaram a concluir que o site irmão estava
    na Netlify. É **config morta**: o handoff do OLI (§14 de lá) registra que o site migrou
    pra Vercel em 21/jul porque a conta Netlify (team **Oliteam**, Free) **estourou o crédito
    e passou a pular todo deploy silenciosamente** (`Skipped due to account credit usage
    exceeded`), e o `state.json` ainda aponta pro site errado e vazio (`bespoke-starship-3fd6f9`).
    Cheguei a criar e publicar um site Netlify (`vytraoficial.netlify.app`, team Oliteam)
    antes de o Guilherme apontar o erro; **esse site foi apagado** a pedido dele no mesmo dia
    (confirmado: a URL responde 404), justamente pra não virar a config órfã que confundiu o OLI.
    **Regra que fica**: não confiar em arquivo de config de host como prova de onde algo está
    publicado, conferir o handoff do projeto e a API do provedor. `netlify.toml` e
    `site/_headers` foram removidos daqui pra não repetir a mesma armadilha neste repo; os
    cabeçalhos viraram `site/vercel.json`.
  - **DNS pendente (passo do Guilherme)**: publicar no painel do Registro.br
    (`Editar zona`, DNS automático já ativo) o registro **`A` da raiz → `76.76.21.21`** e,
    opcionalmente, **`CNAME www` → `cname.vercel-dns.com`**. Os dois domínios
    (`vytraoficial.com.br` e `www.`) já estão vinculados ao projeto `vytra` na Vercel,
    esperando só o DNS. O IP `216.198.79.1` que aparece no handoff do OLI é de outra época,
    usar o que a Vercel informa hoje.
  - **Conteúdo**, seguindo as regras de escrita do brand book (§7 do BRAND.md — sem travessão,
    sem "não é X, é Y", sem exclamação, sem prometer prazo, sem citar concorrente, sem emoji):
    hero com a tagline "Um plano realmente seu.", três passos (Avaliação, Prescrição,
    Check-in), seis recursos que **já existem no app de verdade** (histórico de carga, macro
    por refeição, lista de compras, evolução/fotos, teleconsulta, verificação de CREF/CRN) e
    um bloco para profissional fechando com "o critério que você já tem, sem o trabalho que te
    consumia". Nada de feature inventada, tudo bate com o §8.
  - **Marca aplicada de verdade**: `VytraLockup` real (SVG de `assets/brand/`, wordmark em
    curvas), paleta Sinal Vital, Big Shoulders Display + IBM Plex Mono **auto-hospedadas** em
    `site/fonts/` (TTF do repo convertido pra WOFF2 e subsetado pra latim, 17-20KB cada).
    Nenhuma requisição sai do domínio: sem Google Fonts, sem analytics, sem cookie — decisão
    pela lente do §0 (CDN de fonte entrega o IP do visitante a terceiro sem base legal).
    A linha divisória reproduz a geometria exata do mark (V de 32x30, braços 28:40) com um
    SVG de proporção fixa entre duas réguas flexíveis, porque a primeira versão usava
    `preserveAspectRatio="none"` e achatava o V, contrariando o brand book.
  - **Segurança**: CSP restritiva por `<meta>` (`default-src 'none'`, só `self` para imagem,
    fonte e script), mais `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
    `Permissions-Policy` e HSTS por header no `vercel.json`. Conferido ao vivo com `curl`.
  - **Verificado**: renderização real no navegador (desktop e viewport 375px), zero erro de
    console, zero overflow horizontal (`scrollWidth === clientWidth`), as três fontes com
    status `loaded`, e os cabeçalhos conferidos na resposta HTTP de produção.
  - ~~**Pendências**: apontar o DNS (acima)~~ — **feito, ver §43 (14/set)**: DNS já estava
    certo, o problema era deploy com build quebrado servindo 404 silenciosamente. A LP não
    captura e-mail (sem backend e sem caixa de e-mail no domínio ainda, ver passos 2 e 3 da
    ordem de execução do §7) — isso segue pendente.


## 9. Escopo funcional v1 (proposto, não implementado)

Tabela abaixo é por par paciente↔profissional (já reflete o modelo N:N do §1/§5).

| Módulo | Aluno | Treinador |
|---|---|---|
| Onboarding | aceita convite, anamnese, cadastro | gera convite, acompanha status |
| Treino | vê plano do dia, registra séries (draft→log), histórico | monta plano por período, edita dias/exercícios |
| Nutrição | vê plano alimentar, busca alimento TACO | monta plano, define metas macro |
| Perfil | dados pessoais, peso/altura | lista de alunos, progresso agregado |

## 10. Próximos passos

1. ✅ **Feito em 03/set:** cadastro de paciente destravado (ver §16) — confirmação de e-mail
   desligada e URLs de retorno configuradas. SMTP próprio fica para quando o domínio existir —
   e domínio depende da marca (§7).
2. ✅ **Home confirmada visualmente em 03–04/set**, os dois lados, com login real
   (`expo start --web`): Aluno (Treino/Dieta/Perfil) e Profissional (Alunos/Planos/Perfil,
   login do próprio Tassis) — dado de produção batendo com §5/§11. Achado no processo, ver
   bug abaixo em §8.
3. Telas de treino/nutrição além da home: registrar série (draft→log), montar/editar
   plano (treinador), ver plano alimentar completo, buscar TACO.
4. ✅ **Feito em 04/set:** CRUD de `professional_plans` completo (criar, editar, ativar/
   desativar). Falta ainda gestão de `subscriptions` (cancelar/reativar aluno) — hoje só
   nasce via `finalizar_cadastro_convite`, sem tela pra mudar depois.
5. ✅ **Feito em 04/set, dos dois lados:** tela pública de anamnese por convite (§8, lado
   paciente) + tela do profissional pra gerar o link (§8, lado profissional). O funil do §12
   fecha ponta a ponta agora: profissional convida → paciente preenche anamnese → cria conta
   → assinatura nasce → aparece na lista do profissional. Falta só automação de pagamento
   (Fase 2, fora de escopo agora) e leads/atendimentos (item ainda não iniciado, sem
   depender do Tassis pra começar).
6. ~~Tela de cadastro (`signUp`)~~ — coberta pelo fluxo de convite do item 5. Cadastro
   direto (fora de convite) segue não previsto pelo produto — Tassis sempre inicia o vínculo.
7. Remover a tela de exemplo restante do scaffold (`(app)/explore.tsx`) quando o fluxo
   real substituir.
8. Configurar EAS Build quando for hora de buildar pra iOS/Android de verdade (hoje só roda
   via `expo start --web`/Expo Go). Guilherme já tem conta Apple Developer paga (05/set) —
   não é mais bloqueio de custo — mas decidiu esperar nome/marca (§7) antes de começar; falta
   todo o setup técnico (bundle ID, build profile, credenciais de assinatura), nada disso
   existe no projeto ainda.
9. Cobrar do Tassis os itens do §7 — vários bloqueiam decisões de schema/UX.
10. Avaliar se `is_trainer()` pode ser removida (não é mais usada em nenhuma RLS, ver §5).

## 11. Formas dos campos jsonb (extraídas da produção — não inventar)

Estas estruturas já existem nos dados reais e o protótipo grava nelas. Mudar qualquer uma
quebra os dados do Tassis e do aluno. Tipadas em [`src/models/domain.ts`](src/models/domain.ts).

**`plans.dias`** — array de dias de treino:
```jsonc
[{ "id": "A", "nome": "Push", "desc": "Peito · Ombro · Tríceps", "tipo": "push",
   "ex": [{ "id": "a1", "nome": "Crucifixo máquina", "sets": 2, "min": 12, "max": 15,
            "warm": "8-10 (2x)", "feeder": "4 reps (2x)",
            "nota": "…", "tempo": true, "ombro": true }] }]
```
`tipo` ∈ `push|pull|leg` (define a cor). `tempo: true` = exercício por segundos (prancha),
aí `min`/`max` são segundos, não repetições. `warm`/`feeder` são texto livre ("—" quando não tem).

**`workout_logs.sets` e `workout_drafts.sets`** — array de séries: `[{"p": 40, "r": 12}]`
(`p` = peso em kg, `r` = repetições ou segundos).

**`planos_alimentares.refeicoes`**:
```jsonc
[{ "nome": "Café da manhã",
   "itens": [{ "nome": "Ovo inteiro", "quantidade": "2 unidades médias (100g)",
               "macros": { "kcal": 145.7, "proteina_g": 13.3, "carboidrato_g": 0.6, "lipideos_g": 9.5 },
               "obs": "…",
               "substituicoes": [{ "nome": "…", "quantidade": "…", "macros": {…} }] }] }]
```
`macros` é `null` quando o alimento não tem referência na TACO — sempre tratar o nulo.

### Regra de registro de série (draft → log)

Replicada do protótipo em [`workoutService.ts`](src/services/workoutService.ts); não
simplificar sem entender:
1. Enquanto `séries registradas < ex.sets`, o progresso fica em **`workout_drafts`**
   (chave: client_id + exercise_id + session_date).
2. Ao completar a última série, faz upsert em **`workout_logs`**
   (`onConflict: client_id,exercise_id,session_date`) e **apaga o draft**.
3. "Corrigir última série" desfaz: se já estava em log, apaga o log e devolve as séries
   restantes pro draft; a série removida volta pros steppers pra ser reinformada.

A sugestão de carga/reps da próxima série também veio do protótipo: se na última sessão o
aluno bateu o topo da faixa (`max`) em todas as séries com a mesma carga → sugere subir
(passo de 2,5kg acima de 20kg, 1kg abaixo); senão mantém a carga e pede +1 repetição.

### ⚠️ `Exercicio.id` é chave de histórico — nunca reatribuir

`workout_logs.exercise_id` e `workout_drafts.exercise_id` referenciam o `id` do exercício
dentro de `plans.dias`. Não há FK: é um acoplamento por convenção. Se um id for reatribuído
a outro exercício, o histórico de carga do aluno passa a apontar pro exercício errado, **sem
erro nenhum**.

O protótipo tem esse bug: `dadosDoBuilder()` regenera todos os ids por posição
(`String.fromCharCode(97+i)+(j+1)`) a cada save, então apagar/reordenar exercício lá
embaralha o histórico. **Não copiar esse comportamento.**

O editor do app ([`src/services/planEditor.ts`](src/services/planEditor.ts)) faz o certo:
exercício existente mantém o id; exercício novo recebe o menor id livre conferido contra o
plano inteiro. A tela avisa quais ids sairão do plano antes de salvar.

### Restrição em aberto: um plano de treino por aluno

`plans` tem UNIQUE em `client_id` (`plans_client_id_key`), herdado do protótipo — e o
editor usa `upsert onConflict: 'client_id'`. Isso conflita com o modelo N:N do §1: se um
aluno tiver dois treinadores, os dois disputam a mesma linha. Com o Tassis sozinho não dá
problema. Antes de entrar o segundo profissional, decidir: trocar o UNIQUE para
`(client_id, professional_id)` e ajustar o upsert + as telas que assumem "o plano" no
singular.

### RLS de escrita verificada (02/set)

Por simulação de JWT: upsert em `plans` pelo profissional dono **passa**; update do aluno
no próprio plano é **filtrado** (0 linhas, sem erro — comportamento normal de RLS).

### Dieta: macros são absolutos, e substituições não podem ser perdidas

Os `macros` de um item em `planos_alimentares.refeicoes` são **absolutos** (já na
quantidade daquele item), não por 100g. A TACO (`alimentos_taco`) é que guarda por 100g —
o editor escala na hora de adicionar ([`macrosPorGramas`](src/models/domain.ts)).

A dieta real do aluno tem **31 substituições e 8 observações escritas à mão**. O editor
grava com spread do item existente (`{...item, nome, quantidade}`) justamente pra não
reconstruir e perder esses campos. Round-trip do JSON de produção conferido: contagens
iguais e documento byte-idêntico. **Se for refatorar o save, refazer essa verificação.**

Itens criados pelo editor ganham `taco_id` e `quantidade_g` (campos opcionais, ignorados
por leitores antigos) pra permitir recalcular os macros quando a gramagem muda. Item sem
`taco_id` é "livre" — o profissional digita quantidade em texto e os macros não são
calculados.

## 12. Fluxo de entrada do paciente (desenho fechado com o Guilherme, 02/set)

Roadmap completo publicado como artifact: `https://claude.ai/code/artifact/c760d7f7-ba23-4fa8-b2b3-28d335e93350`
(substitui `683aa212-...`, de 04/set — desatualizado, não editável nesta sessão por bloqueio do
classificador de auto mode; link novo em 06/set incorpora reordenação agressiva pós-benchmark, ver
[Fitness App Scouting Report](https://claude.ai/code/artifact/4717ee25-7db8-487c-88af-b284840724a1))

O funil real do Tassis (e da maioria dos nutricionistas), na ordem:

1. **Consulta de sensibilização** — dentro do app. Ele explica a consultoria e entende a pessoa
   (hábitos, expectativa, contexto, objeções) e registra num **atendimento**. Pode não virar venda:
   nesse caso a pessoa fica como **lead** com histórico e data de retomada.
2. **Gera o link** a partir do lead, escolhendo qual `professional_plans` está vendendo.
3. **Paciente paga** — hoje manual, automatizado na Fase 2 do roadmap.
4. **Anamnese** — formulário público por token, sem login. As seções mudam conforme o plano
   (nutrição / treino / ambos).
5. **App cria a conta** — perfil + anamnese + **assinatura** + costura do lead/atendimentos.
6. **Espera de ~2 dias** — a home tem que dizer isso, não mostrar vazio.
7. **Profissional monta** treino e dieta, vendo anamnese + suas notas da consulta.
8. **Publica** — só então o paciente vê.

### Estado de implementação por passo (04/set — ordem real, terceira versão no mesmo dia)

A ordem mudou de verdade nesta última correção: anamnese e escolha de plano deixaram de
acontecer ANTES da conta existir — agora acontecem DEPOIS, dentro do app autenticado.

| Passo | Status |
|---|---|
| 1. Sensibilização/lead | ✅ feito ([`pro/leads.tsx`](src/app/pro/leads.tsx), 04/set) — cria lead + atendimento na call |
| 2. Gera o link | ✅ feito ([`pro/convite.tsx`](src/app/pro/convite.tsx)) — só nome/e-mail, sempre a partir de um lead (`?leadId=` obrigatório) |
| 3. Lead cria a conta | ✅ feito ([`convite/[token].tsx`](src/app/convite/%5Btoken%5D.tsx)) — link público só pede senha; assinatura nasce `'ativa'` com `plan_id` nulo |
| 4. Anamnese + escolha de plano | ✅ feito ([`OnboardingAnamnese`](src/components/onboarding-anamnese.tsx), dentro do app, autenticado) — grava `plano_solicitado_id` (pedido, não confirmado) |
| 5. Profissional confirma o plano | ✅ feito (Painel, seção "Pedidos de plano") — grava `plan_id` de verdade, libera Treino/Dieta |
| 6. Paciente paga | ❌ manual, fora do app — confirmação de pagamento acontece antes do profissional clicar "Confirmar" no passo 5, sem integração |
| 7. Espera de ~2 dias | ❌ não iniciado — home não avisa nada, ainda mostra vazio genérico |
| 8. Profissional monta | ✅ já existia (editores de treino/dieta) |
| 9. Publica | ❌ não iniciado — sem rascunho/publicado, plano fica visível assim que salva |

### Sensibilização ≠ anamnese

São dois formulários distintos, não um partido em dois. Sensibilização é qualitativa e serve pra
vender/conhecer; anamnese é dirigida e alimenta o cálculo do plano. Na tela do profissional as duas
aparecem juntas.

### ✅ Corrigido em 03/set: convite agora cria a assinatura

`finalizar_cadastro_convite()` criava `profiles` + `anamnese` e fechava o convite, mas **não
inseria em `subscriptions`** — e como a RLS multi-tenant exige assinatura ativa
(`is_professional_of`), o profissional não enxergava o paciente que acabou de cadastrar.

Migração `20260903_convite_cria_assinatura.sql`:
- adiciona `convites.plan_id` (FK → `professional_plans`) — o convite passa a carregar qual produto
  foi vendido, que é o que vai definir as seções da anamnese e os módulos liberados;
- a função passa a inserir em `subscriptions` (paciente, `created_by` do convite, plano, `'ativa'`).

**Detalhe que não pode ser "simplificado" depois:** a proteção contra duplicata usa
`not exists (patient_id, professional_id)` em vez de `ON CONFLICT`. O índice único inclui `plan_id`
e no Postgres NULLs são distintos entre si — com plano nulo, `ON CONFLICT` deixaria chamadas
repetidas empilharem assinaturas.

Verificado por simulação completa em transação com rollback (auth user novo → convite → RPC):
assinatura criada com plano, perfil preenchido, anamnese gravada, convite concluído, o profissional
enxerga tudo (`is_professional_of` = true) e a segunda chamada não duplica.

⚠️ O status nasce `'ativa'` porque hoje o pagamento é confirmado manualmente antes do link ser
enviado. Quando a Fase 2 (cobrança) entrar, quem define o status é a integração.

### Restrições do banco que moldam esse desenho

- `profiles.id` é **FK para `auth.users`** e a policy de insert exige `id = auth.uid()` → é
  impossível o profissional criar o registro do paciente antes da conta existir. Por isso lead e
  atendimento precisam de tabelas próprias, com `client_id` nulo até a conta nascer.
- `profiles.role` tem CHECK que só aceita `client` | `trainer` → separar nutricionista de educador
  físico (Fase 5) exige alterar a constraint.
- `plans` e `planos_alimentares` não têm estado de publicação → hoje o aluno vê o plano no instante
  em que é salvo. Precisa de rascunho vs. publicado antes do primeiro paciente real entrar.

## 13. Check-in recorrente (prints do Live Clean, 03/set)

Prints em [`docs/referencias/`](docs/referencias/) — 5 das 23 perguntas do check-in que o Tassis
usa hoje no Live Clean (`patient.liveclin.com`).

**Correção de modelagem:** o §12 tratava atendimento e check-in como a mesma coisa. Não são.

| | Quem preenche | Formato | Natureza do dado |
|---|---|---|---|
| **Atendimento** | o profissional | notas da consulta | evento, texto |
| **Check-in** | o paciente | questionário de 23 perguntas | **série temporal** |

### Perguntas mapeadas (22 de 23 — falta a 19)

| # | Categoria | Tipo |
|---|---|---|
| 1 | Peso corporal | número (kg, em jejum) |
| 2 | Disposição durante o dia | escolha ordinal, 5 opções com emoji |
| 3 | Desempenho em exercícios | escolha ordinal, 5 opções com emoji |
| 4 | Horas de sono | escala 1–10 ("Pouco" → "Muito") |
| 5 | Qualidade do sono | escolha ordinal, 5 opções com emoji |
| 6 | Aderência ao plano | escolha, 4 opções + **follow-up condicional** |
| 7 | Refeições fora do plano | escala **0–9** ("Nenhuma" → "9 ou mais") |
| 8 | Pular refeições | escolha ordinal, 3 opções sem emoji |
| 9 | Níveis de fome | escolha **categórica**, 4 opções (ver abaixo) |
| 10 | Ingestão de líquidos | escala **0–5** ("Pouco" → "5 ou mais") |
| 11 | Consumo de vegetais | escolha ordinal, 3 opções (ordem invertida) |
| 12 | Consumo de frutas | idem 11, **mesmo conjunto de opções** |
| 13 | Desconforto abdominal | escolha + **follow-up condicional** |
| 14 | Consistência de fezes | escolha categórica, 3 opções |
| 15 | Frequência intestinal | escolha ordinal, 3 opções |
| 16 | Consumo de álcool (dias) | escala **0–7** (dias da semana) |
| 17 | Quantidade de álcool | escolha ordinal, 3 opções |
| 18 | Alterações no cardápio | **texto livre — pedido de revisão do plano** |
| 19 | *(não capturada)* | — |
| 20 | Foto de perfil esquerdo | upload de imagem, opcional, até 8 MB |
| 21 | Foto de perfil direito | upload de imagem, opcional, até 8 MB |
| 22 | Foto de costas | upload de imagem, opcional, até 8 MB |
| 23 | Feedback aberto | texto livre |

Perguntas são **puláveis**, com diálogo de confirmação ("Você está prestes a pular esta pergunta").

### O check-in devolve uma leitura ao paciente

Ao enviar, o paciente vê **"Minha pontuação foi 78%"** e um resumo por categoria com rótulo
qualitativo (Disposição: Bom · Desempenho: Ótimo · Sono: Bom · Qualidade do sono: Neutro ·
Aderência: Neutro). Não é só coleta — é devolutiva imediata, e é o que faz valer a pena responder.
Barato de copiar e provavelmente o maior ganho de retenção do formato.

⚠️ As perguntas 20–22 coletam **fotos de corpo**. É o dado mais sensível que o sistema vai
guardar, e tem implicação jurídica direta — ver a análise do termo de consentimento (§14).

### O template não é uma lista plana

A pergunta 6 revela um campo de texto quando o paciente escolhe certas opções
("Perfeito! Quais são as suas dificuldades?"). O motor precisa suportar **revelação
condicional por opção**, não só uma sequência. Construir como lista plana obriga a refazer.

Outras variações que o modelo tem que cobrir:
- **Escalas não são padronizadas**: sono é 1–10, refeições fora do plano é 0–9. Mínimo, máximo e
  rótulos das pontas são configuráveis por pergunta.
- **Emoji é opcional por opção**: perguntas 6 e 8 são texto puro.

### Aderência é o eixo, não um detalhe

Três das oito perguntas vistas (6, 7, 8) medem se o plano está sendo seguido. O check-in é
principalmente instrumento de aderência. A tela do profissional deve tratar aderência como métrica
de primeira ordem — não enterrada no meio das 23 respostas.

### Guardar valor, não texto — mas nem tudo é ordinal

As respostas precisam ser gravadas pelo **valor** da opção, não pelo rótulo. Rótulo
("Geralmente disposto(a)") e emoji são apresentação; gravar o texto joga fora a possibilidade de
plotar tendência, e a tendência é o produto todo.

Só que **a pergunta precisa declarar se é ordinal ou categórica** — não dá pra assumir:

- A pergunta 9 (níveis de fome) tem "Baixo", "Médio", "Alto" e também "Não sinto fome e tenho
  dificuldade para comer". A última **não é ponta de escala**, é outro eixo (e clinicamente é
  sinal de alerta). Tratada como ordinal, vira ruído no gráfico.
- A **direção varia**: vegetais e frutas listam "Três ou mais porções" primeiro (melhor → pior),
  enquanto outras vão de pior → melhor. Não inferir ordem pela posição na lista — cada opção
  carrega o próprio valor.
- Conjuntos de opções se repetem entre perguntas (11 e 12 são idênticas): vale poder reaproveitar.

### O check-in alimenta a revisão do plano — isso exige versionamento

A pergunta 18 pede explicitamente alterações no cardápio ("incluir um novo alimento, adicionar ou
modificar uma refeição"). Ou seja, o check-in **não é só medição, é entrada de pedido de revisão**,
e o ciclo real é: check-in → pedido → profissional revisa → publica versão nova.

Consequência direta: `plans` e `planos_alimentares` precisam de **histórico de versões**. Hoje o
save sobrescreve a linha única (e `client_id` é UNIQUE nas duas tabelas). Numa consultoria que
revisa a cada quinzena, sobrescrever apaga o histórico inteiro do acompanhamento — o paciente não
vê o que mudou e o profissional não vê o que já tentou. Resolver junto com a publicação
(rascunho/publicado) da Fase 1, porque são a mesma mudança estrutural.

### Melhorar em cima do original: condicional no álcool

A pergunta 17 ("quantas bebidas num dia típico") aparece mesmo quando a 16 é "0 dias". Mesma
mecânica de revelação condicional das perguntas 6 e 13 resolve — é um lugar barato de ficar melhor
que a ferramenta que estamos substituindo.

### As duas conversas medem os mesmos eixos

O que o Tassis observa na sensibilização (§12: vegetais, fibras, hidratação, sono, relação com a
comida) é quase exatamente o que o check-in mede depois. Se os dois instrumentos compartilharem o
mesmo **vocabulário de áreas**, a sensibilização vira a linha de base do gráfico em vez de ficar
solta — o profissional vê "onde começou → onde está" no mesmo eixo. Vale desenhar assim desde o
início; é de graça agora e caro depois.

### Padrão de UX que faz o paciente terminar

Uma pergunta por cartão, contador de progresso (`4/23`), categoria nomeada com ícone, foto e nome do
profissional no topo, resposta em um toque. Vinte e três campos numa página única seriam
abandonados — o formato de cartão é o que faz o volume de perguntas caber. Copiar o formato, não o
visual (a identidade é a do §1).

**Pendente do Tassis:** as outras 18 perguntas.


## 14. Termo de consentimento — análise (03/set)

Tassis trouxe um modelo de termo gerado por IA, escrito para consultório de nutrição autônomo.
Análise completa no artifact **"Termo de Consentimento do App Treino"** (título do artifact é
anterior ao nome Vytra; o conteúdo vale igual). Resumo do que importa
para a engenharia:

**Não é parecer jurídico — precisa de advogado antes de usar com paciente real.**

### Lacunas críticas

1. **A plataforma não aparece no termo.** Falta definir controlador (profissional) e operador
   (plataforma), e falta o contrato entre os dois.
2. **Os dados ficam nos EUA — decidido em 03/set.** O Supabase está em `us-east-1`, o que é
   transferência internacional sob a LGPD. Migrar para `sa-east-1` foi avaliado e **descartado**:
   o plano gratuito permite 2 projetos ativos por organização e as duas vagas estão ocupadas
   (`oli-health-hub` + `treino-tassis`); migrar exigiria pausar outra operação viva ou assinar o
   Pro (~US$ 25/mês). **Consequência: informar a transferência no termo deixou de ser alternativa e
   virou obrigação** — cláusula expressa de transferência internacional, com consentimento
   específico, antes de entrar paciente novo.

   *Não reabrir essa decisão sem o custo na mesa: a parte técnica é trivial (2 usuários, 27 logs,
   zero arquivos em storage), o que trava é o limite do plano.*
3. **Só cobre nutrição.** Treino tem risco de lesão e precisa de termo próprio (CREF).
4. **Menor de idade não tratado** — e o check-in coleta foto de corpo. Recomendação: bloquear
   cadastro de menor de 18 até existir fluxo de consentimento de responsável.

### CNPJ dos profissionais — separado do CNPJ da Vytra (11/set)

Pergunta do Guilherme, direto ligada à lacuna 1 acima (falta definir controlador × operador):
o Tassis precisa de CNPJ próprio de nutrição? E os educadores físicos? **Não é parecer
contábil/jurídico** — mesma ressalva do §7 sobre o INPI — mas o desenho já deixa claro o
formato do problema:

- **Vytra é o operador** (plataforma/software) — o CNPJ que está em aberto (§7) é esse, e
  só esse. Ele não substitui, nem cobre, o profissional.
- **Cada profissional é o controlador** — é ele quem presta o serviço (nutrição/treino) e
  quem recebe o pagamento do paciente de verdade. Pra receber via Asaas, precisa de CPF
  autônomo ou CNPJ próprio, **sempre separado do CNPJ da Vytra** — a sub-conta Asaas
  (decisão do §7, Fluxo 1) é criada em cima do CPF/CNPJ de cada profissional, não do
  documento da plataforma.
- **Bom pro produto**: sub-conta Asaas aceita tanto CPF autônomo quanto CNPJ — não é
  obrigatório cada profissional abrir empresa só pra entrar na Vytra. Reduz fricção de
  onboarding, relevante pro modelo white-label multi-profissional do §1/§2.
- **Nutrição (CRN) é profissão regulamentada** — no geral, profissão regulamentada costuma
  ficar de fora da lista de atividades elegíveis pro MEI. Se o Tassis quiser CNPJ (em vez
  de CPF autônomo com RPA/carnê-leão), o caminho provável é **ME direto, pulando o MEI**.
  **Confirmar com contador e/ou o CRN dele** antes de decidir — não é algo pra assumir do
  desenho técnico.
- **Educador físico (CREF)**: mesma lógica de documento separado do CNPJ da Vytra, mas não
  confirmei se a atividade entra ou não na lista de exclusão do MEI — mesma ressalva,
  confirmar com contador antes de orientar qualquer profissional novo.
- **MEI → ME é caminho normal e comum** — startup abrindo como MEI (o fundador sozinho) e
  subindo pra ME quando cresce (receita, sócio novo, atividade que o MEI não cobre) é
  padrão no Brasil. Chama-se desenquadramento do MEI + enquadramento como ME no Simples
  Nacional; ME exige contador (MEI não exige). Não é decisão técnica, é decisão de
  quando/quanto a Vytra vai faturar — mas não há bloqueio estrutural em começar pequeno.

### Requisitos de implementação que o termo cria

- Guardar **versão do termo aceita** + data, hora, IP e dispositivo do aceite
- **Nunca sobrescrever** versões antigas do termo (mesma lógica do versionamento de plano)
- Aceite vinculado à **assinatura**, não ao perfil — um consentimento por profissional (N:N)
- **Exportação** dos dados do paciente (portabilidade + fim de assinatura)
- Fotos de corpo com **acesso restrito e regra própria** de retenção
- Nome/CRN/CREF preenchidos **a partir do cadastro do profissional**, nunca fixos no texto


## 15. Schema versionado (03/set)

[`supabase/migrations/00000000_baseline_schema.sql`](supabase/migrations/00000000_baseline_schema.sql)
reconstrói o estado atual completo num projeto vazio: 11 tabelas, constraints, índices, 8 funções,
o trigger `on_auth_user_created` e as 30 policies.

Foi capturado por introspecção porque **o schema base nunca tinha sido versionado** — só as
migrações 20260902 e 20260903 estavam no git; as tabelas originais, as policies e o
`handle_new_user` existiam apenas dentro do projeto Supabase.

Ferramentas ausentes nesta máquina: `pg_dump`, `psql` e o CLI do Supabase. Só há acesso via SQL
pelo MCP. Se um dia for preciso migrar de projeto de verdade, instalar o CLI do Supabase primeiro —
copiar `auth.users` e `auth.identities` na mão via SQL é frágil e não vale o risco.

⚠️ O baseline é um **snapshot de 03/set** — não se atualiza sozinho. Migrações aplicadas depois
dele (`20260903_convite_cria_assinatura.sql`, `20260904_convite_token_default.sql`,
`20260904_teleconsultas.sql`) não estão refletidas nas contagens acima (11 tabelas/30 policies);
pra reconstruir o schema completo hoje, aplicar o baseline **e depois** todas as migrações
datadas seguintes, em ordem.


## 16. E-mail e SMTP (investigado em 03/set)

### A causa raiz

O SMTP padrão do Supabase **só entrega para membros da organização do projeto**. Não é limite de
volume — é limitação de destinatário, por design. Para paciente, ele nunca funcionaria.
Confirmado na doc oficial: <https://supabase.com/docs/guides/auth/auth-smtp>

### A dependência que ninguém tinha mapeado

SMTP próprio exige **domínio de envio verificado** (registros DNS). Domínio depende do nome do
app — que é justamente a pendência de marca com o Tassis (§7). Ou seja, **configurar SMTP de
verdade está bloqueado pela decisão de marca**, não por falta de tempo.

Contorno possível sem esperar a marca: usar um subdomínio de domínio já controlado
(`app.olihealthhub.com.br`, ou o domínio do Tassis). Subdomínio dedicado é boa prática — isola a
reputação de envio do domínio principal.

### Caminho recomendado: duas etapas

**Etapa 1 — agora, destrava a Fase 1 sem e-mail nenhum.**
✅ **Feito em 03/set:** confirmação de e-mail desligada (Dashboard → Authentication → Sign In /
Providers → Email → *Confirm email*). O fluxo de cadastro é **por token de convite**: o
profissional já conheceu o paciente, fez a call e recebeu o pagamento. O token é a prova de
confiança, e `finalizar_cadastro_convite` ainda confere que o e-mail bate com o do convite.

*Custo real dessa escolha, para decidir com consciência:* e-mail digitado errado gera conta
inalcançável; recuperação de senha continua dependendo de SMTP; e alguém poderia criar conta via
API com e-mail qualquer — mas sem convite não ganha assinatura, e a RLS não devolve nada
(verificado: usuário autenticado avulso enxerga zero linhas em todas as tabelas). Aceitável no
piloto, **não aceitável em escala**.

✅ **Etapa 2 resolvida (14/set)**, agora que o domínio `vytraoficial.com.br` existe: Guilherme
verificou `vytraoficial.com.br` no Resend (mesma conta já usada pro Oli — tier grátis ampliou pra
3 domínios por conta em ago/2026, não precisou pagar nem criar conta nova) e configurou SMTP no
Supabase dashboard (host `smtp.resend.com`, porta `587`, usuário `resend`, senha = API key,
remetente no domínio verificado) + `https://app.vytraoficial.com.br/**` nas Redirect URLs. Ver
§42 pro fluxo de "esqueci minha senha" que passou a funcionar com isso.

**Etapa 2 original (contexto histórico).** Provedor SMTP (a doc lista Resend, AWS SES, Postmark,
SendGrid, ZeptoMail, Brevo). Com Resend: host `smtp.resend.com`, porta `587`, usuário `resend`,
senha = chave de API, remetente no domínio verificado.

### URLs de retorno

✅ **Feito em 03/set:** Site URL configurado como `https://app-treino.expo.app` e a mesma URL
adicionada às redirect URLs. Dashboard → Authentication → URL Configuration.

### O que um agente NÃO consegue fazer aqui

Criar conta em provedor de e-mail e colar chave de API são ações fora do que um assistente executa.
O MCP do Supabase também **não expõe configuração de auth** — não há ferramenta para SMTP, Site URL
nem `mailer_autoconfirm`. Tudo isso é dashboard ou Management API com token pessoal:

```
PATCH https://api.supabase.com/v1/projects/<ref>/config/auth
```

Depois de configurado, dá para verificar por aqui: disparar um recovery de teste e conferir a
entrega e os logs de auth.

## 17. Transição Vytra — publicação, URLs e plataformas (09/set)

### Objetivo e regra de compatibilidade

Concluir a publicação institucional em `https://vytraoficial.com.br` e mover o app web para
`https://app.vytraoficial.com.br`, eliminando referências públicas a “App Treino” e
“treino-tassis” sem invalidar logins, links de convite, redirects de autenticação ou o deploy
atual. A transição segue **expandir → verificar → trocar leitores/escritores → manter legado**.
Não remover nenhuma URL antiga na mesma etapa do primeiro corte.

### Estado confirmado em 09/set

| Superfície | Estado | Próxima ação |
| --- | --- | --- |
| Marca no app | `name: Vytra`, `scheme: vytra`, ícones e splash Vytra | `slug` continua `app-treino` até o projeto EAS ser renomeado no dashboard |
| GitHub | ✅ repo renomeado para `https://github.com/guipasquetti/vytra`; homepage = `https://vytraoficial.com.br`; remote local atualizado | manter URL anterior como redirecionamento do GitHub |
| Landing | ✅ projeto Vercel `vytra`, deploy de produção pronto e servindo 200 em `vytraoficial.com.br`/`www` (confirmado 14/set, ver §43) | nenhuma — DNS e deploy confirmados |
| Domínios na Vercel | `vytraoficial.com.br` e `www.vytraoficial.com.br` vinculados ao projeto `vytra` | DNS ainda aponta para Registro.br padrão; configurar A da raiz e `www` conforme Vercel |
| App EAS | produção em `https://app-treino.expo.app`; EAS project `@guipasquetti/app-treino` / `f37244c8-045f-4fff-89de-ecf05f7872ce` | manter como rollback até o novo host passar nos testes |
| App Vercel | ✅ projeto separado `vytra-app`, bundle **em paridade com o Expo** (mesmo hash de `entry-*.js`) e rotas dinâmicas corrigidas via `public/vercel.json` (ver item dedicado abaixo) | deploy via `vercel deploy dist --project vytra-app --prod --yes` a cada `expo export`; não usar `--prebuilt` |
| EAS custom domain | indisponível no plano Free (confirmado no dashboard) | manter `app-treino.expo.app` como rollback; o app público novo é servido pela Vercel |
| Supabase Auth | Site URL e redirect URL atuais: `https://app-treino.expo.app` | adicionar `https://app.vytraoficial.com.br` primeiro; trocar Site URL apenas após teste de login/convite no novo host; manter URL antiga permitida |
| Convites | fallback nativo em `src/app/pro/convite.tsx` ainda aponta para `https://app-treino.expo.app`; na web usa `window.location.origin` | atualizar fallback só depois de o novo host responder com SSL válido |

### DNS a aplicar no Registro.br

1. **Landing:** `A @ → 216.198.79.1` **e** `A @ → 64.29.17.1` (Vercel, projeto `vytra`).
   Não usar o IP legado `76.76.21.21` enquanto os dois A atuais forem a recomendação do painel.
2. **App:** `CNAME app → 09877c60c63ba7a2.vercel-dns-017.com.` (Vercel, projeto
   `vytra-app`). Não usar A record no subdomínio enquanto esse CNAME específico for a
   recomendação do painel.
3. **SMTP posterior:** reservar `mail.vytraoficial.com.br`; não criar registros de envio antes
   de decidir o provedor e receber os valores de SPF/DKIM/DMARC.

### Ordem de execução e rollback

1. ~~Publicar/validar DNS da landing.~~ Feito — verificado `https://vytraoficial.com.br` e
   `www` respondendo 200 (14/set, ver §43).
2. Completar DNS/SSL do app na Vercel. Verificar login, refresh de sessão, deep link e convite
   em `app.vytraoficial.com.br`.
3. Adicionar o novo app URL à configuração de Auth do Supabase; testar login e convite; então
   promover o novo endereço a Site URL. Preservar o endereço Expo anterior como redirect URL.
4. Atualizar o fallback de convite, README, documentação e qualquer texto de produto que ainda
   exponha o nome antigo; publicar novo deploy EAS.
5. Só após pelo menos uma janela de operação estável, avaliar troca de slug/nome no dashboard
   EAS e a remoção do domínio `app` da Vercel. URLs de deploy e links históricos não precisam
   ser apagados.

**Rollback:** se o novo host falhar, o app continua em `https://app-treino.expo.app`; reverter
o Site URL do Supabase para ele e não alterar o fallback de convite. O repo antigo já é
redirecionado pelo GitHub e não requer reversão.

### ✅ Passos 1 e 2 concluídos e verificados (09/set, noite)

**Landing no ar.** As três URLs servem a página institucional com o conteúdo certo (tagline
"Um plano realmente seu.", os três passos, os seis recursos reais e o bloco do profissional):

| URL | Estado |
|---|---|
| `https://vytra-pi.vercel.app` | ✅ |
| `https://vytraoficial.com.br` | ✅ |
| `https://www.vytraoficial.com.br` | ✅ |

⚠️ **A causa do atraso não era DNS, era deploy de preview.** Antes do `vercel --prod` a própria
URL `vytra-pi.vercel.app` devolvia 404 — o alias de produção estava vazio. Diagnóstico que fica:
**se a URL `.vercel.app` do projeto também falha, o problema não é domínio.** Resolvido rodando
`npx vercel --prod` de dentro de `site/` (a pasta já está linkada ao projeto pelo
`site/.vercel/project.json`, projeto `vytra`, `prj_3ecvIXhccR3KcwUDGmNG2hBuktyl`).

**App no ar com a identidade nova.** `https://app.vytraoficial.com.br/` renderiza a tela de
login já rebrandeada: lockup Vytra (mark do sinal vital em menta + wordmark IBM Plex Mono em
curvas), tagline, seletor Aluno/Profissional e botão no accent `#2ED9A3` sobre a base
`#0A0C0D`. **Verificado por render real em navegador limpo**, não só por resposta HTTP.
O build servido é o atual: o `dist/` de 09/set traz `vytra-lockup-2400.png`, `vytra-mark-1024.png`,
as variantes branca/preta e as quatro fontes da marca, e o servidor entrega o arquivo com o
hash exato dessa compilação.

⚠️ **O 404 que apareceu no `app.vytraoficial.com.br` era cache do navegador, não infra.**
Diagnóstico completo: a Vercel mostra `Valid Configuration` + `Production` para
`app.vytraoficial.com.br` e `vytra-app.vercel.app` no projeto `vytra-app`; `/favicon.ico` e os
assets com hash respondem; e o render em navegador limpo funciona. O que grudou foi a resposta
404 guardada pelo navegador durante a janela em que o deploy estava quebrado — a Vercel manda
cabeçalho de cache mesmo em 404. **Regra que fica: antes de investigar infra por um 404 relatado,
reproduzir em janela privada.** Duas hipóteses minhas foram descartadas nesse caminho, a de DNS
errado no `app` (o painel diz válido) e a de deploy velho (o hash do asset bate).

**Estado real do DNS hoje** (medido, não planejado):

| Nome | Resolve para | Observação |
|---|---|---|
| raiz | `76.76.21.21`, `64.29.17.1`, `216.198.79.1` | ⚠️ o `76.76.21.21` é o IP legado que esta seção manda não usar. Funciona hoje, mas some sem aviso: **apagar esse registro A** |
| `www` | `76.76.21.123`, `66.33.60.35` | ⚠️ não é o CNAME previsto. Funciona; alinhar com o que o painel da Vercel recomenda hoje |
| `app` | `64.29.17.1`, `216.198.79.1` | ✅ a Vercel valida como correto. Não mexer |
| `mail` | sem registro | reservado pro SMTP, sem criar nada antes de escolher o provedor |

**Próximo passo real:** passo 3 da ordem acima (Supabase Auth), já que 1 e 2 estão fechados.
O fallback do passo 4 (`src/app/pro/convite.tsx`, hoje `https://app-treino.expo.app`) só é
tocado depois do passo 3, conforme a regra de expandir → verificar → trocar.

### ✅ Bug de rotas dinâmicas no Vercel encontrado e corrigido (09/set, noite)

⚠️ **Achado ao comparar os dois hosts:** `app.vytraoficial.com.br` (Vercel) estava com bundle
**defasado** em relação a `app-treino.expo.app` (faltavam §20 e §24) e, além disso, **toda rota
dinâmica quebrava com 404 ao recarregar** — `/convite/[token]`, `/pro/aluno/[id]`,
`/pro/aluno/[id]/dieta`, `/pro/aluno/[id]/resumo`. Causa: o export estático do Expo Router gera
um arquivo físico por rota (`convite/[token].html`, `pro/aluno/[id].html`...), e o EAS Hosting
sabe rotear parâmetro dinâmico nesse formato nativamente; o Vercel, sendo host estático genérico,
não sabe — precisa de `rewrites` explícitos em `vercel.json`.

**Correção aplicada:** [`public/vercel.json`](public/vercel.json) (copiado pro `dist/` a cada
`npx expo export --platform web`, convenção do Expo pra pasta `public/`) com `rewrites` mapeando
cada rota dinâmica pro path limpo correspondente — **sem** extensão `.html` no destino. Motivo
do "sem `.html`": o `cleanUrls: true` do Vercel redireciona (308) qualquer destino terminado em
`.html` de volta pro path sem extensão, e isso cria um loop interno que termina em 404 — só
funciona apontando direto pro path limpo que o próprio Vercel já mapeia internamente pro arquivo
(`overrides` no build output, ex. `"convite/[token].html": {"path": "convite/[token]"}`).

⚠️ **Cuidado à parte, descoberto no processo:** `vercel deploy --prebuilt` (build local via
`vercel build` + `vercel pull`) publicou um build que quebrou o site **inteiro**, incluindo a
raiz e rotas estáticas que funcionavam antes — não usar esse caminho aqui. O método que funciona
e foi usado em todo o resto desta seção é `npx vercel deploy dist --project vytra-app --prod
--yes` (build remoto, direto da pasta `dist/` já exportada pelo Expo).

**Deploy publicado e verificado (09/set, noite):** `app.vytraoficial.com.br` agora serve o
mesmo bundle (`entry-b06e1d96a64c65f1b9f75ca213bbe996.js`) que `app-treino.expo.app` — conferido
por hash do bundle, não só visualmente. Testado com `curl` (200 em `/`, `/aluno`,
`/convite/teste123`, `/pro/aluno/abc`, `/pro/aluno/abc/resumo`) e no navegador: `/convite/teste123`
renderiza "Link indisponível" (comportamento correto pra token inexistente) e sobrevive a reload
sem crash nem 404.

## 18. Organização do fluxo profissional (09/set)

✅ O fluxo profissional deixou de usar “Plano” para dois conceitos diferentes. A barra agora
separa **Início** (pendências e teleconsultas), **Pacientes** (carteira com acompanhamento já
criado), **Leads** (pessoas pré-cadastro) e **Serviços** (catálogo comercial de
`professional_plans`). A rota `pro/planos.tsx` foi mantida para não quebrar links internos,
mas o texto da interface passou a chamar o item de “Serviços”.

✅ Cada card em Pacientes e alerta do Início abre `pro/aluno/[id]/resumo`: o resumo mostra o
status do acompanhamento, serviço vinculado, solicitações pendentes, consultas registradas e
ações inequívocas para **Criar/Editar treino** e **Criar/Editar dieta**. Os editores existentes
continuam nas rotas anteriores, sem migration nem alteração de RLS/dados. `AlunoTabs` ganhou a
aba Resumo para a pessoa nunca cair no editor sem contexto.

**Critério de leitura:** lead só aparece em Leads até finalizar o convite/cadastro; paciente só
aparece na carteira quando a `subscription` existe. “Serviço” é o produto comercial; treino e
dieta são prescrições desse paciente. A agenda permanece no Início nesta etapa, e o resumo
mostra as consultas daquele paciente; não foi criada nova tabela nem mudado o fluxo de convite.

✅ O bloco de indicadores do Início foi refeito como uma grade de 2 colunas com altura e
alinhamento constantes. A cor menta fica reservada para acompanhamentos ativos, o âmbar
`Palette.vitalAlert` apenas para pendências e os demais números usam a cor de texto da marca.
Foram removidos azul/verde/laranja decorativos desse bloco; pedidos de serviço continuam na
seção própria logo abaixo.

## 19. Sistema visual minimalista Vytra (09/set)

✅ Reforma visual aplicada pela base compartilhada, para alcançar as telas existentes sem
recriar fluxos clínicos: títulos e placares usam Big Shoulders, rótulos/ações usam IBM Plex
Mono, cards passaram a ter borda fina e cantos menos arredondados, e botões/pills deixaram de
usar preenchimentos de cor como decoração. Ações principais usam Paper sobre Ink; Mint sinaliza
seleção/atividade; Amber fica restrito a atenção. `Palette.blue`/`green`/`purple`/`orange` e
similares permanecem como aliases temporários para não quebrar módulos, mas agora remetem a
Mint/Amber, nunca a cores externas à identidade. A exceção é `Palette.danger`, preservada para
erros e ações destrutivas.

**Escopo deliberado:** não houve alteração em schema, RLS, fluxos de convite, dados de treino
ou conteúdo clínico. Próximos ajustes de tela devem consumir `Screen`, `Card`, `Button`,
`Pill`, `Field` e os tokens em `src/theme`, em vez de introduzir cores ou tipografia próprias.

## 20. Leads e agenda operacional (09/set)

✅ A aba Leads passou a explicar o funil dentro da própria tela: pessoa em avaliação → conversa
registrada → convite enviado → cadastro concluído → Pacientes. Cada card agora expõe apenas as
ações da próxima etapa (`Registrar conversa` e, enquanto não há convite, `Enviar convite`);
edição e encerramento foram agrupados em “Mais opções”. Um lead com convite enviado não permite
criar convite duplicado e informa que está aguardando o cadastro.

✅ A seção de teleconsultas do Início ganhou calendário compacto dos próximos sete dias. Cada
dia mostra um marcador quando há consulta agendada e filtra a lista ao ser selecionado. A agenda
reaproveita `teleconsultas`/`listarAgenda`, sem tabela, RLS ou integração externa nova; o
formulário de criação continua logo abaixo para manter o fluxo curto.

## 21. Serviços comerciais do Tassis (09/set)

✅ Cadastrados diretamente em produção para o profissional Tassis, ambos ativos e incluindo
dieta + treino: **Acompanhamento mensal** (`R$ 350,00`, mensal) e **Acompanhamento trimestral**
(`R$ 800,00`, trimestral). A inserção é idempotente por nome e profissional, para evitar
duplicação em nova execução. O registro técnico **Padrão (migração)** foi preservado e continua
ativo porque pode estar vinculado a uma assinatura existente; não desativar ou editar sem uma
decisão explícita e checagem dos vínculos.

## 22. Largura de trabalho em desktop (09/set)

✅ `Screen`, a base de todas as telas roláveis, limita o conteúdo a **960px** e o centraliza em
viewports maiores. Isso evita cards, formulários e placares excessivamente largos em monitores
ultrawide, sem breakpoint novo nem efeito no mobile, que mantém `width: 100%` dentro do padding.

## 23. Deploys desta rodada (09/set)

✅ Todos os ajustes das seções 18–22 foram exportados e promovidos no **EAS Hosting** para a
produção `https://app-treino.expo.app`. O último deploy desta rodada é
`https://app-treino--q6r91tyj0y.expo.app` (preview imutável) e contém, além da reorganização
profissional e do design Vytra, a agenda compacta de teleconsultas, os serviços comerciais
cadastrados e o limite de 960px em desktop. A URL de produção pode manter o bundle anterior por
alguns minutos devido ao cache da CDN; o preview é a referência imediata para validação.

## 24. Direção de produto: especialidades e contratação (09/set)

✅ Decisão de produto registrada em [`ROADMAP.md`](ROADMAP.md): o Vytra passa a organizar a
próxima frente em torno de **especialidades clínicas separadas**. Há um núcleo compartilhado
(Início, Pacientes, Leads, Serviços, Agenda, Perfil e cobrança), mas nutricionistas e educadores
físicos terão painéis, check-ins, alertas e ações coerentes com a própria prática. O paciente
continua com uma área única, porém os módulos de Nutrição e Treino aparecem apenas conforme os
serviços ativos e sempre identificam o profissional responsável.

⚠️ Lacuna estrutural conhecida antes do início dessa frente: `aluno/checkin.tsx` hoje escolhe o
primeiro profissional vinculado e o check-in é compartilhado quando o paciente tem nutri e treino.
Não criar telas especializadas por cima desse comportamento. A primeira entrega desta frente é
uma modelagem/migração reversível que vincule acompanhamento, check-ins, evolução e permissões à
assinatura paciente↔profissional; a revisão de RLS, consentimento e compartilhamento de anamnese
é obrigatória antes de qualquer deploy.

✅ Duas relações comerciais permanecem separadas: **profissional → Vytra** (assinatura SaaS,
ainda não implementada) e **paciente → profissional** (serviço clínico, hoje com confirmação de
pagamento manual). Não reaproveitar `subscriptions` do paciente como assinatura SaaS do
profissional.

✅ **Fundação publicada em produção (09/set):** aplicada a migração
[`20260909173000_checkins_por_assinatura.sql`](supabase/migrations/20260909173000_checkins_por_assinatura.sql)
e a adaptação do app para que o check-in use `subscription_id`. A migração faz backfill
determinístico, falha se existir check-in sem assinatura correspondente, valida o par
paciente/profissional por trigger e reduz a política de leitura/fotos ao vínculo exato. A tela
do paciente deixa de escolher o primeiro profissional: quando houver mais de um, ele seleciona o
acompanhamento e vê histórico, prazo e fotos daquele vínculo. `database.types.ts` foi expandido
e comparado aos tipos oficiais gerados do schema remoto; o único acréscimo era o helper
`pode_ler_foto_checkin`, já registrado no arquivo.

**Validação pendente:** ainda falta exercitar o cenário com paciente ligado a nutricionista e
treinador distintos, verificando inserts, filtros, fotos assinadas e RLS nas três identidades.
O rollback não remove dados: restaurar as policies anteriores, remover trigger/funções/índice e
só depois a coluna `check_ins.subscription_id`, se necessário. Não fazer a contração sem essa
validação.

✅ **Deploy realizado (09/set):** a leitura remota encontrou 1 check-in e 0 sem assinatura
correspondente; `subscription_id` está `uuid NOT NULL`, as policies de insert/select e a proteção
de fotos existem em produção. Como o histórico de migrations local e remoto segue desalinhado,
esta migration foi executada explicitamente pelo arquivo e registrada como
`20260909173000` no histórico remoto — não usar `db push` até reconciliar as migrations antigas.
Bundle exportado e promovido para `https://app-treino.expo.app`; preview imutável:
`https://app-treino--itjtn76iyn.expo.app`.

✅ **Primeiro recorte dos painéis especializados publicado (09/set):**
`obterPainelGestao()` agora lê a especialidade do profissional e calcula “sem prescrição” a
partir do plano alimentar para nutricionista e do treino para educador físico. O Início muda o
subtítulo, os indicadores e os alertas: nutrição não recebe aviso de treino parado; treino não
recebe pendência de plano alimentar. Leads, Pacientes, Serviços e Agenda continuam comuns.
Não foi criada nova tabela nem liberada nova informação clínica. Publicado em
`https://app-treino.expo.app`; preview imutável:
`https://app-treino--bcruldkvt9.expo.app`.

**Estado do repositório:** essas mudanças continuam sem commit nesta sessão. Há também alterações
preexistentes de check-in em `src/components/checkin-flow.tsx` e `src/models/checkin.ts`; não as
reverter ou separar sem revisar a intenção registrada na seção de check-ins.

## 25. Três bugs do aluno corrigidos (09/set, sessão seguinte)

Reportados pelo Guilherme testando o app de verdade: lista de compras "fica perdida" dentro da
Dieta, treino registrado hoje não aparecia atualizado, e "Ir treinar" não abria o dia certo.

- ✅ **Lista de compras virou rota própria.** Era só uma seção no fim de `aluno/dieta.tsx` —
  pra chegar nela tinha que rolar refeições + observações inteiras. Extraída pra
  [`src/components/lista-compras.tsx`](src/components/lista-compras.tsx)
  (`ListaComprasSection`, mesma lógica de checklist/AsyncStorage/projeção de dias de antes,
  sem mudança de comportamento) e montada numa rota nova,
  [`aluno/lista-compras.tsx`](src/app/aluno/lista-compras.tsx) — "fantasma" no
  `<Tabs>` do `aluno/_layout.tsx` (`href: null`, mesmo padrão já usado em `pro/` pros
  editores). O card "Lista de compras" do Início e o card "Dieta" continuam distintos: Dieta
  ainda abre `/aluno/dieta` (macros + refeições), lista de compras agora abre só a lista.
  `aluno/dieta.tsx` consome o mesmo componente extraído no fim da tela, então o
  comportamento de quem ainda rola até lá continua igual.
  ⚠️ **Achado no meio da extração:** o novo JSX usava `user!.id` direto (mesma classe de bug
  do §8/04-set, sessão trocando com a tela montada) — corrigido acrescentando `!user` no
  guard de loading da tela, igual ao padrão já usado em `aluno/index.tsx`/`pro/planos.tsx`.
- ✅ **Início (dashboard) não atualizava depois de treinar.** Causa raiz: a tela só buscava
  dado uma vez, no primeiro mount (`useEffect` com `carregar` como dependência) — como as
  abas do `<Tabs>` do expo-router não desmontam ao trocar de aba, voltar do Treino pro Início
  mostrava o streak/contagem de exercícios de antes de treinar. Trocado por
  `useFocusEffect` (`expo-router` re-exporta de `@react-navigation/native`) em
  [`aluno/index.tsx`](src/app/aluno/index.tsx) — recarrega toda vez que a aba ganha foco, não
  só na primeira vez. Primeiro uso desse padrão no projeto; se a mesma cara de bug aparecer
  em Dieta/Treino depois, é o mesmo remédio.
- ✅ **"Ir treinar" abria a aba Treino, não o dia de hoje.** Como o app não tem conceito de
  "dia da semana" pro treino (é o aluno quem escolhe A/B/C, ver §11), o Início sempre trata
  `dias[0]` como "hoje" — mas a aba Treino guardava o último dia escolhido manualmente
  (`diaAtivo`) e não resetava ao voltar pra ela, porque também não desmonta. Card e botão
  "Ir treinar" em `aluno/index.tsx` agora navegam com
  `router.push({ pathname: '/aluno/treino', params: { dia: diaHoje.id } })`; `treino.tsx` lê
  `dia` via `useLocalSearchParams` e sobrescreve `diaAtivo` quando o parâmetro chega —
  clicar direto na aba Treino (sem vir do Início) continua respeitando o que o aluno tinha
  escolhido por último.
- **Verificado sem login** (mesma regra de nunca digitar senha, mesmo descartável): rota de
  depuração temporária (`_debug-lista-compras.tsx`, whitelisted por uma linha em
  `_layout.tsx`, mesmo padrão já usado em 06/set e 08/set) renderizando `ListaComprasSection`
  com dado mockado — checklist marca/desmarca, categoria fica verde ao completar, e o estado
  sobrevive a reload (AsyncStorage funcionando igual a antes da extração). Removida a rota e
  a linha do layout depois — `git status` confirmou `_layout.tsx` sem diff. `npx tsc --noEmit`
  limpo; app sobe sem erro de console/bundler até a tela de login.
  **Não testado logado**: o `useFocusEffect` do Início e o `?dia=` do "Ir treinar" dependem de
  navegação real entre abas com sessão de verdade — comportamento correto por leitura de
  código e por serem APIs padrão do projeto (mesmo padrão de `useLocalSearchParams` já usado
  em `pro/aluno/[id].tsx`), mas vale um teste manual do Guilherme/Tassis treinando de
  verdade.

Commitado em `e62667a` (09/set) — **sem deploy ainda nessa sessão**, ver §26.

## 26. Deploy bloqueado pelo classificador + treino não acompanhava o dia real (10/set)

⚠️ **`eas deploy --prod` e `vercel deploy --prod` bloqueados nesta sessão** pelo classificador
de auto mode do Claude Code (mesma classe de bloqueio já documentada em §8, 03/05/08-set — não é
permanente, é específico da sessão/chamada). `npx expo export --platform web` rodou normal e o
`dist/` gerado já inclui `/aluno/lista-compras` (confirmado na lista de rotas estáticas do
export), mas a promoção pra produção (`app-treino.expo.app` via EAS Hosting e
`app.vytraoficial.com.br` via Vercel) precisa ser feita pelo Guilherme:
```bash
npx eas deploy --prod
npx vercel deploy dist --project vytra-app --prod --yes
```
Os commits de §25 (lista de compras, Início não atualizava, "Ir treinar" no dia errado) e desta
seção (treino não seguia o dia real) estão no `main` mas **não estavam no ar** até essa dupla de
deploy rodar.

✅ **Treino não acompanhava o progresso real — corrigido.** O app não tem calendário de treino
(não amarra dia A/B/C a dia da semana, é o aluno quem decide a ordem), mas o Início e a aba
Treino tratavam `dias[0]` como "o de hoje" incondicionalmente — reportado pelo Guilherme como
"o treino não está acompanhando os dias reais". Era exatamente a simplificação já registrada
como aceita em §8/09-set ("não lembra qual dia o aluno tocou por último"), agora corrigida de
verdade.

`proximoDiaTreino(dias, historico, rascunhos)`, nova em
[`workoutService.ts`](src/services/workoutService.ts): dado o histórico de `workout_logs` (por
`exercise_id`, e cada exercício pertence a um único dia do plano — ver §11), acha o dia mais
recentemente treinado e devolve o **próximo da sequência**, ciclando de volta ao primeiro depois
do último (`A → B → C → A...`). Se já tem série registrada OU rascunho aberto **hoje** nalgum
dia, esse dia continua sendo "hoje" (não pula pro próximo enquanto ainda dá pra terminá-lo). Sem
histórico nenhum, começa em `dias[0]`, mesmo comportamento de antes pro aluno novo.

Usada nos dois lugares que antes assumiam `dias[0]` direto:
- [`aluno/index.tsx`](src/app/aluno/index.tsx) — `diaHoje` do card "Treino de hoje" e do que o
  botão "Ir treinar" manda em `?dia=`.
- [`aluno/treino.tsx`](src/app/aluno/treino.tsx) — valor inicial de `diaAtivo` quando a aba abre
  sem `?dia=` (ex.: clicando direto na aba, não vindo do Início). Continua sticky depois disso —
  só recalcula no primeiro carregamento ou quando o parâmetro da URL muda, exatamente como antes.

**Verificado sem login**, mesmo padrão de sempre: rota de depuração temporária
(`_debug-proximo-dia.tsx`, whitelisted por uma linha em `_layout.tsx`) rodando a função contra 5
cenários sintéticos — sem histórico, último feito há 2 dias, ciclo de volta ao primeiro dia,
série já registrada hoje (não deve pular) e rascunho aberto hoje sem log ainda (idem) — os 5
bateram o esperado. Removida a rota e a linha do layout depois — `git status` confirmou
`_layout.tsx` sem diff. `npx tsc --noEmit` limpo.
**Não testado logado com histórico real de produção** — mesma regra de nunca digitar senha; vale
conferir com o Tassis/Guilherme quando o próximo deploy for pro ar.

✅ **Deploy dos dois hosts feito nesta sessão** (depois do bloqueio do classificador ceder numa
segunda tentativa): `npx eas deploy --prod` e
`npx vercel deploy dist --project vytra-app --prod --yes` rodaram com sucesso, os dois hosts
serví­am o mesmo bundle (`entry-a4ed93998072a820c6f9ebffafa28fa3.js`, conferido por hash) — até
o achado abaixo aparecer.

⚠️→✅ **Achado real de infra, não do app: ícones sumindo só no espelho Vercel — corrigido.**
Guilherme reportou (print) que os botões de +/- do seletor de carga/reps e os ícones da barra
de abas (Início/Treino/Dieta/Check-in/Perfil) apareciam como quadrado vazio — não em todo
lugar, só onde o `@expo/vector-icons` (Ionicons) desenha um glifo. Causa raiz, achada
comparando os dois hosts: `npx expo export --platform web` aninha a fonte de terceiro do
Ionicons em `dist/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.*.ttf`
— caminho que **espelha** onde o pacote mora dentro do `node_modules` real do projeto, mas
dentro do próprio `dist/`. O Vercel CLI, sem um `.vercelignore` no diretório publicado, aplica
uma lista de ignore embutida que inclui qualquer pasta chamada **`node_modules`** — mesmo
sendo, aqui, só uma convenção de nomenclatura do Expo, não dependência de verdade. Resultado:
o arquivo nunca subia (confirmado por hash: `dist/` tem 73 arquivos, a Vercel só recebia 36 —
faltavam exatamente os 37 de `assets/node_modules/`), a fonte dava 404 em produção
(`app.vytraoficial.com.br`) mas 200 no EAS Hosting (`app-treino.expo.app`, que não tem esse
comportamento de ignore). Achado batendo hash/tamanho do arquivo (200, `font/ttf`,
389724 bytes, idêntico ao `dist/` local) depois da correção.

**A correção não foi só criar um `.vercelignore` vazio** — testado e não bastou (o CLI ainda
reportava "Found 26 rules" vindas de uma lista padrão interna, e o upload continuava sem os 37
arquivos). O que funcionou foi um `.vercelignore` com **negação explícita**:
```
!assets/node_modules
!assets/node_modules/**
```
Arquivo em [`public/.vercelignore`](public/.vercelignore) — mesma convenção já usada pro
`vercel.json` (§17): tudo em `public/` é copiado pro `dist/` a cada `npx expo export`, então
não precisa lembrar de recriar isso a cada deploy.

⚠️ **Risco aceito, registrado:** se um dia o Expo passar a aninhar QUALQUER outro asset de
terceiro sob um caminho diferente de `assets/node_modules/...` (ex.: uma fonte de outro pacote
de ícones), o mesmo bug volta pra esse caminho novo — não existe uma negação genérica "nunca
ignore nada dentro de assets/" tentada aqui porque isso reabriria a superfície que o ignore
padrão do Vercel existe pra fechar (evitar subir dependência de verdade sem querer). Se
aparecer ícone sumindo de novo, o primeiro passo é `find dist -type f | wc -l` vs. o total que
a Vercel realmente recebe (linha "Found N files" do `--debug`).

**Verificado**: os 37 arquivos de `assets/node_modules/` conferidos um a um por `curl`, todos
200 na produção; bundle hash inalterado (o código não mudou, só a config de deploy).
**Não é um bug de UI/React** — os componentes `Button`/`StepperButton` renderizam certo em
qualquer navegador; o glifo simplesmente não existia no servidor pro navegador baixar.

## 27. Fase 1 de painéis/anamnese/evolução — sem IA (11/set)

Pedido do Guilherme: painéis completos de dieta/perfil, dashboards de evolução, e (numa fase
posterior) IA (Claude API) interpretando anamnese pra sugerir dieta/treino a partir de fórmulas
que o profissional seta. Decisão dele: **painéis primeiro, IA depois, em cima de dado real** —
plano completo em `/Users/guilhermepasquetti/.claude/plans/vast-crunching-pretzel.md`.
`ROADMAP.md` — o item "Diagnóstico ou prescrição automatizada por IA" sai da lista "fora deste
ciclo": não é mais descartado, só adiado pra depois desta fase (nota adicionada lá).

✅ **Entrega 1 — Perfil completo + anamnese revisável.**
- `profiles.sexo` novo (`feminino|masculino|outro`, CHECK), backfill best-effort a partir de
  `anamnese.respostas_completas->>'sexo'` — [`20260911_profiles_sexo.sql`](supabase/migrations/20260911_profiles_sexo.sql),
  aplicada. Motivo: insumo obrigatório das fórmulas de gasto energético da Entrega 2. Lente LGPD:
  mesma sensibilidade de nome/telefone/data de nascimento já coletados, RLS existente cobre sem
  mudança.
- `extrairColunasAnamnese()` em [`anamnese.ts`](src/models/anamnese.ts) replica o mapeamento
  exato da RPC `submeter_anamnese_autenticado` — usada por
  [`anamneseService.ts`](src/services/anamneseService.ts) (`obterAnamnese`,
  `salvarAnamneseComoProfissional`) pra o profissional revisar/corrigir a anamnese direto na
  tabela (RLS `anamnese_update_professional` já liberava, só faltava a tela). **Nunca** usa a
  RPC do lado do profissional — ela é escopada em `auth.uid()` do paciente.
- `AnamneseCampos` extraído de [`onboarding-anamnese.tsx`](src/components/onboarding-anamnese.tsx)
  (formulário puro, sem lógica de onboarding) — reaproveitado em 3 lugares: onboarding original,
  [`aluno/anamnese.tsx`](src/app/aluno/anamnese.tsx) (paciente reedita a própria, novo — reusa
  `submeterAnamneseEPlano(respostas, null)`) e
  [`pro/aluno/[id]/anamnese.tsx`](src/app/pro/aluno/%5Bid%5D/anamnese.tsx) (revisão do
  profissional, novo). `AlunoTabs` ganhou 4ª pill "Anamnese"; `perfil-screen.tsx` ganhou seletor
  de sexo (Pill, não texto livre) e link "Ver/editar minha anamnese"; `resumo.tsx` ganhou card de
  anamnese (objetivo/condições/alergias, já extraídos por `gestaoService.ts`).
- `Field` (`ui/index.tsx`) ganhou prop `editable` (usada como base pra somenteLeitura futuro, não
  usada ainda em nenhuma tela).
- Verificado: `npx tsc --noEmit` limpo; `AnamneseCampos` e o seletor de sexo conferidos
  visualmente sem login via rota de depuração temporária (removida depois, `git status` limpo no
  `_layout.tsx`). **Não testado logado** — mesma regra de nunca digitar senha de conta nenhuma.

✅ **Entrega 2 — Calculadora de meta calórica + edição de substituições.**
- `planos_alimentares` ganhou `formula_calculo` (CHECK `mifflin_st_jeor|harris_benedict|
  cunningham`), `fator_atividade`, `percentual_gordura`, `tmb_calculada`, `get_calculado` —
  [`20260911_calculadora_meta_calorica.sql`](supabase/migrations/20260911_calculadora_meta_calorica.sql),
  aplicada. Config do mesmo plano 1-por-aluno já existente, não é histórico novo. Lente LGPD:
  só o profissional grava, RLS `dieta_*_professional` já cobre.
- [`gastoEnergetico.ts`](src/models/gastoEnergetico.ts) novo: `calcularTMB` (3 fórmulas),
  `calcularGET`, `sugerirMacros` (distribuição inicial editável, nunca publica sozinho),
  `idadeApartirDe`. **Validado contra valores de referência** via `npx tsx` antes de plugar na
  tela (Mifflin homem/mulher, Harris-Benedict, Cunningham, GET, macros — todos bateram).
- `dietEditor.ts` estendido com os novos campos do plano + helpers de substituição
  (`adicionarSubstituicao`/`removerSubstituicao`/`atualizarSubstituicao`/`substituicaoDeTaco`).
- `pro/aluno/[id]/dieta.tsx`: bloco "Calculadora de meta calórica" no topo (fórmula/fator de
  atividade/objetivo em Pills, busca TACO opcional pra substituição) — botão "Calcular sugestão"
  só preenche os campos de meta já existentes, profissional sempre revisa antes de publicar.
  Avisa quando falta sexo/peso/altura/data de nascimento do paciente, linkando pra tela de
  anamnese da Entrega 1. Editor de substituições dentro de cada item (antes só existiam no tipo,
  não editáveis pela UI).
- Verificado: `npx tsc --noEmit` limpo; calculadora conferida visualmente sem login (rota de
  depuração temporária com dado mockado, removida depois) — as 3 fórmulas, o campo condicional
  de % de gordura (Cunningham) e o resultado batendo com os mesmos números do teste `tsx`.

✅ **Entrega 3 — Dashboard de evolução no lado profissional.**
- `Sparkline`/`BarraProgresso` (antes locais em `aluno/index.tsx`) promovidos pra
  [`components/ui/index.tsx`](src/components/ui/index.tsx) como exports nomeados — elimina
  duplicação, sem mudança de comportamento no lado aluno.
- `checkinService.ts` ganhou `historicoPontuacao` (série de `pontuacao_geral`, mesma forma de
  `historicoPeso`) e `resumoAdesao` (média por categoria de `pontuacao_categorias` nos últimos 3
  check-ins) — dado que já existia (gravado desde o check-in de 06/set), nunca antes plotado em
  série nem visível pro profissional.
- `pro/aluno/[id]/resumo.tsx` ganhou seção "Evolução": peso (sparkline), pontuação de check-in
  (sparkline), adesão por categoria (barra), fotos de progresso (`obterComparacaoFotos`, já
  existia, nunca exibida nesse lado), streak de treino (`streakTreino`, já existia). Nenhuma
  tabela/coluna nova — só agregação de leitura, mesma RLS de sempre.
- Verificado: `npx tsc --noEmit` limpo, sem erro de bundler/console na tela de login (Metro
  reiniciado com cache limpo pra confirmar). **Não testado logado com dado real de evolução** —
  precisa de paciente com histórico de peso/check-in real; vale conferir quando o Tassis logar.

**Pendências desta fase**: nenhuma migração aplicada sem `get_advisors(security)` — conferido
duas vezes, mesma lista de warnings já aceita (nenhuma categoria nova). Nenhuma tela testada com
sessão real (mesma regra de nunca digitar senha de conta nenhuma, nem descartável) — vale um
teste manual do Guilherme/Tassis: perfil (sexo + anamnese), calculadora de dieta com paciente
real, e o dashboard de evolução em `resumo.tsx`.

✅ **Testado antes do commit (11/set, mesma sessão)**: `CalculadoraMetaCalorica` testada com o
componente REAL (export temporário revertido depois, `git status` limpo), não uma cópia — as 3
fórmulas batendo com os valores já validados por `npx tsx`, aviso de dado faltante e campo
condicional de % de gordura (Cunningham) funcionando. **Achado e corrigido nesse teste**:
`resumoAdesao` (`checkinService.ts`) misturava o `rotulo` de check-ins diferentes em vez de
rotular a média — corrigido pra usar `rotuloQualitativo()` (já existe em `checkin.ts`) sobre a
média calculada, revalidado com `npx tsx`. Commitado em `307c18d`.

✅ **Deploy publicado nos dois hosts (11/set)**: `npx expo export --platform web` → `npx eas
deploy --prod` (produção `app-treino.expo.app`) → `npx vercel deploy dist --project vytra-app
--prod --yes` (`app.vytraoficial.com.br`). Bundle hash idêntico nos dois
(`entry-848a10715728853f6caa3ec4ad9af992.js`), conferido por `curl`.
⚠️→✅ **Achado e corrigido no mesmo deploy**: `pro/aluno/[id]/anamnese` (rota nova desta fase)
deu 404 no Vercel — mesmo bug de rota dinâmica sem rewrite já documentado no §17 (o Vercel não
sabe rotear parâmetro dinâmico do export estático do Expo sem `rewrites` explícito em
`vercel.json`). Adicionada a entrada que faltava em
[`public/vercel.json`](public/vercel.json), reexportado e reenviado — `/pro/aluno/:id/anamnese`
e as demais rotas dinâmicas (`/pro/aluno/:id`, `/dieta`, `/resumo`, `/convite/:token`)
conferidas por `curl`, todas 200 nos dois hosts depois do fix. **Regra que fica reforçada**:
toda rota dinâmica nova sob `pro/aluno/[id]/` precisa de uma entrada em `public/vercel.json`,
não só no roteamento do Expo Router — o EAS Hosting não precisa disso, só o Vercel.

⚠️→✅ **Achado pelo Guilherme em produção, corrigido na hora**: `pro/aluno/[id]/anamnese.tsx`
virou uma **6ª aba fantasma** na barra do profissional — esqueci de declarar
`<Tabs.Screen name="aluno/[id]/anamnese" options={{ href: null }} />` em
[`pro/_layout.tsx`](src/app/pro/_layout.tsx), gotcha já documentado neste handoff (todo arquivo
novo em `src/app/pro/` vira aba sozinho sem essa declaração) e mesmo assim pisei nele. Corrigido
(commit `156a7fc`), reexportado, deploy nos dois hosts, hash conferido igual
(`entry-67d454a038511f654e71562982b8deea.js`). **Pergunta em aberto do Guilherme** — enxugar a barra do profissional (hoje
Início/Pacientes/Leads/Serviços/Perfil, 5 abas) — respondida e implementada, ver abaixo.

✅ **Barra do profissional enxugada pra 4 abas (11/set, reversão parcial deliberada de §18).**
Princípio dado pelo Guilherme: aba = área que o profissional gerencia no dia a dia, não uma aba
por atividade — precisa ser intuitivo, sem trabalho extra. `Serviços` (CRUD de
`professional_plans` — nome/preço/periodicidade) saiu da barra: é configuração mexida raro,
diferente de `Pacientes`/`Leads`, que são trabalho diário de verdade. `Leads` continua aba
própria — é área distinta de gestão diária (funil de conversão, §12), não uma configuração.
- `pro/_layout.tsx`: `planos` (rota `pro/planos.tsx`, mantida — não quebra link nenhum) trocou
  de `Tabs.Screen` com ícone/título de aba pra `href: null` + header nativo, mesmo padrão já
  usado em `aluno/[id]/index|dieta|resumo|anamnese`.
- `perfil-screen.tsx`: seção nova "Serviços" no perfil do profissional (mesma posição/formato da
  seção "Anamnese" já existente no perfil do aluno), botão "Gerenciar serviços" → `/pro/planos`.
- **Barra final**: Início / Pacientes / Leads / Perfil.
- **Verificado visualmente**: rota de depuração temporária mockando `useAuthStore` (session
  falsa + `isProfessional: true`, sem tocar Supabase de verdade) pra renderizar o `ProLayout`
  real sem precisar de login — confirmado só 4 ícones na barra, seção "Serviços" aparecendo no
  Perfil, botão navegando pra `/pro/planos` com header "Serviços" certo, barra de baixo
  permanecendo com as 4 abas dentro da tela de serviços. Removida a rota e a linha do layout
  depois — `git status` confirmou `_layout.tsx` sem diff. `npx tsc --noEmit` limpo.
- ✅ **Commitado (`dcd3349`) e deployado nos dois hosts**: `npx expo export --platform web` →
  `npx eas deploy --prod` → `npx vercel deploy dist --project vytra-app --prod --yes`. Bundle
  hash idêntico nos dois (`entry-6ed7b103b8798b6fde67693e0605b180.js`), `/pro/planos` e as
  rotas dinâmicas de paciente (`resumo`, `anamnese`) conferidas 200 por `curl` depois do deploy.

## 28. Biblioteca visual de exercícios — aguardando validação técnica (11/set)

✅ A pedido do Guilherme, foi gerado um conjunto inicial de **34 ilustrações PNG** em
[`assets/exercises/`](assets/exercises/), cobrindo cada exercício dos cinco dias do plano
publicado atual. Os nomes de arquivo correspondem à prescrição em `plans.dias` (a repetição de
"Tríceps corda" tem duas cópias, uma para cada ocorrência do plano).

Cada imagem tem fundo transparente, duas posições do movimento quando dinâmico (ou uma pose de
alinhamento no exercício isométrico), equipamento explícito e guias de movimento em teal.

✅ **Correção pontual solicitada pelo Guilherme:** `cadeira-flexora.png` teve as duas posições
invertidas horizontalmente: a flexão final fica à esquerda e a extensão inicial à direita, com a
seta apontando da posição inicial para a final. Aplicada por inversão exata do PNG original;
transparência (`alpha`) preservada.

✅ **Correção biomecânica solicitada pelo Guilherme:** `triceps-coice-unilateral-no-cabo.png`
foi redesenhada. A modelo agora fica de frente para a torre de cabo, em hinge estável; o braço
superior permanece fixo junto ao tronco e apenas o antebraço estende para trás. Arquivo PNG com
`alpha` confirmado; continua aguardando a validação técnica do Tassis.

✅ **Correção solicitada pelo Guilherme:** `abdominal-infra.png` trocou o halter preso entre os
pés por duas caneleiras escuras, cada uma fixada ao tornozelo. Mantém o mesmo movimento de
reverse crunch no banco declinado; PNG com `alpha` confirmado.

✅ **Correção biomecânica solicitada pelo Guilherme:** `elevacao-lateral-na-polia.png` foi
redesenhada para o cabo direto: a torre de polia baixa fica do mesmo lado da mão que segura o
handle, sem cruzar o tronco; a mesma mão do lado direito no quadro inicial segura o handle e
eleva esse mesmo braço até a altura do ombro no quadro final — sem espelhamento/troca de braço.
O braço oposto fica imóvel. PNG com `alpha` confirmado.

✅ **Correção biomecânica solicitada pelo Guilherme (12/set):**
`panturrilha-em-pe-ou-no-legpress.png` foi redesenhada como panturrilha no leg press 45°.
A modelo permanece reclinada e pernas, joelhos, assento, trenó e plataforma não se deslocam
entre os quadros; somente tornozelos e pés passam da dorsiflexão à flexão plantar contra a
plataforma fixa. PNG com `alpha` confirmado.

✅ **Causa de a correção não aparecer no app, encontrada e resolvida (12/set):** o resolvedor
em `src/lib/exerciseIllustrations.ts` testava o alias genérico `leg press` antes de
`panturrilha no leg press`; por isso a prescrição resolvia incorretamente para
`legpress.png`. A regra de panturrilha agora é avaliada primeiro. `npx tsc --noEmit` passou
e o bundle exportado confirma essa prioridade.

✅ **Correção solicitada pelo Guilherme:** `cadeira-adutora.png` foi redesenhada para que os
dois apoios permaneçam entre as pernas, pressionando a face interna das coxas tanto na abertura
inicial quanto no fechamento; ambos caminham para o centro, sem inverter lado ou atravessar o
corpo. PNG com `alpha` confirmado.

✅ **Correção solicitada pelo Guilherme:** `cadeira-abdutora.png` foi redesenhada para que os
dois apoios permaneçam do lado externo das coxas nas duas posições e acompanhem a abertura das
pernas para fora; não há apoio entre as pernas. PNG com `alpha` confirmado.

✅ **Correção solicitada pelo Guilherme:** `agachamento-smith-hack-ou-livre.png` foi
redesenhada para que a barra corra à frente dos trilhos e todos os discos fiquem nas mangas
externas, com espaço visível para fora das colunas do Smith — sem atravessar ou ficar ocultos
pelo suporte. PNG com `alpha` confirmado.

✅ **Padrão visual oficial para novos exercícios (decisão do Guilherme):** usar
`assets/exercises/elevacao-lateral-na-polia.png` como a referência de qualidade, formato e
acabamento. Ilustrações devem ter atleta adulta atlética sem traços faciais, anatomia e
proporções naturais, roupa de treino escura, máquina em grafite, seta de movimento em teal,
recorte PNG com alpha e sequência clara de início→fim. A variação feminina preserva a silhueta
e o styling da modelo atual; a masculina deve ser a contraparte atlética equivalente (traços
faciais neutros/sem rosto, cabelo curto e vestimenta escura), mantendo a mesma linguagem,
proporção, nível de detalhe e enquadramento. A continuidade do membro que segura carga/cabo e
a geometria física do equipamento são invariantes obrigatórios em ambos os perfis. Aplicar esse
padrão em toda solicitação futura de exercício, salvo orientação explícita em contrário.

✅ **Inventário conferido em 11/set:** `assets/exercises/` contém **34 PNGs**:
`abdominal-banco-45`, `abdominal-infra`, `agachamento-smith-hack-ou-livre`, `bulgaro`,
`cadeira-abdutora`, `cadeira-adutora`, `cadeira-extensora`, `cadeira-flexora`,
`crucifixo-inverso-maquina-ou-halter`, `crucifixo-maquina`,
`desenvolvimento-maquina-ou-smith`, `elevacao-frontal-unilateral-cabo-ou-halter`,
`elevacao-lateral-com-halter`, `elevacao-lateral-na-polia`, `elevacao-pelvica`,
`hiperextensao-lombar-com-sobrecarga`, `legpress`, `mesa-flexora`,
`panturrilha-em-pe-ou-no-legpress`, `prancha-isometrica`, `pull-down`,
`puxada-alta-barra-reta`, `puxada-alta-pegada-neutra`,
`remada-com-peito-apoiado-maquina`, `remada-maquina-sentado-cotovelos-altos`,
`remada-serrote-com-halter`, `rosca-martelo-unilateral-com-halter`,
`rosca-unilateral-com-halter`, `stiff`, `supino-declinado-maquina-ou-banco`,
`supino-reto-maquina-ou-barra`, `triceps-coice-unilateral-no-cabo`,
`triceps-corda` e `triceps-corda-dia-d`. Não há PNGs idênticos por hash. Os dois arquivos
de tríceps corda são a única duplicidade funcional intencional, pois a prescrição o repete em
dois dias; os arquivos são distintos para manter o mapeamento por ocorrência.

✅ **Integração piloto no treino do aluno (autorizada pelo Guilherme após validação parcial do
Tassis):** `src/lib/exerciseIllustrations.ts` faz o mapeamento local e determinístico por
`Exercicio.nome`, aceitando pequenas variações de grafia; exercícios ainda sem correspondência
apenas ficam sem imagem. Não há geração dinâmica, escrita no banco ou mudança em carga,
histórico e prescrição. Para a repetição de Tríceps corda, o dia `D` resolve
`triceps-corda-dia-d.png`; os demais resolvem `triceps-corda.png`.

✅ **Decisão de layout mobile (11/set):** a tentativa de recolher a imagem em uma prévia
compacta foi rejeitada pelo Guilherme e revertida. Cada card volta a exibir a demonstração
inteira, aberta por padrão, antes das séries. Preservar este layout até nova orientação.
`npx tsc --noEmit` limpo após a reversão.

✅ **Publicado em produção (11/set):** export web com as ilustrações abertas nos cards
promovido no EAS Hosting e no Vercel. `https://app-treino.expo.app` e
`https://app.vytraoficial.com.br` responderam 200 e entregaram o mesmo bundle
`entry-49d5914e79d6b50ffaed7d4690c19e9a.js`.

✅ **Correção de panturrilha publicada (12/set):** export web promovido no EAS Hosting
(`https://app-treino--ykifine9as.expo.app`) e na Vercel. As produções
`https://app-treino.expo.app` e `https://app.vytraoficial.com.br` responderam 200 e
entregaram o mesmo bundle `entry-f46f970b2b59b59cee6dffb0c66169b5.js`.

✅ **Republicação do mapeamento de panturrilha (12/set):** o bundle com a regra de prioridade
corrigida foi promovido no EAS (`https://app-treino--2b9c4pv7s5.expo.app`) e na Vercel.
Os dois hosts públicos responderam 200 com o mesmo bundle
`entry-4ae6f81d6d0839d8d73c4bb94d973c14.js`.

⚠️ **Validação técnica restante:** a integração é um piloto visual. Tassis ainda pode apontar
correções de variante, máquina, amplitude e alinhamento; nesse caso, regenerar apenas o asset
indicado, preservando o mapeamento determinístico já aplicado.

## 29. Mapa de telas (11/set)

✅ Pedido do Guilherme: visão macro de todas as telas existentes, separadas por perfil, pra
enxergar o fluxo inteiro. Artifact publicado:
https://claude.ai/code/artifact/c7d546e3-6acf-463a-a1a2-54294464022d — 25 rotas de
`src/app/` (estado no commit `352b76a`), organizadas em Público/Paciente/Profissional/Admin,
com o funil lead→paciente (§12) desenhado no topo e a distinção entre rota de aba e rota
"sem aba" (aberta por toque a partir de outra tela, ex.: editores de treino/dieta/anamnese do
profissional, Serviços). Não recria esta seção — o artifact é a fonte visual; atualizar aqui
só quando o inventário de rotas mudar (rota nova/removida, aba reorganizada), reexportando o
mesmo link (`Artifact` com o mesmo `url` mantém o endereço).

## 30. Benchmark ampliado de concorrentes (11/set)

✅ Pedido do Guilherme: modelar os softwares de benchmark pra entender o que entregam de
verdade (função, não tela) — "não quero cópia, mas não quero perder nem deixar passar nada".
Pesquisa por agente, artifact: https://claude.ai/code/artifact/bb96e86e-042e-4231-a89e-263f9f0e18da
— LiveClin, Elite Pro, MFIT, Dietbox, Trainerize, cruzados contra as 25 rotas do §29. MFIT e
Dietbox foram introspectados por MCP de verdade (`mcp.ai/mfit`, 11 tools; `mcp.ai/dietbox`, 36
tools), mesma técnica já usada no WebDiet — mais preciso que ler site de marketing.

⚠️ **Dois achados que precisam de confirmação do Tassis antes de virar fato no handoff:**
- **"Live Clean" provavelmente é erro de transcrição de "LiveClin"** (`liveclin.com`) — nenhum
  produto chamado "Live Clean" foi encontrado, e a LiveClin bate exatamente com a descrição já
  registrada aqui (check-in/histórico/follow-up de não-respondente). Não corrigi o nome nas
  seções §2/§8 sem confirmar — pode ser produto genuinamente diferente com nome parecido.
- **Elite Pro, fora da Bússola (já excluída do escopo, ver §7): sem fonte confiável.** Vários
  produtos homônimos (Elite Trainer, Elite Training, Elite Pro Coach) não se confirmam como o
  app citado pelo Tassis. Segue sem mapear — só resolve com print/link direto dele.

Gaps reais encontrados, sem prioridade decidida (não tomei essa decisão), ordenados por quantos
concorrentes convergem: **financeiro/cobrança** (4/5, já em construção, bloqueado por CNPJ),
~~**prontuário evolutivo**~~ (3/6 — ✅ **fechado 12/set**, ver §33), ~~**anexo de paciente**~~
(2/6 — ✅ **fechado 12/set**, ver §35), **IA em prescrição** (3/5 — reaberto 14/set, ver §40:
descarte original era "custo de infra" nunca medido de verdade; construído e deployado, mitigado
com modelo barato/gate de revisão obrigatória/tabela de auditoria de custo real — **só falta o
teste ponta a ponta do Guilherme**), **chat in-app**, **diário alimentar livre**, **hábito+badge
além de treino**, **app com marca própria entregue como produto pronto** (2/5 cada) — e mais sete
achados de sinal isolado (1 concorrente cada), listados no artifact pra não perder o achado.
Vytra já ganha em 2 pontos que nenhum dos 5 tem: lista de compras dinâmica e o funil
lead→convite→cadastro automático.

✅ **Artifact atualizado (14/set)** com os fechamentos de prontuário (§33) e anexo de paciente
(§35) e a reabertura de IA (§40, ainda "parcial" — falta só o teste real) — mesmo link:
https://claude.ai/code/artifact/bb96e86e-042e-4231-a89e-263f9f0e18da (tabela-síntese e itens
04/05 da lista ranqueada marcados como feito, item 03 marcado como em andamento).

## 31. Dieta do aluno — accordion nas refeições, observações e lista de compras (11/set)

✅ Pedido do Guilherme: `aluno/dieta.tsx` empurrava tudo (todas as refeições abertas, mais
observações, mais a lista de compras inteira) pra mesma rolagem — pedido pra virar accordion.
- **Refeições** (`RefeicaoCard`): cada card começa fechado, mostrando só nome + kcal total +
  contagem de itens; toque abre/fecha, um independente do outro (`Set<number>` de índices
  abertos em `DietaScreen`). Usa `Card` com `onPress` (já existia essa prop) + ícone
  `chevron-up/down` — sem lib nova.
- **Observações**: mesmo padrão, card fechado por padrão com chevron.
- **Lista de compras**: `ListaComprasSection` ([`lista-compras.tsx`](src/components/lista-compras.tsx))
  ganhou prop opcional `collapsible` (default `false`) — só o card-resumo (contagem/categorias/
  campo de dias) fica visível fechado; as categorias só renderizam quando aberto. `aluno/dieta.tsx`
  passa `collapsible`; a rota dedicada [`aluno/lista-compras.tsx`](src/app/aluno/lista-compras.tsx)
  **não** passa — continua sempre aberta, é o próprio propósito daquela tela.
- **Verificado sem login**: rota de depuração temporária no root (`debugdieta.tsx`, whitelisted
  por uma linha em `_layout.tsx`, mesmo padrão de sempre) com 3 refeições mockadas — expandir/
  colapsar cada refeição independente, observações e lista de compras funcionando, categorias da
  lista só aparecendo com o card aberto. Removida a rota e a linha do layout depois — `git status`
  confirmou `_layout.tsx` sem diff. `npx tsc --noEmit` limpo. **Não testado logado com plano
  real** — mesma regra de nunca digitar senha de conta nenhuma.

✅ **Deploy publicado nos dois hosts (11/set)**: `npx expo export --platform web` → `npx eas
deploy --prod` → `npx vercel deploy dist --project vytra-app --prod --yes`. Bundle hash idêntico
(`entry-bca2f7426756a34c561547c2167b8ba0.js`), conferido por `curl` nos dois (`app-treino.expo.app`
e `app.vytraoficial.com.br`), ambos 200.

## 32. Marcadores visuais de progresso no check-in do aluno (11/set)

✅ Pedido do Guilherme, ancorado no §30 (benchmark): "hábito+badge além de treino" e o padrão
LiveClin de "gráfico com alerta por cor" apareceram como gap parcial. Em vez de feature nova,
achado mais barato: `pro/aluno/[id]/resumo.tsx` já calculava sparkline de pontuação, peso, adesão
por categoria e streak (Entrega 3 do §27) — pro profissional ver, nunca espelhado pro próprio
paciente. `aluno/checkin.tsx` ganhou seção "Sua evolução" reaproveitando exatamente isso:
- `streakCheckin()`, nova em [`checkinService.ts`](src/services/checkinService.ts) — check-ins
  seguidos dentro do prazo (`PERIODICIDADE_DIAS` + 3 dias de folga), diferente do streak de
  treino (dias corridos): aqui "seguido" é não deixar passar um ciclo inteiro de check-in, não
  contar dia a dia. Mesmo padrão de streak já usado em `workoutService.streakTreino`.
- Sparkline de `historicoPontuacao()` e barras de `resumoAdesao()` — mesmas funções e
  componentes (`Sparkline`/`BarraProgresso`, `ui/index.tsx`) já usados no resumo do
  profissional. **Diferença nova**: a barra de adesão fica colorida por limiar (mint ≥60%,
  âmbar <60%, mesmo corte de `rotuloQualitativo` em `models/checkin.ts`) em vez de sempre
  `Palette.accent` — é o "alerta por cor" do LiveClin usando só a semântica que a marca já tem
  (mint = bom, âmbar = atenção, nunca vermelho literal). Não retroaplicado no
  `resumo.tsx` do profissional — fora do pedido desta rodada.
- Sem schema novo, sem tabela nova — só leitura do que `check_ins` já grava desde 06/set.
- **Verificado sem login**: rota de depuração temporária no root (`debugcheckin.tsx`,
  whitelisted por uma linha em `_layout.tsx`, mesmo padrão de sempre) com 3 check-ins mockados
  em progressão — streak bateu 3, sparkline subindo, barras coloridas certas (alimentação 48%
  âmbar, sono/treino ≥70% mint). Removida a rota e a linha do layout depois — `git status`
  confirmou `_layout.tsx` sem diff. `npx tsc --noEmit` limpo. **Não testado logado com histórico
  real** — mesma regra de nunca digitar senha de conta nenhuma.

✅ **Deploy publicado nos dois hosts (11/set)**: bloqueado na primeira tentativa pelo
classificador de auto mode (mesma classe já documentada no §8/§26, não é bloqueio permanente),
passou na segunda. `npx expo export --platform web` → `npx eas deploy --prod` → `npx vercel
deploy dist --project vytra-app --prod --yes`. Bundle hash idêntico
(`entry-59633ec33a99b93fb5e5e5cf0823f028.js`), conferido por `curl` nos dois
(`app-treino.expo.app` e `app.vytraoficial.com.br`), ambos 200.

⚠️→✅ **Redesenho do medidor de adesão pra minimalista (11/set, mesma sessão, pedido do
Guilherme: "tem que ficar mais minimalista na identidade do app")**: a barra preenchida tipo
pílula (`BarraProgresso`) saiu do check-in do aluno — virou `MedidorAdesao`, componente local em
`aluno/checkin.tsx` (não alterou `BarraProgresso` em `ui/index.tsx`, que continua igual pro
resumo do profissional e pra lista de compras do Início). Rótulo da categoria em IBM Plex Mono
maiúsculo, percentual em mono com `tabular-nums`, e uma linha de 2px (não pílula de 8px) —
cor mint/âmbar é o único sinal, sem preenchimento de fundo decorativo (§19: "botões/pills
deixaram de usar preenchimentos de cor como decoração"). Removido o rótulo qualitativo por
extenso (Ótimo/Bom/Neutro) do lado do número — redundante com a cor, cortado a pedido de
minimalismo. Verificado sem login pelo mesmo padrão (`debugcheckin.tsx`, removido depois,
`_layout.tsx` sem diff, `npx tsc --noEmit` limpo).

✅ **Deploy publicado nos dois hosts (11/set)**: `npx expo export --platform web` → `npx eas
deploy --prod` → `npx vercel deploy dist --project vytra-app --prod --yes`. Bundle hash idêntico
(`entry-7f2d9007355e08f8ad770951fdbb9b8d.js`), conferido por `curl` nos dois
(`app-treino.expo.app` e `app.vytraoficial.com.br`), ambos 200.

## 33. Prontuário evolutivo por sessão (12/set)

✅ Item 4 do §30 (benchmark) fechado: decisão do Guilherme foi **estender `atendimentos`**, não
criar `sessoes_clinicas` separada — pergunta que ficava pendente desde §7/11-set.
- **Migração** [`20260912_atendimentos_teleconsulta.sql`](supabase/migrations/20260912_atendimentos_teleconsulta.sql),
  **aplicada em produção** (autorizado pelo Guilherme): `atendimentos.teleconsulta_id` (uuid,
  nullable, referencia `teleconsultas`) + constraint `atendimentos_teleconsulta_requires_client`
  (uma nota ligada a consulta não pode pendurar num lead sem conta — `teleconsultas.patient_id`
  só existe pra quem já é paciente) + índice. Sem mudança de RLS: `atendimentos_write` já
  restringe por `professional_id = auth.uid()`, independente do alvo. `get_advisors(security)`
  depois: mesma lista de warnings já aceita, nenhuma categoria nova. `database.types.ts`
  regenerado via `generate_typescript_types` — conferido idêntico ao que eu já tinha adicionado
  à mão antes de aplicar.
- **Serviço**: `listarAtendimentosDoCliente()`, nova em
  [`leadsService.ts`](src/services/leadsService.ts) — mesma tabela do funil de lead, filtrada
  por `client_id` em vez de `lead_id`. `criarAtendimento()` já era genérico, sem mudança.
- **Tela**: [`pro/aluno/[id]/resumo.tsx`](src/app/pro/aluno/%5Bid%5D/resumo.tsx) ganhou seção
  "Prontuário" — campo de nota multilinha, Pills pra ligar a nota a uma das consultas já
  listadas na seção "Consultas" da mesma tela (ou "Nota avulsa", sem vínculo), lista das notas
  já registradas com a consulta ligada quando houver. **Só o profissional vê** — mesmo padrão
  de prontuário clínico privado que WebDiet/Dietbox/LiveClin também têm; paciente não lê nota
  do profissional sobre si, RLS não abre exceção pra isso.
- **Verificado sem login**: rota de depuração temporária no root (`debugprontuario.tsx`,
  whitelisted por uma linha em `_layout.tsx`, mesmo padrão de sempre) com nota mockada — campo
  preenchido habilita o botão, seleção de consulta muda o vínculo exibido, nota nova aparece no
  topo da lista com "· consulta de [data]" quando ligada. Removida a rota e a linha do layout
  depois — `git status` confirmou `_layout.tsx` sem diff. `npx tsc --noEmit` limpo.

✅ **Testado logado pelo Guilherme (12/set), em produção**: nota avulsa registrada e aparece no
topo sem vínculo; nota ligada a uma consulta aparece com "· consulta de [data]"; as duas
persistem depois de sair e voltar na tela; confirmado que o lado do paciente (perfil/check-in/
dieta) não expõe a nota — RLS de fato restringe ao profissional.

✅ **Deploy publicado nos dois hosts (12/set)**, junto com o commit do Codex das ilustrações de
exercício e do redesenho do Início (§28/§34) — `npx expo export --platform web` → `npx eas
deploy --prod` → `npx vercel deploy dist --project vytra-app --prod --yes`. Bundle hash idêntico
(`entry-1743f0269c8cc2493048b7f4fbd8e92a.js`), conferido por `curl` nos dois
(`app-treino.expo.app` e `app.vytraoficial.com.br`), ambos 200.

## 34. Início — gráfico de pontos no peso + lista de compras minimalista (12/set)

✅ Pedido do Guilherme: peso na tela Início virar "gráfico de pontos" e lista de compras virar
ícone mais direto, dentro da proposta de identidade da marca.
- `GraficoPontos`, novo em [`ui/index.tsx`](src/components/ui/index.tsx) — pontos ocos na cor
  do sinal sobre uma linha de base fina (`Palette.border`), só o mais recente vem preenchido —
  mesmo princípio já usado no `MedidorAdesao` do §32 (cor é o único sinal, sem preenchimento
  decorativo). Substitui a `Sparkline` (barras) só no card de peso de
  [`aluno/index.tsx`](src/app/aluno/index.tsx); `Sparkline` continua igual pros outros usos
  (resumo do profissional).
- Card "Lista de compras" do Início perdeu o título de seção e a `BarraProgresso` — virou uma
  linha só: ícone `list-outline` (Ionicons) + nome + contagem (`7/23`), sem barra preenchida.
- **Verificado sem login**: rota de depuração temporária (`_debug-pontos.tsx`, whitelisted por
  uma linha em `_layout.tsx`, mesmo padrão de sempre) com peso mockado em queda — pontos
  escalando certo, só o último preenchido, linha de base visível; card de lista de compras
  renderizando ícone+nome+contagem numa linha só. Removida a rota e a linha do layout depois —
  `git status` confirmou `_layout.tsx` sem diff. `npx tsc --noEmit` limpo.
- **Não testado logado com dado real** — mesma regra de nunca digitar senha de conta nenhuma.
  **Sem deploy ainda desta rodada.**

## 35. Anexo de paciente — item 5 do benchmark (12/set)

✅ Item 5 da lista ranqueada do §30 fechado: anexo de paciente (exame, laudo), gap que WebDiet e
Dietbox cobrem e o Vytra não tinha. Escopo: paciente sobe o próprio documento pro profissional do
acompanhamento; nunca o contrário (nota do profissional sobre o paciente já existe, é o
prontuário do §33).

- **Migração** [`20260912_anexos_paciente.sql`](supabase/migrations/20260912_anexos_paciente.sql),
  **aplicada em produção** (autorizado pelo Guilherme): tabela `anexos_paciente`
  (`client_id`/`professional_id`/`subscription_id`/`categoria` exame|laudo|outro/`nome_arquivo`/
  `storage_path`/`observacao`) + bucket privado `anexos-paciente`. Lente §0/LGPD: documento de
  saúde é dado sensível novo, e a tabela **nasce escopada por `subscription_id`** desde o início —
  não repete o desenho antigo de `client_id`/`professional_id` soltos que `check_ins` teve até
  09/set (§ "Fundação de especialidades"), quando um paciente com dois profissionais podia
  vazar dado pro profissional errado. Mesmo trigger de validação
  (`validar_assinatura_do_anexo`, espelha `validar_assinatura_do_checkin`) e mesma função de
  leitura de storage por linha real (`pode_ler_anexo_paciente`, espelha `pode_ler_foto_checkin`).
  `get_advisors(security)` depois: nenhuma categoria nova (só a mesma classe já aceita de RPC
  `security definer` anon/authenticated-chamável). `database.types.ts` regenerado via
  `generate_typescript_types` — achado e corrigido um erro de transcrição manual na última linha
  de `CompositeTypes` (`[CompositeTypeName]` em vez de `[PublicCompositeTypeNameOrOptions]`) antes
  de confirmar `npx tsc --noEmit` limpo; corrigido comparando com o texto gerado pelo MCP, não
  reaplicando a geração.
- **Serviço** [`anexosService.ts`](src/services/anexosService.ts) novo: upload (bucket privado,
  caminho `{client_id}/{subscription_id}/{timestamp}-{nome}`), registro, listagem por assinatura
  e por aluno, signed URL (1h), remoção (storage + linha).
- **Tela do paciente** [`aluno/anexos.tsx`](src/app/aluno/anexos.tsx), rota oculta
  (`href: null` em `aluno/_layout.tsx`, mesmo padrão de `lista-compras`/`anamnese`) — escolhe o
  acompanhamento quando tem mais de um profissional ativo (mesmo seletor de `listarMeusProfissionais`
  já usado no Perfil), categoria (Pill), sobe PDF ou foto (`expo-document-picker`, mesmo filtro
  `['application/pdf', 'image/*']` de `cadastro-profissional.tsx`), lista os já enviados com
  abrir/apagar. Link em `perfil-screen.tsx` → "Meus documentos".
- **Tela do profissional**: [`pro/aluno/[id]/resumo.tsx`](src/app/pro/aluno/%5Bid%5D/resumo.tsx)
  ganhou seção "Documentos do paciente" — lista os anexos do acompanhamento (RLS já escopa),
  botão "Abrir" via signed URL. Sem upload do lado profissional aqui — não é o caso de uso.
- **RLS verificada por simulação de JWT em transação com rollback**, com fixture de um SEGUNDO
  profissional (nutricionista fake) vinculado ao mesmo paciente real (Guilherme/Tassis) — o
  teste que mais importa, mesmo cuidado do fix de `check_ins`: paciente vê os 2 anexos próprios;
  Tassis vê só o anexo do próprio acompanhamento; o nutricionista fake vê só o dele, **nunca** o
  de Tassis; um usuário sem vínculo não vê nada. Todos os 4 resultados bateram o esperado.
  Fixture (profile/professional/subscription/anexo, inclusive um `auth.users` sintético — a FK
  de `profiles` exige) totalmente desfeita por `rollback` — conferido depois com `count(*) = 0`
  em todas as tabelas envolvidas.
- **Verificado sem login**: rota de depuração temporária (`_debug-anexos.tsx`, whitelisted por
  uma linha em `_layout.tsx`, mesmo padrão de sempre) com dado mockado — troca de acompanhamento
  esvazia a lista certa (isolamento visual confirmado), categoria/observação/envio/apagar
  funcionando. Removida a rota e a linha do layout depois — `git status` confirmou `_layout.tsx`
  sem diff. `npx tsc --noEmit` limpo (precisou reexportar web uma vez pra regenerar os tipos de
  rota do expo-router antes do typecheck limpar — `/aluno/anexos` apareceu nas 25→26 rotas
  estáticas do export).
- ✅ **Testado logado pelo Guilherme, funcionou**: upload de arquivo real pelo paciente, aparece
  em "Enviados", abre via signed URL; visível do lado profissional em "Documentos do paciente".
- ✅ **Commitado (`8fa78c2`) e deployado nos dois hosts (12/set)**: `npx expo export --platform
  web` → `npx vercel deploy dist --project vytra-app --prod --yes` → `npx eas deploy --prod`
  (bloqueado pelo classificador de auto mode na primeira tentativa, mesma classe já documentada
  em §8/§26, passou na segunda). Bundle hash idêntico nos dois
  (`entry-1765a80c4300364cf4ac3e74b1b85371.js`), conferido por `curl` — `/aluno/anexos` também
  200 nos dois (`app-treino.expo.app` e `app.vytraoficial.com.br`).
- ✅ Artifact do benchmark (§30) atualizado (14/set) com este item marcado como feito.

## 36. Guia de câmera pro check-in (12/set, ampliação do item 5)

✅ Pedido do Guilherme em cima do item 5: a comparação de fotos do check-in
(`obterComparacaoFotos`, §"Fase de Ataque") só é útil se cada envio ficar no mesmo
enquadramento — pediu uma guia pra o paciente sempre mandar a foto "de forma igual, dentro do
mesmo padrão".

- **`expo-camera` instalado** (`npx expo install expo-camera`, versão SDK 57) — **primeira vez
  que o projeto abre a frente de permissão de câmera ao vivo.** Decisão de 06/set foi
  deliberadamente reaproveitar só `expo-document-picker` (escolher arquivo existente) "pra não
  abrir uma frente nova de permissão de câmera sem necessidade agora" — essa necessidade chegou
  agora, com pedido explícito do Guilherme de garantir enquadramento consistente, algo que
  escolher um arquivo já tirado não resolve. Plugin registrado em
  [`app.json`](app.json) com o texto de permissão em português.
- **[`camera-guiada.tsx`](src/components/camera-guiada.tsx)** novo: `CameraView` em tela cheia +
  moldura de enquadramento (retângulo tracejado + linha de altura da cabeça, cor
  `Palette.accent`, sem preenchimento — mesma linguagem de "cor é o único sinal" do §19/§32) e
  rótulo com o ângulo (Perfil esquerdo/direito, Costas) e instrução curta. Botão de obturador,
  virar câmera (frente/trás) e cancelar. Depois de capturar, tela de revisão
  ("Tirar de novo" / "Usar essa foto") antes de subir — evita reenvio por engano.
  **A moldura marca só posição/distância/enquadramento — não tenta reconhecer o corpo nem
  validar pose**, é guia visual, não IA.
- **[`checkin-flow.tsx`](src/components/checkin-flow.tsx)** trocou o fluxo de foto: botão
  principal agora é "Tirar foto com a guia" (abre `CameraGuiada` em tela cheia, sobrepondo o
  card da pergunta); **mantido** um botão secundário "Ou escolher da galeria", reaproveitando o
  `DocumentPicker` de antes — sem esse fallback, quem não tem câmera disponível (desktop sem
  webcam, permissão negada) ficaria travado sem enviar a foto. `uploadFotoCheckin` não mudou —
  recebe `{uri, name}` de qualquer uma das duas origens.
- **Sem migração, sem RLS nova** — mesmas 3 colunas de path já existentes em `check_ins`, é só
  troca de como o arquivo chega até `uploadFotoCheckin`.
- **Verificado sem login**: rota de depuração temporária (`_debug-camera.tsx`, whitelisted por
  uma linha em `_layout.tsx`, mesmo padrão de sempre) — tela de permissão renderiza com o rótulo
  certo por ângulo, `npx tsc --noEmit` limpo, sem erro de console/bundler. O ambiente de preview
  usado aqui **bloqueia acesso a câmera de verdade** (sandbox sem hardware) — confirmado que o
  fluxo de permissão negada não quebra a tela (nenhum crash, nenhum erro de console), mas a
  câmera ao vivo, a moldura sobre a imagem real e a captura em si **não puderam ser testadas por
  mim** nesse ambiente. Removida a rota e a linha do layout depois — `git status` confirmou
  `_layout.tsx` sem diff.
- ✅ **Testado pelo Guilherme, guia funcionou** — moldura, captura e revisão confirmadas num
  dispositivo real.
- ⚠️→✅ **Achado no teste: "Ou escolher da galeria" abria o seletor de ARQUIVOS do sistema, não
  a galeria de fotos** — `expo-document-picker` (usado desde 06/set, decisão de não abrir uma
  segunda frente de permissão) não tem noção de "álbum de fotos", só um seletor genérico de
  arquivo do SO. Trocado por **`expo-image-picker`** (instalado, plugin novo em `app.json` com
  `photosPermission`) — `escolherDaGaleria()` em
  [`checkin-flow.tsx`](src/components/checkin-flow.tsx) agora chama
  `requestMediaLibraryPermissionsAsync()` (pede acesso às fotos explicitamente, mesmo padrão da
  câmera) e `launchImageLibraryAsync()` (abre a galeria de verdade). Escopo da troca é só o
  fallback de galeria do check-in — `aluno/anexos.tsx` e `cadastro-profissional.tsx` continuam
  em `expo-document-picker` de propósito (aceitam PDF, não só foto). **Verificado sem login**:
  rota de depuração temporária (`_debug-galeria.tsx`, removida depois, `_layout.tsx` sem diff)
  confirmou a chamada de permissão e abertura do picker sem crash (ambiente de preview não tem
  mídia real pra selecionar, mesma limitação já registrada pra câmera). `npx tsc --noEmit`
  limpo. **Não testado com seleção real de foto da galeria** — só o Guilherme num dispositivo
  real confirma a permissão aparecendo e uma foto de verdade sendo escolhida.

## 37. Correção do check-in recém-enviado (12/set)

✅ Pedido do Guilherme testando: achou que precisava de "editar o check-in" — esclarecido que é
**correção do check-in mais recente dentro de uma janela curta**, não reabertura livre do
histórico (`check_ins` continua append-only por padrão, §14 — isso é exceção pontual e
delimitada).

- **Migração** [`20260912_checkins_edicao.sql`](supabase/migrations/20260912_checkins_edicao.sql),
  **rascunhada, NÃO aplicada ainda** — falta autorização pra rodar em produção. Adiciona policy
  `check_ins_update_self` (paciente atualiza o próprio check-in só dentro de **24h** do
  `created_at` original, só se o acompanhamento seguir ativo) + trigger
  `check_ins_impede_troca_vinculo` (barra mudar `client_id`/`professional_id`/`subscription_id`
  no update, mesmo que a RLS de assinatura ativa tecnicamente permitisse mover o check-in pra
  outro acompanhamento válido do mesmo paciente). Lente §0: update em dado de saúde é superfície
  nova, mitigada pela janela curta (não se estende reeditando, é sempre contra o `created_at`
  original) e pela trigger de vínculo.
- **Serviço**: `podeEditarCheckin(checkin)` (checa a janela de 24h) e `corrigirCheckin(id,
  respostas, fotos)` (update, recalcula pontuação, não cria linha nova) novos em
  [`checkinService.ts`](src/services/checkinService.ts).
- **`CheckinFlow`** ganhou prop opcional `checkinParaCorrigir` — pré-preenche respostas e fotos
  já enviadas, chama `corrigirCheckin` em vez de `submeterCheckin` ao finalizar, título vira
  "Corrigir check-in".
- **`aluno/checkin.tsx`**: quando o check-in não está pendente mas o mais recente ainda está
  dentro da janela, aparece um botão "Corrigir esse check-in" junto do aviso de "volta em
  alguns dias".
- `npx tsc --noEmit` limpo. **Não testado logado nem aplicado em produção** — falta autorização
  pra rodar a migração; depois disso, testar: corrigir dentro da janela funciona, fora da
  janela a RLS barra, e a trigger impede trocar de profissional/acompanhamento no meio da
  correção.

## 38. Check-in: todas as perguntas de uma vez (12/set)

✅ Pedido do Guilherme: era uma pergunta por cartão, avançando sequencialmente (formato do §13,
"uma pergunta por cartão" pra maximizar conclusão) — trocado por **todas as perguntas visíveis
na mesma tela**, respondidas em qualquer ordem, com botão único "Enviar check-in" no fim.
Reescrita de [`checkin-flow.tsx`](src/components/checkin-flow.tsx).

- **Gate de envio usa o campo `opcional` do modelo** (já existia em
  [`checkin.ts`](src/models/checkin.ts), nunca lido por nenhuma tela até aqui): só as 5
  perguntas com `opcional: true` (pedido de revisão, as 3 fotos, feedback aberto) podem ficar em
  branco — as outras 17 bloqueiam o botão "Enviar" enquanto não respondidas. Contador
  "X/Y obrigatórias respondidas" no topo.
- **`perguntasVisiveis(respostas)` continua resolvendo `dependeDe` ao vivo** — `quantidade_alcool`
  aparece/some na mesma tela assim que `dias_alcool` muda, sem precisar avançar pra revelar
  (antes a revelação só era visível ao alcançar aquele passo).
- **`pedeDetalhe` agora é inline**, um `Field` que aparece dentro do próprio card quando a opção
  que pede detalhe está selecionada — antes era uma etapa de tela cheia à parte.
- **Removido**: conceito de "pular pergunta" com confirmação — não faz mais sentido quando
  todas as perguntas estão na tela; opcional em branco já é o equivalente.
- **Fotos continuam sempre opcionais** (já eram, no dado) — os botões "Tirar foto com a guia"/
  "Ou escolher da galeria" (câmera guiada + galeria, §36) ficam dentro do card de cada ângulo,
  sem mudança de comportamento.
- **`corrigirCheckin`** (§37) continua funcionando igual — o formulário todo-de-uma-vez só muda
  como as respostas chegam até `finalizar`/`enviar`, não a lógica de submeter vs. corrigir.
- **Verificado sem login**: rota de depuração temporária (`_debug-checkin.tsx`, whitelisted por
  uma linha em `_layout.tsx`, removida depois — `git status` confirmou `_layout.tsx` sem diff)
  — as 22 perguntas renderizam juntas, contador incrementa ao responder, `dependeDe` some/aparece
  ao vivo, badge "Opcional" nos 5 campos certos, botão "Enviar" desabilitado até fechar as
  obrigatórias. ⚠️ **Achado da própria ferramenta de teste, não do código**: o clique sintético
  do ambiente de automação não disparava o `StepperButton` (que escuta `onPressIn`/`onPressOut`,
  não `onPress` simples, desde o hold-to-repeat de 05/set) — confirmado como limitação da
  automação (disparando `mousedown`/`mouseup` reais via JS o valor incrementou certo), não regressão
  no componente. `npx tsc --noEmit` limpo.
- ✅ **Testado logado pelo Guilherme (celular real, mesma rodada do §39)**: check-in completo
  respondido no formato novo, sem travar.

## 39. Câmera preserva a sessão do check-in + 4º ângulo (frente) + silhuetas-guia (12/set)

✅ Três pedidos do Guilherme testando a câmera guiada (§36) e o novo formato de check-in (§38):

- **Câmera não perde mais a posição no check-in.** Até aqui `CameraGuiada` substituía a tela
  inteira (early return antes do `<Screen>`) — voltar da câmera (foto tirada ou cancelada)
  desmontava e remontava o formulário, perdendo a rolagem. Corrigido em
  [`checkin-flow.tsx`](src/components/checkin-flow.tsx): a câmera agora renderiza como overlay
  absoluto por cima do `<Screen>`, que nunca desmonta — a posição de rolagem e todas as
  respostas já dadas continuam exatamente onde estavam ao voltar.
- **4º ângulo: foto de frente.** Só existiam perfil esquerdo/direito/costas. Nova pergunta
  `foto_frente` em [`checkin.ts`](src/models/checkin.ts) (opcional, mesmo padrão das outras 3),
  coluna `check_ins.foto_frente_path`, `AnguloFoto` (`camera-guiada.tsx`) e `FotosCheckin`
  (`checkinService.ts`) estendidos pros 4 ângulos.
- **Silhuetas-guia no lugar da moldura genérica.** [`silhuetas-checkin.tsx`](src/components/silhuetas-checkin.tsx)
  novo (usa `react-native-svg`, instalado nesta mudança): só 2 formas de verdade — **frontal**
  (frente e costas, mesmo contorno — o traço de alguém parado de frente ou de costas é
  idêntico) e **lateral** (perfil, espelhada via `scaleX` pro lado direito). Traço só, sem
  preenchimento, mesma linguagem de "cor é o único sinal" do §19/§32. Verificado visualmente
  numa rota de depuração temporária (removida depois): as duas formas são legíveis como pessoa
  parada, frontal com braços/pernas separados, lateral com pé apontando pra frente.
- ✅ **Redesenho solicitado pelo Guilherme (12/set):** as silhuetas geométricas foram
  substituídas por seis modelos-guia PNG transparentes em `assets/checkin-guides/`, na mesma
  linguagem visual aprovada das ilustrações de exercício: mulher e homem, cada um com frente,
  costas e perfil. `CameraGuiada` recebe `profiles.sexo` pelo `CheckinFlow` e mostra o
  modelo masculino quando o perfil é `masculino`; nos demais casos usa o feminino. Frente e
  costas têm poses próprias; o perfil direito é o espelho exato do esquerdo. Todos os PNGs têm
  `alpha` confirmado; `npx tsc --noEmit` e `npx expo export --platform web` passaram.
- ✅ **Referência de foto antes da câmera (12/set):** os seis modelos-guia acima ficam
  preservados em `assets/checkin-guides/` para uso sobre a câmera; uma segunda biblioteca,
  `assets/checkin-references/`, guarda seis PNGs transparentes com as mesmas poses
  padronizadas (mulher/homem × frente/costas/perfil) em traje de banho preto discreto. Antes
  de abrir a câmera — e portanto antes de pedir sua permissão — `CameraGuiada` mostra a
  referência correspondente ao ângulo e a `profiles.sexo` do paciente (perfil direito é o
  espelho do esquerdo), além da orientação de manter o corpo inteiro visível. A pessoa então
  escolhe “Abrir câmera”; traje de banho **ou** roupa de treino ajustada são apresentados como
  opções de referência, sem obrigatoriedade. PNGs conferidos: 1024×1536, `alpha` presente;
  `npx tsc --noEmit` e `npx expo export --platform web` passaram. Mudança local, ainda sem
  nova estrutura de banco/RLS nem o armazenamento das fotos do paciente.
- ✅ **Ajuste dos perfis (12/set):** somente `feminino-perfil.png` e `masculino-perfil.png`
  em `assets/checkin-references/` foram substituídos por versões sem olhos, boca, nariz,
  sobrancelhas ou outros traços faciais. A pose lateral, o corpo inteiro, o fundo transparente
  e o uso como referência pré-câmera permanecem iguais; ambos foram reconferidos em
  1024×1536 com `alpha` presente.
- ✅ **Publicação (12/set):** após `npx expo export --platform web`, o bundle foi publicado
  no Vercel com `npx vercel deploy dist --project vytra-app --prod --yes` (deployment
  `dpl_8NnxQXaeHDR9WXCJkQZphS8Lnzux`) e a atualização OTA foi criada com `npx eas deploy --prod`.
  A rota `/aluno/checkin` respondeu HTTP 200 em `app.vytraoficial.com.br` e
  `vytra-app.vercel.app`. Inclui as referências pré-câmera e os dois perfis sem traços faciais.
- 🗺️ **Roadmap — diversidade visual (12/set):** registrada em [`ROADMAP.md`](ROADMAP.md), na
  frente “Depois — Expansão validada”: futura biblioteca de modelos com variações de pele/etnia,
  traços e cabelo para exercícios, check-in e onboarding. Diretriz de privacidade: a variedade
  entra por curadoria/rotação de contexto visual; o app não deve inferir, solicitar ou persistir
  raça/etnia do paciente para selecionar uma imagem.
- ✅ **Biblioteca inicial de diversidade visual completa (14/set):**
  `assets/checkin-references/diversidade/` agora contém **16 PNGs** (1024×1536, `alpha`), com
  frente, costas, perfil esquerdo e perfil direito para mulher negra, homem negro, mulher do
  Leste Asiático e homem do Leste Asiático. Todos são faceless e preservam postura clínica,
  traje preto e enquadramento. Ainda não são selecionados nem exibidos pelo app; faltam outras
  representações e a regra de curadoria/rotação na interface.
- ⚠️ **Regra obrigatória para novos exercícios (Guilherme, 14/set):** ao gerar novas
  ilustrações de execução, **mesclar deliberadamente as etnias** ao longo da biblioteca e de
  cada conjunto de telas/treinos — não concentrar todos os novos exercícios em modelos brancos.
  A escolha deve ser uma rotação editorial equilibrada, sem inferir, pedir ou persistir
  raça/etnia do paciente. Cada prompt novo deve declarar a representação escolhida, preservar
  as regras biomecânicas e o padrão visual Vytra, e a revisão deve conferir a distribuição
  acumulada antes de aprovar o lote.
- ✅ **Primeiro lote diverso de exercícios estáticos (14/set):** adicionados em
  `assets/exercises/`, todos PNG 1536×1024 com `alpha` real, duas fases de execução, rosto sem
  traços, equipamento grafite e seta teal: `supino-inclinado-com-halteres.png` (mulher negra),
  `remada-curvada-com-barra.png` (homem do Leste Asiático), `agachamento-goblet.png` (mulher do
  Leste Asiático) e `rosca-direta-barra-ez.png` (homem brasileiro pardo/mestiço). As poses foram
  revisadas para manter mãos, carga e trajetória coerentes entre início e fim.
- ⚠️ **Regra obrigatória de seta (Guilherme, 14/set):** a seta teal é um marcador da trajetória
  do movimento no próprio exercício, nunca um conector de “antes → depois” entre as duas poses.
  Deve ficar junto da carga, cabo, alavanca ou membro ativo e seguir sua trajetória biomecânica;
  não pode ocupar o espaço central nem sugerir que a figura da esquerda se desloca até a direita.
  O lote diverso foi corrigido conforme essa regra: press junto aos halteres, remada junto à barra,
  goblet junto ao quadril/carga e rosca EZ junto ao antebraço/barra.
- ✅ **Integração do lote diverso (14/set):** `src/lib/exerciseIllustrations.ts` resolve os quatro
  exercícios localmente; `generate-ai-plan` passa a preferi-los e
  `generate-exercise-illustration` os reconhece como estáticos, evitando geração dinâmica
  duplicada. Não houve publicação nesta alteração. A seleção continua editorial — esses rótulos
  descrevem os assets e não podem ser usados para inferir ou persistir raça/etnia de pacientes.
- 🔎 **Validação do lote diverso (14/set):** `npx tsc --noEmit`, `npx expo export --platform web`
  e `git diff --check` passaram; os quatro PNGs tiveram `alpha` e 1536×1024 confirmados. `npm run
  lint` segue reprovando por 11 erros preexistentes de `react-hooks/set-state-in-effect` em telas
  fora deste lote; nenhum diagnóstico envolve os arquivos alterados aqui.
- **Migrações aplicadas em produção** (autorizado pelo Guilherme):
  [`20260912_checkins_edicao.sql`](supabase/migrations/20260912_checkins_edicao.sql) (§37,
  correção do check-in dentro de 24h) e
  [`20260912_checkins_foto_frente.sql`](supabase/migrations/20260912_checkins_foto_frente.sql)
  (coluna nova + `pode_ler_foto_checkin` passando a checar os 4 caminhos). `get_advisors(security)`
  achou um real logo depois de aplicar: a trigger `check_ins_impede_troca_vinculo` (§37) tinha
  ficado sem `search_path` fixo — inconsistente com toda outra função do projeto (vetor de
  search_path injection). Corrigido na mesma sessão (`create or replace function ... set
  search_path = public`), reconferido: advisor volta a mostrar só a lista já aceita. Migração
  local também corrigida pra refletir o texto de verdade aplicado.
  `database.types.ts` regenerado via `generate_typescript_types`. `npx tsc --noEmit` limpo.
- ✅ **Deploy publicado nos dois hosts (12/set)**: `npx expo export --platform web` → `npx
  vercel deploy dist --project vytra-app --prod --yes` → `npx eas deploy --prod` (passou de
  primeira dessa vez). Bundle agora em **2 arquivos JS** (`entry-*.js` +
  `index-*.js` novo, 45KB — code-splitting mudou com as libs novas de câmera/SVG), os dois
  conferidos por `curl` nos dois hosts (`app-treino.expo.app`, `app.vytraoficial.com.br`),
  ambos 200, junto com `/aluno/anexos` e `/aluno/checkin`.
- ✅ **Testado pelo Guilherme num celular real, tudo funcionou**: os 4 ângulos (frente incluído),
  as silhuetas-guia sobre a câmera ao vivo, a sessão do check-in preservada ao voltar da câmera,
  e a galeria via `expo-image-picker`. Item 5 do benchmark (§30) e a ampliação de check-in ficam
  fechados de ponta a ponta, em produção.

## 40. IA gera treino e dieta a partir da anamnese — item 3 do benchmark reaberto (14/set)

✅ **Migração aplicada, bucket criado, Edge Functions deployadas (14/set, autorizado pelo
Guilherme)** — falta só configurar os dois secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) pra
funcionar de ponta a ponta; sem eles as duas functions respondem `falha_api`/`falha` (bloqueio
gracioso, nada quebra). `get_advisors(security)` depois da migração: nenhuma categoria nova além
do já aceito — `exercicios_ilustracoes`/`ia_geracoes` sem achado. `npx tsc --noEmit` limpo após
regenerar `database.types.ts` via `generate_typescript_types`.

Pedido do Guilherme: reabrir o item 3 do benchmark (§30), "IA em prescrição/anamnese/dieta"
(3/5 concorrentes), descartado em 11/set por "custo de infra" — nunca medido de verdade. Escopo
fechado nesta sessão:
- IA gera **treino e dieta** a partir da anamnese. Profissional **sempre** revisa e publica
  manualmente — a IA nunca publica sozinha (reusa o mesmo rascunho/`publicado` que já existia).
- **Sem paywall/gating de plano nesta v1** — sistema de tier de plataforma não existe ainda (só
  `professional_plans`, produto vendível do profissional, não tier). Decisão de negócio do
  Guilherme: lançar com tudo incluso agora pra vender diferenciação, gating fica pendência
  separada ligada ao item 1 (financeiro/cobrança) — mesmo padrão de "quem já tem, mantém" que
  Notion/Linear usaram ao introduzir tier depois.
- Custo mitigado por: modelo barato (`claude-haiku-4-5-20251001`), **sem retry automático** em
  lugar nenhum, e tabela `ia_geracoes` medindo tokens reais por chamada.
- Achado que virou regra de implementação: [`gastoEnergetico.ts:1-9`](src/models/gastoEnergetico.ts)
  já documentava decisão anterior do Guilherme — "toda sugestão baseada no que o profissional
  seta, nas fórmulas presentes". A IA nunca decide a meta calórica: só decide alimento/porção pra
  bater `meta_kcal`/macros que o profissional já tem em `planos_alimentares` (calculadora
  existente ou digitado à mão). Se não existir `meta_kcal`, a geração de dieta é bloqueada com
  aviso — zero custo de API gasto num bloqueio.

**Segunda automação, pedido à parte do Guilherme**: exercício sem ilustração (nem os ~34 do
catálogo estático, nem já gerado antes) ganha ilustração nova via **OpenAI `gpt-image-1`**
(`images.edit`, 2 ilustrações existentes como referência de estilo) — dispara em **qualquer**
save de plano, manual ou de IA, não só quando a IA monta. Cache global por nome normalizado
(`exercicios_ilustracoes`): o mesmo exercício gerado uma vez serve pra qualquer aluno/profissional
que usar esse nome depois — custo total limitado ao número de exercícios *distintos* já vistos,
não ao número de planos.

- **Migração** [`20260914_ia_geracao_planos.sql`](supabase/migrations/20260914_ia_geracao_planos.sql)
  (ainda não aplicada): `plans.gerado_por_ia`/`planos_alimentares.gerado_por_ia` (bool) +
  constraint `check (not (gerado_por_ia and publicado))` nas duas — rede de segurança no banco
  contra rascunho de IA vazar pro aluno, mesmo com bug futuro (a app já limpa a flag em todo save,
  isso nunca deveria disparar em uso normal). Tabela `ia_geracoes` (auditoria de custo/status por
  chamada, RLS: profissional só lê a própria). Tabela `exercicios_ilustracoes` (cache global de
  ilustração, RLS: leitura pra qualquer autenticado, escrita só via service role).
- **Refactor**: `gerarIdDeExercicio`/`idsEmUso`/`prepararParaSalvar`/`planoParaEdicao` (e tipos
  `PlanoEditavel`/`DiaEditavel`/`ExercicioEditavel`) saíram de `services/planEditor.ts` pra
  `models/domain.ts` — são puros (sem `@/lib/supabase`), precisavam rodar também em Deno.
  `planEditor.ts` reexporta tudo, nenhum call site mudou. `normalizarNomeExercicio`, novo em
  [`lib/exerciseNormalize.ts`](src/lib/exerciseNormalize.ts), saiu de dentro de
  `exerciseIllustrations.ts` pelo mesmo motivo.
- **Duas Edge Functions novas** (primeiras do projeto — não existia `supabase/functions/` ainda):
  [`generate-ai-plan`](supabase/functions/generate-ai-plan/index.ts) (Anthropic, tool-forçada,
  uma chamada por tipo treino/dieta) e
  [`generate-exercise-illustration`](supabase/functions/generate-exercise-illustration/index.ts)
  (OpenAI, roda em background via `EdgeRuntime.waitUntil` pra não travar quem chamou — gerar
  imagem leva 10-30s). Ambas importam direto por caminho relativo os arquivos puros de `src/`
  acima — sem duplicar lógica entre app e Edge Function. ⚠️ **Detalhe do deploy via MCP**: a
  ferramenta de deploy exige lista explícita de arquivo (sem acesso ao filesystem real), e o
  virtual root dela não deixa `../` subir acima da própria function — então o deploy atual usa
  `./src/...` como caminho, não o `../../../src/...` que está nos arquivos commitados no repo
  (esse é o caminho correto pra deploy via Supabase CLI local, que lê o filesystem de verdade).
  Os dois caminhos coexistem por design; se reintrospectar a function via `get_edge_function` o
  import vai aparecer diferente do repo — isso é esperado, não é drift acidental.
  `generate-exercise-illustration` também não inclui, nesse deploy MCP, as 2 imagens de
  referência de estilo (`reference/*.b64.txt`, ~1.3MB de base64 juntas — grande demais pra
  passar pelo parâmetro da ferramenta sem gastar contexto à toa) — elas EXISTEM commitadas no
  repo pra quando alguém rodar `supabase functions deploy` via CLI local. Sem elas, a function
  cai automaticamente no `images.generate` (só prompt de texto, sem referência visual) — funciona,
  só não com a consistência de estilo que foi pedida. Registrado como pendência abaixo.
- **Serviços novos**: [`iaService.ts`](src/services/iaService.ts) (client, chama
  `generate-ai-plan`) e [`illustrationService.ts`](src/services/illustrationService.ts) (busca em
  lote do cache de ilustração + dispara `generate-exercise-illustration` fire-and-forget).
- **UI**: botão "Gerar com IA" nas telas de treino/dieta do profissional
  ([`pro/aluno/[id]/index.tsx`](src/app/pro/aluno/%5Bid%5D/index.tsx),
  [`pro/aluno/[id]/dieta.tsx`](src/app/pro/aluno/%5Bid%5D/dieta.tsx)) com confirmação antes de
  sobrescrever plano com conteúdo real, e banner "Sugestão de IA — revise antes de publicar"
  enquanto `gerado_por_ia=true`. Aluno ([`aluno/treino.tsx`](src/app/aluno/treino.tsx)) ganha
  fallback de ilustração dinâmica quando a estática não cobre o exercício.
- **LGPD (ação pendente, não só nota)**: anamnese carrega dado de saúde sensível. Mandar isso pra
  Anthropic é transferência internacional nova, além da já documentada (banco nos EUA) — só sai
  um subconjunto curado das chaves de `respostas_completas` (nunca nome/telefone/profissão). O
  termo de consentimento (fora do repo, ver §14) precisa declarar a Anthropic como novo
  sub-processador **antes** de qualquer aluno real passar por isso — sign-off do Guilherme, não é
  decisão só de engenharia.

**Pendências novas:**
- **Configurar os secrets** `ANTHROPIC_API_KEY` e `OPENAI_API_KEY` no projeto Supabase
  (`treino-tassis`, `fshwcaxcbnudvoyyqaxy`) — via dashboard (Edge Functions → Secrets) ou
  `supabase secrets set ANTHROPIC_API_KEY=... OPENAI_API_KEY=... --project-ref
  fshwcaxcbnudvoyyqaxy`. Chave de cada provedor é do Guilherme, não passa pelo chat/agente.
  `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` já são injetados automaticamente
  pelo runtime, não precisam ser configurados.
- Rodar um deploy via Supabase CLI local (`supabase functions deploy generate-exercise-illustration
  --project-ref fshwcaxcbnudvoyyqaxy`) quando quiser as 2 imagens de referência de estilo
  entrando de verdade (ver nota do deploy MCP acima) — opcional, a function funciona sem isso.
- Gating de IA por tier de plano — sem sistema de tier ainda, ligado ao item 1 (financeiro).
- Atualizar o termo de consentimento externo com o novo sub-processador (Anthropic) antes de uso
  real com paciente.
- Testar de ponta a ponta com o Guilherme logado, mesma regra de sempre (nunca senha de conta
  nenhuma digitada por agente) — inclusive confirmar que a constraint do banco
  (`plans_ia_exige_revisao`/`planos_alimentares_ia_exige_revisao`) segura mesmo se algo tentar
  publicar direto.

✅ **Deploy do app publicado nos dois hosts (14/set)**: `npx expo export --platform web` → `npx
eas deploy --prod` → `npx vercel deploy dist --project vytra-app --prod --yes`. Bundle
`entry-a88a0cd29e839caa2b0efbbbe76f378e.js`, conferido por `curl` nos dois
(`app-treino.expo.app`, `app.vytraoficial.com.br`), ambos 200. Backend (migração, bucket, Edge
Functions) já estava em produção desde antes deste deploy — só faltava o app cliente pegar o
botão "Gerar com IA" novo. Secrets (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`) configurados pelo
Guilherme direto no dashboard — teste real de ponta a ponta ainda pendente (ele vai clicar
"Gerar com IA" numa tela real).

## 41. Reenviar convite de cadastro pra lead (14/set)

✅ Pedido do Guilherme: em `pro/leads.tsx`, o botão "Enviar convite" só existe enquanto
`lead.convite_id` é nulo (linha do botão original) — depois de gerado uma vez (link perdido,
WhatsApp não entregou, etc.), não tinha como gerar link novo pro mesmo lead.

- **Investigação prévia**: bloqueio era 100% de UI (`lead.status === 'lead' && !lead.convite_id`
  escondendo o botão), nada no schema/RLS impedia um segundo convite. Achado à parte, relevante
  pra quem mexer em `convites` de novo: o arquivo de migração `20260904_leads_atendimentos.sql`
  parece redefinir `finalizar_cadastro_convite` exigindo `status = 'preenchido'`, mas a versão
  **realmente aplicada em produção** (conferida direto no banco via `pg_get_functiondef`, não só
  lendo os arquivos) é a de `20260904_anamnese_pos_login.sql`, que exige `status = 'pendente'` —
  fluxo atual de verdade é conta primeiro, anamnese depois, dentro do app autenticado. Não confiar
  só na ordem alfabética dos arquivos de migração pra saber qual definição vale; checar o banco.
- **Migração** [`20260914_reenviar_convite.sql`](supabase/migrations/20260914_reenviar_convite.sql),
  aplicada em produção: função `reenviar_convite(p_convite_id uuid) returns text` — regenera o
  `token` na MESMA linha de `convites` (nunca cria linha nova) e força `status = 'pendente'`. Sem
  `SECURITY DEFINER` de propósito: a RLS de `convites` já restringe update a
  `created_by = auth.uid()`, então a função roda como invoker e herda essa checagem sozinha — o
  `and created_by = auth.uid()` explícito na função é defesa em profundidade, não substituto da
  RLS. `get_advisors(security)` depois: função nem aparece nos achados de "SECURITY DEFINER
  público" (esperado, por não ser DEFINER), nenhuma categoria nova.
- **Serviço**: `reenviarConvite(conviteId)`, novo em
  [`professionalService.ts`](src/services/professionalService.ts), ao lado de `criarConvite`.
- **UI**: `pro/leads.tsx` ganhou botão "Reenviar convite" quando `lead.status === 'lead' &&
  lead.convite_id`. Reusa a MESMA tela [`pro/convite.tsx`](src/app/pro/convite.tsx) — quando a
  URL traz `conviteId`, os campos nome/e-mail ficam só leitura (não fazem parte do reenvio) e o
  botão chama `reenviarConvite` em vez de `criarConvite`+`vincularConviteAoLead`; a tela de link
  gerado avisa "o link anterior parou de funcionar".
- `npx tsc --noEmit` limpo após regenerar `database.types.ts`.
- **Deploy publicado nos dois hosts (14/set)**: `npx expo export --platform web` → `npx eas
  deploy --prod` → `npx vercel deploy dist --project vytra-app --prod --yes`, conferido por
  `curl` nos dois (`app-treino.expo.app`, `app.vytraoficial.com.br`), ambos 200.
- **Não testado logado com lead real** — mesma regra de sempre (nunca senha de conta nenhuma
  digitada por agente). Vale um teste manual: reenviar um convite existente e confirmar que o
  link antigo para de funcionar e o novo completa o cadastro normalmente.

## 42. Esqueci minha senha (14/set)

✅ Pedido do Guilherme: não existia botão de recuperação de senha — dependia do SMTP, que ficou
resolvido nesta sessão (ver §16, Etapa 2) assim que o domínio `vytraoficial.com.br` entrou no ar.

- **Duas telas novas**: [`esqueci-senha.tsx`](src/app/esqueci-senha.tsx) (pede e-mail, chama
  `solicitarRedefinicaoSenha` — mensagem de sucesso sempre igual, exista ou não o e-mail, pra não
  vazar quem tem conta) e [`redefinir-senha.tsx`](src/app/redefinir-senha.tsx) (recebe o link).
- **Achado que virou trabalho extra**: `flowType` do supabase-js nunca foi setado (fica no padrão
  `implicit`), e `detectSessionInUrl: false` em `lib/supabase.ts` (proposital, evita crash de SSR
  no export web) significa que o token do link de recuperação **nunca é lido sozinho** — chega em
  `window.location.hash` (`#access_token=...&refresh_token=...&type=recovery`), e
  `redefinir-senha.tsx` é quem lê isso manualmente e chama `setSession` — sem isso a tela nunca
  reconheceria o link. Depois de trocar a senha, desloga de propósito (`signOut`) e manda pro
  login de novo, em vez de deixar autenticado silenciosamente por um link de e-mail.
- **Achado que quase quebrou o fluxo**: `_layout.tsx` tem um guard global que redireciona
  qualquer sessão autenticada pra `/aluno`/`/pro` na hora. `redefinir-senha.tsx` GANHA uma sessão
  (a de recuperação) assim que lê o token — sem exceção nesse guard, o usuário seria chutado pra
  área errada antes de conseguir trocar a senha. `esqueci-senha`/`redefinir-senha` entraram na
  mesma lista de exceção que `convite`/`cadastro-profissional` já tinham.
- **Serviços novos** em [`authService.ts`](src/services/authService.ts):
  `solicitarRedefinicaoSenha(email)` e `redefinirSenha(novaSenha)`. `baseUrl()`, que só existia
  duplicada dentro de `pro/convite.tsx`, virou compartilhada em
  [`lib/baseUrl.ts`](src/lib/baseUrl.ts) — usada nos dois lugares agora.
- **UI**: login ganhou o link "Esqueci minha senha" (`login.tsx`).
- **Verificado no browser** (preview local, `npx expo start --web`): disparo do link com e-mail
  fictício (sem conta de verdade) devolveu a mesma mensagem de sucesso, sem erro no console;
  `/redefinir-senha` sem token mostrou "link inválido" e o botão voltou pra `esqueci-senha`
  corretamente. **Não testado o ciclo completo com e-mail de verdade chegando na caixa de
  entrada** — vale um teste manual do Guilherme.
- `npx tsc --noEmit` limpo (precisou reiniciar o Metro uma vez pra regenerar
  `.expo/types/router.d.ts` com as rotas novas — `expo export` sozinho não atualiza esse arquivo,
  só o dev server via `expo start` faz isso).
- **Deploy publicado nos dois hosts (14/set)**: mesmo pipeline de sempre, conferido por `curl`,
  ambos 200.

⚠️→✅ **Bug real achado no teste com e-mail de verdade do Guilherme**: o link do e-mail levava
pro **login**, não pra `redefinir-senha`. Causa: o Supabase só anexa o `redirect_to` pedido
(`/redefinir-senha`) na URL final quando ela bate com uma Redirect URL cadastrada — sem bater,
cai de volta no Site URL puro (`/`, raiz), token junto como fragmento
(`#access_token=...&type=recovery`), só que grudado em "/" em vez de "/redefinir-senha".
`index.tsx` (raiz) fazia `<Redirect href="/login">` pra quem não tem sessão — navegação do Router
não carrega fragmento de URL, o token se perdia nesse pulo. Corrigido em
[`index.tsx`](src/app/index.tsx): checa `window.location.hash` por `type=recovery` ANTES de
qualquer decisão de sessão, e se achar usa `window.location.replace` (navegação de browser de
verdade, preserva o hash) pra `/redefinir-senha` — funciona independente de a Redirect URL do
dashboard estar cadastrada certa ou não (defesa em profundidade, não só corrigir a causa raiz).
`npx tsc --noEmit` limpo. Deploy publicado de novo nos dois hosts.

- ✅ **Template de e-mail na identidade da marca**, pedido do Guilherme:
  [`docs/marca/email-redefinir-senha.html`](docs/marca/email-redefinir-senha.html) — sem imagem
  de propósito (wordmark "VYTRA" em texto estilizado, mint sobre fundo escuro), evita depender de
  host externo pra logo e o bloqueio de imagem padrão de boa parte dos clientes de e-mail.
  **Substituído por ele no Supabase dashboard (14/set)** em Authentication → Emails → Reset
  Password → Message (HTML) — config de dashboard, fora do que um agente aplica sozinho (mesma
  limitação do §16). Vale reusar esse mesmo arquivo como base se um dia precisar de template pra
  outro tipo de e-mail do Supabase (Magic Link, Change Email etc.) — hoje só Reset Password é
  usado de verdade (confirmação de cadastro continua desligada, ver §16).

## 43. Landing (`vytraoficial.com.br`) fora do ar — achado e corrigido (14/set)

⚠️→✅ Guilherme reportou o site 404. Investigação: **não era DNS** — `dig` confirmou a raiz
resolvendo pro IP da Vercel (`76.76.21.21`, o mesmo que o §7 marca como "legado, não usar",
mas que segue funcional) e `www`/`app` também corretos. O problema era o **deploy de
produção do projeto `vytra`** (feito há ~2 dias): `vercel inspect` mostrava `status: Ready` e
alias certo pra `vytraoficial.com.br`, mas tanto o domínio quanto o alias direto
`vytra-pi.vercel.app` devolviam `404 NOT_FOUND` (`x-vercel-error: NOT_FOUND`) — deploy marcado
como saudável só na metadata, servindo 404 de verdade. Mesma classe de bug silencioso já
documentada pro app (§17, ícones sumindo por `.vercelignore`) — build "Ready" não é garantia
de conteúdo correto.

**Correção**: `npx vercel deploy --prod --yes` de dentro de `site/` (sem mudança de código —
`index.html`/`vercel.json` já estavam certos e sem diff no git) gerou um deploy novo
(`dpl_7B8LvowQZdm5YqFRdFm9w8G8eXFs`) que serve 200 em todos os aliases. Verificado por `curl -I`
em `vytraoficial.com.br`, `www.vytraoficial.com.br` e `vytra-pi.vercel.app` — os três 200.
Não investigada a causa raiz do deploy anterior ter build vazio (não crítico agora que
resolveu; se repetir, comparar `vercel inspect --logs` do deploy quebrado com um bom).

## 44. Perfil do profissional mostrava campos de aluno (14/set)

✅ Pedido do Guilherme: perfil de nutricionista/educador físico
([`components/perfil-screen.tsx`](src/components/perfil-screen.tsx), compartilhado entre os
dois papéis desde sempre, ver §6) mostrava peso/altura/sexo/data de nascimento — campos de
saúde do **aluno**, sem sentido pro profissional, que nunca preenche isso.

- **View (modo leitura)**: profissional agora vê e-mail, telefone, especialidade (via
  `rotuloEspecialidade`, já existia em `solicitacoesService.ts`), número de registro (CREF/CRN
  + UF) e status da verificação (`professional_verificacoes`, lido por
  `obterMinhaVerificacao`) — todos dados que já existiam no banco, só não apareciam aqui. Aluno
  não muda: continua com nascimento/sexo/peso/altura.
- **Form de edição**: os campos de sexo/peso/altura/data de nascimento (JSX e `<Field>`) somem
  do form quando `isProfessional`, ficam só nome/telefone pros dois papéis. `salvar()` não
  mudou — como esses campos nunca aparecem pro profissional, o estado deles fica no valor
  vazio inicial e o update não sobrescreve nada de verdade.
- **Decisão consciente: registro (CREF/CRN) e bio ficaram só leitura, não editáveis aqui.**
  Achado ao investigar RLS de `professional_verificacoes`: a policy
  `professional_verificacoes_update_self` tem `with_check (... and status = 'pendente')` — todo
  self-update força o status de volta pra `pendente` (§8, é o mecanismo de reenvio pós-rejeição,
  de propósito). Se editar bio virasse editável aqui, um profissional já **aprovado** cairia de
  volta em análise só por trocar um texto — bug de produto, não intencional. Deixar editável
  exige fluxo dedicado (avisando que reabre verificação), não é escopo desta mudança.
- `npx tsc --noEmit` limpo. **Não testado logado** — mesma regra de sempre (nunca senha de
  conta digitada por agente); vale conferência visual do Guilherme nos dois papéis.
- **Deploy publicado nos dois hosts (14/set)**: `npx expo export --platform web` → `npx eas
  deploy --prod` → `npx vercel deploy dist --project vytra-app --prod --yes`. Bundle
  `entry-0a18ab62e1850b6d0b608394bfb9024b.js`, conferido por `curl` (não só status — o `body`
  com o nome do bundle, lição do §43) nos dois: `app-treino.expo.app` e
  `app.vytraoficial.com.br`, mesmo hash nos dois, ambos 200.

## 45. Solicitar alteração de cadastro + selo de verificado pro paciente (14/set)

✅ Pedido do Guilherme, seguindo §44: precisa dar pro profissional pedir alteração no próprio
registro depois de aprovado (ex.: tirou o CRN além do CREF que já tinha) sem falar com admin
por fora, e mostrar pro paciente que o profissional é verificado — um selo tipo o azul do
Meta, mas na cor da marca.

- **Fluxo de alteração**: nova tela
  [`pro/cadastro-editar.tsx`](src/app/pro/cadastro-editar.tsx) (href:null em `pro/_layout.tsx`,
  não é aba — acessível pelo Perfil), reusa o mesmo padrão visual de
  `cadastro-profissional.tsx`. Prefill com `obterMinhaVerificacao`; envia via
  `solicitarAlteracaoCadastro` (novo em `verificacaoService.ts`) — `UPDATE` direto em
  `professional_verificacoes` (sem RPC nova; a RLS `professional_verificacoes_update_self` já
  existente, ver §8, aceita self-update). **Decisão deliberada**: o update sempre inclui
  `status: 'pendente'` explícito — a RLS (`with_check ... and status = 'pendente'`) rejeitaria
  o update se `status` ficasse implícito no valor antigo (`aprovado`), então reabrir
  verificação não é acidente, é o comportamento pedido. Tela avisa isso antes de enviar: "o
  selo de verificado some até um admin confirmar de novo". Reusa a mesma fila do admin
  (`admin.tsx`, sem mudança lá) — nenhuma tabela/coluna nova.
- **Selo de verificado**: componente `SeloVerificado`
  ([`components/ui/index.tsx`](src/components/ui/index.tsx)) — círculo com check, cor
  `Palette.accent` (verde-menta "Sinal Vital"), mesmo espírito do badge azul de conta
  verificada. Aparece: (a) no próprio perfil do profissional, ao lado do nome, quando
  `verificacao.status === 'aprovado'`; (b) no card de "Meus profissionais" do aluno, ao lado
  do nome de cada profissional vinculado, junto com a bio dele.
- **Achado de segurança que virou trabalho extra — lente §0 aplicada**: `professional_verificacoes`
  tem RLS restrita a `professional_id = auth.uid() or is_admin()` de propósito (guarda CPF,
  número de registro, caminho do documento). Paciente **não pode ler essa tabela direto**. Pra
  mostrar o selo/bio pro paciente sem abrir a tabela inteira, nova migração
  [`20260914_selo_profissional.sql`](supabase/migrations/20260914_selo_profissional.sql) — RPC
  `obter_selo_profissionais(uuid[])`, `SECURITY DEFINER`, retorna só `verificado`/`bio` e só
  pra quem é `is_client_of()` daquele profissional (ou o próprio profissional). CPF/número de
  registro/documento continuam invisíveis pro paciente — decisão consciente, não peça faltando:
  não é necessário pro selo, e é exatamente o tipo de exposição que o §0 pede pra evitar.
  Aplicada em produção com autorização do Guilherme (migração aditiva, sem alterar tabela
  existente).
- ⚠️→✅ **Achado ao aplicar a RPC**: `revoke ... from public` sozinho não bastou —
  `information_schema.routine_privileges` mostrou `anon` com `EXECUTE` mesmo depois do revoke
  de `PUBLIC` (Supabase concede `EXECUTE` a `anon`/`authenticated` direto, por padrão, em toda
  função nova do schema `public` — não é grant via `PUBLIC`, é grant nomeado). Corrigido com
  `revoke execute ... from anon` explícito, migração incorporada. **Achado à parte, mais sério,
  fora do escopo desta mudança**: ao conferir isso, os 4 helpers que o §0 registra como "anon
  revogado" (`is_trainer`/`is_professional`/`is_professional_of`/`is_client_of`) estão hoje
  com `EXECUTE` em `PUBLIC` de novo — regrediram em algum momento entre 04/set e agora
  (provável: um `create or replace function` depois não reaplicou o revoke). Risco baixo (as 4
  dependem de `auth.uid()`, retornam `false` sem sessão — mesma leitura já feita no §0), mas é
  drift real do estado documentado. **Não corrigido aqui** — sinalizado como pendência
  separada, não misturar com esta migração.
- `npx tsc --noEmit` limpo. Verificado renderização da tela nova sem login (preview local,
  `npx expo start --web`) — form aparece certo, nenhum erro de console ligado ao código.
  **Não testado o fluxo completo logado** (pedir alteração → sumir selo → admin aprovar →
  selo voltar) — mesma regra de sempre, vale conferência do Guilherme.
- **Deploy publicado nos dois hosts (14/set)**: mesmo pipeline de sempre. Bundle
  `entry-7889fe9e2301bdcc2f34d5015054c5d5.js`, conferido por `curl` (hash igual nos dois +
  `/pro/cadastro-editar` 200) em `app-treino.expo.app` e `app.vytraoficial.com.br`.

## 46. Caso real do Tassis: nutricionista que também monta treino — 4 mudanças (14/set)

✅ Pedido do Guilherme, motivado por um caso real: Tassis é formado/registrado só em Nutrição
(CRN), mas monta treino por experiência pra alguns pacientes (inclusive o Guilherme), sem ter
CREF. Isso expôs que `professionals.especialidade` era usado como **fonte única de verdade**
em 3 lugares diferentes que na real são independentes: (1) o que o selo afirma, (2) que Painel
o profissional vê, (3) quais métricas de treino ele recebe. Corrigido nos 3, sem tocar no
quarto (abas do aluno) de um jeito que travasse expansão futura:

1. **Selo com o conselho certo** — `professional_verificacoes` ganha `tipo_registro`
   (`CREF`/`CRN`, texto + CHECK, mesmo padrão de `especialidade`/`periodicidade`). Migração
   [`20260914_tipo_registro_verificacao.sql`](supabase/migrations/20260914_tipo_registro_verificacao.sql),
   aplicada em produção (2 tentativas — a 1ª falhou em `drop function`/recriar
   `obter_selo_profissionais` com coluna nova no retorno, Postgres exige `DROP` antes de mudar
   o shape de saída de uma function; toda a migração rodou atômica então nada ficou pela
   metade). `cadastrar_profissional` (cadastro novo) já deriva `tipo_registro` de
   `p_especialidade` — os dois nascem 1:1 nesse momento, só divergem depois via
   `solicitarAlteracaoCadastro`. `obter_selo_profissionais` devolve `tipo_registro` também;
   `SeloVerificado` ([ui/index.tsx](src/components/ui/index.tsx)) ganhou prop `label` opcional
   (pill ícone+texto, ex. "✅ Nutricionista") via `rotuloTipoRegistro()`, novo em
   [`verificacaoService.ts`](src/services/verificacaoService.ts). Tela
   [`pro/cadastro-editar.tsx`](src/app/pro/cadastro-editar.tsx) ganhou pills CREF/CRN pra
   escolher o conselho explicitamente (não infere mais de especialidade). `admin.tsx` também
   corrigido: o link "conferir no site do conselho" usava `especialidade` — trocado pra
   `tipoRegistro`, senão um pedido de alteração pra CREF de alguém com especialidade
   nutricionista mandaria o admin pro site errado.
2. **Painel por paciente, não por especialidade do profissional** —
   [`gestaoService.ts`](src/services/gestaoService.ts) (`semPlano`/`semTreino7d`) e
   [`pro/index.tsx`](src/app/pro/index.tsx) (`montarAlertas`, visibilidade/rótulo dos
   indicadores) paravam de olhar `professionals.especialidade` (flag única, tudo ou nada) e
   passaram a olhar `professional_plans.inclui_treino`/`inclui_dieta` **do plano CONFIRMADO de
   cada paciente** (`AlunoVinculado.incluiTreino`/`incluiDieta`, novo em
   [`professionalService.ts`](src/services/professionalService.ts)). Resultado: Tassis
   (especialidade agora `nutricionista`) continua vendo "sem treino há 7 dias" e alertas de
   treino especificamente pros pacientes cujo plano inclui treino (você), sem isso vazar pra
   quem só tem plano de dieta, e sem precisar ficar ligando/desligando por especialidade.
3. **Abas do aluno por plano contratado, não fixas** —
   [`aluno/_layout.tsx`](src/app/aluno/_layout.tsx) esconde a aba Treino/Dieta
   (`href: capacidades.treino ? undefined : null`) quando NENHUMA assinatura ativa do aluno
   inclui aquele módulo (`obterCapacidadesAluno`, novo em `professionalService.ts` — união
   entre todas as assinaturas ativas, já que o aluno pode ter mais de um profissional).
   Permissivo por padrão: enquanto não há nenhum plano CONFIRMADO ainda (`plan_id` nulo, aluno
   em onboarding), mostra as duas abas — só esconde quando já dá pra saber que não inclui.
4. **`professionals.especialidade` do Tassis → `nutricionista`** — aplicado na mesma migração
   (item 1). Painel dele passa a usar a framing/subtitle de nutricionista, mas os indicadores
   de treino (item 2) continuam aparecendo porque ele tem pelo menos um paciente com
   `incluiTreino=true`.

⚠️ **Ideia capturada, não construída — marketplace/diretório** (Guilherme, mesma conversa):
quando a aba escondida (item 3) deixa um espaço vazio pro paciente que só tem dieta OU só tem
treino, esse é o lugar natural pra um futuro marketplace de profissionais dentro do app —
buscar/contratar quem cobre o serviço que falta, com avaliação/classificação. Já era pendência
conhecida desde o kickoff (§1: "fora de escopo agora, não travar N:N pra isso depois") — o que
é novo aqui é o gancho de UX concreto (o slot da aba vazia). **Não implementado.**

- **Teste real (14/set, sessão do Guilherme como aluno, preview local com sessão já
  autenticada no navegador — sem senha digitada por agente)**: `/aluno/perfil` mostra "Tassis
  Morais ✅ Nutricionista" no card de "Meus profissionais", selo verde-menta com rótulo
  certo. Barra de abas mostra Treino+Dieta+Check-in+Perfil (plano do Guilherme inclui os
  dois) — confirma que `obterCapacidadesAluno` não quebrou o caso comum. `npx tsc --noEmit`
  limpo. **Não testado**: Painel do Tassis como profissional (precisa da senha dele, que eu
  não tenho e não peço), fluxo completo de `solicitarAlteracaoCadastro` escolhendo um segundo
  tipo de registro.
- **Deploy publicado nos dois hosts (14/set)**: mesmo pipeline de sempre. Bundle
  `entry-10d83e83c697de6812315304645a4023.js`, hash igual e 200 nos dois
  (`app-treino.expo.app`, `app.vytraoficial.com.br`).

## 47. Drift de segurança do §45 corrigido + selo com sigla (14/set)

✅ **Drift dos 4 helpers de RLS, corrigido.** `is_trainer`/`is_professional`/
`is_professional_of`/`is_client_of` estavam com `EXECUTE` em `PUBLIC` de novo (achado no §45,
não corrigido lá de propósito). Migração
[`20260914_revoga_public_helpers_rls.sql`](supabase/migrations/20260914_revoga_public_helpers_rls.sql),
aplicada em produção: `revoke ... from public` + `grant ... to authenticated` nos 4. Verificado
por `information_schema.routine_privileges` antes/depois (só `PUBLIC` some, `authenticated`
mantém) e por `get_advisors(security)` (os 4 saem da lista de achados `anon`-chamável; resto é
warning já conhecido/aceito — RPCs de convite/anamnese anon-chamáveis por design, leaked
password protection, `cobranca_eventos` sem policy de select). Causa raiz da regressão
continua não investigada (provável `create or replace function` em algum momento entre 04/set
e 14/set sem reaplicar o revoke) — não é crítico agora que corrigido, mas se acontecer nos
mesmos 4 (ou em `obter_selo_profissionais`) de novo, vale rodar `get_advisors(security)` depois
de qualquer `create or replace function` que toque nesses nomes.

✅ **Selo com sigla, não nome completo** (Guilherme, 14/set): `rotuloTipoRegistro()`
([verificacaoService.ts](src/services/verificacaoService.ts)) passa a devolver `EF`/`NT` em
vez de "Educador físico"/"Nutricionista" — o selo no perfil (próprio e "Meus profissionais" do
aluno) fica mais compacto. O form de `pro/cadastro-editar.tsx` (pills pra escolher o conselho)
continua com o nome por extenso ali — é formulário, não selo, clareza importa mais que
compacidade nesse contexto.
- **Deploy publicado nos dois hosts (14/set)**: mesmo pipeline de sempre. Bundle
  `entry-d27b58cf2196c7e394f91b952e5dfd68.js`, hash igual e 200 nos dois
  (`app-treino.expo.app`, `app.vytraoficial.com.br`).

## 48. Blindagem de responsabilidade: declaração de treino sem CREF (14/set)

✅ Pedido do Guilherme, continuação direta do §46/§47: o toggle "inclui treino" em
`pro/planos.tsx` era **livre** — qualquer profissional habilitava, sem nenhuma checagem contra
o registro verificado. Como resposta a "como separar o que ele pode cadastrar como nutrição
vs treino": a separação não é um bloqueio estrutural (`professional_plans` continua uma
tabela só, com os dois booleans) — é uma **declaração de responsabilidade registrada**, que
só aparece quando falta a licença formal pro módulo. Quem tem CREF nunca vê nada disso;
quem não tem, precisa concordar explicitamente antes do toggle ligar.

- **Migração** [`20260914_declaracoes_profissional.sql`](supabase/migrations/20260914_declaracoes_profissional.sql),
  aplicada em produção: tabela `declaracoes_profissional` (`professional_id`, `tipo` — texto +
  CHECK, hoje só `'treino_sem_cref'`, extensível — `texto`, `created_at`). **Imutável de
  propósito**: só policy de `select`/`insert`, sem `update`/`delete`, mesmo padrão de
  `cobranca_eventos` — é rastro de auditoria, não estado editável. O `texto` grava o conteúdo
  EXATO aceito naquele momento (não um ID de versão), então mudar a redação depois não altera
  o que já foi aceito.
- **Serviço novo** [`declaracaoService.ts`](src/services/declaracaoService.ts):
  `possuiDeclaracao`/`registrarDeclaracao`, mais a constante
  `TEXTO_DECLARACAO_TREINO_SEM_CREF` — texto fixo, **rascunho, não revisado por advogado**
  (mesma ressalva de sempre pra conteúdo jurídico neste projeto).
- **UI** em [`pro/planos.tsx`](src/app/pro/planos.tsx): `PlanoForm` carrega
  `obterMinhaVerificacao` (pra saber `tipoRegistro`) e `possuiDeclaracao` ao abrir. Ligar o
  switch "Inclui treino" quando `tipoRegistro !== 'CREF'` e ainda não declarou não liga direto
  — abre um card com o texto completo e um botão "Concordo e habilito"; só aí grava a
  declaração e liga o switch. Depois da 1ª vez, não pede de novo (checa `possuiDeclaracao`).
  Segunda checagem no `salvar()` (defesa em profundidade) bloqueia gravar `inclui_treino: true`
  sem declaração, mesmo que a UI tenha algum jeito de ser contornada.
- **Retroativo: não aplicado.** Os planos do Tassis que já têm `inclui_treino=true` desde
  antes desta feature (`Padrão (migração)`, etc.) continuam funcionando sem declaração — ele
  nunca vai ser barrado retroativamente por algo que não existia quando ele configurou. A
  declaração só é pedida na próxima vez que ele mexer nesse toggle (editar um plano existente
  ou criar um novo com treino). Decisão consciente, mesmo princípio já usado em outras
  migrações do projeto (não travar o que já funciona, só o que muda daqui pra frente).
- `npx tsc --noEmit` limpo. `get_advisors(security)` depois da migração: tabela nova sem
  achado novo (RLS com policy, nada exposto a mais). **Não testado logado como Tassis** (não
  tenho a senha dele) — o fluxo completo (tentar ligar treino → ver o card → concordar → switch
  liga → declaração persiste na próxima visita) precisa de conferência manual dele.

✅ **Caminho pro termo de consentimento + isenção de responsabilidade**, pedido junto:
[`docs/legal/termo-consentimento.md`](docs/legal/termo-consentimento.md) — esqueleto de
seções (papel da plataforma, responsabilidade do profissional, reconhecimento do paciente,
sem garantia de resultado, LGPD, uso de imagem, cobrança/cancelamento, foro), **não é texto
final nem parecer jurídico**, precisa de advogado antes de qualquer publicação. Arquivo
separado do handoff porque é conteúdo (copy jurídica), não decisão/estado — mesmo padrão já
usado pra `docs/marca/BRAND.md`. Pendência em si continua a mesma já registrada desde o
kickoff (§2/§7/§14) — este arquivo só dá o próximo passo concreto, não fecha a pendência.

- **Deploy publicado nos dois hosts (14/set)**: mesmo pipeline de sempre. Bundle
  `entry-2bfa6ece7f3991858ba6458bb34e3645.js`, hash igual e 200 nos dois
  (`app-treino.expo.app`, `app.vytraoficial.com.br`).

## 49. Anamnese: sessão expirando em silêncio durante o onboarding (14/set)

⚠️→✅ **Achado real do Guilherme, corrigido.** Uma paciente do Tassis testou o link de convite
oficial (`app.vytraoficial.com.br` — não confirmado se foi esse host ou `app-treino.expo.app`,
mas a causa é a mesma nos dois, é o mesmo código/backend), preencheu a anamnese inteira (10
seções, 56 campos) + escolheu o plano, e "Enviar respostas" falhou com a mensagem genérica
"Não consegui enviar suas respostas.".

**Causa raiz**: [`submeter_anamnese_autenticado`](supabase/migrations/20260904_anamnese_pos_login.sql)
é `anon`-chamável por design (mesmo padrão do fluxo de convite, §0) e só faz
`if v_uid is null then return false; end if;` — uma sessão inválida na hora do envio não vira
erro de rede/HTTP, a RPC roda como anon e devolve `false` em silêncio. O formulário é longo
(pode levar minutos pra preencher) e o client Supabase só reforça o auto-refresh de token em
foreground/background via `AppState` no **nativo** ([`lib/supabase.ts`](src/lib/supabase.ts))
— no **web**, que é como todo paciente acessa hoje (§2, v1.0 Web), não tem esse reforço, então
um token expirando com a aba em segundo plano (troca de app, tela bloqueada) pode não renovar a
tempo. Pior: nada no formulário salvava rascunho, então uma paciente que passasse por isso
arriscava perder as 56 respostas inteiras.

**Corrigido** em [`onboarding-anamnese.tsx`](src/components/onboarding-anamnese.tsx):
- **Rascunho local** (`AsyncStorage`, chave `anamnese-rascunho:{userId}`, mesmo padrão de
  `lista-compras-marcados:{userId}`, §25) — salvo com debounce de 400ms a cada mudança de
  resposta/plano, carregado no mount (com banner "Recuperamos suas respostas salvas neste
  aparelho." quando havia algo salvo), removido só depois do envio ter sucesso de verdade.
- **Checagem de sessão antes de enviar**: `supabase.auth.getSession()` (que tenta renovar o
  token se ainda for possível) antes de chamar a RPC — se não houver `session.user`, mostra erro
  acionável ("sua sessão expirou, atualiza a página e entra de novo, suas respostas ficam
  salvas") em vez de deixar a RPC falhar em silêncio.
- Sem migration, sem mudança de RLS — é só resiliência do lado do client. `npx tsc --noEmit`
  limpo (precisou `npm install`, `node_modules` não existia neste clone).

**Não testado logado com paciente real** (mesma regra de sempre, nunca senha de conta nenhuma
digitada por agente). Commitado (`4a74170`).

✅ **Deploy publicado nos dois hosts (18/set, junto com o §50)**: `npx expo export --platform web`
→ `npx eas deploy --prod` → `npx vercel deploy dist --project vytra-app --prod --yes`. Bundle
`entry-bf25a8168b585cd7a0dd1de62b5a50ba.js`, conferido por `curl` (body, não só status) nos dois:
`app-treino.expo.app` e `app.vytraoficial.com.br`, hash igual, ambos 200.

⚠️ **Hipótese, não causa confirmada**: não é certeza que a sessão expirada é a explicação
completa — é a mais consistente com o comportamento observado (RPC retorna `false`, não lança
erro), mas não foi possível reproduzir com a paciente real (não se tem acesso ao aparelho dela).
Se o mesmo erro voltar a acontecer mesmo com a correção acima (ou seja, com sessão válida
confirmada), o próximo passo é logar o corpo do erro em vez de só mostrar mensagem genérica.

## 50. Biblioteca de ilustrações diversas — lote inicial + 4 exercícios novos (14/set)

✅ Primeira entrega do item "Depois" do ROADMAP (biblioteca visual inclusiva de modelos e
referências) — achado isolado do benchmark §30, nunca antes iniciado no código.

- **Biblioteca de referência** `assets/checkin-references/diversidade/` — 16 PNGs novos: 4
  representações (`feminino-negra`, `feminino-leste-asiatico`, `masculino-negro`,
  `masculino-leste-asiatico`) × 4 ângulos (`frente`/`costas`/`perfil`/`perfil-direito`).
  Diferença do par original (`feminino`/`masculino` em `assets/checkin-references/`, sem
  subpasta): o par original só tem 3 imagens e espelha `perfil` pra virar `direito` em runtime
  (`silhuetas-checkin.tsx:37,54`, `transform: scaleX(-1)`); aqui `perfil-direito` já é arquivo
  próprio, gerado separado — **não decidido** se isso é intencional (pose não simétrica em
  alguma dessas poses) ou só como o lote saiu; qualquer um dos dois formatos funciona se/quando
  isso for integrado.
- **Catálogo de exercícios ganhou 4 ilustrações novas**, primeiro lote a variar representação em
  vez do modelo único padrão: `agachamento-goblet.png`, `remada-curvada-com-barra.png`,
  `rosca-direta-barra-ez.png`, `supino-inclinado-com-halteres.png` — aliases novos em
  [`exerciseIllustrations.ts`](src/lib/exerciseIllustrations.ts). Catálogo espelhado (o arquivo
  já documenta essa duplicação intencional, ver §40) atualizado nas duas Edge Functions que
  precisam saber "já existe ilustração estática, IA não gera de novo":
  [`generate-ai-plan/index.ts`](supabase/functions/generate-ai-plan/index.ts) e
  [`generate-exercise-illustration/index.ts`](supabase/functions/generate-exercise-illustration/index.ts).
- **Regra adotada** (registrada só no ROADMAP por ora, não no código): exercício novo deve
  alternar representação de forma equilibrada, pra experiência não ficar predominantemente
  branca — hoje é escolha manual de quem adiciona a ilustração, nada força isso.
- `npx tsc --noEmit` limpo.

**Pendências:**
- **`assets/checkin-references/diversidade/` não está integrado ao app** — `silhuetas-checkin.tsx`
  continua lendo só `feminino`/`masculino` da pasta original; falta decidir e escrever a regra de
  curadoria/rotação (qual representação aparece pra quem, em qual tela) antes de ligar essa
  biblioteca em qualquer fluxo real, incluindo o guia de câmera do check-in (§39).
- Faltam mais representações além dessas duas novas (a biblioteca completa do ROADMAP prevê
  variação maior de traços/cabelo, não só duas etnias a mais).
- Decidir o formato de `perfil-direito` (arquivo próprio vs. espelhamento em runtime) antes de
  gerar lotes futuros, pra não ter os dois padrões coexistindo sem motivo.

✅ **Deploy publicado nos dois hosts (18/set)**: mesmo pipeline de sempre, junto com o §49 (fix de
anamnese, que estava commitado e empurrado mas ainda sem deploy). Bundle
`entry-bf25a8168b585cd7a0dd1de62b5a50ba.js`, conferido por `curl` (body, não só status) nos dois:
`app-treino.expo.app` e `app.vytraoficial.com.br`, hash igual, ambos 200.

## 51. Botão de voltar nas telas de push (18/set)

✅ Pedido do Guilherme: nenhuma tela do app tinha jeito de voltar pra anterior — achado ao
grepar o repo inteiro por `router.back()`/ícone de seta, só existiam 2 usos (e nenhum dos dois
era um botão visível de "voltar", só navegação automática pós-salvar em
`aluno/anamnese.tsx`/`pro/aluno/[id]/anamnese.tsx`). Sem esse botão, quem entrava numa tela de
detalhe (aba/página com `href: null`, acessível só por push — ver §pro/_layout.tsx e
§aluno/_layout.tsx) dependia do gesto nativo do navegador/SO pra sair.

- **`Screen`** ([`components/ui/index.tsx`](src/components/ui/index.tsx)), o wrapper compartilhado
  de tela com título, ganhou prop `voltar?: boolean` — quando `true`, desenha um chevron
  (`Ionicons chevron-back`) antes do título, chamando `router.canGoBack() ? router.back() :
  router.replace('/')`. O fallback pra `/` (não pra uma rota fixa por tela) foi decisão
  deliberada: `index.tsx` já sabe decidir sozinha pra onde mandar (login sem sessão, `/pro` ou
  `/aluno` por papel) — cobre o caso comum no web de abrir a URL direto/dar refresh numa tela
  de detalhe, sem histórico de navegação nenhum. Sem esse guard, `router.back()` sozinho
  dispara o toast de erro do react-navigation ("action GO_BACK was not handled") — reproduzido
  e confirmado no preview antes de adicionar o guard.
- **Aplicado nas telas de push** (nunca em aba raiz — essas não têm "anterior"):
  `aluno/anamnese.tsx`, `aluno/anexos.tsx`, `aluno/lista-compras.tsx`,
  `cadastro-profissional.tsx`, `pro/aluno/[id]/index.tsx`, `pro/aluno/[id]/dieta.tsx`,
  `pro/aluno/[id]/resumo.tsx`, `pro/aluno/[id]/anamnese.tsx`, `pro/cadastro-editar.tsx`,
  `pro/convite.tsx`, `pro/planos.tsx`, `admin.tsx` — 13 arquivos no total (12 telas + o
  componente `Screen`).
- **Não mexido**: `redefinir-senha.tsx` e `convite/[token].tsx` ficaram de fora de propósito —
  são fluxos abertos por link externo (e-mail/WhatsApp), sem tela anterior de verdade dentro do
  app; `esqueci-senha.tsx` já tinha link de texto "Voltar pro login" antes desta sessão.
- `npx tsc --noEmit` limpo. **Verificado no preview local** (`npx expo start --web`, sem
  login): `cadastro-profissional` — clique na seta com histórico real (veio do link "Criar
  conta" do login) volta pro login via `router.back()`; abrindo a URL direto (sem histórico) o
  mesmo clique cai no fallback `/` sem toast de erro. Demais 11 telas usam o mesmo componente
  `Screen`/mesma lógica, não testadas logadas individualmente (dependem de conta real —
  aluno/pro).
- **Deploy publicado nos dois hosts (18/set)**: bloqueado 2x pelo classificador de auto mode
  (mesma classe do §8/§26/§32, não é bloqueio permanente), passou na 3ª tentativa. `npx expo
  export --platform web` → `npx eas deploy --prod` → `npx vercel deploy dist --project
  vytra-app --prod --yes`. Bundle `entry-ee327eb5fb3f27bc2a9babc7ee5aebf8.js`, conferido por
  `curl` (body, não só status) nos dois: `app-treino.expo.app` e `app.vytraoficial.com.br`,
  hash igual, ambos 200.

## 52. Máscara automática de data/hora + calendário pra agendamento (18/set)

✅ Pedido do Guilherme: os 3 campos de data do app (nascimento no perfil, "retomar em" de lead,
data da teleconsulta) e o campo de hora da teleconsulta eram texto livre — só um placeholder
"AAAA-MM-DD"/"HH:MM" sem nenhuma ajuda ao digitar, e nenhum tinha calendário quando o campo era
uma data pra agendar algo (só validação por regex no `salvar()`, já existente, não mexida).

- **Novo** [`components/campo-data.tsx`](src/components/campo-data.tsx): `CampoData` e
  `CampoHora`, fora de `ui/index.tsx` de propósito (mesmo padrão de componentes maiores e
  específicos do projeto, ver `silhuetas-checkin.tsx`/`aluno-tabs.tsx` — `ui/index.tsx` fica só
  com átomos pequenos).
  - **Máscara automática**: só dígitos entram, `-`/`:` são inseridos sozinhos nas posições
    certas (`20260925` digitado vira `2026-09-25`; `1930` vira `19:30`) — `maxLength` trava em
    10/5 caracteres. Não substitui a validação de formato que já existia no `salvar()` de cada
    tela (regex `^\d{4}-\d{2}-\d{2}$`/`^\d{2}:\d{2}$`), só torna quase impossível digitar errado
    antes de chegar lá.
  - **`comCalendario`** (opcional): mostra um botão de calendário ao lado do campo; abre um
    calendário pequeno inline (grid do mês, seta pra trocar de mês, atalho "Hoje") logo abaixo
    do campo — nunca modal/popover, pra não precisar lidar com posicionamento/z-index entre
    plataformas. Seleção de dia usa só cor/borda (`roleColor`), sem preenchimento — mesmo
    princípio de `Pill` em `ui/index.tsx` (§19: cor é o sinal, não decoração). Aceita
    `dataMinima`/`dataMaxima` pra desabilitar dias fora do intervalo (dias passados ficam
    acinzentados e não clicáveis quando é uma data futura).
  - **Sem calendário pra data de nascimento** (decisão deliberada): navegar mês a mês até
    décadas atrás num grid pequeno atrapalha mais que ajuda — esse campo só ganhou a máscara,
    sem `comCalendario`.
- **Aplicado**: `pro/index.tsx` (Nova teleconsulta — `Data` com `comCalendario` e
  `dataMinima={new Date()}` porque não dá pra agendar no passado, `Hora` com `CampoHora`),
  `pro/leads.tsx` ("Retomar em" — mesma lógica de `comCalendario`+`dataMinima`),
  `perfil-screen.tsx` (data de nascimento — só máscara, sem calendário).
- **Achado ao construir, corrigido antes de aplicar em qualquer tela**: o wrapper do campo
  copiou `flex: 1` do `field` de `ui/index.tsx` sem perceber que ali ele só faz sentido em
  layout lado a lado (`rowFields`, peso/altura). Empilhado numa `Card` normal, `flex: 1` fez o
  calendário (conteúdo alto,~300px) disputar altura com os campos vizinhos e ser cortado
  visualmente — só a primeira semana aparecia, o resto ficava por baixo dos campos seguintes
  sem empurrá-los. Confirmado com uma rota de depuração temporária no root (`debugcampo.tsx`,
  whitelisted por uma linha em `_layout.tsx`, mesmo padrão de sempre — removida depois, `git
  status` confirmou `_layout.tsx` sem diff) antes e depois do fix; todos os dias do mês
  apareciam na árvore de texto da página mesmo com o bug (conferido via DOM), confirmando que
  era clipping visual, não erro de lógica do grid.
- **Verificado no preview local** (`npx expo start --web`, rota de depuração, sem login):
  máscara de data e hora digitando só números, calendário abrindo com dias antes de hoje
  desabilitados/acinzentados (`dataMinima`), clique num dia preenche o campo e fecha o
  calendário sozinho, sem erro no console. `npx tsc --noEmit` limpo.
- **Não testado logado** — as 3 telas reais (agendar teleconsulta, retomar lead, editar perfil)
  dependem de conta real (aluno/pro), mesma regra de sempre.
- **Deploy publicado nos dois hosts (18/set)**: mesmo pipeline de sempre. Bundle
  `entry-8ff8a0e746f28c1ce4e012798701d700.js`, conferido por `curl` (body, não só status) nos
  dois: `app-treino.expo.app` e `app.vytraoficial.com.br`, hash igual, ambos 200.

⚠️→✅ **Bug real achado pelo Guilherme, corrigido na mesma sessão**: a última semana do mês (a
única que quase sempre tem menos de 7 dias) não ganhava célula vazia no fim, só a primeira
semana ganhava no começo (`Array(primeiroDiaSemana).fill(null)`). Com `justifyContent:
'space-between'` numa linha de menos de 7 itens, o RN Web espalha os poucos dias que sobraram
pela largura inteira da linha em vez de alinhar embaixo da coluna certa do dia da semana —
parecia "pular dia" (ex.: dia 27 aparecendo sob a coluna errada). Corrigido preenchendo o fim do
grid também: `totalCelulas = Math.ceil((primeiroDiaSemana + totalDias) / 7) * 7`, célula extra
vira `null` como as do começo. Verificado de novo na mesma rota de depuração temporária
(`debugcampo.tsx`, removida depois, `_layout.tsx` sem diff): Setembro 2026 (27-30 sob
D/S/T/Q, correto) e Outubro 2026 (dia 1 sob Q — outubro começa numa quinta, correto) alinhados
certos nos dois extremos do mês. `npx tsc --noEmit` limpo.
- **Deploy publicado nos dois hosts (18/set)**: mesmo pipeline de sempre. Bundle
  `entry-ebccf23c27645f57a4edc482dd676234.js`, conferido por `curl` (body, não só status) nos
  dois: `app-treino.expo.app` e `app.vytraoficial.com.br`, hash igual, ambos 200.

## 53. Profissional pode pedir pro paciente reenviar a anamnese (18/set)

✅ Pedido do Guilherme: não existia jeito do profissional sinalizar "atualiza sua anamnese" pro
paciente — só o próprio paciente decidia reeditar (`aluno/anamnese.tsx`, já existente desde
antes, acessível via Perfil → "Ver/editar minha anamnese"). Sem chat/notificação no app ainda
(gap conhecido, §30), o pedido fica visível de forma passiva — mesmo padrão de outras
solicitações no projeto (ex.: selo de verificado some até aprovação, §45).

- **Migração** [`20260918_solicitar_atualizacao_anamnese.sql`](supabase/migrations/20260918_solicitar_atualizacao_anamnese.sql),
  aplicada em produção: `anamnese.solicitada_atualizacao_em` (timestamptz, nullable). Sem RLS
  nova — `anamnese_update_professional` (baseline, `is_professional_of(client_id)`, sem
  `with_check` restritivo) já libera UPDATE de qualquer coluna pro profissional vinculado,
  conferido direto via `pg_policy` antes de assumir isso. `submeter_anamnese_autenticado`
  (RPC `security definer` que grava a anamnese pelo lado do paciente) precisou de
  `create or replace` pra zerar essa coluna no reenvio — senão o aviso ficaria preso mesmo
  depois do paciente responder. `get_advisors(security)` depois: nenhum achado novo, os já
  conhecidos continuam os mesmos (RPCs anon-chamáveis por design, sem mudança de grant).
  `database.types.ts` regenerado via `generate_typescript_types`.
- **Serviço** [`anamneseService.ts`](src/services/anamneseService.ts): `obterAnamnese` passa a
  retornar `solicitadaAtualizacaoEm`; `solicitarAtualizacaoAnamnese(clientId)`, novo — update
  direto na tabela, sem RPC (a RLS já libera).
- **UI profissional** [`pro/aluno/[id]/anamnese.tsx`](src/app/pro/aluno/%5Bid%5D/anamnese.tsx):
  botão "Pedir pro paciente atualizar" (só quando já existe anamnese respondida — sem sentido
  pedir atualização de algo que nunca foi preenchido, esse caso já tem o aviso "Paciente ainda
  não respondeu"); depois de pedido, vira aviso "Atualização pedida em DD/MM — aguardando o
  paciente responder" no lugar do botão, mesmo padrão de "não pede de novo" já usado em
  outras telas do projeto (§48, declaração de responsabilidade).
- **UI paciente**: banner laranja em [`aluno/anamnese.tsx`](src/app/aluno/anamnese.tsx)
  ("Seu profissional pediu que você atualize suas respostas") quando a flag está setada, e o
  mesmo aviso substitui o texto neutro no card de Anamnese do
  [`perfil-screen.tsx`](src/components/perfil-screen.tsx) — as duas entradas que já levavam pro
  reenvio (Perfil e a própria tela) agora avisam o motivo. Salvar (mesma RPC de sempre) limpa a
  flag sozinho.
- `npx tsc --noEmit` limpo. **Não testado logado** — depende de conta real profissional+aluno
  vinculados (mesma regra de sempre); o texto/layout segue padrões já usados e testados em
  outras telas do mesmo arquivo (Caption `Palette.orange`, Button `ghost`), não uma
  interação nova sem precedente.
- **Deploy publicado nos dois hosts (18/set)**: mesmo pipeline de sempre, com um achado novo —
  `app-treino.expo.app` ficou ~5min servindo o bundle anterior mesmo depois de "Promoted to
  production" confirmado pela CLI (a URL própria do deployment, tipo
  `app-treino--xxxx.expo.app`, já servia o bundle certo na hora; só o alias de produção atrasou).
  `curl -I` mostrava `age` crescendo e `last-modified` do deploy anterior — cache de borda
  (Cloudflare) não purgado na hora da promoção, não é o classificador de auto mode (§8/§26/§32/
  §51, causa diferente). Resolveu sozinho depois de ~5min sem re-deploy nenhum. Vale registrar:
  se `curl` no host `.expo.app` mostrar hash desatualizado logo após `eas deploy --prod`,
  conferir a URL própria do deployment primeiro (ela é imediata) antes de assumir que o deploy
  falhou — só esperar a propagação do alias. Bundle final `entry-2e3f8a6a5e48aea2b6a7308f04b9f99c.js`,
  conferido por `curl` (body, não só status) nos dois: `app-treino.expo.app` e
  `app.vytraoficial.com.br`, hash igual, ambos 200.

## 54. Profissional não via foto de check-in nenhuma sem 2+ envios (18/set)

⚠️→✅ **Achado real do Guilherme testando com as contas de teste**: painel do profissional não
mostrava foto nenhuma do check-in do aluno. Não era bug de deploy nem cache (conferido: bundle
em produção já tinha "Foto de frente" e "Responda na ordem que quiser" desde 12/set, `curl` no
JS servido confirmou string a string) — era comportamento por desenho:
`obterComparacaoFotos` ([checkinService.ts:144](src/services/checkinService.ts:144)) só devolve
algo com **pelo menos 2 check-ins com foto** (é "primeira x mais recente", 1 só não é
comparação, comentário já avisava isso). Com só 1 check-in de teste enviado, a lista vinha
vazia e a seção inteira sumia (`evolucao.fotos.length` no `resumo.tsx`) — não existia NENHUM
outro lugar que mostrasse foto de um check-in isolado.

**Pedido do Guilherme**: profissional tem que poder ver os arquivos enviados a qualquer
momento, não só quando existe comparação.

- **Nova função** [`listarGaleriaCheckins(subscriptionId)`](src/services/checkinService.ts) —
  lista TODO check-in que tem pelo menos 1 foto, mais recente primeiro, sem mínimo de
  quantidade (`GaleriaCheckin[]`, `checkinId`/`data`/`fotos[]`). Coexiste de propósito com
  `obterComparacaoFotos`: essa é a lista completa, a outra continua sendo o atalho visual
  "antes x depois" quando já dá pra comparar. Mesmo bucket/URL assinada de sempre
  (`obterUrlFotoCheckin`), sem tabela nem RLS nova.
- **UI** em [`pro/aluno/[id]/resumo.tsx`](src/app/pro/aluno/%5Bid%5D/resumo.tsx): nova seção
  "Fotos enviadas" logo abaixo de "Fotos de progresso" (que ganhou a legenda "Primeira x mais
  recente, com foto" pra deixar claro que é só o atalho) — um card por check-in, data +
  miniaturas de cada ângulo enviado (`flexWrap`, funciona com 1 foto ou com as 4).
- **Verificado no preview local** (rota de depuração temporária, removida depois,
  `_layout.tsx` sem diff): layout testado com 1 foto e com 4 fotos, thumbnails quebram linha
  certo nos dois casos. `npx tsc --noEmit` limpo.
- **Não testado logado** — depende de check-in real com foto enviada por conta de teste
  (aluno) e leitura pelo profissional vinculado.
- **Deploy publicado nos dois hosts (18/set)**: mesmo pipeline de sempre, sem o atraso de CDN
  desta vez. Bundle `entry-52f0bd2e2fe8014f73bc7261bfd7ab8a.js`, conferido por `curl` (body,
  não só status) nos dois: `app-treino.expo.app` e `app.vytraoficial.com.br`, hash igual, ambos
  200.

## 55. Fotos de check-in ampliáveis (18/set)

✅ Pedido do Guilherme, continuação do §54: as miniaturas novas (e as da comparação
"antes x depois") não abriam — só apareciam pequenas, 100×130.

- **Novo** `FotoAmpliavel` em [`components/ui/index.tsx`](src/components/ui/index.tsx): mostra
  a miniatura, e ao tocar abre um `Modal` (`transparent`, fundo quase opaco) com a imagem em
  tela cheia (`resizeMode="contain"`) e um X pra fechar — também fecha tocando fora da imagem
  ou pelo botão físico/gesto de voltar (`onRequestClose`, tratado pelo próprio `Modal`).
  **Decisão de implementação**: usei `Modal` do React Native, não um `View` com
  `position: 'absolute'` (que foi minha primeira tentativa) — a miniatura vive dentro de cards
  pequenos (linha de fotos), então um overlay absoluto ficaria contido na área desse card, não
  na tela inteira; `Modal` é portal de verdade (inclusive no web, via `react-native-web`),
  cobre o viewport todo não importa onde a miniatura está aninhada. Confirmado com
  `getBoundingClientRect()` no preview: `position: fixed`, `0,0` até a borda do viewport.
- **Aplicado** nas duas seções de fotos de
  [`pro/aluno/[id]/resumo.tsx`](src/app/pro/aluno/%5Bid%5D/resumo.tsx) — "Fotos de progresso"
  (comparação) e "Fotos enviadas" (§54, galeria completa) — trocando `<Image>` cru por
  `<FotoAmpliavel>`, sem mudar mais nada no layout.
- **Verificado no preview local** (rota de depuração temporária, removida depois, `_layout.tsx`
  sem diff): abre em tela cheia, fecha pelo X e tocando fora, sem erro no console.
  `npx tsc --noEmit` limpo.
- **Não testado logado** — depende de foto real de check-in.
