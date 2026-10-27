// =====================================================
// PLANOS
// Usado em: planos.html
// Depende do js/comum.js (carregar ANTES deste arquivo).
// =====================================================

// =====================================================
// 2.7 PLANOS (planos.html)
// Só roda se a página tiver o elemento .planos-grade.
// Ao escolher um plano a pessoa SEMPRE passa pelo login/cadastro antes da compra:
//   - já tem conta neste navegador → tela de login (modo=entrar);
//   - não tem conta → tela de cadastro (modo=cadastro);
// e, depois de entrar/cadastrar, é levada para a tela de compra desse plano.
// =====================================================
function iniciarPlanos() {
  const grade = document.querySelector(".planos-grade");
  if (!grade) return; // esta página não é a de planos

  grade.querySelectorAll("[data-plano]").forEach(botao => {
    botao.addEventListener("click", function (e) {
      e.preventDefault();
      const plano = this.dataset.plano;

      // Nunca vai direto para a compra: a pessoa sempre passa pelo login/cadastro.
      // Quem já criou conta neste navegador vai para o login; quem não criou, para o cadastro.
      localStorage.removeItem(CHAVE_SESSAO);
      const temConta = !!localStorage.getItem("nomeUsuarioCadastrado");
      const modo = temConta ? "entrar" : "cadastro";

      // Plano Grátis não tem tela de compra: cria a conta (ou entra) e cai direto na agenda,
      // onde o teste de 30 dias começa a contar. Por isso não manda "&plano=" na URL.
      if (plano === "gratis") {
        window.location.href = `${PAGINA_CADASTRO}?modo=${modo}`;
        return;
      }
      window.location.href = `${PAGINA_CADASTRO}?modo=${modo}&plano=${plano}`;
    });
  });
}

document.addEventListener("DOMContentLoaded", iniciarPlanos);