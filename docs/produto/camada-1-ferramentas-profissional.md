# Plano de implementação — Camada 1: ferramentas do profissional

> Criado em 14/out/2026. Direção e camadas 2 e 3 vivem no [`ROADMAP.md`](../../ROADMAP.md)
> (seção "Amplitude de trabalho do profissional"); estado técnico e decisões vivem no
> [`HANDOFF.md`](../../HANDOFF.md) (§74). Este arquivo só detalha **como** construir a Camada 1,
> que o handoff não cobre. Nada aqui foi implementado.

## Objetivo

Hoje o profissional prescreve e acompanha, mas não consegue **reutilizar** o próprio trabalho,
**buscar** exercícios, **entregar** o plano em arquivo nem **revisitar** o que já prescreveu.
A Camada 1 fecha esses quatro buracos sem tocar em dado clínico novo (nenhuma medida, exame ou
foto nova), então o risco de LGPD é baixo e o ganho diário do Tassis é alto.

| # | Entrega | Banco | Risco |
| --- | --- | --- | --- |
| F1 | Biblioteca de exercícios pesquisável | tabela nova | baixo |
| F2 | Modelos de treino e de cardápio | tabela nova | médio (cópia de notas livres) |
| F3 | Histórico de versões do plano | tabela nova + trigger | médio (trigger em tabela viva) |
| F4 | PDF de treino e de dieta | nenhum | médio (dado de saúde fora do app) |
| F4b | Compartilhar a lista de compras como texto | nenhum | baixo (ação do paciente) |
| F5 | Mais de um plano por vínculo | altera chave única | **alto, fora da Camada 1** |

## Regras que valem para todas as fases

- **Mudança só aditiva** em `plans.dias` e `planos_alimentares.refeicoes`: campo novo é opcional e
  leitores antigos o ignoram (mesma regra do `taco_id`, HANDOFF §11). Nunca renomear nem remover.
- **`Exercicio.id` é chave de histórico** (HANDOFF §11): nenhuma fase reatribui id. Toda cópia de
  plano preserva os ids; o aviso de "ids que saem do plano" do `planEditor.ts` continua valendo.
- **Tabela nova nasce fechada:** RLS ligado, `REVOKE ALL` de `anon` e `PUBLIC`, escrita só pelo
  dono (`auth.uid()`), políticas testadas com dois profissionais em transação revertida, igual ao
  §73. `get_advisors(security)` antes e depois.
- **Migração reversível**, aplicada pela ferramenta MCP e registrada no histórico remoto. Não usar
  `db push` (histórico local e remoto desalinhado, HANDOFF §24).
- **Publicar nunca é automático.** Aplicar modelo ou restaurar versão cria **rascunho**.
- Antes de escrever código: ler a documentação do **Expo SDK 57** (instrução do `AGENTS.md`).

## F0 — Pré-requisitos

1. **Build 6 validado** no TestFlight (HANDOFF §73, pendência 1). Não somar dependência nativa
   antes de saber que o app abre.
2. Decisões abertas abaixo respondidas, ao menos as de F1 e F4.
3. `npx tsc --noEmit` e `npx expo export --platform web` limpos no ponto de partida.

## F1 — Biblioteca de exercícios pesquisável

**Problema.** O nome do exercício é texto livre. O catálogo da IA é uma **cópia manual** de nomes em
`supabase/functions/generate-ai-plan/index.ts:20`, separada das 38 ilustrações de
`src/lib/exerciseIllustrations.ts`: duas fontes para o mesmo fato, que já podem divergir.

**Banco** — `exercicios_biblioteca`:

| Coluna | Detalhe |
| --- | --- |
| `id` | uuid, pk |
| `dono_id` | uuid nulo. Nulo = catálogo Vytra; preenchido = exercício próprio do profissional |
| `nome`, `nome_normalizado` | normalização idêntica à de `exerciseNormalize.ts` |
| `grupos` | `text[]` (peito, costas, quadríceps…) |
| `equipamento`, `modalidade` | `modalidade` ∈ força, tempo, cardio, mobilidade |
| `sensivel_ombro` | boolean (hoje o campo `ombro` do exercício) |
| `video_url` | `CHECK` começa com `https://` |
| `instrucoes`, `ilustracao_chave`, `ativo`, `criado_em` | opcionais |

Único por (`dono_id` ou zero, `nome_normalizado`). **RLS:** `select` para `authenticated` onde
`dono_id is null or dono_id = auth.uid()`; `insert/update/delete` só onde `dono_id = auth.uid()` e
`is_professional()`. O catálogo Vytra é gravado só por migração.

**Seed.** Os nomes de `EXERCICIOS_CATALOGO` mais os aliases das 38 ilustrações, com grupo muscular
revisado pelo Tassis. Depois, a Edge Function passa a **ler a tabela** em vez da lista copiada
(deploy só pela CLI, junto com a pendência 2 do §73).

**App.** Componente `ExercicioPicker` no editor (`pro/aluno/[id]/index.tsx`): busca normalizada,
filtro por grupo, e "criar exercício próprio" na própria busca. Ao escolher, preenche nome,
`tempo`, `ombro` e `video` e grava `biblioteca_id` **opcional** no jsonb. Texto livre continua
permitido, então nenhum plano antigo quebra.

**Segurança/LGPD.** Sem dado de paciente na tabela. `video_url` passa por `safeLink` no cliente e
pelo `CHECK` no banco. **Sem upload de vídeo nesta fase** (peso, MIME, moderação): decisão aberta.

**Conteúdo, não código, limita o tamanho.** Não copiar vídeos nem catálogos de terceiros. Meta de
partida: ~150 exercícios com nome, grupo e equipamento, **sem mídia**. A biblioteca cresce com os
exercícios próprios de cada profissional; ilustrações seguem o pipeline do §28/§50, com revisão
técnica.

**Aceitação.**
- Adicionar um exercício por busca leva menos de 10 s.
- Exercício próprio de A **não aparece** para B (teste com 2 profissionais).
- O `plans.dias` real do Tassis faz round-trip **byte-idêntico** (mesma verificação do §11).
- "Gerar com IA" continua funcionando.

**Reversão.** `drop table`. O jsonb com `biblioteca_id` segue válido, o campo é ignorado.

## F2 — Modelos de treino e de cardápio

**Banco** — `modelos_profissional`: `id`, `professional_id` (default `auth.uid()`), `tipo`
(`treino` | `dieta`), `nome`, `descricao`, `tags text[]`, `conteudo jsonb`, `criado_em`,
`atualizado_em`, `arquivado_em`. RLS: tudo só onde `professional_id = auth.uid()` e
`is_professional()`. `CHECK` no tamanho do `conteudo` e trigger limitando modelos por profissional
(abuso e custo). Sem `anon`.

**Conteúdo do modelo.**
- *Treino:* `{ dias: [...] }`, sem `periodo` nem `treinador`. Os ids de exercício são preservados.
- *Dieta:* `{ refeicoes: [...], observacoes }`, **sem** metas do paciente. Itens com `taco_id`
  recalculam macros ao aplicar.

**Fluxos.**
1. **Salvar como modelo** (a partir do plano de um aluno). Passo obrigatório de **revisão das
   notas**: `nota` e `obs` são texto livre e podem citar o paciente. O profissional revisa ou
   limpa antes de gravar (minimização, §0). Nunca copiar nome nem dado do paciente.
2. **Aplicar a aluno** cria **rascunho**. Aluno sem plano: cria o plano. Aluno com plano: o
   profissional escolhe "adicionar dias" ou "substituir", e a tela lista os ids que sairiam do
   plano (reuso do aviso do `planEditor.ts`).
