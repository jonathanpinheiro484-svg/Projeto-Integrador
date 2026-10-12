# AgendaExpress (API / back-end)

Projeto do SENAC SP do Gabriel: sistema SaaS de agendamento para donos de negócios de
horário marcado (manicure, barbeiro etc.). Este repositório é a API. O front-end fica em
outro repositório (veja a seção "Front-end" no fim).

## Stack

- C# / .NET 8, Azure Functions no modelo **isolado**, Visual Studio no Windows
- SQL Server local (banco `agendaExpress`), ADO.NET puro com `Microsoft.Data.SqlClient`
  (sem Entity Framework)
- `BCrypt.Net-Next` para hash de senha
- JWT com `System.IdentityModel.Tokens.Jwt`
- Swagger via `Microsoft.Azure.Functions.Worker.Extensions.OpenApi` (os atributos vêm do
  namespace `Microsoft.Azure.WebJobs.Extensions.OpenApi.Core`)
- `Program.cs` usa o `HostBuilder` clássico, porque o `ConfigureOpenApi()` só existe nele

## Como rodar

- Pelo **Visual Studio** (botão verde ▶ AgendaExpress.Api ou F5). Ele traz o Azure Functions
  Core Tools embutido.
- `dotnet run` no terminal **não funciona** nesta máquina: o SDK exige o comando `func`
  (Core Tools) instalado e no PATH, e ele não está (erro AZFW0100).

## Estrutura (pasta AgendaExpress.Api/)

- `Function1.cs`: endpoints (Cadastro, Login, ValidarToken, Colaboradores) e os métodos
  auxiliares `ObterUsuarioIdDaRequisicao` (lê o header `Authorization` e devolve o
  UsuarioId do token, ou `null`) e `CriarResposta`
- `Dados/`: `ConexaoBD`, `DonoRepositorio` (`CadastrarAsync`, `ObterDonoIdAsync`),
  `UsuarioRepositorio` (`LoginUsuario`), `ColaboradorRepositorio` (`CadastroColaborador`)
- `Servicos/`: `TokenServicos` (`GerarToken`, `ObterUsuarioId`)
- `Validadores/`: `UsuarioValidador` (nome, telefone, email, senha, login),
  `ColaboradorValidador` (`ValidarDataAdmissao`)
- `DTOs/`: `DonoCadastroRequest`, `ColaboradorCadastroRequest`, `LoginRequest`, `LoginResponse`
- `Models/`: `Donos.cs` (classe `Dono`)

## Convenções

- Classes `public`; campos privados com prefixo `_`
- Dependências recebidas pelo construtor e registradas com `AddSingleton` no `Program.cs`
- Todo I/O é assíncrono (o Kestrel não permite síncrono): `ReadAsStringAsync`,
  `WriteStringAsync`, `OpenAsync`
- Validadores devolvem `null` quando está válido, ou a mensagem de erro (`string`)
- `CriarResposta(req, status, mensagem, contentType)` centraliza as respostas HTTP
- SQL sempre parametrizado (`@Parametro`); escrita em mais de uma tabela dentro de transação
- 401 para "não autenticado", 403 para "logado, mas sem permissão", 400 para requisição ou
  dados inválidos
- Padrão de endpoint protegido do dono: `ObterUsuarioIdDaRequisicao` → 401;
  `ObterDonoIdAsync` → 403; validadores → 400; hash (se tiver senha); repositório;
  `CriarResposta`. O `DonoId` sempre vem do token, nunca do JSON.
- Git: a branch principal é `master` (não `main`). Os amigos puxam dela para o front, então
  o trabalho novo vai em branches `feature/...` e só entra na `master` com merge combinado.

## Contrato da API (o que o front precisa saber)

Base em desenvolvimento: `http://localhost:7244/api` (a porta pode mudar; confira na janela
do Core Tools ao rodar). Corpos de requisição são JSON (`Content-Type: application/json`).
Na ENTRADA, os nomes dos campos não diferenciam maiúsculas de minúsculas. Na SAÍDA JSON,
os nomes saem como no C# (começam com maiúscula).

