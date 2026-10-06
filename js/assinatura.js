// =====================================================
// ASSINATURA (compra do plano)
// Usado em: assinatura.html
// Depende do js/comum.js (carregar ANTES deste arquivo).
// =====================================================

// =====================================================
// 3.7 ASSINATURA (assinatura.html) — tela de compra do plano
// Só roda se a página tiver o formulário #form-assinatura.
// Código movido de dentro do assinatura.html, sem alterações na lógica.
// Fica dentro de uma função para as constantes e funções daqui não
// baterem com as que já existem neste arquivo (PAGINA_CADASTRO, CHAVE_SESSAO, etc.).
// =====================================================
function iniciarAssinatura() {
  if (!document.getElementById("form-assinatura")) return; // esta página não é a de assinatura

  // =====================================================
  // CONFIGURAÇÃO — ajuste aqui sem mexer no resto
  // =====================================================
  const PAGINA_PAINEL = "agenda.html";     // página do painel (destino do "Ir para o painel")
  const PAGINA_PLANOS = "planos.html";     // tela de planos (quando entram aqui sem escolher um plano)
  const PAGINA_CADASTRO = "cadastro.html"; // tela de login/cadastro (quando entram aqui sem estar logados)
  const DESCONTO_ANUAL = 0.20;             // 20% de desconto no plano anual
  const CHAVE_ASSINATURA = "assinaturaAtual";
  const CHAVE_SESSAO = "sessaoUsuario";    // a mesma usada pelo js/comum.js e pelo login/cadastro

  // >>> PREÇOS: Básico, Profissional e Completo seguem os valores da tela de Planos (planos.html).
  // O Premium (usado pelo painel) continua com o valor de exemplo: troque pelo valor real.
  const PLANOS = {
    FREE: {
      nome: "Grátis", mensal: 0, duracaoDias: 30,
      itens: ["30 dias de uso", "Até 15 colaboradores", "Agenda simples"]
    },
    BASICO: {
      nome: "Básico", mensal: 39.90,
      itens: ["Agenda", "Cadastro de clientes", "Cadastro de serviços", "Organização de horários"]
    },
    PROFISSIONAL: {
      nome: "Profissional", mensal: 69.90, destaque: "Mais escolhido",
      itens: ["Tudo do plano Básico", "Agenda completa", "Controle financeiro", "Histórico de clientes", "Relatórios"]
    },
    COMPLETO: {
      nome: "Completo", mensal: 99.90,
      itens: ["Tudo do plano Profissional", "Controle de equipe", "Controle de comissões", "Controle de estoque", "Recursos adicionais"]
    },
    PREMIUM: {
      nome: "Premium", mensal: 59.90, destaque: "Mais completo",
      itens: ["Colaboradores ilimitados", "Relatórios financeiros", "Suporte prioritário"]
    }
  };

  // =====================================================
  // ESTADO
  // =====================================================
  let planoEscolhido = "PREMIUM";
  let ciclo = "mensal";

  const $ = (id) => document.getElementById(id);
  const moeda = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const metodoAtual = () => document.querySelector('input[name="metodo"]:checked').value;

  // Preço do plano no ciclo escolhido: { total, porMes, desconto }
  function calcularPreco(chave, cicloEscolhido) {
    const mensal = PLANOS[chave].mensal;
    if (cicloEscolhido === "anual") {
      const cheio = mensal * 12;
      const desconto = cheio * DESCONTO_ANUAL;
      return { total: cheio - desconto, porMes: (cheio - desconto) / 12, desconto };
    }
    return { total: mensal, porMes: mensal, desconto: 0 };
  }

  function dataRenovacao(chave, cicloEscolhido) {
    const d = new Date();
    if (chave === "FREE") d.setDate(d.getDate() + PLANOS.FREE.duracaoDias);
    else if (cicloEscolhido === "anual") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }

  // =====================================================
  // RENDERIZAÇÃO
  // =====================================================
  function atualizarResumo() {
    const p = PLANOS[planoEscolhido];
    const gratis = planoEscolhido === "FREE";
    const preco = calcularPreco(planoEscolhido, ciclo);
    const subtotal = gratis ? 0 : p.mensal * (ciclo === "anual" ? 12 : 1);

    $("titulo-pagina").textContent = "Assinar plano " + p.nome;
    $("res-plano").textContent = p.nome;
    $("res-ciclo").textContent = gratis ? "30 dias grátis" : (ciclo === "anual" ? "Anual" : "Mensal");
    $("res-subtotal").textContent = moeda(subtotal);
    $("linha-desconto").hidden = !(preco.desconto > 0);
    $("res-desconto").textContent = "- " + moeda(preco.desconto);
    $("res-renovacao").textContent = gratis ? "Nenhuma" : dataRenovacao(planoEscolhido, ciclo).toLocaleDateString("pt-BR");
    $("res-total").textContent = moeda(preco.total);

    $("btn-assinar").textContent = gratis ? "Ativar plano grátis" : "Assinar " + p.nome + " · " + moeda(preco.total);
    $("aviso-cobranca").textContent = gratis
      ? "Sem cobrança. Ao fim dos 30 dias, escolha um plano pago para continuar."
      : (ciclo === "anual" ? "Cobrança única por ano. Você pode cancelar quando quiser." : "Cobrança mensal. Você pode cancelar quando quiser.");

    // Plano grátis não precisa de pagamento
    $("bloco-pagamento").hidden = gratis;
  }

  function atualizarTela() {
    atualizarResumo();
    limparErro();
  }

  // =====================================================
  // MÁSCARAS E VALIDAÇÕES
  // =====================================================
  function soDigitos(v) { return v.replace(/\D/g, ""); }

  function mascaraCpf(v) {
    const d = soDigitos(v).slice(0, 11);
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  function mascaraCartao(v) { return soDigitos(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "); }
  function mascaraValidade(v) {
    const d = soDigitos(v).slice(0, 4);
    return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
  }

  function cpfValido(cpf) {
    const c = soDigitos(cpf);
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    for (let t = 9; t < 11; t++) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(c[t])) return false;
    }
    return true;
  }

  // Algoritmo de Luhn: confere se o número do cartão é válido
  function cartaoValido(numero) {
    const n = soDigitos(numero);
    if (n.length < 13 || n.length > 16) return false;
    let soma = 0, alternar = false;
    for (let i = n.length - 1; i >= 0; i--) {
      let d = Number(n[i]);
      if (alternar) { d *= 2; if (d > 9) d -= 9; }
      soma += d;
      alternar = !alternar;
    }
    return soma % 10 === 0;
  }

  function validadeValida(v) {
    const m = v.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return false;
    const mes = Number(m[1]), ano = 2000 + Number(m[2]);
    if (mes < 1 || mes > 12) return false;
    return new Date(ano, mes, 1) > new Date(); // vale até o fim do mês de validade
  }

  const NOME_REGEX = /^\p{L}{2,}(\s+\p{L}{2,})+$/u; // nome no cartão (aceita MAIÚSCULAS)
  // Nome completo sem abreviar: cada palavra começa com maiúscula e tem 2+ letras
  // (aceita "da", "de", "do", "das", "dos", "e" em minúsculo no meio). Mesma regra do cadastro de colaborador.
  const NOME_COMPLETO_REGEX = /^\p{Lu}\p{Ll}+(\s(da|de|do|das|dos|e|\p{Lu}\p{Ll}+))*\s\p{Lu}\p{Ll}+$/u;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validarFormulario() {
    const erros = [];
    let primeiro = null;
    const falhar = (msg, id) => { erros.push(msg); if (!primeiro) primeiro = $(id); };

    const nome = $("ass-nome").value.trim();
    $("ass-nome").value = nome;
    if (!nome) falhar("Preencha o nome completo.", "ass-nome");
    else if (nome.length < 5 || nome.length > 60) falhar("O nome deve ter de 5 a 60 caracteres.", "ass-nome");
    else if (/[^\p{L}\s]/u.test(nome)) falhar("O nome deve ter apenas letras (sem números, símbolos ou pontuação).", "ass-nome");
    else if (!NOME_COMPLETO_REGEX.test(nome)) falhar("Digite o nome completo, sem abreviar: nome e sobrenome, cada um começando com letra maiúscula. Exemplo: Fernanda Lima", "ass-nome");

    const email = $("ass-email").value.trim();
    if (!email) falhar("Preencha o e-mail.", "ass-email");
    else if (!EMAIL_REGEX.test(email)) falhar("Digite um e-mail válido. Exemplo: nome@gmail.com", "ass-email");

    if (!$("ass-cpf").value.trim()) falhar("Preencha o CPF.", "ass-cpf");
    else if (!cpfValido($("ass-cpf").value)) falhar("O CPF informado não é válido.", "ass-cpf");

    if (planoEscolhido !== "FREE" && metodoAtual() === "cartao") {
      const numeroCartao = $("cc-numero").value.trim();
      if (!numeroCartao) falhar("Preencha o número do cartão.", "cc-numero");
      else if (/[^\d\s]/.test(numeroCartao)) falhar("O número do cartão deve ter apenas números.", "cc-numero");
      else if (soDigitos(numeroCartao).length < 13 || soDigitos(numeroCartao).length > 16) falhar("O número do cartão deve ter de 13 a 16 números.", "cc-numero");
      else if (!cartaoValido(numeroCartao)) falhar("O número do cartão não é válido. Confira os números digitados.", "cc-numero");
      const nomeCartao = $("cc-nome").value.trim();
      if (!nomeCartao) falhar("Preencha o nome impresso no cartão.", "cc-nome");
      else if (/[^\p{L}\s]/u.test(nomeCartao)) falhar("O nome no cartão deve ter apenas letras (sem números, símbolos ou pontuação).", "cc-nome");
      else if (!NOME_REGEX.test(nomeCartao)) falhar("Digite o nome como está impresso no cartão, com nome e sobrenome.", "cc-nome");
      if (!validadeValida($("cc-validade").value)) falhar("Validade inválida ou vencida. Use o formato MM/AA.", "cc-validade");
      if (!/^\d{3,4}$/.test($("cc-cvv").value)) falhar("O CVV deve ter 3 ou 4 números.", "cc-cvv");
    }
    return { erros, primeiro };
  }

  function mostrarErro(msg, campo) {
    const el = $("erro-form");
    el.textContent = msg;
    el.hidden = false;
    if (campo) campo.focus();
  }
  function limparErro() { $("erro-form").hidden = true; }

  // =====================================================
  // EVENTOS
  // =====================================================
  document.querySelectorAll('input[name="metodo"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const pix = metodoAtual() === "pix";
      $("painel-pix").hidden = !pix;
      $("painel-cartao").hidden = pix;
      document.querySelectorAll(".metodo").forEach((l) => l.classList.toggle("sel", l.querySelector("input").checked));
      limparErro();
    });
  });

  // Nome: só aceita letras e espaços (descarta o resto enquanto a pessoa digita)
  $("ass-nome").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^\p{L}\s]/gu, ""); });
  // Nome no cartão: só aceita letras e espaços
  $("cc-nome").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^\p{L}\s]/gu, ""); });
  $("ass-cpf").addEventListener("input", (e) => { e.target.value = mascaraCpf(e.target.value); });
  $("cc-numero").addEventListener("input", (e) => { e.target.value = mascaraCartao(e.target.value); });
  $("cc-validade").addEventListener("input", (e) => { e.target.value = mascaraValidade(e.target.value); });
  $("cc-cvv").addEventListener("input", (e) => { e.target.value = soDigitos(e.target.value); });
  $("form-assinatura").addEventListener("input", limparErro);

  $("btn-copiar-pix").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("pix-codigo").value);
      $("btn-copiar-pix").textContent = "Copiado";
    } catch (e) {
      $("pix-codigo").select();
    }
    setTimeout(() => { $("btn-copiar-pix").textContent = "Copiar"; }, 2000);
  });

  $("form-assinatura").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { erros, primeiro } = validarFormulario();
    if (erros.length > 0) { mostrarErro(erros.join("\n"), primeiro); return; }
    limparErro();

    const gratis = planoEscolhido === "FREE";
    const preco = calcularPreco(planoEscolhido, ciclo);
    const metodo = gratis ? null : metodoAtual();
    const validoAte = dataRenovacao(planoEscolhido, ciclo);

    const btn = $("btn-assinar");
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Processando...";

    // >>> API: aqui entra o pagamento de verdade. Os dados do cartão NUNCA devem
    // ser guardados no front nem passar pelo servidor de vocês: use o checkout /
    // tokenização do gateway escolhido (Mercado Pago, Stripe, Pagar.me, etc.) e
    // envie só o token + o plano para o backend PHP. Exemplo:
    // const resp = await fetch("/api/assinaturas", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ plano: planoEscolhido, ciclo, metodo, token })
    // });
    // Simulação: o cartão aprova na hora; o Pix leva alguns segundos para "confirmar".
    // Com o gateway real, o Pix fica "pendente" até o banco confirmar o pagamento (webhook).
    if (metodo === "pix") btn.textContent = "Aguardando confirmação do Pix...";
    await new Promise((r) => setTimeout(r, metodo === "pix" ? 3500 : 1500));

    // Só guarda dados do pedido. Nunca número, validade ou CVV do cartão.
    localStorage.setItem(CHAVE_ASSINATURA, JSON.stringify({
      plano: planoEscolhido,
      status: "aprovada", // o painel (agenda) só libera o plano quando está aprovada
      ciclo: gratis ? "teste" : ciclo,
      metodo,
      total: preco.total,
      contratadoEm: new Date().toISOString(),
      validoAte: validoAte.toISOString()
    }));

    btn.disabled = false;
    btn.textContent = textoOriginal;
    mostrarSucesso(gratis, preco.total, metodo, validoAte);
  });

  function mostrarSucesso(gratis, total, metodo, validoAte) {
    const p = PLANOS[planoEscolhido];
    $("suc-titulo").textContent = gratis ? "Plano grátis ativado" : "Pagamento aprovado";
    $("suc-sub").textContent = gratis
      ? "Você tem 30 dias para testar o sistema."
      : "Seu plano " + p.nome + " já está ativo.";
    $("suc-plano").textContent = p.nome;
    $("suc-ciclo").textContent = gratis ? "30 dias grátis" : (ciclo === "anual" ? "Anual" : "Mensal");
    $("suc-total").textContent = moeda(total);
    $("suc-rotulo-data").textContent = gratis ? "Teste até" : "Próxima cobrança";
    $("suc-data").textContent = validoAte.toLocaleDateString("pt-BR");
    $("etapa-checkout").hidden = true;
    $("etapa-sucesso").hidden = false;
    window.scrollTo(0, 0);

    // Aprovado: volta para a agenda sozinho, já com o plano ativo (o botão leva na hora)
    let segundos = 4;
    const aviso = $("suc-redireciona");
    const mostrarContagem = () => { aviso.textContent = "Abrindo a sua agenda em " + segundos + "s..."; };
    mostrarContagem();
    const timer = setInterval(() => {
      segundos--;
      if (segundos <= 0) { clearInterval(timer); window.location.href = PAGINA_PAINEL; return; }
      mostrarContagem();
    }, 1000);
  }

  // =====================================================
  // INICIALIZAÇÃO
  // =====================================================
  // Seta "voltar/avançar" do navegador: sai da conta na hora (e a trava abaixo manda para o cadastro/login)
  function sairDaConta() { localStorage.removeItem(CHAVE_SESSAO); }
  const navegacaoAtual = performance.getEntriesByType("navigation")[0];
  if (navegacaoAtual && navegacaoAtual.type === "back_forward") sairDaConta();
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) { sairDaConta(); window.location.reload(); }
  });

  $("btn-ir-painel").href = PAGINA_PAINEL;
  $("pix-codigo").value = "00020126-SIMULACAO-" + Math.random().toString(36).slice(2, 12).toUpperCase();

  // O plano vem da tela de Planos: assinatura.html?plano=profissional
  const params = new URLSearchParams(window.location.search);
  const planoUrl = (params.get("plano") || "").toUpperCase();
  let podeContinuar = true;

  if (!PLANOS[planoUrl] || planoUrl === "FREE") {
    // Sem plano escolhido: volta para a tela de planos, onde o plano é escolhido
    podeContinuar = false;
    window.location.replace(PAGINA_PLANOS);
  } else {
    planoEscolhido = planoUrl;

    // Sem cadastro/login: vai para a tela de cadastro e, depois de cadastrar, volta aqui já com o plano
    let sessao = null;
    try { sessao = JSON.parse(localStorage.getItem(CHAVE_SESSAO)); } catch (e) { sessao = null; }
    if (!sessao || sessao.perfil !== "DONO") {
      podeContinuar = false;
      window.location.replace(PAGINA_CADASTRO + "?modo=cadastro&plano=" + planoUrl.toLowerCase());
    }
  }

  // Botão "voltar" do topo
  if (params.get("origem") === "painel") {
    // Veio da agenda: volta para a agenda (continua logado)
    $("link-voltar").textContent = "Voltar à agenda";
    $("link-voltar").href = PAGINA_PAINEL;
  } else {
    // Veio da tela de planos do site: sai da conta e volta para o login, mantendo o plano escolhido
    $("link-voltar").textContent = "Voltar ao login";
    $("link-voltar").href = PAGINA_CADASTRO + "?modo=entrar&plano=" + planoUrl.toLowerCase();
    $("link-voltar").addEventListener("click", sairDaConta);
  }

  if (podeContinuar) atualizarTela();
}

document.addEventListener("DOMContentLoaded", iniciarAssinatura);
