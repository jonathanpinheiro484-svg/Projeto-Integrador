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
  `assinatura.html`, `agenda.html`, `colaborador.html`, `sobre.html`, `recuperar-senha.html`
- `css/`, `img/`
- `js/`: um arquivo por página, mais o `js/comum.js`, que é compartilhado
  (`API_CONFIG`, `apiRequest`, `salvarTokenApi`, `mostrarErroForm`, sessão e localStorage).
  **Toda página que fala com a API precisa carregar o `js/comum.js` antes do seu próprio
  script** (com `defer`, os dois na mesma ordem).
- `script.js` na raiz: parece ser a versão antiga, de antes da separação em `js/`.
  Confirmar com o grupo antes de mexer nele ou apagar.

## Estado atual

- **Cadastro do Dono** (`cadastro.html` + `js/cadastro.js`): ligado a `POST /api/Cadastro`.
- **Login** (`login.html` + `js/cadastro.js`): Dono **e colaborador** entram pela API
  (`POST /Login`). O token fica salvo e o `Perfil` da resposta decide a tela. O colaborador
  inativo recebe 403 com a mensagem na tela.
- **Recuperar senha** (`recuperar-senha.html`): ligado às três rotas da API.
- **Agenda do Dono** (`agenda.html` + `js/agenda.js`) e **tela do colaborador**
  (`colaborador.html` + `js/colaborador.js`): serviços, clientes, colaboradores,
  agendamentos (criar, editar, status) e plano vêm da API. O `localStorage` ainda guarda
  cópias e alguns extras só da tela (status "Remarcado", agendamentos escondidos,
  histórico de avisos).
- **Remover agendamento**: a API não tem `DELETE`, então o front marca como `Cancelado`.
- **Financeiro**: a tela calcula pelos agendamentos que vêm da API. O `GET /Financeiro` já
  existe, mas por enquanto o front só mostra a resposta no console.
- **Assinatura** (`assinatura.html`): o plano aprovado é enviado para `PUT /Plano` quando
  o Dono abre a agenda (`sincronizarPlanoComApi`). Cartão, boleto e
  pagamento continuam simulados no `localStorage` (a API não tem essas rotas).
- **Falta testar** tudo isso com a API atualizada pela `master` (ajustes de 26/10/2026).
- No final de alguns scripts está o carrossel da página inicial ("NÃO MEXER"). Nas
  páginas sem carrossel, ele pode gerar um erro no console
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