// =====================================================
// PÁGINA INICIAL
// Usado em: index.html
// Depende do js/comum.js (carregar ANTES deste arquivo).
// Aviso de cookies + carrossel de depoimentos.
// =====================================================

// =====================================================
// 4. LANDING PAGE (home.html — aviso de cookies)
// Só roda se a página tiver o elemento #aviso-cookies.
// =====================================================
function iniciarLanding() {
  const avisoCookies = document.getElementById("aviso-cookies");
  if (!avisoCookies) return; // esta página não tem aviso de cookies

  const btnAceitar = document.getElementById("btn-aceitar-cookies");
  const btnRecusar = document.getElementById("btn-recusar-cookies");

  const CHAVE_PREFERENCIA = "preferenciaCookies"; // "aceito" | "recusado"

  const preferenciaSalva = localStorage.getItem(CHAVE_PREFERENCIA);
  if (!preferenciaSalva) {
    avisoCookies.hidden = false;
  }

  function esconderAvisoCookies() {
    avisoCookies.hidden = true;
  }

  if (btnAceitar) {
    btnAceitar.addEventListener("click", () => {
      localStorage.setItem(CHAVE_PREFERENCIA, "aceito");

      // >>> API: se vocês tiverem analytics/marketing que só deve
      // rodar com consentimento, é aqui que ele deve ser iniciado.
      // if (window.iniciarAnalytics) window.iniciarAnalytics();

      esconderAvisoCookies();
    });
  }

  if (btnRecusar) {
    btnRecusar.addEventListener("click", () => {
      localStorage.setItem(CHAVE_PREFERENCIA, "recusado");
      esconderAvisoCookies();
    });
  }
}

document.addEventListener("DOMContentLoaded", iniciarLanding);

// =======================================================
// Carrosel - Página Index (NÃO MEXER) - DEPOIMENTOS
// =======================================================

const track = document.querySelector('.carousel-track');
const btnPrev = document.querySelector('.carousel-btn.prev');
const btnNext = document.querySelector('.carousel-btn.next');

function passo() {
  const card = track.querySelector('.card');
  return card.getBoundingClientRect().width + 20; // 20 = gap
}

function atualizarBotoes() {
  btnPrev.disabled = track.scrollLeft <= 0;
  btnNext.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
}

btnPrev.addEventListener('click', () => track.scrollBy({ left: -passo() }));
btnNext.addEventListener('click', () => track.scrollBy({ left: passo() }));
track.addEventListener('scroll', atualizarBotoes);
window.addEventListener('resize', atualizarBotoes);
atualizarBotoes();
