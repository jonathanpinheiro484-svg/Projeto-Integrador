// =====================================================
// SCRIPT ÚNICO — GESTÃO INTEGRADA PRO
// Este arquivo reúne todo o JavaScript do site: configuração de
// API, dashboard (agenda/financeiro/administração/planos), tela
// de login/cadastro e a landing page (aviso de cookies).
//
// Cada bloco só é ativado se a página atual tiver o elemento
// "âncora" daquela tela — então dá pra incluir este mesmo arquivo
// em TODAS as páginas do site sem risco de erro nas que não usam
// aquele pedaço (ex: a tela "Sobre" não roda nada, pois não tem
// nenhuma das âncoras abaixo).
//
// Inclua assim, no final do <body> de cada página:
//   <script src="script.js"></script>
// =====================================================


// =====================================================
// 1. CONFIGURAÇÃO DA API (usado por todas as telas que falam com o backend)
// Troque BASE_URL pela URL real do backend de vocês.
// =====================================================
const API_CONFIG = {
  BASE_URL: "https://SEU_BACKEND_AQUI.com/api",

  ENDPOINTS: {
    LOGIN: "/auth/login",
    COLABORADORES: "/colaboradores",
    AGENDAMENTOS: "/agendamentos",
    FINANCEIRO: "/financeiro",
    CONTRATOS: "/contratos",
    PLANO: "/plano",
  },

  token: localStorage.getItem("apiToken") || null,
};

async function apiRequest(endpointKey, options = {}, sufixoUrl = "") {
  const caminho = API_CONFIG.ENDPOINTS[endpointKey];
  if (!caminho) throw new Error(`Endpoint "${endpointKey}" não configurado em API_CONFIG.`);

  const url = `${API_CONFIG.BASE_URL}${caminho}${sufixoUrl}`;

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (API_CONFIG.token) {
    headers["Authorization"] = `Bearer ${API_CONFIG.token}`;
  }

  const resposta = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "");
    throw new Error(`Erro na API (${resposta.status}) em ${endpointKey}: ${texto}`);
  }

  const contentType = resposta.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return resposta.json();
  }
  return null;
}

function salvarTokenApi(token) {
  API_CONFIG.token = token;
  localStorage.setItem("apiToken", token);
}

// --- LOGIN DE COLABORADORES (simulação no front até o backend PHP existir) ---
// O dono cadastra e-mail + senha do colaborador na Administração; depois o
// colaborador entra em login.html com esses dados.
// IMPORTANTE: quando o backend existir, a validação de e-mail/senha deve ser
// feita LÁ (PHP + password_hash), e estas chaves do localStorage saem.
const CHAVE_COLABORADORES = "colaboradoresCadastrados"; // lista de colaboradores
const CHAVE_CREDENCIAIS = "credenciaisColaboradores";   // { email: { colaboradorId, senhaHash } }
const CHAVE_SESSAO = "sessaoUsuario";                   // { perfil, colaboradorId?, nome? }
const CHAVE_AGENDAMENTOS = "agendamentosSalvos";        // lista de agendamentos (dono e colaboradores veem os mesmos)

function lerJsonLocal(chave, padrao) {
  try {
    const valor = JSON.parse(localStorage.getItem(chave));
    return valor === null || valor === undefined ? padrao : valor;
  } catch (erro) {
    return padrao;
  }
}

function salvarColaboradoresLocal(lista) {
  localStorage.setItem(CHAVE_COLABORADORES, JSON.stringify(lista));
}

function salvarAgendamentosLocal(lista) {
  localStorage.setItem(CHAVE_AGENDAMENTOS, JSON.stringify(lista));
}

// --- VALIDAÇÕES DE FORMULÁRIO ---
const SENHA_TAMANHO_MINIMO = 8;

// Aceita: texto@dominio.ext (sem espaços, com @ e um ponto no domínio)
function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function senhaValida(senha) {
  return typeof senha === "string" && senha.length >= SENHA_TAMANHO_MINIMO;
}

// Regras da senha na tela de CADASTRO: devolve o que ainda está faltando
// (mínimo 8 caracteres, 1 maiúscula, 1 minúscula e 1 símbolo; número não é obrigatório)
function senhaFaltando(senha) {
  const faltando = [];
  if (senha.length < SENHA_TAMANHO_MINIMO) faltando.push(`${SENHA_TAMANHO_MINIMO} caracteres`);
  if (!/\p{Lu}/u.test(senha)) faltando.push("1 letra maiúscula");
  if (!/\p{Ll}/u.test(senha)) faltando.push("1 letra minúscula");
  if (!/[^\p{L}\p{N}\s]/u.test(senha)) faltando.push("1 símbolo (ex: @ # $ !)");
  return faltando;
}

function listaEmTexto(itens) {
  if (itens.length <= 1) return itens.join("");
  return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
}

// Mostra a mensagem de erro dentro do próprio formulário (sem alert / sem botão OK).
// A mensagem some sozinha assim que a pessoa volta a digitar.
function mostrarErroForm(form, mensagem, campo) {
  let aviso = form.querySelector(".erro-form");
  if (!aviso) {
    aviso = document.createElement("p");
    aviso.className = "erro-form";
    aviso.setAttribute("role", "alert");
    aviso.style.cssText = "color:#e74c3c; font-size:12px; margin:6px 0 0; text-align:center; white-space:pre-line;";
    const linhaBotoes = form.querySelector(".form-botoes");
    const botao = form.querySelector("button");
    if (linhaBotoes && linhaBotoes.parentNode === form) form.insertBefore(aviso, linhaBotoes);
    else if (botao && botao.parentNode === form) form.insertBefore(aviso, botao);
    else form.appendChild(aviso);
    form.addEventListener("input", () => limparErroForm(form));
  }
  aviso.textContent = mensagem;
  aviso.style.display = "block";
  if (campo) campo.focus();
}

function limparErroForm(form) {
  const aviso = form.querySelector(".erro-form");
  if (aviso) aviso.style.display = "none";
}