3. Aplicar cardápio **mostra o delta de kcal** contra a meta calculada do aluno (§27, Entrega 2) e
   **não** sobrescreve a meta nem a fórmula.
4. Editar, renomear, arquivar, buscar por nome e tag.
5. Duplicar de um aluno para outro = salvar + aplicar. **Não** existe cópia direta entre pacientes.

**Fora desta fase.** Modelos curados pela Vytra ("starter"): têm responsabilidade clínica e só
entram com revisão de profissional habilitado (decisão aberta). Compartilhar modelo entre
profissionais também fica de fora.

**Aceitação.** Salvar e aplicar a 2 alunos em menos de 1 min; modelo invisível para outro
profissional; aplicar não altera plano publicado; resultado sempre em rascunho.

**Reversão.** `drop table`. Nada no plano do aluno depende dela.

## F3 — Histórico de versões do plano

**Por quê.** O `upsert` sobrescreve a linha: o que foi prescrito antes se perde. Nenhuma comparação
por ciclo é possível. O roadmap já listava "versionamento completo" em "Depois"; este recorte
entrega o essencial **sem mudar nenhuma leitura existente**.

**Banco** — `planos_versoes`: `id`, `client_id`, `professional_id`, `tipo`, `versao int`,
`conteudo jsonb`, `motivo text`, `criado_em`. Um **trigger `SECURITY DEFINER` com `search_path`
fixo** grava o snapshot **ao publicar** (o que o paciente efetivamente viu), nunca a cada edição de
rascunho. Teto de 50 versões por plano.
- **Conferido em 14/out:** `plans` e `planos_alimentares` têm a coluna `publicado` (migração
  `20260906_plans_rascunho_publicado`), então o mesmo gatilho serve para os dois.

**RLS.** `select` para o profissional do vínculo (`is_professional_of`) e para o paciente dono
(leitura do que lhe foi prescrito). **Nenhum** `insert/update/delete` direto: só o trigger grava.

**App.** "Histórico" no editor e no resumo: lista, visualizar, **comparar** (por dia/exercício e
por refeição/macros) e **restaurar como rascunho**. Restaurar preserva os ids, então o histórico
de carga do aluno continua apontando certo.

**Aceitação.** Publicar 3 vezes gera 3 versões; restaurar nunca publica; paciente não escreve.
**Reversão.** Remover trigger e tabela.

## F4 — PDF de treino e de dieta

**Sem tabela e sem armazenar o arquivo no servidor** (não cria superfície nova de dado de saúde).
O PDF é gerado sob demanda no dispositivo.

**Técnica** (conferida na doc do SDK 57):
- `expo-print`: `printToFileAsync` gera o PDF no cache do app; `expo-sharing` entrega o arquivo.
- **Na web**, `printToFileAsync` **não gera arquivo**: abre o diálogo de impressão do navegador, e o
  profissional escolhe "Salvar como PDF". A tela deve deixar isso claro.
- iOS: imagens locais não carregam em HTML impresso, então vão em base64. Incluir `<!DOCTYPE html>`
  e `@page` para margens.
- `expo-print` e `expo-sharing` são módulos nativos: o app instalado precisa de **novo build iOS**.
  Entregar a web primeiro, e o nativo junto da limpeza de dependências (§73, pendência 6).

**Conteúdo.**
- *Treino:* por dia, exercícios, séries × repetições, descanso, observações, ilustração opcional.
- *Dieta:* refeições, itens, macros, substituições, observações e, opcional, a lista de compras.
- Cabeçalho: nome do profissional e **sigla do selo**. Rodapé: data, versão e marca d'água
  "RASCUNHO" se não publicado.
- Plano de treino emitido por nutricionista leva o **texto da declaração do §48**.
- Número do registro (CRN/CREF) no PDF: **decisão aberta**, porque o §58 o mantém invisível ao
  paciente.

**Segurança.** O arquivo vive no aparelho e é dado de saúde: avisar o profissional ao compartilhar.
Nada de dado de outro paciente no documento.

