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
  // VÁRIOS SERVIÇOS NO MESMO AGENDAMENTO
  // Troca o <select id="agend-servico"> (que só aceita 1 opção) por caixinhas de marcar.
  // As opções continuam vindo do HTML: para incluir um serviço novo, basta
  // colocar mais um <option> no select.
  // =====================================================
  function prepararServicosMultiplos() {
    const select = document.getElementById("agend-servico");
    if (!select || select.tagName !== "SELECT") return;

    if (!document.getElementById("estilo-servicos-multiplos")) {
      const estilo = document.createElement("style");
      estilo.id = "estilo-servicos-multiplos";
      estilo.textContent =
        ".servicos-grupo { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; max-height:170px; overflow-y:auto; padding:10px; border:1px solid var(--border); border-radius:7px; background:var(--input-bg); outline:none; }" +
        ".servicos-grupo label { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--texto); cursor:pointer; }" +
        ".servicos-grupo input[type=\"checkbox\"] { width:16px; height:16px; padding:0; margin:0; flex-shrink:0; cursor:pointer; accent-color:#6c5ce7; }" +
        "@media (max-width:480px) { .servicos-grupo { grid-template-columns:1fr; } }";
      document.head.appendChild(estilo);
    }

    const grupo = document.createElement("div");
    grupo.id = "agend-servicos-grupo";
    grupo.className = "servicos-grupo";
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", "Serviços");
    grupo.tabIndex = -1; // permite focar o grupo quando falta marcar algum serviço

    Array.from(select.options).filter(opcao => opcao.value).forEach(opcao => {
      const rotulo = document.createElement("label");
      const caixa = document.createElement("input");
      caixa.type = "checkbox";
      caixa.value = opcao.value;
      rotulo.appendChild(caixa);
      rotulo.appendChild(document.createTextNode(opcao.textContent));
      grupo.appendChild(rotulo);
    });

    // O id "agend-servico" continua existindo (escondido) porque a validação do
    // comum.js lê esse campo. Quem guarda os serviços de verdade é o grupo acima.
    const campoEscondido = document.createElement("input");
    campoEscondido.type = "hidden";
    campoEscondido.id = "agend-servico";

    const dica = document.createElement("small");
    dica.style.cssText = "font-size:11px; color:var(--muted);";
    dica.textContent = "Marque quantos serviços forem necessários.";

    const campo = select.parentElement;
    select.replaceWith(grupo);
    grupo.insertAdjacentElement("afterend", dica);
    grupo.insertAdjacentElement("afterend", campoEscondido);

    const titulo = campo ? campo.querySelector(":scope > label") : null;
    if (titulo) titulo.textContent = "Serviços";
  }

  // Lista dos serviços marcados, ex.: ["Manicure", "Pedicure"]
  function lerServicosMarcados() {
    const grupo = document.getElementById("agend-servicos-grupo");
    if (!grupo) return [];
    return Array.from(grupo.querySelectorAll('input[type="checkbox"]:checked')).map(caixa => caixa.value);
  }

  // Mesma validação de sempre (comum.js) + exigir pelo menos um serviço marcado
  function validarAgendamentoComServicos() {
    const marcados = lerServicosMarcados();
    const campoEscondido = document.getElementById("agend-servico");
    // O comum.js só entende 1 serviço em texto; damos um texto curto só para ele não reclamar
    if (campoEscondido) campoEscondido.value = marcados.length ? "serviços marcados" : "";

    const resultado = validarNovoAgendamento();
    const erros = resultado.erros.filter(erro => erro !== "Preencha o serviço.");
    let campoErro = (resultado.campoErro === campoEscondido) ? null : resultado.campoErro;

    if (marcados.length === 0) {
      erros.unshift("Escolha pelo menos um serviço.");
      if (!campoErro) campoErro = document.getElementById("agend-servicos-grupo");
    }
    return { erros, campoErro };
  }

  prepararServicosMultiplos();

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
    window.location.href = "cadastro.html?modo=entrar";
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

    const validacaoAgend = validarAgendamentoComServicos();
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
      servico: listaEmTexto(lerServicosMarcados()), // texto: "Manicure e Pedicure"
      servicos: lerServicosMarcados(),              // lista: ["Manicure", "Pedicure"]
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

document.addEventListener("DOMContentLoaded", iniciarColaborador);