// Nunca guarda a senha em texto puro: guarda só o hash SHA-256.
async function gerarHashSenha(senha) {
  if (window.crypto && window.crypto.subtle) {
    const dados = new TextEncoder().encode(senha);
    const buffer = await window.crypto.subtle.digest("SHA-256", dados);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback para navegadores/contextos sem crypto.subtle
  return btoa(unescape(encodeURIComponent(senha)));
}


// =====================================================
// VALIDAÇÕES — CADASTRO DE COLABORADOR E NOVO AGENDAMENTO
// Cada função devolve { erros: [mensagens], campoErro: primeiro campo com erro }.
// As mensagens aparecem dentro do próprio formulário (mostrarErroForm).
// =====================================================
const COLAB_NOME_MIN = 5, COLAB_NOME_MAX = 60;
const COLAB_CARGO_MIN = 3, COLAB_CARGO_MAX = 40;
const COLAB_EMAIL_MAX = 80;
const COLAB_SENHA_MAX = 20;
const AGEND_CLIENTE_MIN = 3, AGEND_CLIENTE_MAX = 60;
const AGEND_SERVICO_MIN = 3, AGEND_SERVICO_MAX = 60;
const AGEND_HORA_MIN = 7 * 60;          // 07:00
const AGEND_HORA_MAX = 14 * 60 + 45;    // 14:45
const AGEND_DURACAO_MIN = 15, AGEND_DURACAO_MAX = 240;

// Nome completo sem abreviar: cada palavra começa com maiúscula e tem 2+ letras
// (aceita "da", "de", "do", "das", "dos", "e" em minúsculo no meio).
const NOME_COMPLETO_REGEX = /^\p{Lu}\p{Ll}+(\s(da|de|do|das|dos|e|\p{Lu}\p{Ll}+))*\s\p{Lu}\p{Ll}+$/u;
// Nome do cliente: letras, espaços, apóstrofo e hífen
const NOME_CLIENTE_REGEX = /^\p{L}[\p{L}' -]+$/u;

function criarColetorErros() {
  const erros = [];
  let campoErro = null;
  return {
    erros,
    falhar(mensagem, idCampo) {
      erros.push(mensagem);
      if (!campoErro && idCampo) campoErro = document.getElementById(idCampo);
    },
    resultado() { return { erros, campoErro }; }
  };
}

function dataHojeISO() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
}

function validarNovoColaborador() {
  const coletor = criarColetorErros();
  const campoNome = document.getElementById("colab-nome");
  const campoCargo = document.getElementById("colab-cargo");
  const campoEmail = document.getElementById("colab-email");
  const campoSenha = document.getElementById("colab-senha");
  const campoSenhaConfirmar = document.getElementById("colab-senha-confirmar");
  const campoCor = document.getElementById("colab-cor");

  // Tira espaços do começo/fim antes de validar e de salvar
  campoNome.value = campoNome.value.trim();
  campoCargo.value = campoCargo.value.trim();
  campoEmail.value = campoEmail.value.trim();
  const nome = campoNome.value;
  const cargo = campoCargo.value;
  const email = campoEmail.value;
  const senha = campoSenha.value;

  // Nome: obrigatório, completo (sem abreviar) e com maiúsculas
  if (!nome) {
    coletor.falhar("Preencha o nome completo.", "colab-nome");
  } else if (nome.length < COLAB_NOME_MIN || nome.length > COLAB_NOME_MAX) {
    coletor.falhar(`O nome deve ter de ${COLAB_NOME_MIN} a ${COLAB_NOME_MAX} caracteres.`, "colab-nome");
  } else if (!NOME_COMPLETO_REGEX.test(nome)) {
    coletor.falhar("Digite o nome completo, sem abreviar: nome e sobrenome, cada um começando com letra maiúscula. Exemplo: Fernanda Lima", "colab-nome");
  }

  // Cargo: obrigatório
  if (!cargo) {
    coletor.falhar("Preencha o cargo / especialidade.", "colab-cargo");
  } else if (cargo.length < COLAB_CARGO_MIN || cargo.length > COLAB_CARGO_MAX) {
    coletor.falhar(`O cargo deve ter de ${COLAB_CARGO_MIN} a ${COLAB_CARGO_MAX} caracteres.`, "colab-cargo");
  }

  // E-mail: só precisa estar preenchido
  if (!email) {
    coletor.falhar("Preencha o e-mail.", "colab-email");
  }

  // Senha: obrigatória, até 20 caracteres e com as mesmas regras do cadastro
  if (!senha) {
    coletor.falhar("Preencha a senha de acesso.", "colab-senha");
  } else if (senha.length > COLAB_SENHA_MAX) {
    coletor.falhar(`A senha pode ter no máximo ${COLAB_SENHA_MAX} caracteres.`, "colab-senha");
  } else {
    const faltando = senhaFaltando(senha);
    if (faltando.length > 0) {
      coletor.falhar(`A senha precisa ter pelo menos ${listaEmTexto(faltando)}.`, "colab-senha");
    }
  }

  // Confirmar senha: precisa ser igual à senha
  if (!campoSenhaConfirmar.value) {
    coletor.falhar("Confirme a senha.", "colab-senha-confirmar");
  } else if (campoSenhaConfirmar.value !== senha) {
    coletor.falhar("As senhas não coincidem. Digite a mesma senha nos dois campos.", "colab-senha-confirmar");
  }

  // Cor: obrigatória
  if (!campoCor.value) coletor.falhar("Escolha a cor do cabeçalho.", "colab-cor");

  return coletor.resultado();
}

function validarNovoAgendamento() {
  const coletor = criarColetorErros();
  const campoCliente = document.getElementById("agend-cliente");
  const campoServico = document.getElementById("agend-servico");
  const campoProfissional = document.getElementById("agend-profissional"); // só existe no painel do dono
  const campoData = document.getElementById("agend-data");
  const campoHora = document.getElementById("agend-hora-inicio");
  const campoDuracao = document.getElementById("agend-duracao");
  const campoCor = document.getElementById("agend-cor");

  campoCliente.value = campoCliente.value.trim();
  campoServico.value = campoServico.value.trim();
  const cliente = campoCliente.value;
  const servico = campoServico.value;

  // Cliente: obrigatório, só letras, espaços, apóstrofo e hífen
  if (!cliente) {
    coletor.falhar("Preencha o nome do cliente.", "agend-cliente");
  } else if (cliente.length < AGEND_CLIENTE_MIN || cliente.length > AGEND_CLIENTE_MAX) {
    coletor.falhar(`O nome do cliente deve ter de ${AGEND_CLIENTE_MIN} a ${AGEND_CLIENTE_MAX} caracteres.`, "agend-cliente");
  } else if (!NOME_CLIENTE_REGEX.test(cliente)) {
    coletor.falhar("O nome do cliente deve ter apenas letras, espaços, apóstrofo ou hífen.", "agend-cliente");
  }

  // Serviço: obrigatório
  if (!servico) {
    coletor.falhar("Preencha o serviço.", "agend-servico");
  } else if (servico.length < AGEND_SERVICO_MIN || servico.length > AGEND_SERVICO_MAX) {
    coletor.falhar(`O serviço deve ter de ${AGEND_SERVICO_MIN} a ${AGEND_SERVICO_MAX} caracteres.`, "agend-servico");
  }

  // Profissional: obrigatório (painel do dono)
  if (campoProfissional && !campoProfissional.value) {
    coletor.falhar("Escolha o profissional responsável.", "agend-profissional");
  }

  // Data: obrigatória e de hoje em diante
  if (!campoData.value) {
    coletor.falhar("Escolha a data do agendamento.", "agend-data");
  } else if (campoData.value < dataHojeISO()) {
    coletor.falhar("Não é possível agendar em uma data que já passou. Escolha uma data de hoje em diante.", "agend-data");
  }

  // Hora de início: obrigatória, entre 07:00 e 14:45, de 15 em 15 minutos
  if (!campoHora.value) {
    coletor.falhar("Informe a hora de início.", "agend-hora-inicio");
  } else {
    const [h, m] = campoHora.value.split(":").map(Number);
    const minutos = h * 60 + m;
    if (minutos < AGEND_HORA_MIN || minutos > AGEND_HORA_MAX) {
      coletor.falhar("A hora de início deve ser entre 07:00 e 14:45 (a agenda funciona das 07h às 15h).", "agend-hora-inicio");
    } else if (m % 15 !== 0) {
      coletor.falhar("A hora de início deve ser de 15 em 15 minutos (ex: 08:00, 08:15, 08:30).", "agend-hora-inicio");
    }
  }

  // Duração: obrigatória, número inteiro de 15 a 240, de 15 em 15
  const duracaoTexto = campoDuracao.value.trim();
  const duracao = Number(duracaoTexto);
  if (!duracaoTexto) {
    coletor.falhar("Informe a duração em minutos.", "agend-duracao");
  } else if (!Number.isInteger(duracao) || duracao < AGEND_DURACAO_MIN || duracao > AGEND_DURACAO_MAX || duracao % 15 !== 0) {
    coletor.falhar(`A duração deve ser de ${AGEND_DURACAO_MIN} a ${AGEND_DURACAO_MAX} minutos, de 15 em 15 (ex: 15, 30, 45, 60).`, "agend-duracao");
  }

  // Cor: obrigatória
  if (!campoCor.value) coletor.falhar("Escolha a cor do card.", "agend-cor");

  return coletor.resultado();
}


// =====================================================
// 2. DASHBOARD (index.html — agenda, financeiro, administração, planos)
// Só roda se a página tiver o elemento #layout-principal.
// =====================================================
function iniciarDashboard() {
  const layoutPrincipal = document.getElementById("layout-principal");
  if (!layoutPrincipal) return; // esta página não é o dashboard

  // --- CONTROLADOR DE TEMA NOTURNO ---
  const btnToggleTema = document.getElementById("btn-toggle-tema");
  if (btnToggleTema) {
    btnToggleTema.addEventListener("click", function () {
      const htmlEl = document.documentElement;
      if (htmlEl.getAttribute("data-theme") === "dark") {
        htmlEl.removeAttribute("data-theme");
        btnToggleTema.textContent = "🌙 Modo Noturno";
      } else {
        htmlEl.setAttribute("data-theme", "dark");
        btnToggleTema.textContent = "☀️ Tema Claro";
      }
    });
  }

  // --- ESTADO DA APLICAÇÃO ---
  let planoAtual = "FREE";
  const sessaoSalva = lerJsonLocal(CHAVE_SESSAO, null);
  let usuarioLogado = (sessaoSalva && sessaoSalva.perfil === "COLABORADOR")
    ? { perfil: "COLABORADOR", colaboradorId: sessaoSalva.colaboradorId }
    : { perfil: "DONO", colaboradorId: null };
  let abaAtiva = "Dashboard";
  let abaOrigemPlanos = "Dashboard";
  let modoVisualizacao = "Dia";
  const colunasVisiveis = 5;
  let paginaAtual = 0;

  // >>> API: dados financeiros por período. Começa zerado até o
  // endpoint FINANCEIRO existir (eixoMaximo não pode ser 0, senão
  // o gráfico divide por zero).
  const financeiroPorPeriodo = {
    Dia: { receitas: 0, despesas: 0, saldo: 0, pagamentos: { pix: 0, cartao: 0 }, eixoMaximo: 100 },
    Semana: { receitas: 0, despesas: 0, saldo: 0, pagamentos: { pix: 0, cartao: 0 }, eixoMaximo: 100 },
    Mês: { receitas: 0, despesas: 0, saldo: 0, pagamentos: { pix: 0, cartao: 0 }, eixoMaximo: 100 }
  };

  // >>> API: colaboradores (começa vazio; guarda no localStorage até ter backend).
  let colaboradores = lerJsonLocal(CHAVE_COLABORADORES, []);

  // >>> API: agendamentos (começa vazio; guarda no localStorage até ter backend).
  let agendamentos = lerJsonLocal(CHAVE_AGENDAMENTOS, []);

  // >>> API: contratos próximos do vencimento (começa vazio).
  let contratos = [];

  // >>> API: carregamento inicial. Se falhar, mantém as listas vazias.
  async function carregarDadosIniciais() {
    try {
      const dadosColaboradores = await apiRequest("COLABORADORES");
      if (Array.isArray(dadosColaboradores)) colaboradores = dadosColaboradores;
    } catch (erro) {
      console.warn("Não foi possível carregar colaboradores da API.", erro.message);
    }

    try {
      const dadosAgendamentos = await apiRequest("AGENDAMENTOS");
      if (Array.isArray(dadosAgendamentos)) agendamentos = dadosAgendamentos;
    } catch (erro) {
      console.warn("Não foi possível carregar agendamentos da API.", erro.message);
    }

    try {
      const dadosContratos = await apiRequest("CONTRATOS");
      if (Array.isArray(dadosContratos)) contratos = dadosContratos;
    } catch (erro) {
      console.warn("Não foi possível carregar contratos da API.", erro.message);
    }

    atualizarSelectLoginSimulado();
    atualizarOpcoesSeletorColunas();
    atualizarFiltroColaborador();
    renderizarListaColaboradores();
    renderizarContratos();
    renderizarAgenda();
  }

  // --- GERENCIAMENTO DE PLANOS ---
  function irParaTelaPlanos(origem) {
    abaOrigemPlanos = origem || abaAtiva;
    mudarAba("Planos");
  }

  const nomesPlanos = {
    FREE: "Grátis",
    BASICO: "Básico",
    PREMIUM: "Premium",
    PRO: "Premium"
  };

  async function escolherPlano(novoPlano) {
    planoAtual = novoPlano;

    // >>> API: avisar o backend da troca de plano.
    // try {
    //   await apiRequest("PLANO", { method: "PUT", body: { plano: novoPlano } });
    // } catch (erro) {
    //   console.warn("Não foi possível atualizar o plano na API.", erro.message);
    // }

    atualizarPlano();
    mudarAba(abaOrigemPlanos);
  }

  function atualizarPlano() {
    const textoPlano = document.getElementById("texto-plano");
    if (textoPlano) textoPlano.textContent = nomesPlanos[planoAtual] || planoAtual;

    const planoCompleto = (planoAtual === "PREMIUM" || planoAtual === "PRO");
    const temAcessoFinanceiro = planoCompleto;

    const gridCards = document.getElementById("grid-financeiro-cards");
    const avisoBloqueio = document.getElementById("aviso-bloqueio-financeiro-pagina");

    if (temAcessoFinanceiro) {
      if (gridCards) { gridCards.hidden = false; gridCards.style.display = "grid"; }
      if (avisoBloqueio) avisoBloqueio.hidden = true;
    } else {
      if (gridCards) { gridCards.hidden = true; gridCards.style.display = "none"; }
      if (avisoBloqueio) avisoBloqueio.hidden = false;
    }

    const cardsFinanceiros = ["card-receitas", "card-despesas", "card-saldo", "card-grafico"];
    cardsFinanceiros.forEach(id => {
      const card = document.getElementById(id);
      if (!card) return;
      const overlay = card.querySelector(".overlay-bloqueio");
      if (planoCompleto) {
        card.classList.remove("bloqueado");
        if (overlay) overlay.hidden = true;
      } else {
        card.classList.add("bloqueado");
        if (overlay) overlay.hidden = false;
      }
    });

    const tagLock = document.getElementById("tag-lock-fin");
    if (tagLock) tagLock.hidden = temAcessoFinanceiro;

    const planos = [
      { id: "btn-plano-free", valor: "FREE", texto: "Selecionar Plano", atual: "Plano Atual" },
      { id: "btn-plano-basico", valor: "BASICO", texto: "Escolher Básico", atual: "Plano Atual" },
      { id: "btn-plano-premium", valor: "PREMIUM", texto: "Escolher Premium", atual: "Plano Atual" }
    ];
    planos.forEach(plano => {
      const botao = document.getElementById(plano.id);
      if (!botao) return;
      const atual = planoAtual === plano.valor;
      botao.className = atual ? "btn-selecionar-plano atual" : "btn-selecionar-plano";
      botao.textContent = atual ? plano.atual : plano.texto;
    });

    atualizarNavegacao();
  }

  // --- NAVEGAÇÃO ENTRE ABAS ---
  function mudarAba(nomeAba) {
    document.querySelectorAll(".menu-item").forEach(m => {
      if (m.dataset.menu === nomeAba) { m.classList.add("ativo"); }
      else { m.classList.remove("ativo"); }
    });
    abaAtiva = nomeAba;
    atualizarNavegacao();
  }
  document.querySelectorAll(".menu-item").forEach(item => {
    item.addEventListener("click", function() { mudarAba(this.dataset.menu); });
  });

  function atualizarNavegacao() {
    const secFin = document.getElementById("secao-financeiro");
    const secAgenda = document.getElementById("secao-agenda");
    const secAdmin = document.getElementById("secao-administrativo");
    const secSuporte = document.getElementById("secao-suporte");
    const secPlanos = document.getElementById("secao-planos");
    const gridCardsFin = document.getElementById("grid-financeiro-cards");
    const avisoBloqueioFin = document.getElementById("aviso-bloqueio-financeiro-pagina");

    if (usuarioLogado.perfil === "COLABORADOR" && abaAtiva !== "Suporte") abaAtiva = "Agenda";

    secFin.style.display = "none";
    secAgenda.style.display = "none";
    secAdmin.style.display = "none";
    secSuporte.style.display = "none";
    secPlanos.style.display = "none";

    if (abaAtiva === "Dashboard") {
      if (usuarioLogado.perfil === "DONO" && (planoAtual === "PREMIUM" || planoAtual === "PRO")) {
        secFin.style.display = "block";
        gridCardsFin.style.display = "grid";
        gridCardsFin.hidden = false;
        avisoBloqueioFin.hidden = true;
      } else {
        secFin.style.display = "none";
        gridCardsFin.style.display = "none";
        gridCardsFin.hidden = true;
        avisoBloqueioFin.hidden = true;
      }
      secAgenda.style.display = "block";
      secAdmin.style.display = (usuarioLogado.perfil === "DONO") ? "block" : "none";
    } else if (abaAtiva === "Financeiro") {
      secFin.style.display = "block";
      if (planoAtual === "PREMIUM" || planoAtual === "PRO") {
        gridCardsFin.style.display = "grid";
        gridCardsFin.hidden = false;
        avisoBloqueioFin.hidden = true;
      } else {
        gridCardsFin.style.display = "none";
        gridCardsFin.hidden = true;
        avisoBloqueioFin.hidden = false;
      }
    } else if (abaAtiva === "Agenda") {
      secAgenda.style.display = "block";
    } else if (abaAtiva === "Administracao") {
      secAdmin.style.display = "block";
    } else if (abaAtiva === "Suporte") {
      secSuporte.style.display = "block";
    } else if (abaAtiva === "Planos") {
      secPlanos.style.display = "block";
    }
  }

  // --- FUNÇÕES AUXILIARES ---
  function paraMinutos(hora) {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
  }
  function formatarMoeda(v) { return "R$ " + v.toFixed(2).replace(".", ","); }

  function atualizarSelectLoginSimulado() {
    const textoPerfil = document.getElementById("texto-perfil");
    const nomeCadastrado = (usuarioLogado.perfil === "COLABORADOR" && sessaoSalva && sessaoSalva.nome)
      ? sessaoSalva.nome
      : localStorage.getItem("nomeUsuarioCadastrado");
    if (textoPerfil) textoPerfil.textContent = nomeCadastrado || "Admin";
  }

  function atualizarOpcoesSeletorColunas() {
    const seletor = document.getElementById("seletor-colunas");
    seletor.innerHTML = "";
    for (let i = 1; i <= Math.min(5, colaboradores.length); i++) {
      seletor.insertAdjacentHTML("beforeend", `<option value="${i}" ${i === colunasVisiveis ? 'selected' : ''}>${i} Coluna${i > 1 ? 's' : ''}</option>`);
    }
  }

  // --- FILTRO DE COLABORADOR NA AGENDA ---
  function atualizarFiltroColaborador() {
    const select = document.getElementById("filtro-colaborador");

    select.innerHTML = `<option value="todos">Procurar colaborador...</option>`;

    colaboradores.filter(c => c.ativo !== false).forEach(c => {
      select.insertAdjacentHTML(
        "beforeend",
        `<option value="${c.id}">${c.nome}</option>`
      );
    });
  }

  document.getElementById("filtro-colaborador")
    .addEventListener("change", function () {
      paginaAtual = 0;
      renderizarAgenda();
    });

  function atualizarFinanceiro() {
    const d = financeiroPorPeriodo[modoVisualizacao];
    document.getElementById("titulo-receitas").textContent = `Receitas (${modoVisualizacao})`;
    document.getElementById("valor-receitas").textContent = formatarMoeda(d.receitas);
    document.getElementById("valor-despesas").textContent = formatarMoeda(d.despesas);
    document.getElementById("valor-saldo").textContent = formatarMoeda(d.saldo);
    document.querySelector(".eixo-max").textContent = d.eixoMaximo.toLocaleString("pt-BR");
    document.querySelector(".eixo-meio").textContent = (d.eixoMaximo / 2).toLocaleString("pt-BR");
    document.querySelector('[data-meio="pix"] .barra').style.height = (d.pagamentos.pix / d.eixoMaximo) * 100 + "%";
    document.querySelector('[data-meio="cartao"] .barra').style.height = (d.pagamentos.cartao / d.eixoMaximo) * 100 + "%";
  }

  // --- PAGINAÇÃO DA AGENDA ---
  function obterColaboradoresPagina() {
    if (usuarioLogado.perfil === "COLABORADOR") {
      const meuPerfil = colaboradores.find(c => c.id === usuarioLogado.colaboradorId);
      return meuPerfil ? [meuPerfil] : [];
    }

    // Colaborador inativo some da agenda (os agendamentos dele continuam salvos)
    const colaboradoresAtivos = colaboradores.filter(c => c.ativo !== false);

    const filtro = document.getElementById("filtro-colaborador");
    const colaboradorSelecionado = filtro ? filtro.value : "todos";

    if (colaboradorSelecionado !== "todos") {
      return colaboradoresAtivos.filter(c => String(c.id) === colaboradorSelecionado);
    }

    // Se a página atual ficou vazia (ex: desativou alguém), volta pra última página
    const ultimaPagina = Math.max(Math.ceil(colaboradoresAtivos.length / colunasVisiveis) - 1, 0);
    if (paginaAtual > ultimaPagina) paginaAtual = ultimaPagina;

    const inicio = paginaAtual * colunasVisiveis;
    return colaboradoresAtivos.slice(inicio, inicio + colunasVisiveis);
  }
  function obterTotalPaginas() {
    if (usuarioLogado.perfil === "COLABORADOR") return 1;

    const filtro = document.getElementById("filtro-colaborador");
    const colaboradorSelecionado = filtro ? filtro.value : "todos";
    if (colaboradorSelecionado !== "todos") return 1;

    return Math.ceil(colaboradores.filter(c => c.ativo !== false).length / colunasVisiveis) || 1;
  }
  function atualizarInfoPaginacao() {
    document.getElementById("pag-info").textContent = `${paginaAtual + 1} de ${obterTotalPaginas()}`;
  }

  // --- DISTRIBUIÇÃO DA AGENDA ---
  function calcularLayoutColuna(itens) {
    const ordenados = itens.slice().sort((a, b) => paraMinutos(a.ag.horaInicio) - paraMinutos(b.ag.horaInicio));
    const layout = [];
    let grupoAtual = [];
    let fimGrupo = -1;

    for (let i = 0; i < ordenados.length; i++) {
      const item = ordenados[i];
      const inicioMin = paraMinutos(item.ag.horaInicio);
      const fimMin = inicioMin + item.ag.duracaoMin;

      if (grupoAtual.length > 0 && inicioMin >= fimGrupo) {
        processarGrupo(grupoAtual, layout);
        grupoAtual = [];
        fimGrupo = -1;
      }
      grupoAtual.push(item);
      fimGrupo = Math.max(fimGrupo, fimMin);
    }
    if (grupoAtual.length > 0) processarGrupo(grupoAtual, layout);
    return layout;
  }

  function processarGrupo(grupo, layoutSaida) {
    const finsColunas = [];
    for (let i = 0; i < grupo.length; i++) {
      const item = grupo[i];
      const inicioMin = paraMinutos(item.ag.horaInicio);
      const fimMin = inicioMin + item.ag.duracaoMin;

      let colunaEncontrada = -1;
      for (let c = 0; c < finsColunas.length; c++) {
        if (finsColunas[c] <= inicioMin) { colunaEncontrada = c; break; }
      }
      if (colunaEncontrada === -1) {
        colunaEncontrada = finsColunas.length;
        finsColunas.push(fimMin);
      } else {
        finsColunas[colunaEncontrada] = fimMin;
      }
      layoutSaida.push({ ag: item.ag, id: item.ag.id, coluna: colunaEncontrada });
    }
    const totalColunas = finsColunas.length;
    for (let i = layoutSaida.length - grupo.length; i < layoutSaida.length; i++) {
      layoutSaida[i].totalColunas = totalColunas;
    }
  }

  // --- RENDERIZAÇÃO DA AGENDA ---
  const horaInicio = 7;
  const horaFim = 15;
  const totalHoras = horaFim - horaInicio;
  const agenda = document.getElementById("agenda");
  const seletorData = document.getElementById("seletor-data");
  const seletorColunas = document.getElementById("seletor-colunas");

  async function removerAgendamento(id, event) {
    if (event) event.stopPropagation();

    // >>> API: apagar agendamento no backend.
    // try {
    //   await apiRequest("AGENDAMENTOS", { method: "DELETE" }, `/${id}`);
    // } catch (erro) {
    //   console.warn("Não foi possível remover o agendamento na API.", erro.message);
    // }

    agendamentos = agendamentos.filter(a => a.id !== id);
    salvarAgendamentosLocal(agendamentos);
    renderizarAgenda();
  }

  function verDetalhesAgendamento(ag) {
    alert(`📋 Detalhes do Agendamento:\n\nCliente: ${ag.cliente}\nServiço: ${ag.servico || 'Não informado'}\nInício: ${ag.horaInicio}\nDuração: ${ag.duracaoMin} min\nData: ${ag.data}`);
  }

  function renderizarAgenda() {
    agenda.innerHTML = "";
    const colaboradoresPagina = obterColaboradoresPagina();
    const dataSelecionada = seletorData.value;

    agenda.style.setProperty("--n-colab", colaboradoresPagina.length);
    agenda.style.setProperty("--n-horas", totalHoras);
    atualizarInfoPaginacao();

    // Sem colaboradores ativos: mostra um aviso em vez de uma agenda vazia
    if (colaboradoresPagina.length === 0) {
      agenda.innerHTML = `<p style="padding: 24px; text-align: center; color: #888;">
        Nenhum colaborador ativo. Cadastre ou ative um colaborador em Administração.
      </p>`;
      return;
    }

    const divCabecalho = document.createElement("div");
    divCabecalho.className = "agenda-cabecalho";
    divCabecalho.innerHTML = `<div class="cab" style="background: transparent;"></div>`;
    colaboradoresPagina.forEach(c => {
      divCabecalho.innerHTML += `
        <div class="cab" style="background:${c.cor}">
          <div class="cab-avatar"></div>
          <div class="cab-nome">${c.nome}</div>
          <div class="cab-cargo">${c.cargo}</div>
        </div>`;
    });
    agenda.appendChild(divCabecalho);

    const divCorpo = document.createElement("div");
    divCorpo.className = "agenda-corpo";

    const colHorarios = document.createElement("div");
    colHorarios.className = "col-horarios";
    for (let h = horaInicio; h < horaFim; h++) {
      colHorarios.insertAdjacentHTML("beforeend", `<div class="hora-label">${String(h).padStart(2, "0")}</div>`);
    }
    divCorpo.appendChild(colHorarios);

    colaboradoresPagina.forEach(coluna => {
      const col = document.createElement("div");
      col.className = "col-colab";
      for (let h = horaInicio; h < horaFim; h++) {
        col.insertAdjacentHTML("beforeend", `<div class="linha-hora"></div>`);
      }

      const agsDoColab = agendamentos
        .filter(a => a.colaboradorId === coluna.id && a.data === dataSelecionada)
        .map(ag => ({ ag }));

      const layoutColuna = calcularLayoutColuna(agsDoColab);

      layoutColuna.forEach(item => {
        const ag = item.ag;
        const [hIni, mIni] = ag.horaInicio.split(":").map(Number);
        const minInicio = (hIni - horaInicio) * 60 + mIni;
        const topPx = (minInicio / 60) * 48;
        const heightPx = Math.max((ag.duracaoMin / 60) * 48, 38);
        const largura = 100 / item.totalColunas;
        const esquerda = item.coluna * largura;

        const bloco = document.createElement("div");
        bloco.className = "agendamento";
        bloco.style.cssText = `top: ${topPx}px; height: ${heightPx}px; left: calc(${esquerda}% + 2px); width: calc(${largura}% - 4px); background: ${ag.cor};`;
        bloco.setAttribute("title", `Cliente: ${ag.cliente}\nServiço: ${ag.servico || 'Não informado'}\nHorário: ${ag.horaInicio}`);
        bloco.addEventListener("click", () => verDetalhesAgendamento(ag));
        bloco.innerHTML = `
          <button type="button" class="remover" onclick="removerAgendamento(${ag.id}, event)">✕</button>
          <strong>${ag.cliente}</strong>
          ${ag.servico ? `<span>${ag.servico}</span>` : ''}
        `;
        col.appendChild(bloco);
      });

      divCorpo.appendChild(col);
    });

    agenda.appendChild(divCorpo);
  }

  // --- EVENTOS E PERMISSÕES ---
  function aplicarPermissoes() {
    const containerPaginacao = document.getElementById("container-paginacao");
    const seletorColunasDiv = seletorColunas.parentElement;
    const menuFinanceiro = document.querySelector('.menu-item[data-menu="Financeiro"]');
    const menuAdministracao = document.querySelector('.menu-item[data-menu="Administracao"]');
    const menuPlanos = document.querySelector('.menu-item[data-menu="Planos"]');

    if (usuarioLogado.perfil === "COLABORADOR") {
      containerPaginacao.style.display = "none";
      seletorColunasDiv.style.display = "none";
      if (menuFinanceiro) menuFinanceiro.style.display = "none";
      if (menuAdministracao) menuAdministracao.style.display = "none";
      if (menuPlanos) menuPlanos.style.display = "none";

      // Colaborador: menu lateral só com Agenda e Suporte, sem plano e sem filtro
      abaAtiva = "Agenda";
      document.querySelectorAll(".menu-item").forEach(m => m.classList.toggle("ativo", m.dataset.menu === "Agenda"));
      const menuDashboard = document.querySelector('.menu-item[data-menu="Dashboard"]');
      if (menuDashboard) menuDashboard.style.display = "none";
      const blocoPlano = document.getElementById("texto-plano");
      if (blocoPlano && blocoPlano.parentElement) blocoPlano.parentElement.style.display = "none";
      const blocoFiltro = document.getElementById("filtro-colaborador");
      if (blocoFiltro && blocoFiltro.parentElement) blocoFiltro.parentElement.style.display = "none";
    } else {
      containerPaginacao.style.display = "flex";
      seletorColunasDiv.style.display = "none";
      if (menuAdministracao) menuAdministracao.style.display = "flex";
      if (menuFinanceiro) menuFinanceiro.style.display = "flex";
      if (menuPlanos) menuPlanos.style.display = "flex";
    }
    paginaAtual = 0;
    atualizarNavegacao();
    renderizarAgenda();
  }

  seletorData.addEventListener("change", renderizarAgenda);

  document.getElementById("btn-pag-anterior").addEventListener("click", () => {
    if (paginaAtual > 0) { paginaAtual--; renderizarAgenda(); }
  });
  document.getElementById("btn-pag-proxima").addEventListener("click", () => {
    if (paginaAtual < obterTotalPaginas() - 1) { paginaAtual++; renderizarAgenda(); }
  });

  ["Dia", "Semana", "Mês"].forEach(modo => {
    const btnId = modo === "Mês" ? "btn-modo-mes" : modo === "Semana" ? "btn-modo-semana" : "btn-modo-dia";
    document.getElementById(btnId).addEventListener("click", function() {
      document.querySelectorAll(".toggle-view button").forEach(b => b.classList.remove("ativo"));
      this.classList.add("ativo");
      modoVisualizacao = modo;
      atualizarFinanceiro();
    });
  });

  // --- MODAL DE AGENDAMENTO ---
  const modalAgendamento = document.getElementById("modal-agendamento");
  const btnAbrirAgendamento = document.getElementById("btn-abrir-agendamento");
  const btnFecharModal = document.getElementById("btn-fechar-modal");
  const btnCancelarAgendamento = document.getElementById("btn-cancelar-agendamento");
  const selectProfissional = document.getElementById("agend-profissional");
  const formAgendamento = document.getElementById("form-novo-agendamento");

  function obterDataHojeISO() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  btnAbrirAgendamento.addEventListener("click", () => {
    // Sem colaborador ativo não dá pra agendar
    if (!colaboradores.some(c => c.ativo !== false)) {
      alert("Cadastre um colaborador antes de criar um agendamento.");
      return;
    }

    selectProfissional.innerHTML = "";
    colaboradores
      .filter(c => c.ativo !== false)
      .filter(c => usuarioLogado.perfil !== "COLABORADOR" || c.id === usuarioLogado.colaboradorId)
      .forEach(c => {
      selectProfissional.insertAdjacentHTML("beforeend", `<option value="${c.id}">${c.nome}</option>`);
    });
    const hojeISO = obterDataHojeISO();
    const campoData = document.getElementById("agend-data");
    campoData.min = hojeISO;
    campoData.value = (seletorData.value >= hojeISO) ? seletorData.value : hojeISO;
    modalAgendamento.hidden = false;
  });

  function fecharModalAgendamento() { modalAgendamento.hidden = true; limparErroForm(formAgendamento); }
  btnFecharModal.addEventListener("click", fecharModalAgendamento);
  btnCancelarAgendamento.addEventListener("click", fecharModalAgendamento);

  formAgendamento.addEventListener("submit", async function(e) {
    e.preventDefault();

    const validacaoAgendamento = validarNovoAgendamento();
    if (validacaoAgendamento.erros.length > 0) {
      mostrarErroForm(formAgendamento, validacaoAgendamento.erros.join("\n"), validacaoAgendamento.campoErro);
      return;
    }
    limparErroForm(formAgendamento);

    const dataEscolhida = document.getElementById("agend-data").value;
    if (dataEscolhida < obterDataHojeISO()) {
      alert("Não é possível agendar em uma data que já passou. Escolha uma data de hoje em diante.");
      return;
    }

    const novoAgendamento = {
      id: Date.now(),
      cliente: document.getElementById("agend-cliente").value,
      servico: document.getElementById("agend-servico").value,
      colaboradorId: parseInt(selectProfissional.value),
      data: document.getElementById("agend-data").value,
      horaInicio: document.getElementById("agend-hora-inicio").value,
      duracaoMin: parseInt(document.getElementById("agend-duracao").value),
      cor: document.getElementById("agend-cor").value
    };

    // >>> API: criar agendamento no backend.
    // try {
    //   const criado = await apiRequest("AGENDAMENTOS", { method: "POST", body: novoAgendamento });
    //   if (criado && criado.id) novoAgendamento.id = criado.id;
    // } catch (erro) {
    //   console.warn("Não foi possível salvar o agendamento na API.", erro.message);
    // }

    agendamentos.push(novoAgendamento);
    salvarAgendamentosLocal(agendamentos);
    seletorData.value = novoAgendamento.data;
    renderizarAgenda();
    fecharModalAgendamento();
    formAgendamento.reset();
  });

  // --- SUPORTE (envio de e-mail sem sair da página) ---
  const formSuporte = document.getElementById("form-suporte");
  const suporteSucesso = document.getElementById("suporte-sucesso");
  const suporteErro = document.getElementById("suporte-erro");
  const btnEnviarSuporte = document.getElementById("btn-enviar-suporte");
  const btnSuporteNovaMensagem = document.getElementById("btn-suporte-nova-mensagem");

  if (formSuporte) {
    formSuporte.addEventListener("submit", function (e) {
      e.preventDefault();
      suporteErro.style.display = "none";
      btnEnviarSuporte.disabled = true;
      const textoOriginal = btnEnviarSuporte.textContent;
      btnEnviarSuporte.textContent = "Enviando...";

      const dadosFormulario = new FormData(formSuporte);

      fetch("https://formsubmit.co/ajax/jonathanpinheiro484@gmail.com", {
        method: "POST",
        headers: { "Accept": "application/json" },
        body: dadosFormulario
      })
        .then((resposta) => {
          if (!resposta.ok) throw new Error("Falha no envio");
          return resposta.json();
        })
        .then(() => {
          formSuporte.reset();
          formSuporte.style.display = "none";
          suporteSucesso.style.display = "block";
        })
        .catch(() => {
          suporteErro.style.display = "block";
        })
        .finally(() => {
          btnEnviarSuporte.disabled = false;
          btnEnviarSuporte.textContent = textoOriginal;
        });
    });
  }

  if (btnSuporteNovaMensagem) {
    btnSuporteNovaMensagem.addEventListener("click", () => {
      suporteSucesso.style.display = "none";
      formSuporte.style.display = "block";
    });
  }

  // --- ADMINISTRATIVO ---
  const formColab = document.getElementById("form-colaborador");
  formColab.addEventListener("submit", async function (e) {
    e.preventDefault();

    const validacaoColab = validarNovoColaborador();
    if (validacaoColab.erros.length > 0) {
      mostrarErroForm(formColab, validacaoColab.erros.join("\n"), validacaoColab.campoErro);
      return;
    }
    limparErroForm(formColab);

    const limiteColaboradores = { FREE: 15, BASICO: 10, PREMIUM: Infinity };
    const limite = limiteColaboradores[planoAtual];

    if (colaboradores.length >= limite) {
      alert(`O plano ${planoAtual} permite até ${limite} colaboradores.`);
      return;
    }

    const emailNovo = document.getElementById("colab-email").value.trim().toLowerCase();
    const senhaNova = document.getElementById("colab-senha").value;
    const credenciais = lerJsonLocal(CHAVE_CREDENCIAIS, {});
    if (credenciais[emailNovo]) {
      alert("Já existe um colaborador cadastrado com esse e-mail.");
      return;
    }

    const novoColab = {
      id: colaboradores.length ? Math.max(...colaboradores.map(c => c.id)) + 1 : 1,
      nome: document.getElementById("colab-nome").value,
      cargo: document.getElementById("colab-cargo").value,
      email: document.getElementById("colab-email").value,
      cor: document.getElementById("colab-cor").value,
      ativo: true
    };

    // >>> API: criar colaborador no backend (a senha está em #colab-senha
    // e só deve ser enviada pra API, nunca guardada em texto puro no front).
    // try {
    //   const criado = await apiRequest("COLABORADORES", {
    //     method: "POST",
    //     body: { ...novoColab, senha: senhaNova },
    //   });
    //   if (criado && criado.id) novoColab.id = criado.id;
    // } catch (erro) {
    //   console.warn("Não foi possível salvar o colaborador na API.", erro.message);
    // }

    colaboradores.push(novoColab);
    salvarColaboradoresLocal(colaboradores);
    credenciais[emailNovo] = { colaboradorId: novoColab.id, senhaHash: await gerarHashSenha(senhaNova) };
    localStorage.setItem(CHAVE_CREDENCIAIS, JSON.stringify(credenciais));
    atualizarSelectLoginSimulado();
    atualizarOpcoesSeletorColunas();
    atualizarFiltroColaborador();
    renderizarListaColaboradores();
    renderizarAgenda();
    formColab.reset();
  });

  async function removerColaborador(id) {
    // >>> API: remover colaborador no backend.
    // try {
    //   await apiRequest("COLABORADORES", { method: "DELETE" }, `/${id}`);
    // } catch (erro) {
    //   console.warn("Não foi possível remover o colaborador na API.", erro.message);
    // }

    colaboradores = colaboradores.filter(c => c.id !== id);
    agendamentos = agendamentos.filter(a => a.colaboradorId !== id);
    salvarAgendamentosLocal(agendamentos);
    salvarColaboradoresLocal(colaboradores);
    const credenciaisRestantes = lerJsonLocal(CHAVE_CREDENCIAIS, {});
    Object.keys(credenciaisRestantes).forEach(email => {
      if (credenciaisRestantes[email].colaboradorId === id) delete credenciaisRestantes[email];
    });
    localStorage.setItem(CHAVE_CREDENCIAIS, JSON.stringify(credenciaisRestantes));
    atualizarSelectLoginSimulado();
    atualizarOpcoesSeletorColunas();
    atualizarFiltroColaborador();
    renderizarListaColaboradores();
    renderizarAgenda();
  }

  async function alternarStatusColaborador(id) {
    const colab = colaboradores.find(c => c.id === id);
    if (!colab) return;
    colab.ativo = !colab.ativo;
    salvarColaboradoresLocal(colaboradores);

    // >>> API: persistir a troca de status.
    // try {
    //   await apiRequest("COLABORADORES", { method: "PATCH", body: { ativo: colab.ativo } }, `/${id}`);
    // } catch (erro) {
    //   console.warn("Não foi possível atualizar o status do colaborador na API.", erro.message);
    // }

    renderizarListaColaboradores();
    atualizarFiltroColaborador();
    renderizarAgenda();
  }

  function renderizarListaColaboradores() {
    const lista = document.getElementById("colaboradores-lista");
    lista.innerHTML = "";

    if (colaboradores.length === 0) {
      lista.innerHTML = `<p style="padding: 12px; color: #888;">Nenhum colaborador cadastrado.</p>`;
      return;
    }

    colaboradores.forEach(c => {
      const ativo = c.ativo !== false;
      const acoes = `<button type="button" class="btn-cancelar" style="padding: 2px 8px; font-size: 10px; margin-left: 6px;" onclick="alternarStatusColaborador(${c.id})">${ativo ? 'Desativar' : 'Ativar'}</button>`;
      const btnRemover = `<button type="button" class="colaborador-remover" onclick="removerColaborador(${c.id})">✕</button>`;
      lista.insertAdjacentHTML("beforeend", `
        <div class="colaborador-item" style="border-left: 4px solid ${c.cor}; ${ativo ? '' : 'opacity: 0.65;'}">
          <span class="colaborador-avatar"></span>
          <div class="colaborador-info">
            <strong>${c.nome}</strong>
            <small>${c.cargo}</small><br>
            <span class="${ativo ? 'status-ativo' : 'status-inativo'}">${ativo ? 'Ativo' : 'Inativo'}</span>
            ${acoes}
          </div>
          ${btnRemover}
        </div>`);
    });
  }

  function renderizarContratos() {
    const listaContratos = document.getElementById("contratos-lista");
    listaContratos.innerHTML = "";

    if (contratos.length === 0) {
      listaContratos.innerHTML = `<tr><td colspan="2" style="color: #888;">Nenhum contrato próximo do vencimento.</td></tr>`;
      return;
    }

    contratos.forEach(ct => {
      listaContratos.insertAdjacentHTML("beforeend", `<tr><td>${ct.nome}</td><td>${ct.vencimento}</td></tr>`);
    });
  }

  // --- MOSTRAR / ESCONDER MENU LATERAL ---
  const btnGestao = document.getElementById("btn-gestao");
  const sidebar = document.getElementById("sidebar-principal");
  const btnMostrarSidebar = document.getElementById("btn-mostrar-sidebar");

  function alternarMenuLateral() {
    if (!sidebar || !layoutPrincipal) return;
    const vaiEsconder = !sidebar.classList.contains("oculta");
    sidebar.classList.toggle("oculta", vaiEsconder);
    layoutPrincipal.classList.toggle("sidebar-oculta", vaiEsconder);
    if (btnMostrarSidebar) {
      btnMostrarSidebar.classList.toggle("mostrar", vaiEsconder);
    }
  }

  if (btnGestao) {
    btnGestao.addEventListener("click", alternarMenuLateral);
    btnGestao.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        alternarMenuLateral();
      }
    });
  }

  if (btnMostrarSidebar) {
    btnMostrarSidebar.addEventListener("click", alternarMenuLateral);
  }

  // Expõe pro escopo global as funções chamadas via onclick="..." no HTML gerado
  window.removerAgendamento = removerAgendamento;
  window.removerColaborador = removerColaborador;
  window.alternarStatusColaborador = alternarStatusColaborador;
  window.irParaTelaPlanos = irParaTelaPlanos;
  window.escolherPlano = escolherPlano;

  // --- BOTÕES DE PLANOS (antes eram onclick="..." dentro do index.html) ---
  const btnUpgradeFinanceiro = document.getElementById("btn-upgrade-financeiro");
  if (btnUpgradeFinanceiro) {
    btnUpgradeFinanceiro.addEventListener("click", () => irParaTelaPlanos("Financeiro"));
  }
  [
    ["btn-plano-free", "FREE"],
    ["btn-plano-basico", "BASICO"],
    ["btn-plano-premium", "PREMIUM"]
  ].forEach(([idBotao, plano]) => {
    const botao = document.getElementById(idBotao);
    if (botao) botao.addEventListener("click", () => escolherPlano(plano));
  });

  // Se o dono e o colaborador estiverem com o site aberto em abas diferentes,
  // a agenda atualiza sozinha quando o outro adiciona/remove algo.
  window.addEventListener("storage", function (e) {
    if (e.key !== CHAVE_AGENDAMENTOS && e.key !== CHAVE_COLABORADORES) return;
    agendamentos = lerJsonLocal(CHAVE_AGENDAMENTOS, []);
    colaboradores = lerJsonLocal(CHAVE_COLABORADORES, []);
    atualizarOpcoesSeletorColunas();
    atualizarFiltroColaborador();
    renderizarListaColaboradores();
    renderizarAgenda();
  });

  // --- INICIALIZAÇÃO DO DASHBOARD ---
  seletorData.value = obterDataHojeISO();
  atualizarFinanceiro();
  atualizarPlano();
  aplicarPermissoes();
  carregarDadosIniciais();
}


