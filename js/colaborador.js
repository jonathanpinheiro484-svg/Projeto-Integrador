// =====================================================
// TELA DO COLABORADOR
// Usado em: colaborador.html
// Depende do js/comum.js (carregar ANTES deste arquivo).
// =====================================================

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

  // =====================================================
  // DONO NA AGENDA
  // O dono também atende clientes, então aparece como uma coluna da agenda,
  // igual a um colaborador. Ele usa o id 0 (os colaboradores começam no 1),
  // por isso nunca se mistura com a equipe.
  // =====================================================
  function obterDono() {
    return {
      id: 0,
      nome: localStorage.getItem("nomeUsuarioCadastrado") || "Dono",
      cargo: "Dono",
      cor: "#6c5ce7",
      ativo: true
    };
  }

  // Lista de colaboradores com o dono na primeira posição
  function comDono(listaColaboradores) {
    return [obterDono()].concat(listaColaboradores);
  }

  // =====================================================
  // SERVIÇOS DO BANCO NO AGENDAMENTO
  // Mesmo modelo da agenda do dono: cada linha é uma LISTA com os serviços cadastrados
  // no banco (GET /Servicos). Duração e valor vêm do cadastro do serviço (somente leitura).
  // Sem serviço no banco não há o que escolher: nada fica guardado só no navegador.
  // =====================================================
  const TEXTO_DICA_SERVICOS = "Marque quantos serviços forem necessários.";
  let servicos = [];            // [{ id, nome, valor, duracaoMin }] — só o que veio do banco
  let erroCarregarServicos = ""; // motivo de a lista estar vazia quando o GET /Servicos falha

  function formatarMoeda(v) { return "R$ " + Number(v || 0).toFixed(2).replace(".", ","); }

  // Máscara enquanto digita: (11) 91234-5678
  function formatarTelefone(valor) {
    const d = valor.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  // Devolve só os números com DDD (10 ou 11 dígitos) ou "" se for inválido
  function telefoneValido(valor) {
    const d = valor.replace(/\D/g, "");
    if (d.length < 10 || d.length > 11) return "";
    if (/^(\d)\1+$/.test(d)) return ""; // 00000000000, 11111111111...
    if (Number(d.slice(0, 2)) < 11) return ""; // DDD inexistente
    if (d.length === 11 && d[2] !== "9") return ""; // celular tem 9 depois do DDD
    return d;
  }

  // A API pode devolver a lista direto ou dentro de um objeto ({ dados: [...] }, { items: [...] }...)
  function extrairLista(resposta) {
    if (Array.isArray(resposta)) return resposta;
    if (resposta && typeof resposta === "object") {
      for (const chave of ["dados", "data", "items", "itens", "clientes", "agendamentos", "Agendamentos", "servicos", "Servicos", "servicosCadastrados", "result", "resultado", "$values", "value"]) {
        if (Array.isArray(resposta[chave])) return resposta[chave];
      }
    }
    return null;
  }

  // A API manda nome, duração e preço (maiúsculo ou minúsculo)
  function normalizarServicoApi(item) {
    if (!item) return null;
    const nome = String(item.nome ?? item.Nome ?? "").trim();
    if (!nome) return null;
    const id = Number(item.id ?? item.Id);
    return {
      id: Number.isFinite(id) ? id : Date.now() + Math.floor(Math.random() * 1000),
      nome,
      valor: Math.round((Number(item.preco ?? item.Preco ?? item.valor ?? item.Valor) || 0) * 100) / 100,
      duracaoMin: Number(item.duracaoMinutos ?? item.DuracaoMinutos ?? item.duracaoMin ?? item.duracao ?? item.Duracao) || 0
    };
  }

  // Lê os serviços do banco (GET /Servicos) e redesenha as listas. Se falhar, fica vazio com o motivo.
  // O login do colaborador é simulado no front e não tem token da API. Sem token, usa a cópia dos
  // serviços do banco que a agenda do dono grava a cada carga (chave "servicosDoBanco:<e-mail do dono>").
  const chaveServicosDoBanco = () => "servicosDoBanco:" + (localStorage.getItem("emailUsuarioLogado") || "dono").trim().toLowerCase();
  function lerServicosCopiaDoBanco() {
    return lerJsonLocal(chaveServicosDoBanco(), []).map(normalizarServicoApi).filter(Boolean);
  }

  async function recarregarServicosDoBanco() {
    if (!API_CONFIG.token) {
      servicos = lerServicosCopiaDoBanco();
      erroCarregarServicos = servicos.length ? "" : "Nenhum serviço disponível. Peça ao dono para abrir a agenda dele e conferir se há serviços cadastrados.";
    } else {
      try {
        const dados = await apiRequest("SERVICOS"); // GET: serviços do dono (token)
        // API sem conteúdo (204 / corpo vazio) = nenhum serviço no banco
        const lista = (dados === null || dados === undefined || dados === "") ? [] : extrairLista(dados);
        if (lista) {
          erroCarregarServicos = "";
          servicos = lista.map(normalizarServicoApi).filter(Boolean);
        } else {
          servicos = [];
          erroCarregarServicos = "A API respondeu, mas não devolveu uma lista de serviços reconhecível.";
        }
      } catch (erro) {
        console.warn("Não foi possível carregar serviços da API.", erro.message);
        servicos = [];
        erroCarregarServicos = "Não foi possível carregar os serviços do banco. " + mensagemErroApiComum(erro, "Erro ao buscar os serviços na API.");
      }
    }
    atualizarServicosAgendamento();
  }

  // Cada linha do agendamento é uma LISTA (select) com os serviços cadastrados.
  function selectsServicos() {
    const grupo = document.getElementById("agend-servicos-grupo");
    return grupo ? Array.from(grupo.querySelectorAll("select.servico-select")) : [];
  }
  function opcoesSelecionadas() {
    return selectsServicos().map(sel => sel.selectedOptions[0]).filter(op => op && op.value);
  }
  function calcularTotalServicos() {
    return opcoesSelecionadas().reduce((soma, op) => soma + (Number(op.dataset.valor) || 0), 0);
  }

  // Soma a duração e o valor dos serviços escolhidos e preenche os campos (somente leitura)
  function atualizarResumoServicos() {
    const resumo = document.getElementById("agend-servicos-resumo");
    const campoDuracao = document.getElementById("agend-duracao");
    const campoValor = document.getElementById("agend-valor");
    const escolhidas = opcoesSelecionadas();
    const minutos = escolhidas.reduce((soma, op) => soma + (Number(op.dataset.duracao) || 0), 0);
    if (escolhidas.length) {
      if (campoDuracao) campoDuracao.value = minutos > 0 ? minutos : "";
      if (campoValor) campoValor.value = formatarMoeda(calcularTotalServicos());
      if (resumo) resumo.textContent = "Total: " + formatarMoeda(calcularTotalServicos()) + " · " + minutos + " min";
    } else {
      // Sem serviço escolhido, duração e valor ficam vazios: sempre vêm do cadastro do serviço
      if (campoDuracao) campoDuracao.value = "";
      if (campoValor) campoValor.value = "";
      if (resumo) resumo.textContent = TEXTO_DICA_SERVICOS;
    }
  }

  function criarLinhaServico(nomeEscolhido, podeRemover) {
    const linha = document.createElement("div");
    linha.className = "servico-linha";
    const sel = document.createElement("select");
    sel.className = "servico-select";
    sel.setAttribute("aria-label", "Serviço");
    sel.innerHTML = '<option value="">Selecione o serviço...</option>';
    servicos.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).forEach(s => {
      const op = document.createElement("option");
      op.value = s.nome;
      op.dataset.valor = s.valor;
      op.dataset.duracao = s.duracaoMin;
      op.textContent = `${s.nome} · ${formatarMoeda(Number(s.valor) || 0)} · ${s.duracaoMin} min`;
      sel.appendChild(op);
    });
    if (nomeEscolhido && servicos.some(s => s.nome === nomeEscolhido)) sel.value = nomeEscolhido;
    sel.addEventListener("change", atualizarResumoServicos);
    linha.appendChild(sel);
    if (podeRemover) {
      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "btn-link";
      remover.style.color = "#e11d48";
      remover.textContent = "Remover";
      remover.addEventListener("click", () => { linha.remove(); atualizarResumoServicos(); });
      linha.appendChild(remover);
    }
    return linha;
  }

  // Refaz as listas do agendamento com os serviços do banco (mantém o que já estava escolhido)
  function atualizarServicosAgendamento(marcadosIniciais) {
    const grupo = document.getElementById("agend-servicos-grupo");
    if (!grupo) return;
    const jaMarcados = Array.isArray(marcadosIniciais) ? marcadosIniciais : lerServicosMarcados();
    grupo.innerHTML = "";
    const btnMais = document.getElementById("btn-mais-servico");
    if (!servicos.length) {
      const aviso = document.createElement("small");
      aviso.style.cssText = erroCarregarServicos ? "color:#e11d48;" : "color:var(--muted);";
      aviso.textContent = erroCarregarServicos || "Nenhum serviço cadastrado. O dono cadastra em Administração > Serviços.";
      grupo.appendChild(aviso);
      if (btnMais) btnMais.hidden = true;
      atualizarResumoServicos();
      return;
    }
    if (btnMais) btnMais.hidden = false;
    const nomes = jaMarcados.length ? jaMarcados : [""];
    nomes.forEach((nome, i) => grupo.appendChild(criarLinhaServico(nome, i > 0)));
    atualizarResumoServicos();
  }

  function prepararServicosMultiplos() {
    const select = document.getElementById("agend-servico");
    if (!select || select.tagName !== "SELECT") return;

    if (!document.getElementById("estilo-servicos-multiplos")) {
      const estilo = document.createElement("style");
      estilo.id = "estilo-servicos-multiplos";
      estilo.textContent =
        ".servicos-lista { display:flex; flex-direction:column; gap:8px; outline:none; }" +
        ".servico-linha { display:flex; align-items:center; gap:10px; }" +
        ".servico-linha select { flex:1; min-width:0; }";
      document.head.appendChild(estilo);
    }

    const grupo = document.createElement("div");
    grupo.id = "agend-servicos-grupo";
    grupo.className = "servicos-lista";
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", "Serviços");
    grupo.tabIndex = -1; // permite focar o grupo quando falta escolher o serviço

    // O id "agend-servico" continua existindo (escondido) porque a validação do
    // comum.js lê esse campo. Quem guarda os serviços de verdade são as listas acima.
    const campoEscondido = document.createElement("input");
    campoEscondido.type = "hidden";
    campoEscondido.id = "agend-servico";

    const btnMais = document.createElement("button");
    btnMais.type = "button";
    btnMais.id = "btn-mais-servico";
    btnMais.className = "btn-link";
    btnMais.textContent = "+ Adicionar outro serviço";
    btnMais.addEventListener("click", () => {
      const g = document.getElementById("agend-servicos-grupo");
      const linha = criarLinhaServico("", true);
      g.appendChild(linha);
      linha.querySelector("select").focus();
    });

    const dica = document.createElement("small");
    dica.id = "agend-servicos-resumo";
    dica.style.cssText = "font-size:11px; color:var(--muted);";
    dica.textContent = TEXTO_DICA_SERVICOS;

    const campo = select.parentElement;
    select.replaceWith(grupo);
    grupo.insertAdjacentElement("afterend", btnMais);
    btnMais.insertAdjacentElement("afterend", campoEscondido);
    campoEscondido.insertAdjacentElement("afterend", dica);

    const titulo = campo ? campo.querySelector(":scope > label") : null;
    if (titulo) titulo.textContent = "Serviço";
  }

  // Lista dos serviços escolhidos, ex.: ["Manicure", "Pedicure"]
  function lerServicosMarcados() {
    const nomes = selectsServicos().map(sel => sel.value).filter(Boolean);
    return nomes.filter((nome, i) => nomes.indexOf(nome) === i); // sem repetir o mesmo serviço
  }

  // Mesma validação de sempre (comum.js) + exigir pelo menos um serviço escolhido
  function validarAgendamentoComServicos() {
    const marcados = lerServicosMarcados();
    const campoEscondido = document.getElementById("agend-servico");
    // O comum.js só entende 1 serviço em texto; damos um texto curto só para ele não reclamar
    if (campoEscondido) campoEscondido.value = marcados.length ? "serviços marcados" : "";

    const resultado = validarNovoAgendamento();
    // Sem serviço escolhido a duração fica vazia de propósito: só o aviso do serviço aparece
    const erros = resultado.erros.filter(erro => erro !== "Preencha o serviço." && (marcados.length > 0 || !/dura[cç][aã]o/i.test(erro)));
    const erroNaDuracao = marcados.length === 0 && resultado.campoErro && resultado.campoErro.id === "agend-duracao";
    let campoErro = (resultado.campoErro === campoEscondido || erroNaDuracao) ? null : resultado.campoErro;

    if (marcados.length === 0) {
      erros.unshift("Escolha pelo menos um serviço.");
      if (!campoErro) campoErro = selectsServicos()[0] || document.getElementById("agend-servicos-grupo");
    }
    return { erros, campoErro };
  }

  prepararServicosMultiplos();
  atualizarServicosAgendamento();

  // Só colaborador logado entra aqui
  const sessao = lerJsonLocal(CHAVE_SESSAO, null);
  if (!sessao || sessao.perfil !== "COLABORADOR") {
    window.location.href = "cadastro.html?modo=entrar";
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
  const horaFim = 19;
  const colunasVisiveis = 5;
  let paginaAtual = 0;
  let totalPaginasAtual = 1;
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
    return comDono(colaboradores).filter(c => c.ativo !== false && c.id !== meuId);
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
  const textoPerfil = document.getElementById("texto-perfil");
  if (textoPerfil) {
    const meuReg = colaboradores.find(c => c.id === meuId);
    textoPerfil.textContent = String((meuReg && meuReg.nome) || sessao.nome || "Colaborador").trim().split(/\s+/)[0];
  }

  document.querySelectorAll(".menu-item[data-menu]").forEach(item => {
    item.addEventListener("click", function () {
      const aba = this.dataset.menu;
      document.querySelectorAll(".menu-item[data-menu]").forEach(m => m.classList.toggle("ativo", m === this));
      document.getElementById("secao-agenda").style.display = aba === "Agenda" ? "block" : "none";
      document.getElementById("secao-suporte").style.display = aba === "Suporte" ? "block" : "none";
    });
  });

  // Sair: pergunta "tem certeza?"; confirmando, apaga a sessão e volta para o login
  const btnSair = document.getElementById("btn-sair");
  const modalSair = document.getElementById("modal-sair");
  const sair = () => {
    localStorage.removeItem(CHAVE_SESSAO);
    window.location.replace("cadastro.html?modo=entrar");
  };
  const fecharModalSair = () => { modalSair.hidden = true; };
  const pedirConfirmacaoSair = () => {
    modalSair.hidden = false;
    document.getElementById("manter-login").focus();
  };
  btnSair.addEventListener("click", pedirConfirmacaoSair);
  btnSair.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pedirConfirmacaoSair(); } });
  document.getElementById("confirmar-sair").addEventListener("click", sair);
  document.getElementById("manter-login").addEventListener("click", fecharModalSair);
  document.getElementById("btn-fechar-sair").addEventListener("click", fecharModalSair);
  modalSair.addEventListener("click", (e) => { if (e.target === modalSair) fecharModalSair(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalSair.hidden) fecharModalSair(); });

  // --- MOSTRAR / ESCONDER MENU LATERAL ---
  const btnGestao = document.getElementById("btn-gestao");
  const sidebar = document.getElementById("sidebar-principal");
  const btnMostrarSidebar = document.getElementById("btn-mostrar-sidebar");
  function alternarMenuLateral() {
    const vaiEsconder = !sidebar.classList.contains("oculta");
    sidebar.classList.toggle("oculta", vaiEsconder);
    layout.classList.toggle("sidebar-oculta", vaiEsconder);
    btnMostrarSidebar.classList.toggle("mostrar", vaiEsconder);
  }
  btnGestao.addEventListener("click", alternarMenuLateral);
  btnGestao.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternarMenuLateral(); }
  });
  btnMostrarSidebar.addEventListener("click", alternarMenuLateral);

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
    paginaAtual = 0;
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
      paginaAtual = 0;
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

  // =====================================================
  // AGENDAMENTOS NA API (mesmas rotas da agenda do dono)
  // Com token da API: lê (GET), cria (POST), edita (PUT) e muda o status (PATCH) no banco.
  // Sem token (login local do colaborador): continua tudo só neste navegador, como antes.
  // =====================================================
  const CHAVE_AGENDAMENTOS_OCULTOS = "agendamentosOcultos";   // a mesma da agenda do dono
  const CHAVE_STATUS_AGENDAMENTOS = "statusAgendamentosLocal"; // a mesma da agenda do dono
  const assinaturaAgendamento = ag => `${ag.id}|${ag.data}|${ag.horaInicio}`;

  function lerStatusLocal() {
    try {
      const obj = JSON.parse(localStorage.getItem(CHAVE_STATUS_AGENDAMENTOS) || "{}");
      return obj && typeof obj === "object" ? obj : {};
    } catch (_) { return {}; }
  }
  function guardarStatusLocal(id, status) {
    try {
      const obj = lerStatusLocal();
      obj[id] = status;
      localStorage.setItem(CHAVE_STATUS_AGENDAMENTOS, JSON.stringify(obj));
    } catch (_) { /* sem armazenamento */ }
  }
  function normalizarStatusAgendamento(v) {
    const t = String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (t.startsWith("conclu")) return "Concluido";
    if (t.startsWith("cancel")) return "Cancelado";
    if (t.startsWith("remarc")) return "Remarcado";
    if (t.startsWith("naocompar") || t.startsWith("nao compar") || t.startsWith("falt")) return "NaoCompareceu";
    if (t.startsWith("agend")) return "Agendado";
    return "";
  }
  function resolverStatusAgendamento(statusApi, id) {
    const guardado = lerStatusLocal()[id] || "";
    if ((!statusApi || statusApi === "Agendado" || statusApi === "Remarcado") && guardado) return guardado;
    return statusApi || "";
  }
  function dataApiParaISO(v) {
    const t = String(v ?? "").trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  }
  function horaApiParaHHMM(v) {
    const m = String(v ?? "").match(/(\d{1,2}):(\d{2})/);
    return m ? m[1].padStart(2, "0") + ":" + m[2] : "";
  }

  // Agendamento que veio da API -> formato usado pela agenda
  function normalizarAgendamentoApi(item) {
    if (!item) return null;
    const id = Number(item.id ?? item.Id ?? item.agendamentoId ?? item.AgendamentoId);
    const brutoData = item.data ?? item.Data ?? item.dataAgendamento ?? item.DataAgendamento ?? item.dataHora ?? item.DataHora ?? item.dataHoraInicio ?? item.DataHoraInicio;
    const data = dataApiParaISO(brutoData);
    const hora = horaApiParaHHMM(item.horaInicio ?? item.HoraInicio ?? item.hora ?? item.Hora) || horaApiParaHHMM(brutoData);
    if (!Number.isFinite(id) || !data || !hora) return null;

    const cli = item.cliente ?? item.Cliente;
    const idCliente = item.clienteId ?? item.ClienteId ?? (cli && typeof cli === "object" ? (cli.id ?? cli.Id) : undefined);
    const clienteLista = idCliente != null ? clientes.find(c => String(c.id) === String(idCliente)) : null;
    const nomeCliente = item.clienteNome ?? item.ClienteNome ?? item.nomeCliente ?? item.NomeCliente
      ?? (cli && typeof cli === "object" ? (cli.nome ?? cli.Nome) : cli) ?? (clienteLista ? clienteLista.nome : "");
    const telefoneCliente = item.whatsapp ?? item.Whatsapp ?? item.telefone ?? item.Telefone
      ?? (cli && typeof cli === "object" ? (cli.telefone ?? cli.Telefone) : undefined) ?? (clienteLista ? clienteLista.telefone : "");

    const achaServico = idSv => servicos.find(s => String(s.id) === String(idSv));
    let nomesServ = [];
    const listaServ = item.servicos ?? item.Servicos;
    if (Array.isArray(listaServ)) {
      nomesServ = listaServ.map(sv => {
        if (typeof sv === "string") return sv;
        if (typeof sv === "number") { const a = achaServico(sv); return a ? a.nome : null; }
        if (!sv) return null;
        const nome = sv.nome ?? sv.Nome;
        if (nome) return nome;
        const a = achaServico(sv.id ?? sv.Id ?? sv.servicoId ?? sv.ServicoId);
        return a ? a.nome : null;
      }).filter(Boolean);
    }
    if (!nomesServ.length) {
      const ids = item.servicoIds ?? item.ServicoIds;
      const listaIds = Array.isArray(ids) ? ids : [item.servicoId ?? item.ServicoId].filter(v => v != null);
      nomesServ = listaIds.map(idSv => { const a = achaServico(idSv); return a ? a.nome : null; }).filter(Boolean);
    }
    const textoServ = item.servicoNome ?? item.ServicoNome ?? item.servico ?? item.Servico ?? "";
    if (!nomesServ.length && typeof textoServ === "string" && textoServ) nomesServ = [textoServ];
    const cadastrados = nomesServ.map(n => servicos.find(s => String(s.nome).toLowerCase() === String(n).toLowerCase())).filter(Boolean);

    const duracaoApi = Number(item.duracaoMinutos ?? item.DuracaoMinutos ?? item.duracaoMin ?? item.duracao ?? item.Duracao);
    const valorApi = Number(item.valor ?? item.Valor ?? item.preco ?? item.Preco ?? item.valorTotal ?? item.ValorTotal);
    return {
      id,
      cliente: String(nomeCliente || ""),
      servico: nomesServ.length ? listaEmTexto(nomesServ) : "",
      servicos: nomesServ,
      colaboradorId: Number(item.colaboradorId ?? item.ColaboradorId ?? 0) || 0,
      data,
      horaInicio: hora,
      duracaoMin: duracaoApi > 0 ? duracaoApi : (cadastrados.reduce((s, sv) => s + (Number(sv.duracaoMin) || 0), 0) || 30),
      cor: item.cor ?? item.Cor ?? "#3d5a80",
      valor: Number.isFinite(valorApi) && valorApi > 0 ? valorApi : cadastrados.reduce((s, sv) => s + (Number(sv.valor) || 0), 0),
      whatsapp: String(telefoneCliente || "").replace(/\D/g, ""),
      status: resolverStatusAgendamento(normalizarStatusAgendamento(item.status ?? item.Status), id)
    };
  }

  // Lê os agendamentos do banco (GET /Agendamentos). Devolve true se leu; false se não tem token ou deu erro.
  async function recarregarAgendamentosDoBanco() {
    if (!API_CONFIG.token) return false;
    try {
      const dados = await apiRequest("AGENDAMENTOS");
      const lista = (dados === null || dados === undefined || dados === "") ? [] : extrairLista(dados);
      if (!lista) return false;
      const doBanco = lista.map(normalizarAgendamentoApi).filter(Boolean);
      if (lista.length && !doBanco.length) return false;
      const ocultos = lerJsonLocal(CHAVE_AGENDAMENTOS_OCULTOS, []);
      agendamentos = doBanco.filter(ag => !ocultos.includes(assinaturaAgendamento(ag)));
      salvarAgendamentosLocal(agendamentos);
      renderizarAgenda();
      return true;
    } catch (erro) {
      console.warn("Não foi possível carregar agendamentos da API.", erro.message);
      return false;
    }
  }

  // Corpo do POST/PUT /Agendamentos (mesmo formato da agenda do dono)
  function montarCorpoAgendamentoApi(ag) {
    const nomeCliente = String(ag.cliente || "").trim().toLowerCase();
    const cliente = clientes.find(c => c.nome.toLowerCase() === nomeCliente);
    if (!cliente || cliente.id === null || cliente.id === undefined) {
      return { erro: 'Escolha um cliente cadastrado na lista, ou cadastre um novo em "+ Cadastrar novo cliente".' };
    }
    const servicoIds = [];
    for (const nome of (ag.servicos && ag.servicos.length ? ag.servicos : (ag.servico ? [ag.servico] : []))) {
      const sv = servicos.find(x => String(x.nome).toLowerCase() === String(nome).toLowerCase());
      if (!sv || !Number.isFinite(Number(sv.id))) {
        return { erro: `O serviço "${nome}" não está no banco. Recarregue a página e tente de novo.` };
      }
      servicoIds.push(Number(sv.id));
    }
    const hora = String(ag.horaInicio || "");
    return {
      corpo: {
        clienteId: Number(cliente.id),
        colaboradorId: ag.colaboradorId === 0 ? null : ag.colaboradorId,
        servicoId: servicoIds[0],
        servicoIds,
        data: ag.data,
        horaInicio: hora.length === 5 ? hora + ":00" : hora,
        duracaoMinutos: ag.duracaoMin,
        valor: ag.valor,
        cor: ag.cor,
        ...(ag.status ? { status: ag.status === "Remarcado" ? "Agendado" : ag.status } : {}) // a API não conhece "Remarcado"
      }
    };
  }

  // --- AGENDA: a própria (editável) ou a dos outros (somente consulta) ---
  const rotuloStatusBloco = { Remarcado: "↻ Remarcado", Concluido: "✓ Concluído", Cancelado: "Cancelado", NaoCompareceu: "Não compareceu" };

  function dataBR(iso) {
    const [a, m, d] = String(iso || "").split("-");
    return `${d}/${m}/${a}`;
  }

  async function removerAgendamento(id, event) {
    if (event) event.stopPropagation();
    // Só pode apagar da própria agenda
    const alvo = agendamentos.find(a => a.id === id);
    if (!alvo || alvo.colaboradorId !== meuId) return;
    if (API_CONFIG.token) {
      // A API não apaga agendamento: marca como Cancelado (PATCH /Agendamentos/{id}/status)
      try {
        await cancelarAgendamentoApi(id);
      } catch (erro) {
        alert(mensagemErroApiComum(erro, "Não foi possível remover o agendamento no banco."));
        return;
      }
      // No banco ele continua (como Cancelado): fica "escondido" para não voltar quando a agenda recarregar
      const ocultos = lerJsonLocal(CHAVE_AGENDAMENTOS_OCULTOS, []);
      const assinatura = assinaturaAgendamento(alvo);
      if (!ocultos.includes(assinatura)) {
        ocultos.push(assinatura);
        localStorage.setItem(CHAVE_AGENDAMENTOS_OCULTOS, JSON.stringify(ocultos));
      }
    }
    agendamentos = agendamentos.filter(a => a.id !== id);
    salvarAgendamentosLocal(agendamentos);
    renderizarAgenda();
  }

  // Clicou no card: abre os detalhes (na própria agenda, de lá dá para concluir, cancelar e editar)
  function verDetalhesAgendamento(ag) {
    const modalDet = document.getElementById("modal-detalhes-agendamento");
    if (!modalDet) return;
    const editavel = ag.colaboradorId === meuId;
    const colab = comDono(colaboradores).find(c => c.id === ag.colaboradorId);
    const set = (id, texto) => { document.getElementById(id).textContent = texto; };
    set("det-cliente", ag.cliente || "—");
    set("det-servico", ag.servico || "Não informado");
    set("det-profissional", colab ? colab.nome : "—");
    set("det-data", ag.data ? dataBR(ag.data) : "—");
    set("det-horario", ag.horaInicio || "—");
    set("det-duracao", ag.duracaoMin ? ag.duracaoMin + " min" : "—");
    set("det-valor", ag.valor ? formatarMoeda(Number(ag.valor)) : "—");
    set("det-whatsapp", ag.whatsapp ? formatarTelefone(ag.whatsapp) : "—");
    document.getElementById("det-linha-whatsapp").hidden = !ag.whatsapp;

    const btnZap = document.getElementById("btn-whatsapp-detalhes");
    btnZap.hidden = !telefoneValido(ag.whatsapp || "");
    btnZap.onclick = () => {
      const numero = telefoneValido(ag.whatsapp || "");
      if (!numero) { alert("Este agendamento não tem um WhatsApp válido."); return; }
      const mensagem =
        `Olá, ${ag.cliente}! Passando para lembrar do seu horário` +
        `${ag.servico ? " de " + ag.servico : ""} no dia ${dataBR(ag.data)} às ${ag.horaInicio}` +
        `${colab ? " com " + colab.nome : ""}. Você confirma?`;
      window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener");
    };

    const selectStatus = document.getElementById("det-status");
    const msgStatus = document.getElementById("det-status-msg");
    const btnConcluir = document.getElementById("btn-concluir-agendamento-det");
    const btnCancelarAg = document.getElementById("btn-cancelar-agendamento-det");
    const btnEditarAg = document.getElementById("btn-editar-agendamento");
    const pintarStatus = () => selectStatus.setAttribute("data-status", selectStatus.value);
    const mostrarMsgStatus = (texto) => {
      msgStatus.textContent = texto;
      msgStatus.style.display = texto ? "block" : "none";
    };
    const atualizarBotoes = () => {
      const fechado = ag.status === "Cancelado" || ag.status === "Concluido";
      btnConcluir.hidden = !editavel || fechado;
      btnCancelarAg.hidden = !editavel || fechado;
      btnEditarAg.hidden = !editavel || ag.status === "Cancelado"; // cancelado não edita mais
    };
    selectStatus.value = ag.status || "Agendado";
    selectStatus.disabled = true; // o status só muda pelos botões Concluído e Cancelar
    pintarStatus();
    mostrarMsgStatus("");
    atualizarBotoes();

    // PATCH /Agendamentos/{id}/status (com token). Sem token, vale só neste navegador.
    const salvarStatus = async (novoStatus) => {
      const anterior = ag.status || "Agendado";
      selectStatus.value = novoStatus;
      pintarStatus();
      mostrarMsgStatus("");
      try {
        if (API_CONFIG.token) {
          const montado = montarCorpoAgendamentoApi(Object.assign({}, ag, { status: novoStatus }));
          await atualizarStatusAgendamentoApi(ag.id, novoStatus, montado.erro ? null : montado.corpo);
        }
        ag.status = novoStatus;
        guardarStatusLocal(ag.id, novoStatus);
        const naLista = agendamentos.find(a => a.id === ag.id);
        if (naLista) naLista.status = novoStatus;
        salvarAgendamentosLocal(agendamentos);
        renderizarAgenda();
      } catch (erro) {
        console.warn("[API] erro ao salvar o status do agendamento:", erro.message);
        selectStatus.value = anterior;
        pintarStatus();
        mostrarMsgStatus(mensagemErroApiComum(erro, "Não foi possível salvar o status no banco."));
      }
      atualizarBotoes();
    };

    btnConcluir.onclick = async () => {
      if (!confirm("Marcar este agendamento como Concluído?")) return;
      await salvarStatus("Concluido");
    };
    btnCancelarAg.onclick = async () => {
      if (!confirm("Cancelar este agendamento? O status vai mudar para Cancelado.")) return;
      await salvarStatus("Cancelado");
    };

    const fechar = () => { modalDet.hidden = true; };
    document.getElementById("btn-fechar-detalhes").onclick = fechar;
    document.getElementById("btn-fechar-detalhes-2").onclick = fechar;
    modalDet.onclick = (e) => { if (e.target === modalDet) fechar(); };
    btnEditarAg.onclick = () => { if (!editavel || ag.status === "Cancelado") return; fechar(); abrirEdicaoAgendamento(ag); };
    modalDet.hidden = false;
  }
  document.addEventListener("keydown", (e) => {
    const modalDet = document.getElementById("modal-detalhes-agendamento");
    if (e.key === "Escape" && modalDet && !modalDet.hidden) modalDet.hidden = true;
  });

  // --- EDITAR AGENDAMENTO (abre o mesmo formulário do novo agendamento, já preenchido) ---
  let agendamentoEditandoId = null; // null = é um agendamento novo

  function popularProfissionaisAgendamento() {
    selectProfissional.innerHTML = "";
    const meu = obterMeuColaborador();
    const opcao = document.createElement("option");
    opcao.value = String(meuId);
    opcao.textContent = meu ? meu.nome : (sessao.nome || "Eu");
    selectProfissional.appendChild(opcao);
  }

  function definirModoEdicaoAgendamento(editando) {
    const titulo = document.getElementById("modal-agendamento-titulo");
    const botao = document.getElementById("btn-confirmar-agendamento");
    if (titulo) titulo.textContent = editando ? "Editar Agendamento" : "Agendar Cliente";
    if (botao) botao.textContent = editando ? "Salvar alterações" : "Confirmar Agendamento";
  }

  function abrirEdicaoAgendamento(ag) {
    if (ag.colaboradorId !== meuId) return; // só edita a própria agenda
    agendamentoEditandoId = ag.id;
    definirModoEdicaoAgendamento(true);
    limparErroForm(formAgend);
    popularProfissionaisAgendamento();
    selectProfissional.value = String(ag.colaboradorId);

    document.getElementById("agend-cliente").value = ag.cliente || "";
    const zap = document.getElementById("agend-whatsapp");
    if (zap) zap.value = ag.whatsapp ? formatarTelefone(ag.whatsapp) : "";
    const hojeISO = obterDataHojeISO();
    const campoData = document.getElementById("agend-data");
    campoData.min = ag.data < hojeISO ? ag.data : hojeISO; // permite manter a data de um agendamento antigo
    campoData.value = ag.data;
    document.getElementById("agend-hora-inicio").value = ag.horaInicio;
    document.getElementById("agend-cor").value = ag.cor || "#3d5a80";

    const campoDuracao = document.getElementById("agend-duracao");
    campoDuracao.value = ag.duracaoMin;
    atualizarServicosAgendamento(Array.isArray(ag.servicos) ? ag.servicos : (ag.servico ? [ag.servico] : []));
    // Serviço antigo que não está mais cadastrado: mantém a duração que o agendamento já tinha
    if (!campoDuracao.value) campoDuracao.value = ag.duracaoMin;
    modal.hidden = false;
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
    const verTodos = filtro.value === "todos";
    avisoLeitura.hidden = verMinha;
    btnNovo.style.display = verMinha ? "" : "none";

    let colunasTodas;
    if (verMinha) colunasTodas = [meu];
    else if (verTodos) colunasTodas = outros;
    else colunasTodas = outros.filter(c => String(c.id) === filtro.value);

    // Paginação (5 colunas por página quando a lista é de todos os colaboradores)
    totalPaginasAtual = verTodos ? Math.max(Math.ceil(colunasTodas.length / colunasVisiveis), 1) : 1;
    if (paginaAtual > totalPaginasAtual - 1) paginaAtual = totalPaginasAtual - 1;
    if (paginaAtual < 0) paginaAtual = 0;
    document.getElementById("pag-info").textContent = `${paginaAtual + 1} de ${totalPaginasAtual}`;
    const colunas = verTodos ? colunasTodas.slice(paginaAtual * colunasVisiveis, paginaAtual * colunasVisiveis + colunasVisiveis) : colunasTodas;

    const tituloAgenda = document.getElementById("agenda-titulo");

    if (colunas.length === 0) {
      tituloAgenda.textContent = "Agenda dos colaboradores";
      agenda.style.setProperty("--n-colab", 1);
      agenda.innerHTML = `<p style="padding:24px; text-align:center; color:#888;">Não há outros colaboradores ativos para mostrar. Escolha o seu nome no filtro para ver a sua agenda.</p>`;
      return;
    }

    if (verMinha) tituloAgenda.textContent = `Agenda de ${obterMeuPrimeiroNome()}`;
    else tituloAgenda.textContent = colunas.length === 1 && !verTodos ? `Agenda de ${colunas[0].nome}` : "Agenda dos colaboradores";
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
        const heightPx = Math.max((ag.duracaoMin / 60) * 48, 52); // altura mínima: cabem o ✕ e a tag de status
        const largura = 100 / item.totalColunas;

        const bloco = document.createElement("div");
        bloco.className = "agendamento";
        bloco.style.cssText = `top:${topPx}px; height:${heightPx}px; left:calc(${item.coluna * largura}% + 2px); width:calc(${largura}% - 4px); background:${ag.cor};`;
        bloco.title = `Cliente: ${ag.cliente}\nServiço: ${ag.servico || "Não informado"}\nHorário: ${ag.horaInicio}${ag.status && ag.status !== "Agendado" ? "\nStatus: " + (rotuloStatusBloco[ag.status] || ag.status) : ""}`;

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
        if (rotuloStatusBloco[ag.status]) {
          const tag = document.createElement("em");
          tag.className = `tag-status tag-${ag.status}`;
          tag.textContent = rotuloStatusBloco[ag.status];
          bloco.appendChild(tag);
        }
        bloco.addEventListener("click", () => verDetalhesAgendamento(ag));
        col.appendChild(bloco);
      });

      corpo.appendChild(col);
    });

    agenda.appendChild(corpo);
  }

  seletorData.addEventListener("change", renderizarAgenda);

  // --- PAGINAÇÃO ---
  document.getElementById("btn-pag-anterior").addEventListener("click", () => {
    if (paginaAtual > 0) { paginaAtual--; renderizarAgenda(); }
  });
  document.getElementById("btn-pag-proxima").addEventListener("click", () => {
    if (paginaAtual < totalPaginasAtual - 1) { paginaAtual++; renderizarAgenda(); }
  });

  // --- MODAL DE NOVO AGENDAMENTO / EDIÇÃO (sempre na própria agenda) ---
  const modal = document.getElementById("modal-agendamento");
  const formAgend = document.getElementById("form-novo-agendamento");
  const selectProfissional = document.getElementById("agend-profissional");

  btnNovo.addEventListener("click", () => {
    agendamentoEditandoId = null;
    definirModoEdicaoAgendamento(false);
    popularProfissionaisAgendamento();
    const hojeISO = obterDataHojeISO();
    const campoData = document.getElementById("agend-data");
    campoData.min = hojeISO;
    campoData.value = seletorData.value >= hojeISO ? seletorData.value : hojeISO;
    atualizarServicosAgendamento();
    modal.hidden = false;
    recarregarServicosDoBanco(); // traz os serviços que o dono cadastrou/alterou há pouco
  });
  formAgend.addEventListener("reset", () => setTimeout(() => atualizarServicosAgendamento([]), 0));
  const fecharModal = () => {
    modal.hidden = true;
    limparErroForm(formAgend);
    if (agendamentoEditandoId !== null) { // cancelou/terminou uma edição: deixa o formulário limpo
      agendamentoEditandoId = null;
      formAgend.reset();
      definirModoEdicaoAgendamento(false);
    }
  };
  document.getElementById("btn-fechar-modal").addEventListener("click", fecharModal);
  document.getElementById("btn-cancelar-agendamento").addEventListener("click", fecharModal);

  formAgend.addEventListener("submit", async function (e) {
    e.preventDefault();

    const validacaoAgend = validarAgendamentoComServicos();
    if (validacaoAgend.erros.length > 0) {
      mostrarErroForm(formAgend, validacaoAgend.erros.join("\n"), validacaoAgend.campoErro);
      return;
    }
    // Telefone do cliente (opcional; se preencher, precisa ser válido)
    let whatsappCliente = "";
    const campoZap = document.getElementById("agend-whatsapp");
    if (campoZap && campoZap.value.trim()) {
      whatsappCliente = telefoneValido(campoZap.value);
      if (!whatsappCliente) {
        mostrarErroForm(formAgend, "Digite um telefone válido com DDD. Exemplo: (11) 91234-5678", campoZap);
        return;
      }
    }
    limparErroForm(formAgend);

    const data = document.getElementById("agend-data").value;
    const horaEscolhida = document.getElementById("agend-hora-inicio").value;
    const original = agendamentoEditandoId !== null ? agendamentos.find(a => a.id === agendamentoEditandoId) : null;
    const manteveData = !!original && original.data === data; // editar sem mudar o dia é permitido
    if (data < obterDataHojeISO() && !manteveData) {
      alert("Não é possível agendar em uma data que já passou. Escolha uma data de hoje em diante.");
      return;
    }
    // Editou e mudou o dia ou a hora = o status vira "Remarcado"
    const mudouDiaOuHora = !!original && (original.data !== data || original.horaInicio !== horaEscolhida);

    const novo = {
      id: Date.now(),
      cliente: document.getElementById("agend-cliente").value,
      servico: listaEmTexto(lerServicosMarcados()), // texto: "Manicure e Pedicure"
      servicos: lerServicosMarcados(),              // lista: ["Manicure", "Pedicure"]
      colaboradorId: meuId,
      data,
      horaInicio: horaEscolhida,
      duracaoMin: parseInt(document.getElementById("agend-duracao").value),
      cor: document.getElementById("agend-cor").value,
      valor: calcularTotalServicos(), // soma dos valores fixos dos serviços escolhidos
      whatsapp: whatsappCliente,
      status: mudouDiaOuHora ? "Remarcado" : (original ? original.status : undefined)
    };

    const aplicarLocal = () => {
      if (agendamentoEditandoId !== null) agendamentos = agendamentos.map(a => a.id === agendamentoEditandoId ? novo : a);
      else agendamentos.push(novo);
      salvarAgendamentosLocal(agendamentos);
    };

    if (API_CONFIG.token) {
      // Com token: grava no banco (POST ou PUT /Agendamentos). Só entra na agenda o que foi gravado.
      const montado = montarCorpoAgendamentoApi(novo);
      if (montado.erro) {
        mostrarErroForm(formAgend, montado.erro, document.getElementById("agend-cliente"));
        return;
      }
      const btnConfirmar = document.getElementById("btn-confirmar-agendamento");
      if (btnConfirmar) btnConfirmar.disabled = true;
      try {
        if (agendamentoEditandoId !== null) {
          await editarAgendamentoApi(agendamentoEditandoId, montado.corpo);
          novo.id = agendamentoEditandoId;
          if (mudouDiaOuHora) guardarStatusLocal(agendamentoEditandoId, "Remarcado");
        } else {
          const criado = await criarAgendamentoApi(montado.corpo);
          const idCriado = criado && typeof criado === "object" ? Number(criado.id ?? criado.Id) : NaN;
          if (Number.isFinite(idCriado)) novo.id = idCriado;
        }
      } catch (erro) {
        console.warn("[API] erro ao salvar agendamento:", erro.message);
        mostrarErroForm(formAgend, mensagemErroApiComum(erro, "Não foi possível salvar o agendamento no banco."), null);
        return;
      } finally {
        if (btnConfirmar) btnConfirmar.disabled = false;
      }
      const recarregou = await recarregarAgendamentosDoBanco(); // pega o que ficou gravado de verdade
      if (!recarregou) aplicarLocal();
    } else {
      aplicarLocal();
    }
    seletorData.value = data;
    filtro.value = "minha";
    paginaAtual = 0;
    renderizarEquipe();
    renderizarAgenda();
    fecharModal();
    formAgend.reset();
  });

  // =====================================================
  // CLIENTES (os mesmos do dono)
  // POST /Clientes cadastra { nome, telefone }; GET /Clientes devolve os clientes do dono do token.
  // A lista local usa a MESMA chave da agenda do dono, então os dois enxergam os mesmos clientes.
  // =====================================================
  let clientes = []; // [{ id, nome, telefone (só números) }]
  const chaveClientes = () => "clientesCadastrados:" + (localStorage.getItem("emailUsuarioLogado") || "dono").trim().toLowerCase();

  function normalizarCliente(c) {
    if (!c) return null;
    const nome = String(c.nome ?? c.Nome ?? "").trim();
    if (!nome) return null;
    return {
      id: c.id ?? c.Id ?? null,
      nome,
      telefone: String(c.telefone ?? c.Telefone ?? "").replace(/\D/g, "")
    };
  }

  function salvarClientesLocal() {
    try { localStorage.setItem(chaveClientes(), JSON.stringify(clientes)); } catch (e) { /* sem armazenamento: vale só nesta visita */ }
  }

  function atualizarListaClientes() {
    const lista = document.getElementById("lista-clientes");
    if (!lista) return;
    lista.innerHTML = "";
    clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).forEach(c => {
      const opcao = document.createElement("option");
      opcao.value = c.nome;
      opcao.label = c.telefone ? c.nome + " · " + formatarTelefone(c.telefone) : c.nome;
      lista.appendChild(opcao);
    });
  }

  async function carregarClientes() {
    clientes = lerJsonLocal(chaveClientes(), []).map(normalizarCliente).filter(Boolean);
    atualizarListaClientes();
    if (!API_CONFIG.token) return;
    try {
      const dados = await apiRequest("CLIENTES"); // GET: a API devolve só os clientes do dono do token
      const listaApi = extrairLista(dados);
      if (listaApi) {
        clientes = listaApi.map(normalizarCliente).filter(Boolean);
        salvarClientesLocal();
        atualizarListaClientes();
      }
    } catch (erro) {
      console.warn("Não foi possível carregar clientes da API.", erro.message);
    }
  }

  // Escolheu (ou digitou) um cliente cadastrado no agendamento: já traz o telefone dele no WhatsApp
  const campoClienteAgend = document.getElementById("agend-cliente");
  const campoWhatsappAgend = document.getElementById("agend-whatsapp");
  if (campoClienteAgend) {
    const preencherTelefoneDoCliente = () => {
      const nome = campoClienteAgend.value.trim().toLowerCase();
      const achado = nome ? clientes.find(c => c.nome.toLowerCase() === nome) : null;
      if (achado && achado.telefone && campoWhatsappAgend) campoWhatsappAgend.value = formatarTelefone(achado.telefone);
    };
    campoClienteAgend.addEventListener("input", preencherTelefoneDoCliente);
    campoClienteAgend.addEventListener("change", preencherTelefoneDoCliente);
  }
  if (campoWhatsappAgend) {
    campoWhatsappAgend.addEventListener("input", () => { campoWhatsappAgend.value = formatarTelefone(campoWhatsappAgend.value); });
  }

  // Lista de clientes do agendamento: painel próprio (nome + telefone), filtra enquanto digita
  // e deixa cadastrar um cliente novo quando o nome não existe.
  if (campoClienteAgend) {
    campoClienteAgend.removeAttribute("list");
    const envolt = document.createElement("div");
    envolt.className = "combo-wrap";
    campoClienteAgend.parentNode.insertBefore(envolt, campoClienteAgend);
    envolt.appendChild(campoClienteAgend);
    const painel = document.createElement("div");
    painel.className = "combo-lista";
    painel.id = "combo-clientes";
    painel.setAttribute("role", "listbox");
    painel.hidden = true;
    envolt.appendChild(painel);
    campoClienteAgend.setAttribute("role", "combobox");
    campoClienteAgend.setAttribute("aria-controls", "combo-clientes");
    campoClienteAgend.setAttribute("aria-expanded", "false");

    let indiceAtivo = -1;
    const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const destacar = (nome, termo) => {
      if (!termo) return esc(nome);
      const i = nome.toLowerCase().indexOf(termo.toLowerCase());
      if (i < 0) return esc(nome);
      return esc(nome.slice(0, i)) + "<mark>" + esc(nome.slice(i, i + termo.length)) + "</mark>" + esc(nome.slice(i + termo.length));
    };
    const fechar = () => { painel.hidden = true; indiceAtivo = -1; campoClienteAgend.setAttribute("aria-expanded", "false"); };
    const escolher = cliente => {
      campoClienteAgend.value = cliente.nome;
      if (campoWhatsappAgend && cliente.telefone) campoWhatsappAgend.value = formatarTelefone(cliente.telefone);
      fechar();
      campoClienteAgend.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const marcarAtivo = () => {
      painel.querySelectorAll(".combo-item").forEach((el, i) => {
        el.classList.toggle("ativo", i === indiceAtivo);
        if (i === indiceAtivo) el.scrollIntoView({ block: "nearest" });
      });
    };
    let visiveis = [];
    const abrir = () => {
      const termo = campoClienteAgend.value.trim();
      const digitos = termo.replace(/\D/g, "");
      visiveis = clientes
        .filter(c => !termo || c.nome.toLowerCase().includes(termo.toLowerCase()) || (digitos && c.telefone.includes(digitos)))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      painel.innerHTML = "";
      if (!visiveis.length) {
        const vazio = document.createElement("div");
        vazio.className = "combo-vazio";
        vazio.innerHTML = termo
          ? `<p>Nenhum cliente com “${esc(termo)}”.</p><button type="button" class="combo-novo">+ Cadastrar “${esc(termo)}”</button>`
          : `<p>Nenhum cliente cadastrado ainda.</p><button type="button" class="combo-novo">+ Cadastrar novo cliente</button>`;
        vazio.querySelector(".combo-novo").addEventListener("mousedown", e => {
          e.preventDefault();
          fechar();
          abrirModalCliente(termo);
        });
        painel.appendChild(vazio);
      } else {
        visiveis.forEach(c => {
          const item = document.createElement("div");
          item.className = "combo-item";
          item.setAttribute("role", "option");
          item.innerHTML = `<span class="combo-avatar">${esc(c.nome.charAt(0).toUpperCase())}</span>` +
            `<span class="combo-textos"><strong>${destacar(c.nome, termo)}</strong>` +
            `<small>${c.telefone ? esc(formatarTelefone(c.telefone)) : "Sem telefone"}</small></span>`;
          item.addEventListener("mousedown", e => { e.preventDefault(); escolher(c); });
          painel.appendChild(item);
        });
      }
      indiceAtivo = -1;
      painel.hidden = false;
      campoClienteAgend.setAttribute("aria-expanded", "true");
    };
    campoClienteAgend.addEventListener("focus", abrir);
    campoClienteAgend.addEventListener("click", () => { if (painel.hidden) abrir(); });
    campoClienteAgend.addEventListener("input", abrir);
    campoClienteAgend.addEventListener("blur", () => setTimeout(fechar, 120));
    campoClienteAgend.addEventListener("keydown", e => {
      if (e.key === "Escape" && !painel.hidden) { e.stopPropagation(); fechar(); return; }
      if (!visiveis.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (painel.hidden) abrir();
        const passo = e.key === "ArrowDown" ? 1 : -1;
        indiceAtivo = (indiceAtivo + passo + visiveis.length) % visiveis.length;
        marcarAtivo();
      } else if (e.key === "Enter" && !painel.hidden && indiceAtivo >= 0) {
        e.preventDefault();
        escolher(visiveis[indiceAtivo]);
      }
    });
  }

  // --- Janela "Cadastrar Cliente" ---
  const modalCliente = document.getElementById("modal-cliente");
  const formCliente = document.getElementById("form-cliente");
  const campoNomeCliente = document.getElementById("cli-nome");
  const campoTelefoneCliente = document.getElementById("cli-telefone");
  const btnSalvarCliente = document.getElementById("btn-salvar-cliente");

  function abrirModalCliente(nomeSugerido) {
    formCliente.reset();
    limparErroForm(formCliente);
    if (nomeSugerido) campoNomeCliente.value = nomeSugerido;
    modalCliente.hidden = false;
    campoNomeCliente.focus();
  }
  function fecharModalCliente() { modalCliente.hidden = true; limparErroForm(formCliente); }

  document.getElementById("btn-abrir-cliente").addEventListener("click", () => abrirModalCliente());
  document.getElementById("btn-novo-cliente-modal").addEventListener("click", () => {
    const digitado = campoClienteAgend ? campoClienteAgend.value.trim() : "";
    const jaCadastrado = digitado && clientes.some(c => c.nome.toLowerCase() === digitado.toLowerCase());
    abrirModalCliente(jaCadastrado ? "" : digitado);
  });
  document.getElementById("btn-fechar-cliente").addEventListener("click", fecharModalCliente);
  document.getElementById("btn-cancelar-cliente").addEventListener("click", fecharModalCliente);
  modalCliente.addEventListener("click", (e) => { if (e.target === modalCliente) fecharModalCliente(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalCliente.hidden) fecharModalCliente(); });

  // Nome: só letras, espaço, hífen e apóstrofo. Telefone: máscara (11) 91234-5678
  campoNomeCliente.addEventListener("input", () => {
    campoNomeCliente.value = campoNomeCliente.value.replace(/[^\p{L}\s'-]/gu, "").replace(/\s{2,}/g, " ");
  });
  campoTelefoneCliente.addEventListener("input", () => {
    campoTelefoneCliente.value = formatarTelefone(campoTelefoneCliente.value);
  });

  formCliente.addEventListener("submit", async function (e) {
    e.preventDefault();

    const nome = campoNomeCliente.value.trim();
    campoNomeCliente.value = nome;
    const telefone = telefoneValido(campoTelefoneCliente.value); // só números com DDD, ou ""

    if (!nome) { mostrarErroForm(formCliente, "Preencha o nome do cliente.", campoNomeCliente); return; }
    if (nome.length < AGEND_CLIENTE_MIN || nome.length > AGEND_CLIENTE_MAX) {
      mostrarErroForm(formCliente, `O nome do cliente deve ter de ${AGEND_CLIENTE_MIN} a ${AGEND_CLIENTE_MAX} caracteres.`, campoNomeCliente);
      return;
    }
    if (!NOME_CLIENTE_REGEX.test(nome)) { mostrarErroForm(formCliente, mensagemNomeClienteInvalido(nome), campoNomeCliente); return; }
    if (!nomeClienteComIniciaisMaiusculas(nome)) { mostrarErroForm(formCliente, MSG_NOME_CLIENTE_MAIUSCULA, campoNomeCliente); return; }
    if (!campoTelefoneCliente.value.trim()) { mostrarErroForm(formCliente, "Preencha o telefone do cliente.", campoTelefoneCliente); return; }
    if (!telefone) { mostrarErroForm(formCliente, "Digite um telefone válido com DDD. Exemplo: (11) 91234-5678", campoTelefoneCliente); return; }
    if (clientes.some(c => c.telefone === telefone)) {
      mostrarErroForm(formCliente, "Já existe um cliente cadastrado com esse telefone.", campoTelefoneCliente);
      return;
    }
    // LGPD: quem cadastra confirma que o cliente autorizou o uso dos dados
    const lgpdCli = document.getElementById("cli-lgpd");
    if (lgpdCli && !lgpdCli.checked) { mostrarErroForm(formCliente, "Confirme que o cliente autorizou o uso do nome e do telefone (LGPD).", lgpdCli); return; }
    if (!API_CONFIG.token) {
      mostrarErroForm(formCliente, "O login do colaborador ainda não está ligado à API: o cliente não pode ser salvo no banco.", null);
      return;
    }
    limparErroForm(formCliente);

    btnSalvarCliente.disabled = true;
    let criado = null;
    try {
      // >>> API: POST /Clientes. O DonoId vem do token, por isso não é enviado.
      criado = await apiRequest("CLIENTES", { method: "POST", body: { nome, telefone } });
    } catch (erro) {
      console.warn(erro.message);
      mostrarErroForm(formCliente, mensagemErroApiComum(erro, "Não foi possível cadastrar o cliente."), null);
      btnSalvarCliente.disabled = false;
      return;
    }
    btnSalvarCliente.disabled = false;

    const novo = normalizarCliente(criado && typeof criado === "object" ? criado : null) || { id: null, nome, telefone };
    novo.nome = nome; novo.telefone = telefone; // vale o que foi digitado
    clientes.push(novo);
    salvarClientesLocal();
    atualizarListaClientes();

    // Se o cadastro foi aberto de dentro do agendamento, já deixa o cliente escolhido lá
    if (!modal.hidden && campoClienteAgend) {
      campoClienteAgend.value = nome;
      if (campoWhatsappAgend) campoWhatsappAgend.value = formatarTelefone(telefone);
    }
    fecharModalCliente();
  });

  // --- SUPORTE ---
  const formSuporte = document.getElementById("form-suporte");
  const suporteSucesso = document.getElementById("suporte-sucesso");
  const suporteErro = document.getElementById("suporte-erro");
  const btnEnviar = document.getElementById("btn-enviar-suporte");

  formSuporte.addEventListener("submit", function (e) {
    e.preventDefault();
    suporteErro.style.display = "none";

    // Limpa espaços das pontas e confere o que o navegador não pega (ex.: mensagem só com espaços)
    const campoSupEmail = document.getElementById("suporte-email");
    const campoSupAssunto = document.getElementById("suporte-assunto");
    const campoSupMsg = document.getElementById("suporte-mensagem");
    campoSupEmail.value = campoSupEmail.value.trim();
    campoSupAssunto.value = campoSupAssunto.value.trim().replace(/\s{2,}/g, " ");
    campoSupMsg.value = campoSupMsg.value.trim();
    const checagens = [
      [!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(campoSupEmail.value), "Digite um e-mail válido, ex: nome@empresa.com.", campoSupEmail],
      [campoSupAssunto.value.length < 5, "O assunto deve ter pelo menos 5 caracteres.", campoSupAssunto],
      [campoSupMsg.value.length < 10, "A mensagem deve ter pelo menos 10 caracteres.", campoSupMsg]
    ];
    const falha = checagens.find(c => c[0]);
    if (falha) {
      falha[2].setCustomValidity(falha[1]);
      falha[2].reportValidity();
      falha[2].setCustomValidity("");
      return;
    }
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
    if (e.key === chaveServicosDoBanco() && !API_CONFIG.token) { // o dono atualizou os serviços em outra aba
      servicos = lerServicosCopiaDoBanco();
      erroCarregarServicos = servicos.length ? "" : "Nenhum serviço disponível. Peça ao dono para abrir a agenda dele e conferir se há serviços cadastrados.";
      atualizarServicosAgendamento();
      return;
    }
    if (e.key === chaveClientes()) { // o dono cadastrou/alterou cliente em outra aba
      clientes = lerJsonLocal(chaveClientes(), []).map(normalizarCliente).filter(Boolean);
      atualizarListaClientes();
      return;
    }
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
  // Clientes e serviços primeiro (os agendamentos do banco precisam deles para mostrar nomes), depois a agenda
  Promise.all([carregarClientes(), recarregarServicosDoBanco()]).then(recarregarAgendamentosDoBanco);
  // Voltou para esta aba: relê a agenda do banco
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) recarregarAgendamentosDoBanco();
  });
}

document.addEventListener("DOMContentLoaded", iniciarColaborador);