### POST /api/Cadastro (cadastra o Dono)

- Entrada: `{ "nome": "", "cpf": "", "email": "", "senha": "", "telefone": "" }`
- Regras, nesta ordem: nome não vazio e sem números; telefone não vazio e sem letras;
  email não vazio e em formato válido; senha não vazia e com 8 ou mais caracteres.
  O CPF ainda não é validado.
- 200: texto simples de confirmação (o front não deve depender do conteúdo)
- 400: texto simples com a mensagem do primeiro problema encontrado
- 500 sem corpo: erro do banco (por exemplo, email ou CPF já cadastrados) ou corpo vazio
  ou inválido. Ainda não é tratado.

### POST /api/Login

- Entrada: `{ "email": "", "senha": "" }`
- 200, `application/json; charset=utf-8`: `{ "Mensagem": "...", "Token": "<jwt>" }`
- 400, texto simples: campos vazios ("Email e senha não podem estar vazio"), ou
  "login ou senha invalidos"
- Token: JWT assinado com HMAC SHA-256, validade de 1 hora, com os claims `sub` (Id do
  usuário) e `email`. Ainda não leva o papel (Dono ou Colaborador) nem o `DonoId`.

### GET /api/ValidarToken (endpoint de teste, deve sair depois)

- Cabeçalho: `Authorization: Bearer <token>`
- 200, texto simples: o Id do usuário lido do token
- 401, texto simples: "Token não autorizado" (sem cabeçalho) ou "Token inválido"

### POST /api/Colaboradores (o dono cadastra um colaborador)

- Cabeçalho: `Authorization: Bearer <token>` de um usuário que seja **dono**
- Entrada: `{ "nome": "", "cargo": "", "telefone": "", "dataAdmissao": "AAAA-MM-DD",
  "senha": "", "cpf": "", "email": "" }` (sem `DonoId`: ele vem do token)
- Regras: as mesmas do Dono para nome, telefone, email e senha; `dataAdmissao` obrigatória
  e não pode ser no futuro
- Grava `tblUsuarios` + `tblColaboradores` em transação, com hash BCrypt
- 200: texto "Colaborador <nome> cadastrado com sucesso."
- 401 "Token inválido": sem token ou token inválido/expirado
- 403 "Usuário não é dono": logado, mas é colaborador
- 400: mensagem do primeiro problema de validação

### Swagger com token

O documento gerado é OpenAPI **2.0**, então `SecuritySchemeType.Http`/Bearer NÃO funciona
("Unknown security definition type"). Usar:
`[OpenApiSecurity("Bearer", SecuritySchemeType.ApiKey, Name = "Authorization", In = OpenApiSecurityLocationType.Header)]`.
No botão Authorize, colar `Bearer <token>`.

### CORS (configurado e testado)

- Fica no `local.settings.json`, bloco `Host`: `"Host": { "CORS": "http://127.0.0.1:5501" }`.
  Várias origens se separam por vírgula, sem espaços.
- O `local.settings.json` **não vai para o Git**: repetir esse bloco em cada máquina.
- A origem do front é a do Live Server. Se a porta mudar (por exemplo, 5500), ajustar aqui.
- Testado: um POST com JSON feito pelo console do navegador, a partir do front, leu a
  resposta 400 da rota Login sem erro de CORS.

## Banco (agendaExpress)

`tblUsuarios` (login: CPF, Email, SenhaHash), `tblDonos` (UsuarioId 1:1),
`tblColaboradores` (DonoId + UsuarioId 1:1), `tblClientes`, `tblServicos`, `tblPlanos`,
`tblAssinaturas`, `tblAgendamentos` (CHECK: Dono OU Colaborador, nunca os dois).
Todo `Id` é IDENTITY. `tblDonos.Status` é INT (1 = Ativo, 0 = Inativo).
Login único para Dono e Colaborador: as credenciais ficam só em `tblUsuarios`.

## Segredos

`local.settings.json` **não vai para o Git**. Ele guarda `SqlConnectionString`, `JwtSecret`
(mínimo de 32 caracteres) e o bloco `Host`. Nunca coloque valores reais em arquivos
versionados nem em mensagens.