// =====================================================
// 2.5 TELA DO COLABORADOR (colaborador.html)
// Só roda se a página tiver o elemento #layout-colaborador.
// Mostra só a Agenda + Suporte. O colaborador faz a PRÓPRIA agenda
// ("Minha agenda": criar e apagar agendamentos) e consulta a agenda
// dos OUTROS colaboradores (somente leitura), usando o filtro
// "Procurar colaborador" ou os botões com os nomes.
// =====================================================
function iniciarColaborador() {
  const layout = document.getElementById("layout-colaborador");
  if (!layout) return; // esta página não é a tela do colaborador

  // Só colaborador logado entra aqui
  const sessao = lerJsonLocal(CHAVE_SESSAO, null);
  if (!sessao || sessao.perfil !== "COLABORADOR") {
    window.location.href = "login.html";
    return;
  }
  const meuId = sessao.colaboradorId;

  // --- TEMA ---
  const btnTema = document.getElementById("btn-toggle-tema");
  btnTema.addEventListener("click", function () {
    const htmlEl = document.documentElement;
    if (htmlEl.getAttribute("data-theme") === "dark") {
      htmlEl.removeAttribute("data-theme");
      btnTema.textContent = "🌙 Modo Noturno";
    } else {
      htmlEl.setAttribute("data-theme", "dark");
      btnTema.textContent = "☀️ Tema Claro";
    }
  });

  // --- ESTADO ---
  let colaboradores = lerJsonLocal(CHAVE_COLABORADORES, []);
  let agendamentos = lerJsonLocal(CHAVE_AGENDAMENTOS, []);
  const horaInicio = 7;
  const horaFim = 15;
  const totalHoras = horaFim - horaInicio;

  const agenda = document.getElementById("agenda");
  const seletorData = document.getElementById("seletor-data");
  const equipeBotoes = document.getElementById("equipe-botoes");
  const avisoLeitura = document.getElementById("aviso-leitura");
  const btnNovo = document.getElementById("btn-abrir-agendamento");
  const filtro = document.getElementById("filtro-colaborador");

  function paraMinutos(hora) {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
  }

  function obterDataHojeISO() {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  }

  // Colaboradores que o usuário pode consultar: ativos e diferentes dele mesmo
  function obterOutrosColaboradores() {
    return colaboradores.filter(c => c.ativo !== false && c.id !== meuId);
  }

  // O próprio colaborador (dono da agenda que ele pode editar)
  function obterMeuColaborador() {
    return colaboradores.find(c => c.id === meuId && c.ativo !== false);
  }

  // Primeiro nome do colaborador logado (usado no lugar de "Minha agenda")
  function obterMeuPrimeiroNome() {
    const meu = colaboradores.find(c => c.id === meuId);
    const nomeCompleto = String((meu && meu.nome) || sessao.nome || "").trim();
    return nomeCompleto.split(/\s+/)[0] || "Minha agenda";
  }

  // --- NAVEGAÇÃO (Agenda / Suporte / Sair) ---
  document.querySelectorAll(".menu-item[data-menu]").forEach(item => {
    item.addEventListener("click", function () {
      const aba = this.dataset.menu;
      document.querySelectorAll(".menu-item[data-menu]").forEach(m => m.classList.toggle("ativo", m === this));
      document.getElementById("secao-agenda").style.display = aba === "Agenda" ? "block" : "none";
      document.getElementById("secao-suporte").style.display = aba === "Suporte" ? "block" : "none";
    });
  });

  document.getElementById("btn-sair").addEventListener("click", function () {
    localStorage.removeItem(CHAVE_SESSAO);
    window.location.href = "login.html";
  });

  // --- FILTRO "PROCURAR COLABORADOR" ---
  // Valores: "todos" = agenda de todos os outros | "minha" = a própria agenda (editável) | id = um outro colaborador
  function atualizarFiltroColaborador() {
    const valorAtual = filtro.value;
    filtro.innerHTML = "";

    const opcaoTodos = document.createElement("option");
    opcaoTodos.value = "todos";
    opcaoTodos.textContent = "Procurar colaborador...";
    filtro.appendChild(opcaoTodos);

    const opcaoMinha = document.createElement("option");
    opcaoMinha.value = "minha";
    opcaoMinha.textContent = obterMeuPrimeiroNome();
    filtro.appendChild(opcaoMinha);

    obterOutrosColaboradores().forEach(c => {
      const opcao = document.createElement("option");
      opcao.value = String(c.id);
      opcao.textContent = c.nome;
      filtro.appendChild(opcao);
    });

    // Mantém a escolha anterior, se ela ainda existir
    const aindaExiste = Array.from(filtro.options).some(o => o.value === valorAtual);
    filtro.value = aindaExiste ? valorAtual : "todos";
  }

  filtro.addEventListener("change", function () {
    renderizarEquipe();
    renderizarAgenda();
  });

  // --- BLOCO COM OS NOMES (Minha agenda + os outros colaboradores) ---
  function criarBotaoColab(valor, texto, cor) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-colab" + (valor === filtro.value ? " ativo" : "");
    const bolinha = document.createElement("span");
    bolinha.className = "bolinha";
    bolinha.style.background = cor;
    const nome = document.createElement("span");
    nome.textContent = texto;
    btn.appendChild(bolinha);
    btn.appendChild(nome);
    btn.addEventListener("click", function () {
      // Clicar de novo no mesmo botão volta a mostrar todos os outros
      filtro.value = (valor === filtro.value) ? "todos" : valor;
      renderizarEquipe();
      renderizarAgenda();
    });
    equipeBotoes.appendChild(btn);
  }

  function renderizarEquipe() {
    equipeBotoes.innerHTML = "";
    const outros = obterOutrosColaboradores();
    const meu = obterMeuColaborador();

    if (meu) criarBotaoColab("minha", obterMeuPrimeiroNome(), meu.cor);
    outros.forEach(c => criarBotaoColab(String(c.id), c.nome, c.cor));

    if (outros.length === 0) {
      const aviso = document.createElement("p");
      aviso.style.cssText = "color:#888; font-size:13px; margin:0;";
      aviso.textContent = "Ainda não há outros colaboradores ativos.";
      equipeBotoes.appendChild(aviso);
    }
  }

  // --- LAYOUT DE AGENDAMENTOS SOBREPOSTOS ---
  function calcularLayoutColuna(itens) {
    const ordenados = itens.slice().sort((a, b) => paraMinutos(a.horaInicio) - paraMinutos(b.horaInicio));
    const layout = [];
    let grupo = [];
    let fimGrupo = -1;
    ordenados.forEach(ag => {
      const ini = paraMinutos(ag.horaInicio);
      if (grupo.length > 0 && ini >= fimGrupo) {
        processarGrupo(grupo, layout);
        grupo = [];
        fimGrupo = -1;
      }
      grupo.push(ag);
      fimGrupo = Math.max(fimGrupo, ini + ag.duracaoMin);
    });
    if (grupo.length > 0) processarGrupo(grupo, layout);
    return layout;
  }

  function processarGrupo(grupo, saida) {
    const fins = [];
    const inicioSaida = saida.length;
    grupo.forEach(ag => {
      const ini = paraMinutos(ag.horaInicio);
      const fim = ini + ag.duracaoMin;
      let col = fins.findIndex(f => f <= ini);
      if (col === -1) { col = fins.length; fins.push(fim); }
      else { fins[col] = fim; }
      saida.push({ ag, coluna: col });
    });
    for (let i = inicioSaida; i < saida.length; i++) saida[i].totalColunas = fins.length;
  }

  // --- AGENDA: a própria (editável) ou a dos outros (somente consulta) ---
  async function removerAgendamento(id, event) {
    if (event) event.stopPropagation();
    // Só pode apagar da própria agenda
    const alvo = agendamentos.find(a => a.id === id);
    if (!alvo || alvo.colaboradorId !== meuId) return;
    agendamentos = agendamentos.filter(a => a.id !== id);
    salvarAgendamentosLocal(agendamentos);
    renderizarAgenda();
  }

  function renderizarAgenda() {
    agenda.innerHTML = "";

    const outros = obterOutrosColaboradores();
    const meu = obterMeuColaborador();

    // Se quem estava selecionado foi desativado/removido, volta para "todos"
    const valorValido = filtro.value === "todos"
      || (filtro.value === "minha" && meu)
      || outros.some(c => String(c.id) === filtro.value);
    if (!valorValido) filtro.value = "todos";

    const verMinha = filtro.value === "minha";
    avisoLeitura.hidden = verMinha;
    btnNovo.style.display = verMinha ? "" : "none";

    let colunas;
    if (verMinha) colunas = [meu];
    else if (filtro.value === "todos") colunas = outros;
    else colunas = outros.filter(c => String(c.id) === filtro.value);

    const tituloAgenda = document.getElementById("agenda-titulo");

    if (colunas.length === 0) {
      tituloAgenda.textContent = "Agenda dos colaboradores";
      agenda.style.setProperty("--n-colab", 1);
      agenda.innerHTML = `<p style="padding:24px; text-align:center; color:#888;">Não há outros colaboradores ativos para mostrar. Escolha o seu nome no filtro para ver a sua agenda.</p>`;
      return;
    }

    if (verMinha) tituloAgenda.textContent = `Agenda de ${obterMeuPrimeiroNome()}`;
    else tituloAgenda.textContent = colunas.length === 1 ? `Agenda de ${colunas[0].nome}` : "Agenda dos colaboradores";
    agenda.style.setProperty("--n-colab", colunas.length);
    agenda.style.setProperty("--n-horas", totalHoras);

    const cab = document.createElement("div");
    cab.className = "agenda-cabecalho";
    cab.innerHTML = `<div class="cab" style="background:transparent;"></div>`;
    colunas.forEach(colab => {
      const cabColab = document.createElement("div");
      cabColab.className = "cab";
      cabColab.style.background = colab.cor;
      cabColab.innerHTML = `<div class="cab-avatar"></div><div class="cab-nome"></div><div class="cab-cargo"></div>`;
      cabColab.querySelector(".cab-nome").textContent = colab.nome;
      cabColab.querySelector(".cab-cargo").textContent = colab.cargo;
      cab.appendChild(cabColab);
    });
    agenda.appendChild(cab);

    const corpo = document.createElement("div");
    corpo.className = "agenda-corpo";

    const colHorarios = document.createElement("div");
    colHorarios.className = "col-horarios";
    for (let h = horaInicio; h < horaFim; h++) {
      colHorarios.insertAdjacentHTML("beforeend", `<div class="hora-label">${String(h).padStart(2, "0")}</div>`);
    }
    corpo.appendChild(colHorarios);

    colunas.forEach(colab => {
      const editavel = colab.id === meuId;
      const col = document.createElement("div");
      col.className = "col-colab";
      for (let h = horaInicio; h < horaFim; h++) col.insertAdjacentHTML("beforeend", `<div class="linha-hora"></div>`);

      const doDia = agendamentos.filter(a => a.colaboradorId === colab.id && a.data === seletorData.value);

      calcularLayoutColuna(doDia).forEach(item => {
        const ag = item.ag;
        const [hIni, mIni] = ag.horaInicio.split(":").map(Number);
        const topPx = (((hIni - horaInicio) * 60 + mIni) / 60) * 48;
        const heightPx = Math.max((ag.duracaoMin / 60) * 48, 38);
        const largura = 100 / item.totalColunas;

        const bloco = document.createElement("div");
        bloco.className = "agendamento";
        bloco.style.cssText = `top:${topPx}px; height:${heightPx}px; left:calc(${item.coluna * largura}% + 2px); width:calc(${largura}% - 4px); background:${ag.cor};`;
        bloco.title = `Cliente: ${ag.cliente}\nServiço: ${ag.servico || "Não informado"}\nHorário: ${ag.horaInicio}`;

        if (editavel) {
          const btnX = document.createElement("button");
          btnX.type = "button";
          btnX.className = "remover";
          btnX.textContent = "✕";
          btnX.addEventListener("click", e => removerAgendamento(ag.id, e));
          bloco.appendChild(btnX);
        }
        const strong = document.createElement("strong");
        strong.textContent = ag.cliente;
        bloco.appendChild(strong);
        if (ag.servico) {
          const span = document.createElement("span");
          span.textContent = ag.servico;
          bloco.appendChild(span);
        }
        bloco.addEventListener("click", () => {
          alert(`📋 Detalhes do Agendamento:\n\nCliente: ${ag.cliente}\nServiço: ${ag.servico || "Não informado"}\nInício: ${ag.horaInicio}\nDuração: ${ag.duracaoMin} min\nData: ${ag.data}`);
        });
        col.appendChild(bloco);
      });

      corpo.appendChild(col);
    });

    agenda.appendChild(corpo);
  }

  seletorData.addEventListener("change", renderizarAgenda);

  // --- MODAL DE NOVO AGENDAMENTO (sempre na própria agenda) ---
  const modal = document.getElementById("modal-agendamento");
  const formAgend = document.getElementById("form-novo-agendamento");

  btnNovo.addEventListener("click", () => {
    const hojeISO = obterDataHojeISO();
    const campoData = document.getElementById("agend-data");
    campoData.min = hojeISO;
    campoData.value = seletorData.value >= hojeISO ? seletorData.value : hojeISO;
    modal.hidden = false;
  });
  const fecharModal = () => { modal.hidden = true; limparErroForm(formAgend); };
  document.getElementById("btn-fechar-modal").addEventListener("click", fecharModal);
  document.getElementById("btn-cancelar-agendamento").addEventListener("click", fecharModal);

  formAgend.addEventListener("submit", function (e) {
    e.preventDefault();

    const validacaoAgend = validarNovoAgendamento();
    if (validacaoAgend.erros.length > 0) {
      mostrarErroForm(formAgend, validacaoAgend.erros.join("\n"), validacaoAgend.campoErro);
      return;
    }
    limparErroForm(formAgend);
    const data = document.getElementById("agend-data").value;
    if (data < obterDataHojeISO()) {
      alert("Não é possível agendar em uma data que já passou. Escolha uma data de hoje em diante.");
      return;
    }
    const novo = {
      id: Date.now(),
      cliente: document.getElementById("agend-cliente").value,
      servico: document.getElementById("agend-servico").value,
      colaboradorId: meuId,
      data,
      horaInicio: document.getElementById("agend-hora-inicio").value,
      duracaoMin: parseInt(document.getElementById("agend-duracao").value),
      cor: document.getElementById("agend-cor").value
    };
    agendamentos.push(novo);
    salvarAgendamentosLocal(agendamentos);
    seletorData.value = data;
    filtro.value = "minha";
    renderizarEquipe();
    renderizarAgenda();
    fecharModal();
    formAgend.reset();
  });

  // --- SUPORTE ---
  const formSuporte = document.getElementById("form-suporte");
  const suporteSucesso = document.getElementById("suporte-sucesso");
  const suporteErro = document.getElementById("suporte-erro");
  const btnEnviar = document.getElementById("btn-enviar-suporte");

  formSuporte.addEventListener("submit", function (e) {
    e.preventDefault();
    suporteErro.style.display = "none";
    btnEnviar.disabled = true;
    const textoOriginal = btnEnviar.textContent;
    btnEnviar.textContent = "Enviando...";

    fetch("https://formsubmit.co/ajax/jonathanpinheiro484@gmail.com", {
      method: "POST",
      headers: { "Accept": "application/json" },
      body: new FormData(formSuporte)
    })
      .then(r => { if (!r.ok) throw new Error("Falha no envio"); return r.json(); })
      .then(() => {
        formSuporte.reset();
        formSuporte.style.display = "none";
        suporteSucesso.style.display = "block";
      })
      .catch(() => { suporteErro.style.display = "block"; })
      .finally(() => {
        btnEnviar.disabled = false;
        btnEnviar.textContent = textoOriginal;
      });
  });

  document.getElementById("btn-suporte-nova-mensagem").addEventListener("click", () => {
    suporteSucesso.style.display = "none";
    formSuporte.style.display = "block";
  });

  // Atualiza sozinho quando o dono/outro colaborador mexe nos dados em outra aba
  window.addEventListener("storage", function (e) {
    if (e.key !== CHAVE_AGENDAMENTOS && e.key !== CHAVE_COLABORADORES) return;
    agendamentos = lerJsonLocal(CHAVE_AGENDAMENTOS, []);
    colaboradores = lerJsonLocal(CHAVE_COLABORADORES, []);
    atualizarFiltroColaborador();
    renderizarEquipe();
    renderizarAgenda();
  });

  // --- INICIALIZAÇÃO ---
  // Ao entrar, o colaborador já cai na própria agenda (Minha agenda) aberta no dia de hoje
  seletorData.value = obterDataHojeISO();
  atualizarFiltroColaborador();
  filtro.value = "minha";
  renderizarEquipe();
  renderizarAgenda();
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

  if (modo === "cadastro") {
    container.classList.add("active");
  } else if (modo === "entrar") {
    container.classList.remove("active");
  }

  const formCadastro = document.getElementById("form-cadastro");
  const formLogin = document.getElementById("form-login");

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

      const nomeInput = formCadastro.querySelector('input[type="text"]');
      const emailInput = formCadastro.querySelector('input[type="email"]');
      const senhaInput = formCadastro.querySelector('input[type="password"]');

      const nome = nomeInput ? nomeInput.value.trim() : "";
      const email = emailInput ? emailInput.value.trim() : "";
      const senha = senhaInput ? senhaInput.value : "";

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
      window.location.href = "agenda.html";
    });
  }

  if (formLogin) {
    formLogin.addEventListener("submit", async function (e) {
      e.preventDefault();

      const emailInput = formLogin.querySelector('input[type="email"]');
      const senhaInput = formLogin.querySelector('input[type="password"]');

      const email = emailInput ? emailInput.value.trim() : "";
      const senha = senhaInput ? senhaInput.value : "";

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
      window.location.href = "agenda.html";
    });
  }
}


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


