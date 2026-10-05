# Projeto-Integrador (front-end do AgendaExpress)

Front-end do AgendaExpress, projeto do grupo no SENAC SP: sistema SaaS de agendamento para
donos de negócios de horário marcado (manicure, barbeiro etc.). São páginas estáticas em
HTML, CSS e JavaScript puros, sem framework e sem build.

A API (back-end) fica em outro repositório e é mantida pelo Gabriel. **Como ela funciona,
quais rotas existem e o que cada uma devolve está em `API.md`.** Leia antes de mexer em
qualquer chamada à API.

@API.md

## Como rodar

- Pelo Live Server do VS Code (botão "Go Live"), em `http://127.0.0.1:5501`.
- Para as telas que já falam com a API funcionarem, a API precisa estar rodando na mesma
  máquina (veja `API.md`).

## Estrutura

- Páginas na raiz: `index.html`, `login.html`, `cadastro.html`, `planos.html`,
  `assinatura.html`, `agenda.html`, `colaborador.html`, `sobre.html`
- `css/`, `img/`
- `js/script.js`: **todo** o JavaScript do site, num arquivo só. Cada bloco só roda na
  página que tem o elemento "âncora" dele (por exemplo, `#container` para login/cadastro).

## Estado atual

- **Cadastro do Dono** (`cadastro.html` + bloco `iniciarAuth` do `js/script.js`): sendo
  ligado à rota `POST /api/Cadastro`. O formulário ganhou os campos de CPF e telefone.
- **Login**: ainda simulado com `localStorage`; o próximo a ser ligado à API.
- **Demais telas** (agenda, colaborador, planos, assinatura): simuladas com
  `localStorage`, porque a API ainda não tem as rotas delas.
- No final do `js/script.js` está o carrossel da página inicial ("NÃO MEXER"). Nas
  páginas sem carrossel, ele gera um erro no console
  (`Cannot read properties of null`). Esse erro não afeta o resto do site.

## Regras para não quebrar o trabalho dos outros

- **Mudanças pequenas.** Não reescreva o `js/script.js` inteiro nem reorganize blocos
  que não fazem parte da sua tarefa: outras pessoas mexem no mesmo arquivo.
- **Antes de começar, atualize o código** (`git pull`). Antes de subir, confira o que
  mudou (`git diff`).
- **A URL da API fica só em `API_CONFIG`** (`BASE_URL` e `ENDPOINTS`).
- **Não troque os `id` dos campos** de `cadastro.html` (`cad-nome`, `cad-cpf`,
  `cad-telefone`, `cad-email`, `cad-senha`, `cad-senha-confirmar`). O JavaScript busca
  os campos por esses ids.
- **Não volte para o `localStorage`** uma tela que já fala com a API.
- **Não esconda erros da API.** Mostre a mensagem na tela; `console.warn` sozinho não basta.
- **Senha:** nunca guardar a senha digitada. Guardar só o token da API.
- **Segredos:** nunca colocar tokens, senhas ou dados de conexão em arquivos do repositório.
- **Mudança na API** (rota nova, campo novo, formato de resposta): combinar com o Gabriel.
  O front não altera a API.
