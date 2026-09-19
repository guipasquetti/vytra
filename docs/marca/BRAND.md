# Vytra — brand book

> Fonte canônica da identidade da marca dentro do repositório.
> Nome fechado em 09/set/2026. Paleta "Sinal Vital" aprovada em 08/set/2026.
> Sempre que este documento e um arquivo de código discordarem, este documento vence — e o
> código deve ser corrigido, não o contrário.

---

## 1. O nome

**Vytra.** Não é palavra de dicionário, é construção fonética: `Vy-` ecoa "vital" e "vitória",
`-tra` ecoa "extra" e "ultra". Foi essa origem construída que fez o nome sobreviver à ronda de
colisão que derrubou ~20 candidatos, "Pulso 360" incluído.

**Escrita:** "Vytra" em texto corrido. "VYTRA" só no logotipo e em rótulos de interface em
caixa alta. Nunca "VyTra", "Vytrá" ou "Vitra".

**Situação de registro (09/set/2026):**

- Busca exata no INPI (`busca.inpi.gov.br`) zerou para VYTRA, VYTRIA e VYTTRA.
- Busca radical trouxe 7 processos, nenhum idêntico; o mais próximo é VYTRANZO (farmacêutica,
  classes NCL 5/10) — outro mercado.
- "Vytra Diagnósticos" existe como empresa mas não aparece no INPI, ou seja, é nome
  empresarial e não marca registrada. Mas nome empresarial anterior de terceiro no mesmo ramo
  é fundamento de oposição pelo art. 124, V da LPI, e eles operam em saúde no Brasil. O risco
  não é zero: é moderado e depende de depositarmos primeiro.
- Existe um app internacional homônimo (`@vytra.app`, treino/tracking, US$ 9,99/mês). Não
  bloqueia juridicamente e não opera no Brasil, mas é risco de confusão em busca e rede social.
- O aviso do próprio INPI vale: "nenhum resultado" não garante registrabilidade. O exame real
  só acontece com o pedido formal — **ainda não depositado**.
- **Nada foi depositado ainda.** O depósito é a única parte irreversível da marca e tem
  prioridade sobre qualquer outra decisão de identidade. Classes e custo em
  [`DOMINIO-E-INPI.md`](DOMINIO-E-INPI.md) §5.

**Handle social:** `@vytra.oficial`.

**Domínio oficial:** `vytraoficial.com.br` (decidido em 09/set). `vytra.com.br` pertence à
Vytra Diagnósticos e está em monitoramento. Alternativas descartadas, com o motivo de cada
uma, e o passo a passo de DNS e INPI em [`DOMINIO-E-INPI.md`](DOMINIO-E-INPI.md).

**Nomes testados e descartados:** Vytia (nome contaminado por fraude em busca) e Vytria
(`.com.br` suspenso e `.com` de e-commerce ativo). Não reabrir sem informação nova; o motivo
de cada um está no `DOMINIO-E-INPI.md` §4.

---

## 2. O mark

Uma linha de monitor de sinal vital: base plana, um único pico para baixo. O vértice desse
pico é, isolado, a letra V. É o critério técnico e o nome da marca no mesmo traço.

**Geometria canônica** — todos os arquivos saem destes números
(`scripts/brand/gen_brand.py` reproduz o conjunto inteiro):

| Parâmetro | Valor |
|---|---|
| Espessura do traço | 8 unidades |
| Pontas e junções | retas (`stroke-linecap: butt` / `stroke-linejoin: miter`) — nunca arredondar |
| Linha de base | y = 22 |
| Profundidade do vértice | y = 52 |
| Meia-largura do V | 16 |
| Proporção dos braços (esquerdo:direito) | 28:40 — o V nunca fica centralizado |
| Variante larga (lockups) | x de 8 a 112, vértice em x ≈ 53,65 |
| Variante compacta (ícone quadrado) | x de 22 a 98, vértice em x ≈ 56,12 |

O vértice fica à esquerda do centro de propósito — braço esquerdo mais curto que o direito,
na proporção 28:40 do desenho de referência. Cada variante recalcula o x do vértice a partir
da própria largura pra manter essa MESMA proporção visual (`apex_x()` em
`scripts/brand/gen_brand.py`), em vez de usar uma coordenada fixa. O V tem 32 de largura por
30 de profundidade — quase quadrado, que é o que faz ele ler como letra e não como ruído do
gráfico.

**Ajuste óptico para tamanho pequeno.** Abaixo de ~48px o traço de 8 some. Existe uma variante
com traço 13 (`vytra-icon-small.svg`, e os favicons gerados dela). Use essa, não reduza a
principal.

**Um único pico.** O sinal marca um evento, não um ruído contínuo. Nunca desenhar dois picos,
nem espelhar o V para cima.

---

## 3. Cor

| Papel | Nome | Hex | Uso |
|---|---|---|---|
| Base | Ink | `#0A0C0D` | fundo de toda superfície da marca |
| Sinal | Mint | `#2ED9A3` | o traço do mark, o accent do produto |
| Alerta | Amber | `#FFB020` | estado de atenção — nunca decoração |
| Texto | Paper | `#ECEFEE` | texto sobre a base |
| Texto secundário | Paper muted | `#9CA6A2` | apoio, legendas |

Superfícies do app, derivadas da base: card `#15181A`, elemento dentro do card `#1D2123`,
divisória `#262B2D`. Todos vivem em `src/theme/index.ts`.

