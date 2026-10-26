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
  { "Mensagem": "...", "Token": "<jwt>", "Perfil": "Dono" | "Colaborador",
    "Nome": "...", "ColaboradorId": 12 }
  ```
  Atenção: é `Token` com **T maiúsculo**. Ler `resposta.token` dá `undefined`.
  `ColaboradorId` vem `null` quando quem entrou é o Dono.
- **400**, texto simples: `Email e senha não podem estar vazio` ou
  `login ou senha invalidos`.
- **403**, texto simples: `Usuário inativo. Fale com o dono do salão.` (colaborador desativado).

Sobre o token:

- JWT, válido por **1 hora**.
- Guarde só o token (a função `salvarTokenApi` já faz isso). **Nunca guarde a senha.**
- Nas chamadas que exigem login, envie o cabeçalho `Authorization: Bearer <token>`. A
  `apiRequest` já envia sozinha se houver token salvo.
- Dono e colaborador entram pela mesma rota. O front decide a tela pelo `Perfil`
  (`agenda.html` para o Dono, `colaborador.html` para o colaborador).

### GET /api/ValidarToken: só para teste (vai sair)

- Cabeçalho `Authorization: Bearer <token>`.
- 200: o Id do usuário. 401: `Token não autorizado` ou `Token inválido`.

### POST /api/Colaboradores: o Dono cadastra um colaborador

> Rota disponível na `master` da API desde 12/10/2026. Dê pull na API antes de testar;
> com uma versão antiga, ela devolve 404.

Exige login: o Dono precisa ter entrado antes. A `apiRequest` manda o cabeçalho
`Authorization: Bearer <token>` sozinha. **Não mande o Id do Dono no corpo**: a API descobre
quem é o dono pelo token.

Entrada:

```json
{ "nome": "", "cargo": "", "telefone": "", "dataAdmissao": "AAAA-MM-DD",
  "senha": "", "cpf": "", "email": "" }