// =====================================================
// 5. PONTO DE ENTRADA — dispara cada bloco quando a página carrega.
// Cada função já verifica sozinha se deve ou não rodar naquela tela.
// =====================================================
document.addEventListener("DOMContentLoaded", function () {
  iniciarDashboard();
  iniciarColaborador();
  iniciarAuth();
  iniciarLanding();
});


// =======================================================
// Carrosel - Página Index (NÃO MEXER) - DEPOIMENTOS
// =======================================================
const track = document.querySelector('.carousel-track');
const prevBtn = document.querySelector('.carousel-btn.prev');
const nextBtn = document.querySelector('.carousel-btn.next');

// Função para atualizar o estado dos botões
function updateButtons() {
  const maxScrollLeft = track.scrollWidth - track.clientWidth;

  // Desabilita o botão "voltar" se estiver no início
  prevBtn.disabled = track.scrollLeft <= 0;

  // Desabilita o botão "próximo" se estiver no fim
  nextBtn.disabled = track.scrollLeft >= maxScrollLeft - 5;

  // Ajuste visual opcional
  prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
  nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
}

// Movimento para frente
nextBtn.addEventListener('click', () => {
  track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
  setTimeout(updateButtons, 500); // espera o scroll terminar
});

// Movimento para trás
prevBtn.addEventListener('click', () => {
  track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
  setTimeout(updateButtons, 500);
});

// Atualiza ao carregar e ao rolar manualmente
track.addEventListener('scroll', updateButtons);
updateButtons();


