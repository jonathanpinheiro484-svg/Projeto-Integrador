// =====================================================
// RECUPERAR SENHA
// Usado em: recuperar-senha.html
// Depende do js/comum.js (carregar ANTES deste arquivo).
// Os blocos internos já tinham as próprias funções de validação.
// =====================================================

// =====================================================
// RECUPERAR SENHA (recuperar-senha.html) — VALIDAÇÕES
//
// Arquivo independente: tem as próprias funções de validação (não depende das do comum.js).
// Etapas da tela:
//   1) e-mail   2) código de 6 dígitos   3) nova senha
//
// As regras da senha são as mesmas da tela de cadastro:
// mínimo 8 caracteres, 1 maiúscula, letras minúsculas e 1 símbolo.
// =====================================================
document.addEventListener("DOMContentLoaded", function () {
  const formEmail = document.getElementById("etapa-email");
  const formCodigo = document.getElementById("etapa-codigo");
  const formSenha = document.getElementById("etapa-senha");
  if (!formEmail || !formCodigo || !formSenha) return; // esta página não é a de recuperar senha

  const campoEmail = document.getElementById("rec-email");
  const campoCodigo = document.getElementById("rec-codigo");
  const campoSenha = document.getElementById("rec-senha");
  const campoSenha2 = document.getElementById("rec-senha2");

  const EMAIL_MAX = 80;
  const CODIGO_TAMANHO = 6;
  const SENHA_MIN = 8;
  const PAGINA_LOGIN = "cadastro.html?modo=entrar";

  let emailRecuperacao = "";
  let codigoDigitado = "";

  // ---------- Funções de apoio ----------

  // Aceita: texto@dominio.ext (sem espaços, com @ e um ponto no domínio)
  function emailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  // Devolve o que ainda está faltando na senha
  function senhaFaltando(senha) {
    const faltando = [];
    if (senha.length < SENHA_MIN) faltando.push(`${SENHA_MIN} caracteres`);
    if (!/\p{Lu}/u.test(senha)) faltando.push("1 letra maiúscula");
    if (!/\p{Ll}/u.test(senha)) faltando.push("letras minúsculas");
    if (!/[^\p{L}\p{N}\s]/u.test(senha)) faltando.push("1 símbolo (ex: @ # $ !)");
    return faltando;
  }

  function listaEmTexto(itens) {
    if (itens.length <= 1) return itens.join("");
    return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
  }

  // Mensagens dentro da própria tela (sem alert / sem botão OK)
  function mostrarMsg(idMsg, texto, tipo, campo) {
    const el = document.getElementById(idMsg);
    if (!el) return;
    el.textContent = texto;
    el.className = "msg " + tipo; // "erro" ou "ok"
    el.style.cssText = "display:block; font-size:12px; white-space:pre-line; color:" +
      (tipo === "ok" ? "#2e7d32" : "#e74c3c") + ";";
    if (campo) campo.focus();
  }

  function mostrarErro(idMsg, texto, campo) {
    mostrarMsg(idMsg, texto, "erro", campo);
  }

  function limparMsg(idMsg) {
    const el = document.getElementById(idMsg);
    if (!el) return;
    el.textContent = "";
    el.style.display = "none";
  }

  // Mostra só a etapa pedida
  function mostrarEtapa(form) {
    [formEmail, formCodigo, formSenha].forEach(function (f) {
      const ativa = f === form;
      f.classList.toggle("ativa", ativa);
      f.hidden = !ativa;
    });
  }

  // A mensagem de erro some assim que a pessoa volta a digitar
  formEmail.addEventListener("input", function () { limparMsg("msg-email"); });
  formCodigo.addEventListener("input", function () { limparMsg("msg-codigo"); });
  formSenha.addEventListener("input", function () { limparMsg("msg-senha"); });

  // ---------- Etapa 1: e-mail ----------
  formEmail.addEventListener("submit", function (e) {
    e.preventDefault();

    campoEmail.value = campoEmail.value.trim();
    const email = campoEmail.value;

    if (!email) {
      mostrarErro("msg-email", "Preencha o e-mail.", campoEmail);
      return;
    }
    if (email.length > EMAIL_MAX) {
      mostrarErro("msg-email", `O e-mail pode ter no máximo ${EMAIL_MAX} caracteres.`, campoEmail);
      return;
    }
    if (!emailValido(email)) {
      mostrarErro("msg-email", "Digite um e-mail válido. Exemplo: nome@gmail.com", campoEmail);
      return;
    }
    limparMsg("msg-email");

    emailRecuperacao = email.toLowerCase();

    // >>> API: pedir ao backend que envie o código para o e-mail.
    // Se o e-mail não existir, mostrar: mostrarErro("msg-email", "E-mail não cadastrado.", campoEmail);
    // try {
    //   const resp = await fetch(API_URL + "/recuperar-senha", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ email: emailRecuperacao })
    //   });
    // } catch (erro) { ... }

    document.getElementById("email-destino").textContent = emailRecuperacao;
    mostrarEtapa(formCodigo);
    campoCodigo.focus();
  });

  // ---------- Etapa 2: código ----------

  // Só aceita números e no máximo 6 dígitos (letras e símbolos são removidos na hora)
  campoCodigo.addEventListener("input", function () {
    campoCodigo.value = campoCodigo.value.replace(/\D/g, "").slice(0, CODIGO_TAMANHO);
  });

  formCodigo.addEventListener("submit", function (e) {
    e.preventDefault();

    const codigo = campoCodigo.value.trim();

    if (!codigo) {
      mostrarErro("msg-codigo", "Digite o código que enviamos para o seu e-mail.", campoCodigo);
      return;
    }
    if (codigo.length !== CODIGO_TAMANHO) {
      mostrarErro("msg-codigo", `O código tem ${CODIGO_TAMANHO} números. Confira o e-mail e digite novamente.`, campoCodigo);
      return;
    }
    limparMsg("msg-codigo");

    codigoDigitado = codigo;

    // >>> API: o backend confere se o código está certo e dentro da validade.
    // Se estiver errado ou expirado, mostrar: mostrarErro("msg-codigo", "Código incorreto ou expirado.", campoCodigo);

    mostrarEtapa(formSenha);
    campoSenha.focus();
  });

  // Reenviar código
  const btnReenviar = document.getElementById("reenviar-codigo");
  if (btnReenviar) {
    btnReenviar.addEventListener("click", function () {
      campoCodigo.value = "";

      // >>> API: pedir ao backend um novo código para emailRecuperacao.

      mostrarMsg("msg-codigo", "Enviamos um novo código para o seu e-mail.", "ok", campoCodigo);
    });
  }

  // ---------- Etapa 3: nova senha ----------
  formSenha.addEventListener("submit", function (e) {
    e.preventDefault();

    const senha = campoSenha.value.trim();
    const confirmar = campoSenha2.value.trim();

    const erros = [];
    let campoErro = null;

    // Nova senha: obrigatória e com as regras do cadastro
    if (!senha) {
      erros.push("Preencha a nova senha.");
      campoErro = campoSenha;
    } else {
      const faltando = senhaFaltando(senha);
      if (faltando.length > 0) {
        erros.push(`A senha precisa ter pelo menos ${listaEmTexto(faltando)}.`);
        campoErro = campoSenha;
      }
    }

    // Confirmar senha: obrigatória e igual à nova senha
    if (!confirmar) {
      erros.push("Confirme a nova senha.");
      if (!campoErro) campoErro = campoSenha2;
    } else if (confirmar !== senha) {
      erros.push("As senhas não coincidem. Digite a mesma senha nos dois campos.");
      if (!campoErro) campoErro = campoSenha2;
    }

    if (erros.length > 0) {
      mostrarErro("msg-senha", erros.join("\n"), campoErro);
      return;
    }
    limparMsg("msg-senha");

    // >>> API: enviar ao backend { email: emailRecuperacao, codigo: codigoDigitado, novaSenha: senha }
    // Se der erro, mostrar: mostrarErro("msg-senha", "Não foi possível alterar a senha.");

    const botao = formSenha.querySelector('button[type="submit"]');
    if (botao) botao.disabled = true;
    mostrarMsg("msg-senha", "Senha alterada com sucesso! Voltando para o login...", "ok");
    setTimeout(function () {
      window.location.href = PAGINA_LOGIN;
    }, 2000);
  });
});
