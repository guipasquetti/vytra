# Vytra — instruções para agentes

## Regra que vem antes de tudo

O `HANDOFF.md` na raiz é a **fonte canônica única** do projeto: estado atual, decisões, schema,
infraestrutura, restrições e pendências. Codex e Claude compartilham esse mesmo arquivo.

1. **Leia o `HANDOFF.md` antes de qualquer coisa.** Inclusive antes de abrir um assunto com o
   Guilherme: em 09/set uma sessão gastou uma tarde ajudando a escolher um domínio que já
   estava comprado e documentado ali.
2. **NUNCA duplique o `HANDOFF.md`.** Não crie documento paralelo que repita decisão, estado de
   infraestrutura ou pendência que já vive nele. Documento separado só para assunto que o
   handoff não cobre (`docs/marca/BRAND.md`, regras de uso da marca), e ainda assim o handoff
   aponta para ele em vez de repetir o conteúdo.
3. **Releia a versão do disco antes de escrever nele.** Nunca grave por cima de uma cópia lida
   minutos antes, e nunca force gravação por cima de versão mais nova: o outro agente pode ter
   escrito nesse intervalo. Em 09/set uma gravação forçada apagou 287 linhas do Codex.
4. **Atualize-o ao concluir** mudança relevante, decisão, migração, configuração de infra ou
   bloqueio.

Identidade da marca: `docs/marca/BRAND.md`. Assets de `assets/brand/` são gerados por
`scripts/brand/gen_brand.py`, não editar à mão.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
