// =====================================================
// LOGIN & CADASTRO
// Usado em: cadastro.html (e login.html)
// Depende do js/comum.js (carregar ANTES deste arquivo).
// =====================================================

// Transforma o erro do apiRequest numa mensagem amigável para o formulário.
// O apiRequest lança: "Erro na API (STATUS) em ROTA: texto da resposta".
function mensagemErroApi(erro, contexto) {
  const texto = (erro && erro.message) || "";
  const m = texto.match(/Erro na API \((\d+)\)[^:]*:\s*([\s\S]*)$/);

  if (!m) {
    // Sem status = a requisição nem chegou na API (offline, porta errada ou CORS)
    return "Não foi possível conectar à API. Confira se ela está rodando e se o site está aberto em http://127.0.0.1:5501.";
  }

  const status = Number(m[1]);
  let corpo = (m[2] || "").trim();
  try {
    const json = JSON.parse(corpo);
    corpo = json.mensagem || json.message || json.erro || json.error || json.title || corpo;
  } catch (_) { /* a resposta era texto puro */ }

  if (status === 400 && corpo) return corpo;
  if (status === 401) return "E-mail ou senha inválidos.";
  if (status === 500 && contexto === "cadastro") return "Não foi possível cadastrar. Confira se o e-mail ou o CPF já foram cadastrados.";
  return `Erro ${status} ao falar com a API.`;
}

// Validação do CPF (11 números + dígitos verificadores)
function cpfCadastroValido(valor) {
  const c = String(valor || "").replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}

// Tenta achar o nome do usuário dentro do token JWT (se a API colocar o nome lá).
function nomeDoToken(token) {
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))));
    const chaves = ["nome", "Nome", "name", "unique_name", "given_name",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"];
    for (const c of chaves) {
      const v = payload[c];
      if (typeof v === "string" && v.trim() && !v.includes("@")) return v.trim();
    }
  } catch (_) { /* token sem nome legível */ }
  return "";
}

// =====================================================
// ★ COLABORADOR QUE ENTRA PELA API
// A API aceita o e-mail/senha do colaborador no /Login. Quando as credenciais dele não estão
// neste navegador (outro navegador, dados apagados...), o login caía na conta de DONO.
// Estas funções descobrem se quem entrou é colaborador.
// =====================================================
function lerPayloadJwt(token) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))));
  } catch (_) { return {}; }
}

// Devolve "colaborador", "dono" ou "" (a API não informou o perfil).
function perfilInformadoPelaApi(resposta) {
  const fontes = [resposta || {}, lerPayloadJwt((resposta && resposta.Token) || "")];
  const chaves = ["Perfil", "perfil", "Tipo", "tipo", "Role", "role", "Papel", "papel", "TipoUsuario", "tipoUsuario",
    "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];
  for (const fonte of fontes) {
    for (const c of chaves) {
      let v = fonte[c];
      if (Array.isArray(v)) v = v[0];
      if (typeof v !== "string") continue;
      const t = v.trim().toLowerCase();
      if (t.startsWith("colab") || t.startsWith("func")) return "colaborador";
      if (t.startsWith("dono") || t.startsWith("admin") || t.startsWith("owner")) return "dono";
    }
  }
  return "";
}

function idColaboradorDaApi(resposta) {
  const v = resposta && (resposta.ColaboradorId ?? resposta.colaboradorId ?? resposta.IdColaborador ?? resposta.idColaborador);
  return Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null;
}

// Procura o e-mail na lista de colaboradores (principal e cópias de segurança deste navegador).
function acharColaboradorLocal(email) {
  const alvo = String(email || "").trim().toLowerCase();
  const listas = [lerJsonLocal(CHAVE_COLABORADORES, [])];
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (chave && chave.startsWith("colaboradoresBackup:")) listas.push(lerJsonLocal(chave, []));
  }
  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;
    const achado = lista.find(c => c && String(c.email || "").trim().toLowerCase() === alvo);
    if (achado) return achado;
  }
  return null;
}

