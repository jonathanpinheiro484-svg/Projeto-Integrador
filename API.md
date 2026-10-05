# API do AgendaExpress: guia para o front-end

Este arquivo explica como o back-end (a API) funciona, para quem mexe no front-end, e
para o Claude dessa pessoa. Ele vale tanto para gente quanto para IA.

> **Usa o Claude pelo site (claude.ai)?** Ele não lê este arquivo sozinho. Faça uma destas:
> - crie um **Projeto** no claude.ai e adicione este arquivo (e o `CLAUDE.md`) ao
>   conhecimento do projeto; todas as conversas daquele projeto passam a enxergá-lo; ou
> - anexe este arquivo no começo da conversa.
>
> Sempre que o arquivo mudar no GitHub, atualize a cópia no Projeto.

## Quem cuida de quê

- **Front-end** (este repositório): HTML, CSS e JavaScript puros, sem framework.
- **API** (outro repositório, mantido pelo Gabriel): C# / .NET 8, Azure Functions, banco
  SQL Server. **O front não altera a API.** Precisa de uma rota nova, de um campo novo ou
  de uma resposta diferente? Combine com o Gabriel antes.

## Endereço

- Em desenvolvimento: `http://localhost:7244/api`
- A API só responde se estiver rodando na máquina de quem testa (pelo Visual Studio).
  Sem ela rodando, o `fetch` falha com erro de rede (`TypeError: Failed to fetch`).
- No `js/script.js`, o endereço fica **só** em `API_CONFIG.BASE_URL`, e os caminhos em
  `API_CONFIG.ENDPOINTS`. Não espalhe URLs pelo código.

## Regras gerais

- Corpo das requisições: JSON, com o cabeçalho `Content-Type: application/json`. A função
  `apiRequest` do `js/script.js` já faz isso.
- **Entrada**: os nomes dos campos não diferenciam maiúsculas (`email` e `Email` valem).
- **Saída JSON**: os nomes saem com a primeira letra maiúscula (`Token`, `Mensagem`).
- Erros de validação voltam como **texto simples** (não JSON), com status 400.
- CORS: a API só aceita chamadas vindas de `http://127.0.0.1:5501` (Live Server). Se o
  Live Server abrir em outra porta (por exemplo, 5500), o navegador bloqueia a chamada
  por CORS. Avise o Gabriel para liberar a nova origem.

## Rotas que existem hoje

### POST /api/Cadastro: cadastra o Dono (dono do negócio)

Entrada:

```json
{ "nome": "", "cpf": "", "email": "", "senha": "", "telefone": "" }
```

A API valida nesta ordem e para no primeiro erro:

| Campo | Regra | Mensagem (400) |
|---|---|---|
| nome | não vazio | O nome não pode ser vazio. |
| nome | sem números | O nome não pode conter números. |
| telefone | não vazio | O telefone não pode estar vazio. |
| telefone | sem letras | O telefone não pode conter letras. |
| email | não vazio | O email não pode estar vazio |
| email | formato válido | O email esta em formato invalido |
| senha | não vazia | Senha Não pode estar em branco |
| senha | 8+ caracteres | Senha Invalida deve conter no minímo 8 caracteres |

O CPF ainda **não** é validado pela API.

Respostas:

- **200**, texto simples: confirmação. Não dependa do texto exato, só do status.
- **400**, texto simples: a mensagem do primeiro problema (tabela acima).
- **500**, sem corpo: email ou CPF já cadastrados, ou corpo vazio/inválido. Ainda não é
  tratado pela API; o front deve mostrar uma mensagem genérica.

O cadastro **não** devolve token. Para entrar, a pessoa faz login depois.

### POST /api/Login: entra no sistema (Dono ou Colaborador)

Entrada:

```json
{ "email": "", "senha": "" }
```

Respostas:

- **200**, JSON:
  ```json
  { "Mensagem": "...", "Token": "<jwt>" }
  ```
  Atenção: é `Token` com **T maiúsculo**. Ler `resposta.token` dá `undefined`.
- **400**, texto simples: `Email e senha não podem estar vazio` ou
  `login ou senha invalidos`.

Sobre o token:

- JWT, válido por **1 hora**.
- Guarde só o token (a função `salvarTokenApi` já faz isso). **Nunca guarde a senha.**
- Nas chamadas que exigem login, envie o cabeçalho `Authorization: Bearer <token>`. A
  `apiRequest` já envia sozinha se houver token salvo.
- O token ainda não informa se a pessoa é Dono ou Colaborador.

### GET /api/ValidarToken: só para teste (vai sair)

- Cabeçalho `Authorization: Bearer <token>`.
- 200: o Id do usuário. 401: `Token não autorizado` ou `Token inválido`.

## Rotas que ainda NÃO existem

`/colaboradores`, `/agendamentos`, `/contratos`, `/financeiro`, `/plano` e
`/assinaturas` aparecem no `js/script.js`, mas **não existem na API**. Chamar qualquer
uma delas dá erro 404. As telas que dependem delas continuam usando `localStorage` até
a API ganhar essas rotas.

## Senha: mesma regra no cadastro e no login

O front tira os espaços do começo e do fim da senha (`.trim()`) **nos dois formulários**,
cadastro e login. Se um lado fizer e o outro não, a senha gravada fica diferente da
digitada e a pessoa não consegue entrar. Mexeu em um, confira o outro.

## Como tratar erro da API no front

- `apiRequest` lança um erro quando o status não é 2xx. A mensagem vem no formato
  `Erro na API (400) em CADASTRO: <texto da API>`.
- Mostre o erro **na tela** (por exemplo, com `mostrarErroForm`). Um `catch` que só faz
  `console.warn` esconde o problema e a tela parece funcionar.
- Depois de mostrar o erro, use `return` para não continuar o fluxo (não redirecionar,
  não gravar sessão).
