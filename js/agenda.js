// =====================================================
// AGENDA / PAINEL DO DONO
// Usado em: agenda.html
// Depende do js/comum.js (carregar ANTES deste arquivo).
// =====================================================

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
  let planoAtual = lerPlanoAssinado(); // plano da assinatura aprovada (ou Grátis)
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
    if (!botao) return;
    botao.addEventListener("click", () => {
      if (plano === planoAtual) return; // já é o plano atual

      // Voltar para o Grátis: pede confirmação e cancela a assinatura salva
      if (plano === "FREE") {
        if (!confirm("Voltar para o plano Grátis? Você perde os recursos do plano atual.")) return;
        localStorage.removeItem(CHAVE_ASSINATURA);
        escolherPlano(plano);
        return;
      }

      // Planos pagos abrem a tela de compra. Quando o pagamento é aprovado, a tela de compra
      // volta para a agenda já com o plano ativo (lido por lerPlanoAssinado).
      window.location.href = `${PAGINA_ASSINATURA}?plano=${plano.toLowerCase()}&origem=painel`;
    });
  });

  // --- SAIR (painel do dono): apaga a sessão e volta para o login ---
  const btnSair = document.getElementById("btn-sair");
  if (btnSair) {
    const sair = () => {
      sairDaConta();
      localStorage.removeItem("apiToken");
      window.location.href = "cadastro.html?modo=entrar";
    };
    btnSair.addEventListener("click", sair);
    btnSair.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sair(); } });
  }

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

document.addEventListener("DOMContentLoaded", iniciarDashboard);