## Estado atual (atualizado em 12/10/2026)

- A `master` está em dia: o cadastro de colaborador entrou nela por merge em 12/10/2026
  (commits `997a2c8` e `c3b1000`). A branch `feature/cadastro-colaborador` já foi
  incorporada e pode ser apagada quando o grupo quiser.
- Pronto: cadastro do Dono, login que devolve JWT, validação do token, CORS liberado para o
  front, e **cadastro de Colaborador** (testado no Swagger: 200 como dono, 401 sem token,
  403 logado como colaborador; conferido no banco com `DonoId` e `UsuarioId` corretos)
- Front (repositório Projeto-Integrador, branch `main`): o login carrega o `js/comum.js` e
  o formulário de colaborador da `agenda.html` está ligado a `POST /api/Colaboradores`.
  Falta os amigos testarem a tela de ponta a ponta.
- Decisão pendente: manter os nomes de saída com maiúscula (`Token`) e o front se adaptar,
  ou a API passar a devolver `token` (camelCase)

## Próximos passos

- Próxima entidade: Serviços (sugerida, a mais simples), depois Clientes, depois
  Agendamentos. Ainda não decidido. Todas seguem o padrão de endpoint protegido do dono.
- Cada parte nova vai numa branch `feature/...`. Para levar à `master`, a receita que o
  Gabriel já aprendeu no Visual Studio: ir para a `master` → Efetuar Pull → em Gerenciar
  Branches, botão direito na feature → "Mesclar ... em 'master'" → botão direito na
  `master` (lista da esquerda) → Enviar por Push. Cuidado: o link "Enviar por push" do
  histórico age sobre a branch que a janela está mostrando, não sobre a branch atual.
- Decisão pendente: o token não diz se a pessoa é Dono ou Colaborador, então o login do
  colaborador ainda é simulado no front. Definir como a API vai informar o papel (por
  exemplo, um claim no JWT ou um campo na resposta do login).
- Pendências:
  - `LoginUsuario`: o catch engole o erro em silêncio. Adicionar `Exception ex`,
    `LogError` e `throw`.
  - Testar o login com senha errada e com email inexistente.
  - Script SQL: em `tblColaboradores`, deixar `Status INT NOT NULL DEFAULT 1` e
    `Telefone NOT NULL`, igual ao banco real.
  - Na Function `Colaboradores`, renomear a variável `ColaboradorRequest` para
    `colaboradorRequest` (local começa com minúscula).
  - Padrão de nomes no banco: o front manda o nome do colaborador em minúsculas, mas o
    cadastro do Dono ainda manda como foi digitado. Alinhar os dois.
  - Técnicas: avisos de nulo (CS8618, CS8603...), validação de CPF, tratar corpo de
    requisição vazio ou inválido (hoje dá 500), email/CPF duplicado (hoje dá 500).

## Como trabalhar com o Gabriel

- Ele está aprendendo C#: guiar **um passo pequeno por vez**, sem entregar o código pronto.
- Mostrar direto só a peça nova que ele não conhece; o resto ele escreve.
- Ao corrigir erro, dizer a linha, o erro e o motivo, de forma clara.
- Nunca editar arquivos sem ele pedir.
- No fim de cada sessão, atualizar as seções "Estado atual" e "Próximos passos" deste
  arquivo e lembrar de fazer commit + push: este arquivo é a memória compartilhada entre o
  Claude do console e o Claude do chat (claude.ai), que lê o repositório pelo GitHub.

## Front-end

- Fica em outro repositório, na pasta irmã `..\Projeto-Integrador` (HTML, CSS e JavaScript
  puros, sem framework e sem build), servido pelo Live Server do VS Code em
  `http://127.0.0.1:5501`. O CLAUDE.md dele descreve a estrutura e o estado.
- Para a sessão do Claude enxergar os dois:
  `claude --add-dir "$HOME\source\repos\Projeto-Integrador"`, com a variável de ambiente
  `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` para carregar também o CLAUDE.md dele.