```

- `dataAdmissao`: o `<input type="date">` já entrega nesse formato.
- O nome é enviado em minúsculas (padrão do banco); a tela formata para exibir.

A API valida nome, telefone, email e senha com as mesmas regras do cadastro do Dono e,
por último, a data de admissão:

| Campo | Regra | Mensagem (400) |
|---|---|---|
| dataAdmissao | informada | A data de admissão não foi informada. |
| dataAdmissao | não pode ser no futuro | A data de admissão não pode ser no futuro. |

Respostas:

- **200**, texto simples: `Colaborador <nome> cadastrado com sucesso.` Não devolve JSON nem `id`.
- **400**, texto simples: a mensagem do primeiro problema.
- **401**, texto simples: `Token inválido` (sem login, ou token vencido: ele dura 1 hora).
- **403**, texto simples: `Usuário não é dono` (quem está logado é um colaborador).
- **500**, sem corpo: email ou CPF já cadastrados. Ainda não é tratado pela API.

### Demais rotas (conferidas na `master` da API em 26/10/2026)

Todas exigem login (`Authorization: Bearer <token>`, que a `apiRequest` manda sozinha). O
dono **sempre** vem do token, nunca do corpo. Na coluna "Quem", "Dono" quer dizer que o
colaborador recebe **403** `Usuário não é dono`.

| Rota | Quem | Entrada | Resposta 200 |
|---|---|---|---|
| `GET /Colaboradores` | Dono e colab. | — | JSON: lista `{ Id, Nome, Cargo, Telefone, DataAdmissao, Ativo }` (ativos e inativos) |
| `PATCH /Colaboradores/{id}` | Dono | `{ "ativo": true \| false }` | texto. 404 se não achar |
| `POST /Servicos` | Dono | `{ "nome", "duracaoMinutos", "preco" }` | texto |
| `GET /Servicos` | Dono e colab. | — | JSON: lista `{ Id, Nome, DuracaoMinutos, Preco }` (só ativos) |
| `PUT /Servicos/{id}` | Dono | igual ao POST | texto. 404 se não achar |
| `DELETE /Servicos/{id}` | Dono | — | texto (só inativa no banco). 404 se não achar |
| `POST /Clientes` | Dono e colab. | `{ "nome", "telefone" }` | texto. **409** `Telefone de cliente ja cadastrado` |
| `GET /Clientes` | Dono e colab. | — | JSON: lista `{ Id, Nome, Telefone }` (só ativos) |
| `PUT /Clientes/{id}` | Dono e colab. | `{ "nome", "telefone" }` | texto. 404 se não achar |
| `DELETE /Clientes/{id}` | Dono e colab. | — | texto (só inativa no banco). 404 se não achar |
| `POST /Agendamentos` | Dono e colab. | ver abaixo | JSON `{ Id, Mensagem }` |
| `GET /Agendamentos` | Dono e colab. | — | JSON: lista, ver abaixo |
| `PUT /Agendamentos/{id}` | Dono e colab. | igual ao POST | texto. 404 se não achar |
| `PATCH /Agendamentos/{id}/status` | Dono e colab. | `{ "status": "..." }` | texto. 400 status inválido, 404 se não achar |
| `GET /Plano` | Dono e colab. | — | JSON `{ Plano, Status, Preco, DataInicio, DataFim }` (`Plano` = `FREE` sem assinatura) |
| `PUT /Plano` | Dono | `{ "plano": "BASICO" \| "PREMIUM" }` | texto. 400 para outro valor |
| `DELETE /Plano` | Dono | — | texto. 404 `Nenhuma assinatura ativa para cancelar.` |
| `GET /Financeiro` | Dono | `?data=AAAA-MM-DD` (opcional; sem ela, hoje) | JSON, ver abaixo |
| `POST /RecuperarSenha` | sem login | `{ "email" }` | texto (sempre 200, para não revelar quais e-mails existem) |
| `POST /VerificarCodigo` | sem login | `{ "email", "codigo" }` | texto. 400 `Código incorreto ou expirado.` |
| `POST /RedefinirSenha` | sem login | `{ "email", "codigo", "novaSenha" }` | texto. 400 se a senha for inválida ou o código errado |

**Agendamento**

- Entrada (POST e PUT): `{ "clienteId", "servicoId", "colaboradorId", "data": "AAAA-MM-DD", "horaInicio": "HH:MM:SS" }`.
  `colaboradorId` `null` = o próprio Dono atende. Preço, duração e hora de fim a API copia do serviço.
- Erros: **400** (`Cliente não encontrado.`, `Serviço não encontrado.`, `Colaborador não encontrado.`
  ou validação) e **409** `Este profissional já tem um agendamento nesse horário.`
- Saída do GET: `{ Id, ClienteId, ClienteNome, ServicoId, ServicoNome, ColaboradorId,
  ColaboradorNome, Data, HoraInicio, HoraFim, Preco, DuracaoMinutos, Status }`.
- `Status` aceito: **`Agendado`, `Concluido`, `NaoCompareceu`, `Cancelado`** (sem acento).
  "Remarcado" **não existe** na API: a tela mostra, mas envia como `Agendado`.
- **Não existe `DELETE /Agendamentos/{id}`.** Para "remover", o front marca como `Cancelado`
  (`cancelarAgendamentoApi` no `js/comum.js`).

**Financeiro** (`GET /Financeiro`)

`{ DataReferencia, Dia, Semana, Mes, PorColaborador }`. `Dia`, `Semana` e `Mes` têm
`{ Inicio, Fim, Receitas, Atendimentos, Cancelados, Faltas }`. Receita = só agendamentos
`Concluido`; a semana vai de segunda a domingo. `PorColaborador` é uma lista
`{ ColaboradorId, Nome, Dia, Semana, Mes }` (o Dono aparece com `Nome` = `Dono`).

## Rotas que ainda NÃO existem

`/contratos` e `/assinaturas` (pagamento, cartão, boleto). A tela de assinatura continua
guardando o pagamento no `localStorage`; o plano escolhido vai para `PUT /Plano`.

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