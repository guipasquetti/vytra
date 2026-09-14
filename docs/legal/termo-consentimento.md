# Termo de Consentimento + Isenção de Responsabilidade — esqueleto

> **Isto não é parecer jurídico e não é texto final.** É um esqueleto de seções pra orientar um
> advogado (revisão obrigatória antes de qualquer publicação real). Pendência já registrada
> desde o kickoff (`HANDOFF.md` §2/§7/§14) — este arquivo existe só porque o conteúdo (texto
> de termo) não cabe no handoff, que é fonte de decisão/estado, não de copy jurídica. Decisões
> sobre este termo (quando publicar, quem revisou, o que mudou) continuam registradas no
> handoff, não aqui — ver a regra de arquivo único no topo do `AGENTS.md`.

## Por que existe (contexto de produto, pra quem for escrever o texto de verdade)

A Vytra é uma plataforma que **conecta** paciente e profissional (personal trainer,
nutricionista) — não presta atendimento clínico ela mesma. Cada profissional é responsável
pelo conteúdo técnico (treino, dieta) que publica, dentro da própria competência/registro no
conselho de classe (CREF/CRN). Isso importa porque:

- O app permite um profissional configurar serviços fora da sua licença formal (ex.: um
  nutricionista, registrado só no CRN, habilitando um plano com módulo de treino) — caso real
  documentado no `HANDOFF.md` §46/§48. A plataforma não bloqueia isso (decisão de produto:
  reflete prática comum e aceita do mercado), mas precisa deixar claro pra quem contrata quem
  está de fato assumindo a responsabilidade técnica.
- Desde 14/set, habilitar treino sem CREF verificado exige uma **declaração explícita** do
  profissional dentro do app (`declaracoes_profissional`, texto fixo em
  `src/services/declaracaoService.ts::TEXTO_DECLARACAO_TREINO_SEM_CREF`, registrada com
  data/hora, nunca editável depois). Esse texto deveria ser revisado pelo MESMO advogado que
  revisar este termo — os dois precisam ser juridicamente consistentes entre si.
- O selo de verificado (`EF`/`NT`, ver §45/§47) mostra ao paciente qual registro foi
  **conferido por humano** — mas isso não é garantia de resultado nem substitui o paciente
  verificar credenciais por conta própria.

## Seções que o termo precisa cobrir (rascunho de estrutura, não de texto)

1. **Papel da plataforma.** Vytra é ferramenta de software; não presta atendimento de saúde,
   não prescreve, não supervisiona clinicamente o conteúdo publicado por profissionais.
2. **Responsabilidade do profissional.** Cada profissional é o único responsável pelo conteúdo
   técnico que cadastra, dentro da própria competência/registro — incluindo o caso de serviço
   fora da licença formal (mencionar a declaração de responsabilidade como parte do
   consentimento, não como substituto dele).
3. **Reconhecimento do paciente.** O paciente reconhece o registro/especialidade declarada do
   profissional (o selo mostra isso) antes de contratar; a plataforma facilita a checagem, não
   garante o resultado.
4. **Sem garantia de resultado.** Cláusula padrão de isenção — resultado de treino/dieta
   depende de fatores fora do controle da plataforma e do próprio profissional.
5. **LGPD e dado sensível.** Referenciar (não duplicar) a base já registrada no `HANDOFF.md`
   §0/§14 — dado de saúde da anamnese, residência de dados em `us-east-1` (transferência
   internacional), e o subprocessador novo desde a geração de plano por IA (Anthropic/OpenAI,
   ver §"IA" no handoff) — LGPD exige que o titular seja informado de cada sub-processador que
   toca o dado dele.
6. **Uso de imagem.** Fotos de check-in (silhuetas/corpo) e vídeos de exercício — cobrir uso,
   armazenamento, quem acessa (RLS já restringe a paciente+profissional+admin, mas o termo
   precisa declarar isso em linguagem de consentimento, não só tecnicamente).
7. **Cobrança e cancelamento.** Quando o módulo de cobrança (Asaas, §7 do handoff, ainda
   bloqueado por falta de CNPJ) entrar em produção, este termo precisa de uma seção de
   reembolso/cancelamento — hoje não é urgente (nada cobra de verdade ainda).
8. **Foro e legislação aplicável.** Padrão de contrato brasileiro — advogado define.

## Pendências explícitas (não inventar aqui)

- Nenhum texto de cláusula foi redigido — só a estrutura acima.
- Precisa de advogado antes de qualquer publicação real pra paciente.
- Precisa decidir ONDE isso aparece no fluxo (aceite no cadastro do paciente? Do profissional?
  Os dois, com textos diferentes?) — decisão de produto, não só jurídica.
- Quando existir texto de verdade, linkar aqui a partir do `HANDOFF.md` (uma linha, sem repetir
  conteúdo) e marcar a pendência como resolvida lá.
