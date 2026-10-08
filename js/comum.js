// =====================================================
// COMUM — GESTÃO INTEGRADA PRO
// Código usado por várias telas: configuração da API, chaves do
// localStorage, validações, mensagens de erro e saída da conta.
// Toda página que tem JavaScript carrega ESTE arquivo primeiro e
// depois o arquivo da própria tela. Exemplo (agenda.html):
//   <script src="js/comum.js"></script>
//   <script src="js/agenda.js"></script>
// =====================================================

// =====================================================
// 1. CONFIGURAÇÃO DA API (usado por todas as telas que falam com o backend)
// Troque BASE_URL pela URL real do backend de vocês.
// =====================================================
const API_CONFIG = {
  BASE_URL: "http://localhost:7244/api",

  ENDPOINTS: {
    LOGIN: "/Login",
    CADASTRO: "/Cadastro",
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

// --- FLUXO "ESCOLHER PLANO → CADASTRO → COMPRA" ---
const PAGINA_CADASTRO = "cadastro.html";      // tela de login/cadastro
const PAGINA_ASSINATURA = "assinatura.html";  // tela de compra do plano
// Planos aceitos no endereço (?plano=...) e o nome que aparece para o cliente
const NOMES_PLANOS_ASSINATURA = {
  basico: "Básico",
  profissional: "Profissional",
  completo: "Completo",
  premium: "Premium"
};

// --- ASSINATURA APROVADA → PLANO DO PAINEL ---
// A tela de compra (assinatura.html) grava a assinatura aqui quando o pagamento é aprovado.
const CHAVE_ASSINATURA = "assinaturaAtual";

// Plano que a agenda deve usar: o da assinatura aprovada e dentro da validade (senão, Grátis).
// Profissional/Completo/Premium liberam o financeiro como o Premium.
function lerPlanoAssinado() {
  const assinatura = lerJsonLocal(CHAVE_ASSINATURA, null);
  if (!assinatura || assinatura.status !== "aprovada") return "FREE";
  if (assinatura.validoAte && new Date(assinatura.validoAte) < new Date()) return "FREE";
  if (assinatura.plano === "BASICO") return "BASICO";
  if (assinatura.plano === "FREE") return "FREE";
  return "PREMIUM";
}

// --- SEGURANÇA: a seta "voltar" do navegador sai da conta (só no fluxo de compra pelo site) ---
// Fluxo pelo site (planos → cadastro → compra): ao voltar pela seta do navegador, a sessão é apagada.
// Dentro da agenda (painel do dono) a seta NÃO desloga: quem está logado e volta da tela de
// compra continua logado e pode escolher outro plano normalmente.
function sairDaConta() {
  localStorage.removeItem(CHAVE_SESSAO);
}
function sairAoVoltarNoNavegador(restauradaDoCache) {
  if (document.getElementById("layout-principal")) return; // painel do dono: não desloga
  sairDaConta();
  // A tela do colaborador só abre logada: se veio do cache, recarrega para ela mandar para o login
  if (restauradaDoCache && document.getElementById("layout-colaborador")) window.location.reload();
}
// Página restaurada do cache do navegador (o script não roda de novo nesse caso)
window.addEventListener("pageshow", function (e) {
  if (e.persisted) sairAoVoltarNoNavegador(true);
});

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
// Nome do cliente: só letras (com acento), espaço, hífen e apóstrofo.
// Começa e termina com letra, e os símbolos nunca ficam repetidos (ex: João Pereira, Maria-Clara, D'Ávila).
const NOME_CLIENTE_REGEX = /^\p{L}+(?:[ '-]\p{L}+)*$/u;

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

// Explica o que está errado no nome do cliente (números, símbolos ou formato)
function mensagemNomeClienteInvalido(nome) {
  if (/\p{N}/u.test(nome)) {
    return "O nome do cliente não pode ter números. Use apenas letras.";
  }
  if (/[^\p{L}\s'-]/u.test(nome)) {
    return "O nome do cliente não pode ter símbolos (como @ # $ % ! . , _). Use apenas letras, espaço, hífen (-) ou apóstrofo (').";
  }
  return "Digite o nome do cliente começando e terminando com letra, sem espaços ou símbolos repetidos. Exemplo: João Pereira";
}

// Validação ao vivo no campo "Cliente" (tela de Agendar Cliente):
// enquanto a pessoa digita, números e símbolos são barrados e aparece um aviso embaixo do campo.
function ativarValidacaoNomeCliente() {
  const campo = document.getElementById("agend-cliente");
  if (!campo) return; // esta página não tem a tela de agendar cliente

  campo.setAttribute("maxlength", AGEND_CLIENTE_MAX);
  campo.setAttribute("autocomplete", "off");
  campo.setAttribute("title", "Use apenas letras, espaço, hífen (-) e apóstrofo ('). Números e símbolos não são aceitos.");

  const dica = document.createElement("small");
  dica.style.cssText = "color:#e11d48; font-size:11px; display:none;";
  dica.textContent = "Só são permitidas letras, espaço, hífen (-) e apóstrofo ('). Números e símbolos não são aceitos.";
  campo.insertAdjacentElement("afterend", dica);

  campo.addEventListener("input", function () {
    const original = campo.value;

    // Aspas "curvas" viram apóstrofo comum
    const normalizado = original.replace(/[’‘`´]/g, "'");
    // Remove tudo que não for letra, espaço, hífen ou apóstrofo (números, @, #, $, %, ., , etc.)
    const semInvalidos = normalizado.replace(/[^\p{L}\s'-]/gu, "");
    const removeuInvalido = semInvalidos.length !== normalizado.length;

    // Arruma o formato: sem espaço/símbolo no começo e sem separadores repetidos
    const limpo = semInvalidos
      .replace(/\s+/g, " ")
      .replace(/^[ '-]+/, "")
      .replace(/([ '-])[ '-]+/g, "$1");

    if (limpo !== original) campo.value = limpo;
    dica.style.display = removeuInvalido ? "block" : "none";
  });

  if (campo.form) {
    campo.form.addEventListener("reset", () => { dica.style.display = "none"; });
  }
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
    coletor.falhar(mensagemNomeClienteInvalido(cliente), "agend-cliente");
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
// PONTO DE ENTRADA COMUM — roda em todas as páginas, antes do
// código da tela (comum.js é carregado primeiro).
// =====================================================
document.addEventListener("DOMContentLoaded", function () {
  // Chegou pela seta voltar/avançar do navegador? (só desloga fora do painel do dono)
  const navegacao = performance.getEntriesByType("navigation")[0];
  if (navegacao && navegacao.type === "back_forward") sairAoVoltarNoNavegador(false);

  // Validação ao vivo do campo Cliente (agenda.html e colaborador.html; nas outras não faz nada)
  ativarValidacaoNomeCliente();
});