**Aceitação.** Abre em Preview, Chrome e Arquivos do iOS; acentos e tabelas corretos; um cardápio
grande (8 refeições × 6 itens com substituições) pagina sem cortar.

## F4b — Compartilhar a lista de compras

Hoje `aluno/lista-compras.tsx` só exibe a lista (`ListaComprasSection`). Entrega: botão "Compartilhar
lista" que gera um **texto simples** (itens agrupados por categoria, com quantidades) e abre a folha
de compartilhamento do sistema (WhatsApp, Notas, mercado). É a base de conveniência que **não
depende de ninguém** e prepara o item 7 do roadmap (carrinho parceiro).

- Texto puro, sem identificador do paciente, sem nome do profissional e sem rótulo de dieta.
  Quem decide para onde vai é o paciente, ao tocar no botão. Nada é enviado automaticamente.
- API de compartilhamento nativa do React Native (`Share`); na web, `navigator.share` com
  fallback de copiar. Conferir a documentação do SDK 57 antes de codar.
- **Aceitação:** o texto cola corretamente no WhatsApp com acentos e quebras de linha; lista vazia
  ou plano em rascunho não mostra o botão.
- **Reversão:** remover o botão. Sem banco.

## F5 — Mais de um plano por vínculo (fora da Camada 1)

Não entra como entrega: fica **desenhada e bloqueada** até o §24 fechar. Motivos verificados:

1. `plans_client_id_key` e `planos_alimentares_client_id_key` são `UNIQUE (client_id)`, e os dois
   editores fazem `upsert onConflict: 'client_id'` (`planEditor.ts:44`, `dietEditor.ts:153`).
2. A leitura do paciente assume uma linha: `workoutService.ts:20` usa `.maybeSingle()` por
   `client_id`, que **dá erro** com duas linhas; `nutritionService.ts:11` tem a mesma forma.
3. **Risco silencioso:** `workout_logs` e `workout_drafts` usam `exercise_id` sem separar por plano
   ou profissional. Dois treinadores com um exercício `a1` cada **colidem no histórico de carga**,
   sem erro nenhum (a mesma classe de bug do §11).

Pré-condições: validação multi-profissional do item 1 do roadmap, "Área unificada do paciente"
(item 3), e uma chave de histórico que inclua o plano. Só então trocar para
`UNIQUE (client_id, professional_id)`.

## Ordem e dependências

```
F0 → F1 → F2
      └──→ F3   (independente de F2)
F4-web (independente de F1; usa o plano atual)  →  F4-nativo (com o build de limpeza)
F4b (independente de tudo; só depende do plano alimentar já existente)
F5: bloqueada
```

Rodar uma fase por vez, cada uma com seu deploy: migração → app → verificação → handoff.

## Decisões abertas (Guilherme e Tassis)

1. **Número do registro no PDF** entregue ao paciente (conflito com a regra do §58).
2. **Modelos "starter" da Vytra:** quem revisa clinicamente, e com que responsabilidade.
3. **Upload de vídeo próprio do profissional:** limite de tamanho, formato e moderação.
4. **Limite de modelos por profissional** e política de arquivamento.
5. **Quem revisa os grupos musculares** do catálogo inicial (sugestão: o Tassis).
6. **Chave de histórico** para o multi-plano (F5).

## Verificação padrão de cada fase

- `npx tsc --noEmit` e `npx expo export --platform web` limpos.
- RLS com dois profissionais e um paciente, em transação revertida; `get_advisors(security)` sem
  achado novo.
- Round-trip do `plans.dias` e do `planos_alimentares.refeicoes` reais, byte-idêntico.
- Teste logado feito pelo Guilherme (nenhum agente digita senha de conta).
- Deploy pelo pipeline do handoff; conferir por `curl` o corpo, não só o status, nos dois hosts.
- Atualizar o `HANDOFF.md` relendo a versão do disco antes de gravar.
