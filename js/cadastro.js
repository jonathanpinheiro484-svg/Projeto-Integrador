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

  if (formCadastro) {
    // Dica de como criar a senha (só na tela de cadastro)
    const senhaCampoCadastro = formCadastro.querySelector('input[type="password"]');
    if (senhaCampoCadastro) {
      const dicaSenha = document.createElement("p");
      dicaSenha.className = "dica-senha";
      dicaSenha.style.cssText = "color:#777; font-size:11px; line-height:1.5; margin:4px 0 0; text-align:left; white-space:pre-line;";
      dicaSenha.textContent =
        "A senha deve ter:\n" +
        `• pelo menos ${SENHA_TAMANHO_MINIMO} caracteres\n` +
        "• pelo menos 1 letra maiúscula\n" +
        "• letras minúsculas \n" +
        "• pelo menos 1 símbolo (ex: @ # $ !)";
      senhaCampoCadastro.insertAdjacentElement("afterend", dicaSenha);
    }

    formCadastro.addEventListener("submit", async function (e) {
      e.preventDefault();

      const nomeInput = document.getElementById("cad-nome");
      const emailInput = document.getElementById("cad-email");
      const senhaInput = document.getElementById("cad-senha");
      const cpfInput = document.getElementById("cad-cpf");
      const telefoneInput = document.getElementById("cad-telefone");

      const nome = nomeInput ? nomeInput.value.trim() : "";
      const email = emailInput ? emailInput.value.trim() : "";
      const senha = senhaInput ? senhaInput.value.trim() : "";
      const cpf = cpfInput ? cpfInput.value.trim(): "";
      const tel = telefoneInput ? telefoneInput.value.trim() : "";
      // Validações da tela de cadastro
      const erros = [];
      let campoErro = null;
      if (!emailValido(email)) {
        erros.push("Digite um e-mail válido. Exemplo: nome@gmail.com");
        campoErro = emailInput;
      }
      const senhaFalta = senhaFaltando(senha);
      if (senhaFalta.length > 0) {
        erros.push(`A senha precisa ter pelo menos ${listaEmTexto(senhaFalta)}.`);
        if (!campoErro) campoErro = senhaInput;
      }
      if (erros.length > 0) {
        mostrarErroForm(formCadastro, erros.join("\n"), campoErro);
        return;
      }
      limparErroForm(formCadastro);

      const botaoCadastro = formCadastro.querySelector("button");
      if (botaoCadastro) botaoCadastro.disabled = true; // evita clique duplo

      try {
        // 1) Cria a conta. Formato que a API espera:
        //    { nome, cpf, email, senha, telefone }
        await apiRequest("CADASTRO", {
          method: "POST",
          body: { nome, cpf, email, senha, telefone: tel },
        });

        // 2) A API não devolve token no cadastro, então entra logo em seguida
        const resposta = await apiRequest("LOGIN", {
          method: "POST",
          body: { email, senha },
        });
        if (resposta && resposta.Token) salvarTokenApi(resposta.Token); // Token com T maiúsculo
      } catch (erro) {
        console.warn(erro.message);
        mostrarErroForm(formCadastro, mensagemErroApi(erro, "cadastro"), null);
        if (botaoCadastro) botaoCadastro.disabled = false;
        return;
      }

      prepararContaDono(email, nome, true);
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ perfil: "DONO" }));
      window.location.href = destinoCompra || "agenda.html";
    });
  }

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
      if (!emailValido(email)) {
        erros.push("Digite um e-mail válido. Exemplo: nome@gmail.com");
        campoErro = emailInput;
      }
      if (!senhaValida(senha)) {
        erros.push(`A senha precisa ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);
        if (!campoErro) campoErro = senhaInput;
      }
      if (erros.length > 0) {
        mostrarErroForm(formLogin, erros.join("\n"), campoErro);
        return;
      }
      limparErroForm(formLogin);

      // E-mail cadastrado pelo dono para um colaborador: valida a senha
      const credenciais = lerJsonLocal(CHAVE_CREDENCIAIS, {});
      const cred = credenciais[email.toLowerCase()];
      if (cred) {
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
      try {
        const resposta = await apiRequest("LOGIN", {
          method: "POST",
          body: { email, senha },
        });
        if (!resposta || !resposta.Token) throw new Error("Erro na API (401) em LOGIN: sem token");
        salvarTokenApi(resposta.Token);
        nomeApi = resposta.Nome || resposta.nome || nomeDoToken(resposta.Token);
      } catch (erro) {
        console.warn(erro.message);
        mostrarErroForm(formLogin, mensagemErroApi(erro, "login"), senhaInput);
        if (botaoLogin) botaoLogin.disabled = false;
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