**Regras.**

- O menta é sinal, não preenchimento. Ele marca a coisa importante da tela; se tudo é menta,
  nada é.
- O âmbar nunca é enfeite. Se está âmbar, alguma coisa precisa de atenção.
- A marca não tem gradiente, sombra colorida nem glow.
- Risco aceito e registrado: a paleta lê mais "clínica" que "treino". Aceito porque o educador
  físico também se vende pelo rigor técnico.

**Contraste.** Menta sobre Ink passa AA para texto grande e para elemento gráfico. Não use
menta para texto corrido pequeno sobre a base — use Paper.

---

## 4. Tipografia

| Papel | Fonte | Onde |
|---|---|---|
| Wordmark | IBM Plex Mono Medium, tracking aberto | só o logotipo |
| Título / número grande | Big Shoulders Display Bold/Black | títulos, placares, estatística |
| Rótulo e dado tabular | IBM Plex Mono Medium/SemiBold | rótulo de campo, unidade, código |
| Texto corrido | fonte do sistema | parágrafo, formulário, chat |

Os arquivos estão em `assets/fonts/`, versionados no repositório de propósito: sem pacote npm
novo e sem depender de rede em tempo de build. Carregados por `useBrandFonts()` em
`src/theme/fonts.ts`; helpers `headingStyle()` e `monoStyle()` aplicam tracking e altura de
linha certos.

---

## 5. Lockups

| Arquivo | Quando usar |
|---|---|
| `vytra-lockup.svg` | forma principal — mark menta + wordmark claro, sobre a base escura |
| `vytra-lockup-white.svg` | tudo branco, sobre foto ou fundo colorido |
| `vytra-lockup-black.svg` | tudo preto, sobre fundo claro (documento, PDF, papel) |
| `vytra-lockup-stacked.svg` | espaço quadrado — avatar, selo, marca d'água |
| `vytra-mark.svg` | só o mark, quando "Vytra" já está escrito por perto |
| `vytra-wordmark.svg` | só o nome, quando o mark já apareceu na mesma peça |

No app, use os componentes `VytraLockup` e `VytraMark` (`src/components/vytra-logo.tsx`) —
são as imagens exportadas, com o wordmark já convertido em curvas. Nunca escrever "VYTRA"
como texto para fazer as vezes do logotipo: o resultado depende da fonte carregada e muda
entre plataformas.

**Área livre.** Nada encosta no mark a menos de uma espessura de traço de distância, em
nenhum dos quatro lados.

**Tamanho mínimo.** Lockup horizontal: 96px de largura. Mark isolado: 16px de altura, e nesse
tamanho use a variante óptica pequena.

**Não fazer:** girar, inclinar, esticar em um eixo só, aplicar contorno, colocar sobre fundo
que deixe o menta abaixo de 3:1 de contraste, recolorir o mark fora das variantes acima,
ou trocar a fonte do wordmark.

---

## 6. Ícones e aplicações

| Arquivo | Onde entra |
|---|---|
| `vytra-app-icon-1024.png` | ícone iOS e ícone web (`app.json → icon`) |
| `vytra-icon-foreground-1024.png` | camada de frente do ícone adaptativo Android |
| `vytra-icon-monochrome-1024.png` | ícone monocromático Android (tema dinâmico) |
| `vytra-favicon-196.png` / `-48` / `-32` | favicon web |
| `vytra-splash-512.png` | splash screen, sobre `#0A0C0D` |

O ícone adaptativo do Android usa cor de fundo sólida (`#0A0C0D`), não imagem de fundo — o
mark ocupa 50% da largura, dentro da zona segura de 66%.

---

## 7. Voz

**É:** técnica, presente, direta.
**Nunca é:** genérica, sedutora, fria.

Frase de diferenciação, nas palavras do próprio Tassis:
> encaixar a dieta e o treino na rotina do paciente, não o contrário.

Tagline do produto: **"Um plano realmente seu."**

Fecho para o paciente: "um plano realmente seu."
Fecho para o profissional: "o critério que você já tem, sem o trabalho que te consumia."

### Regras de escrita, fixadas linha a linha

- Nunca travessão.
- Nunca a construção "não é X, é Y".
- Nunca ponto de exclamação.
- Nunca prometer prazo.
- Nunca citar concorrente pelo nome. Descrever a função ("uma ferramenta pra gestão, outra
  pra prescrever dieta").
- Nunca emoji atrelado à marca. Se um dia houver base de ícones própria, ela substitui o
  papel que o emoji ocuparia.
- Toda comunicação pública, produto e interface falam em nome da **Vytra**. Nunca expor o
  nome do fundador/responsável nesses contextos; identificação pessoal só cabe, se necessária,
  em documentação contratual privada e transitória até a formalização da empresa.

Ideia central dos dois discursos de marca: o plano se adapta à pessoa, não o contrário. Isso
reformula a tentativa anterior que não deu certo como falha do método, e usa isso como prova
de critério técnico em vez de promessa.

---

## 8. Como regerar os arquivos

```bash
python3 scripts/brand/gen_brand.py
```

O script é a única fonte da geometria. Ele lê as fontes de `assets/fonts/`, converte o
wordmark em curvas e exporta todos os SVGs e PNGs para `assets/brand/`. **Não editar os
arquivos de `assets/brand/` à mão** — a próxima execução do script sobrescreve.

Dependências do script (só para gerar, não para rodar o app): `fonttools`, `cairosvg`.
