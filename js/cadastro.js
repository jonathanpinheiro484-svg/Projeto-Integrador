// =====================================================
// LOGIN & CADASTRO
// Usado em: cadastro.html (e login.html)
// Depende do js/comum.js (carregar ANTES deste arquivo).
// =====================================================

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
      // >>> API: criar conta no backend. Exemplo:
      // try {
      //   const resposta = await apiRequest("COLABORADORES", {
      //     method: "POST",
      //     body: { nome, email, senha },
      //   });
      //   if (resposta && resposta.token) salvarTokenApi(resposta.token);
      // } catch (erro) {
      //   alert("Não foi possível criar a conta agora. Tente novamente.");
      //   console.warn(erro.message);
      //   return;
      // }

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

      if (nome) {
        localStorage.setItem("nomeUsuarioCadastrado", nome);
      }
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

      // >>> API: autenticar no backend. Exemplo:
      // try {
      //   const resposta = await apiRequest("LOGIN", {
      //     method: "POST",
      //     body: { email, senha },
      //   });
      //   if (resposta && resposta.token) salvarTokenApi(resposta.token);
      // } catch (erro) {
      //   alert("E-mail ou senha inválidos.");
      //   console.warn(erro.message);
      //   return;
      // }

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