// Dados da agenda ainda ficam no localStorage e não pertencem a nenhuma conta.
// Quando entra um dono diferente do último, apaga os dados do anterior e guarda o nome dele.
function prepararContaDono(email, nome, contaNova) {
  const emailNorm = (email || "").toLowerCase();
  const nomes = lerJsonLocal("nomesPorEmail", {});
  if (nome) nomes[emailNorm] = nome;
  localStorage.setItem("nomesPorEmail", JSON.stringify(nomes));

  const outraConta = contaNova || localStorage.getItem("ultimoEmailDono") !== emailNorm;
  if (outraConta) {
    [CHAVE_COLABORADORES, CHAVE_CREDENCIAIS, CHAVE_AGENDAMENTOS, CHAVE_ASSINATURA,
     "whatsappLigado", "nomeUsuarioCadastrado"].forEach(c => localStorage.removeItem(c));
  }
  localStorage.setItem("ultimoEmailDono", emailNorm);
  localStorage.setItem("emailUsuarioLogado", email);

  const nomeFinal = nomes[emailNorm];
  if (nomeFinal) localStorage.setItem("nomeUsuarioCadastrado", nomeFinal);
  else localStorage.removeItem("nomeUsuarioCadastrado");
}

// =====================================================
// 3. LOGIN & CADASTRO (login.html)
// Só roda se a página tiver o elemento #container (o card com o slider).
// =====================================================
function iniciarAuth() {
  const container = document.getElementById("container");
  if (!container) return; // esta página não é a de login/cadastro

  const registerBtn = document.getElementById("register");
  const loginBtn = document.getElementById("login");

  if (registerBtn && loginBtn) {
    registerBtn.addEventListener("click", () => {
      container.classList.add("active");
    });

    loginBtn.addEventListener("click", () => {
      container.classList.remove("active");
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const modo = urlParams.get("modo");

  // Veio da tela de Planos? Depois de cadastrar/entrar, vai para a compra desse plano
  const planoEscolhido = (urlParams.get("plano") || "").toLowerCase();
  const destinoCompra = NOMES_PLANOS_ASSINATURA[planoEscolhido]
    ? `${PAGINA_ASSINATURA}?plano=${planoEscolhido}`
    : null;

  if (modo === "cadastro") {
    container.classList.add("active");
  } else if (modo === "entrar") {
    container.classList.remove("active");
  }

  const formCadastro = document.getElementById("form-cadastro");
  const formLogin = document.getElementById("form-login");

  // Aviso embaixo do título dos formulários, lembrando o plano escolhido
  if (destinoCompra) {
    [[formCadastro, "Crie sua conta para continuar com o plano"], [formLogin, "Entre para continuar com o plano"]].forEach(([form, texto]) => {
      const titulo = form ? form.querySelector("h1") : null;
      if (!titulo) return;
      const aviso = document.createElement("p");
      aviso.style.cssText = "font-size:12px; color:#512da8; margin:6px 0 0; text-align:center;";
      aviso.textContent = `${texto} ${NOMES_PLANOS_ASSINATURA[planoEscolhido]}.`;
      titulo.insertAdjacentElement("afterend", aviso);
    });
  }

 // =====================================================================
// BLOCO "CRIAR CONTA" (só o cadastro, o login não é tocado)
//
// COMO USAR: no seu cadastro.js, dentro de iniciarAuth(), apague tudo
// que começa em      if (formCadastro) {
// e termina logo ANTES de      if (formLogin) {
// e cole o bloco abaixo no lugar.
// =====================================================================

  // =====================================================================
  // ★ CRIAR CONTA - COMEÇO DO BLOCO ALTERADO
  // =====================================================================
  if (formCadastro) {
    // ---------- Campos do formulário ----------
    const nomeInput = document.getElementById("cad-nome");
    const cpfInput = document.getElementById("cad-cpf");
    const telefoneInput = document.getElementById("cad-telefone");
    const emailInput = document.getElementById("cad-email");
    const senhaInput = document.getElementById("cad-senha");
    const confirmarInput = document.getElementById("cad-senha-confirmar");

    // ★ REGRAS DA SENHA (aparecem quando a pessoa clica no campo)
    // Para mudar ou acrescentar uma regra, edite só esta lista.
    const REGRAS_SENHA = [
      { texto: `${SENHA_TAMANHO_MINIMO} caracteres`, ok: v => v.length >= SENHA_TAMANHO_MINIMO },
      { texto: "1 maiúscula", ok: v => /[A-Z]/.test(v) },
      { texto: "1 minúscula", ok: v => /[a-z]/.test(v) },
      { texto: "1 símbolo (@ # $ !)", ok: v => /[^A-Za-z0-9]/.test(v) }
    ];

    // ---------- Olho para mostrar/esconder a senha (igual ao seu original) ----------
    const envolverSenha = document.createElement("div");
    envolverSenha.style.cssText = "position:relative; width:100%;";
    senhaInput.parentNode.insertBefore(envolverSenha, senhaInput);
    envolverSenha.appendChild(senhaInput);
    senhaInput.style.paddingRight = "40px";

    const olhoSenha = document.createElement("button");
    olhoSenha.type = "button"; // não envia o formulário
    olhoSenha.setAttribute("aria-label", "Mostrar senha");
    // Ícones em SVG próprio (não dependem de internet nem do Font Awesome)
    const ICONE_OLHO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const ICONE_OLHO_CORTADO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    olhoSenha.innerHTML = ICONE_OLHO;
    olhoSenha.style.cssText = "position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; padding:0; margin:0; width:auto; height:auto; color:#777; line-height:0; letter-spacing:0; text-transform:none; cursor:pointer;";
    olhoSenha.addEventListener("click", () => {
      const mostrar = senhaInput.type === "password";
      senhaInput.type = mostrar ? "text" : "password";
      olhoSenha.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
      olhoSenha.innerHTML = mostrar ? ICONE_OLHO_CORTADO : ICONE_OLHO;
    });
    envolverSenha.appendChild(olhoSenha);

    // ---------- ★ ERRO CURTO EMBAIXO DE CADA CAMPO ----------
    // Cria um <span class="erro-campo"> logo depois do campo.
    function criarErro(input, ancora) {
      const span = document.createElement("span");
      span.id = `${input.id}-erro`;
      span.className = "erro-campo";
      span.setAttribute("aria-live", "polite");
      input.setAttribute("aria-describedby", span.id);
      (ancora || input).insertAdjacentElement("afterend", span);
      return span;
    }

    // ---------- ★ MENSAGENS DE ERRO (textos curtos) ----------
    // Cada função recebe o valor do campo e devolve o erro ("" = tudo certo).
    function validarSenha(v) {
      if (!v) return "Crie uma senha";
      if (REGRAS_SENHA.some(r => !r.ok(v))) return "Atenda aos requisitos abaixo";
      // Garantia extra: usa a regra oficial do comum.js
      const falta = senhaFaltando(v);
      if (falta.length > 0) return `A senha precisa ter pelo menos ${listaEmTexto(falta)}`;
      return "";
    }

    const campos = [
      { input: nomeInput, validar: v => v ? "" : "Preencha o nome e sobrenome" },
      {
        input: cpfInput, apenasNumeros: true,
        validar: v => !v ? "Preencha o CPF" : (cpfCadastroValido(v) ? "" : "CPF inválido. Digite os 11 números")
      },
      {
        input: telefoneInput, apenasNumeros: true,
        validar: v => !v ? "Preencha o telefone" : (v.replace(/\D/g, "").length >= 10 ? "" : "Digite o telefone com DDD. Ex: 11912345678")
      },
      { input: emailInput, validar: v => emailValido(v) ? "" : "Digite um e-mail válido. Ex: nome@gmail.com" },
      { input: senhaInput, ancora: envolverSenha, validar: validarSenha },
      {
        input: confirmarInput, confirmacao: true,
        validar: v => !v ? "Confirme a senha" : (v === senhaInput.value.trim() ? "" : "As senhas não coincidem")
      }
    ];
    const campoConfirmar = campos.find(c => c.confirmacao);

    campos.forEach(c => { c.erro = criarErro(c.input, c.ancora); c.tocado = false; });

    // ---------- ★ AVISO GERAL (erros que vêm da API) ----------
    // Aparece embaixo do botão CADASTRAR, no mesmo estilo dos erros dos campos.
    const botaoCadastro = formCadastro.querySelector('button[type="submit"]');
    const erroGeral = document.createElement("span");
    erroGeral.className = "erro-campo erro-geral";
    erroGeral.setAttribute("role", "alert");
    botaoCadastro.insertAdjacentElement("afterend", erroGeral);

    // Mostra ou limpa o erro de um campo. Devolve a mensagem ("" = válido).
    function validarCampo(c) {
      const msg = c.validar(c.input.value.trim());
      c.erro.classList.remove("ok");
      c.erro.textContent = msg;
      if (!msg && c.confirmacao) {
        c.erro.textContent = "✓ As senhas coincidem";
        c.erro.classList.add("ok");
      }
      c.input.classList.toggle("invalido", !!msg);
      c.input.setAttribute("aria-invalid", msg ? "true" : "false");
      return msg;
    }

    function limparCampo(c) {
      c.erro.textContent = "";
      c.erro.classList.remove("ok");
      c.input.classList.remove("invalido");
      c.input.removeAttribute("aria-invalid");
    }

    // ---------- ★ PAINEL DE REQUISITOS DA SENHA ----------
    // Aparece ao clicar no campo, mostra barra de força + 4 itens em grade.
    // Quando todos os itens são atendidos, vira só "✓ Senha forte".
    const painel = document.createElement("div");
    painel.className = "req-senha";
    painel.hidden = true;
    painel.innerHTML =
      '<div class="req-barra" data-nivel="0"><i></i><i></i><i></i><i></i></div>' +
      '<ul class="req-lista">' + REGRAS_SENHA.map(r => `<li>${r.texto}</li>`).join("") + "</ul>" +
      '<div class="req-forte" hidden>✓ Senha forte</div>';
    const campoSenha = campos.find(c => c.input === senhaInput);
    campoSenha.erro.insertAdjacentElement("afterend", painel);

    const barra = painel.querySelector(".req-barra");
    const lista = painel.querySelector(".req-lista");
    const itens = painel.querySelectorAll("li");
    const aviso = painel.querySelector(".req-forte");

    function atualizarPainel() {
      const v = senhaInput.value.trim();
      const atendidas = REGRAS_SENHA.map(r => r.ok(v));
      const total = atendidas.filter(Boolean).length;
      const forte = total === REGRAS_SENHA.length;

      itens.forEach((li, i) => li.classList.toggle("ok", atendidas[i]));
      barra.dataset.nivel = total;
      barra.hidden = forte;
      lista.hidden = forte;
      aviso.hidden = !forte;
      // Só some quando o campo está vazio e sem foco
      painel.hidden = !(v.length > 0 || document.activeElement === senhaInput);
    }

    // ---------- Eventos de cada campo ----------
    campos.forEach(c => {
      // Ao sair do campo: valida (se a pessoa digitou algo)
      c.input.addEventListener("blur", () => {
        if (c.input.value.trim() || c.tocado) {
          c.tocado = true;
          validarCampo(c);
        }
        if (c.input === senhaInput) atualizarPainel();
      });

      // Ao digitar: CPF/telefone só aceitam números; corrige o erro na hora
      c.input.addEventListener("input", () => {
        if (c.apenasNumeros) c.input.value = c.input.value.replace(/\D/g, "");

        if (c.confirmacao && !c.input.value) limparCampo(c);
        else if (c.tocado || c.confirmacao || c.input.classList.contains("invalido")) validarCampo(c);

        if (c.input === senhaInput) {
          atualizarPainel();
          if (confirmarInput.value) validarCampo(campoConfirmar); // reconfere a confirmação
        }
      });
    });

    senhaInput.addEventListener("focus", atualizarPainel);

    // ---------- Envio do formulário ----------
    formCadastro.addEventListener("submit", async function (e) {
      e.preventDefault();
      erroGeral.textContent = "";

      // Valida tudo; foca o primeiro campo com erro
      let primeiroErro = null;
      campos.forEach(c => {
        c.tocado = true;
        if (validarCampo(c) && !primeiroErro) primeiroErro = c;
      });
      atualizarPainel();
      if (primeiroErro) {
        primeiroErro.input.focus();
        return;
      }

      const nome = nomeInput.value.trim();
      const cpf = cpfInput.value.trim();
      const tel = telefoneInput.value.trim();
      const email = emailInput.value.trim();
      const senha = senhaInput.value.trim();

      botaoCadastro.disabled = true; // evita clique duplo

      try {
        // 1) Cria a conta. Formato que a API espera:
        //    { nome, cpf, email, senha, telefone }
        const corpoCadastro = { nome, cpf, email, senha, telefone: tel };
        await apiRequest("CADASTRO", {
          method: "POST",
          body: corpoCadastro,
        });

        // 2) A API não devolve token no cadastro, então entra logo em seguida
        const resposta = await apiRequest("LOGIN", {
          method: "POST",
          body: { email, senha },
        });
        if (resposta && resposta.Token) salvarTokenApi(resposta.Token); // Token com T maiúsculo
      } catch (erro) {
        console.warn(erro.message);
        // Erros que vêm da API (ex: e-mail já cadastrado)
        erroGeral.textContent = mensagemErroApi(erro, "cadastro");
        botaoCadastro.disabled = false;
        return;
      }

      prepararContaDono(email, nome, true);
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ perfil: "DONO" }));
      window.location.href = destinoCompra || "agenda.html";
    });
  }
  // =====================================================================
  // ★ CRIAR CONTA - FIM DO BLOCO ALTERADO
  // =====================================================================



  if (formLogin) {
    formLogin.addEventListener("submit", async function (e) {
      e.preventDefault();

      const emailInput = formLogin.querySelector('input[type="email"]');
      const senhaInput = formLogin.querySelector('input[type="password"]');

      const email = emailInput ? emailInput.value.trim() : "";
      const senha = senhaInput ? senhaInput.value.trim() : "";

      // Validações da tela de entrar
      const erros = [];
      let campoErro = null;
      if (!email) {
        erros.push("Preencha o e-mail.");
        campoErro = emailInput;
      } else if (!emailValido(email)) {
        erros.push("Digite um e-mail válido. Exemplo: nome@gmail.com");
        campoErro = emailInput;
      }
      if (!senha) {
        erros.push("Preencha a senha.");
        if (!campoErro) campoErro = senhaInput;
      } else if (!senhaValida(senha)) {
        erros.push(`A senha precisa ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);
        if (!campoErro) campoErro = senhaInput;
      }
      if (erros.length > 0) {
        mostrarErroForm(formLogin, erros.join("\n"), campoErro);
        return;
      }
      limparErroForm(formLogin);

      // ★ O e-mail do DONO (o último que entrou/cadastrou neste navegador) sempre entra como dono,
      // mesmo que esse mesmo e-mail também tenha sido cadastrado como colaborador.
      const ehDonoConhecido = localStorage.getItem("ultimoEmailDono") === email.toLowerCase();

      // E-mail cadastrado pelo dono para um colaborador: valida a senha
      const credenciais = lerJsonLocal(CHAVE_CREDENCIAIS, {});
      const cred = credenciais[email.toLowerCase()];
      if (cred && !ehDonoConhecido) {
        const hashDigitado = await gerarHashSenha(senha);
        const colabs = lerJsonLocal(CHAVE_COLABORADORES, []);
        const colab = colabs.find(c => c.id === cred.colaboradorId);
        if (hashDigitado !== cred.senhaHash || !colab || colab.ativo === false) {
          mostrarErroForm(formLogin, "E-mail ou senha inválidos.", senhaInput);
          return;
        }
        localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ perfil: "COLABORADOR", colaboradorId: colab.id, nome: colab.nome }));
        window.location.href = "colaborador.html";
        return;
      }

      // Dono: confere e-mail e senha na API
      const botaoLogin = formLogin.querySelector("button");
      if (botaoLogin) botaoLogin.disabled = true;
      let nomeApi = "";
      let respostaApi = null;
      try {
        const resposta = await apiRequest("LOGIN", {
          method: "POST",
          body: { email, senha },
        });
        if (!resposta || !resposta.Token) throw new Error("Erro na API (401) em LOGIN: sem token");
        salvarTokenApi(resposta.Token);
        respostaApi = resposta;
        nomeApi = resposta.Nome || resposta.nome || nomeDoToken(resposta.Token);
      } catch (erro) {
        console.warn(erro.message);
        mostrarErroForm(formLogin, mensagemErroApi(erro, "login"), senhaInput);
        if (botaoLogin) botaoLogin.disabled = false;
        return;
      }

      // ★ Quem entrou é colaborador? (a API aceita o login dele, mas ele NÃO pode cair na conta do dono)
      const perfilApi = perfilInformadoPelaApi(respostaApi);
      const colabLocal = acharColaboradorLocal(email);
      if (perfilApi === "colaborador" || (perfilApi !== "dono" && !ehDonoConhecido && colabLocal)) {
        const colabId = colabLocal ? colabLocal.id : idColaboradorDaApi(respostaApi);
        if (colabId === null || colabId === undefined || (colabLocal && colabLocal.ativo === false)) {
          mostrarErroForm(formLogin, colabLocal ? "E-mail ou senha inválidos." : "Não foi possível abrir a agenda deste colaborador neste navegador. Peça ao dono para conferir o seu cadastro.", senhaInput);
          if (botaoLogin) botaoLogin.disabled = false;
          return;
        }
        // Guarda as credenciais aqui para os próximos logins (sem apagar os dados do dono)
        const credenciaisNovas = lerJsonLocal(CHAVE_CREDENCIAIS, {});
        credenciaisNovas[email.toLowerCase()] = { colaboradorId: colabId, senhaHash: await gerarHashSenha(senha) };
        localStorage.setItem(CHAVE_CREDENCIAIS, JSON.stringify(credenciaisNovas));
        localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ perfil: "COLABORADOR", colaboradorId: colabId, nome: (colabLocal && colabLocal.nome) || nomeApi }));
        window.location.href = "colaborador.html";
        return;
      }

      prepararContaDono(email, nomeApi, false);
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ perfil: "DONO" }));
      window.location.href = destinoCompra || "agenda.html";
    });
  }
}

document.addEventListener("DOMContentLoaded", iniciarAuth);

// Garante que o "Esqueci minha senha" nunca suma do login (carregamento, botão voltar do navegador, etc.) 
    (function () {
        function garantirLinkEsqueci() {
            var form = document.getElementById("form-login");
            if (!form || form.querySelector("#esqueci-senha")) return;

            var link = document.createElement("a");
            link.href = "recuperar-senha.html";
            link.id = "esqueci-senha";
            link.className = "link-esqueci";
            link.textContent = "Esqueci minha senha";

            var botao = form.querySelector("button");
            if (botao) form.insertBefore(link, botao);
            else form.appendChild(link);
        }

        garantirLinkEsqueci();
        document.addEventListener("DOMContentLoaded", garantirLinkEsqueci);
        window.addEventListener("load", garantirLinkEsqueci);
        window.addEventListener("pageshow", garantirLinkEsqueci); // volta pelo botão do navegador

        var formLogin = document.getElementById("form-login");
        if (formLogin) new MutationObserver(garantirLinkEsqueci).observe(formLogin, { childList: true });
    })();