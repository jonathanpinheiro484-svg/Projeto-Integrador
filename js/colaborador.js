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
      for (const chave of ["dados", "data", "items", "itens", "clientes", "servicos", "Servicos", "servicosCadastrados", "result", "resultado", "$values", "value"]) {
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

  // --- EDITAR AGENDAMENTO (clicar no bloco da PRÓPRIA agenda) ---
  // A janela é criada aqui mesmo. Edita só o cliente e o telefone (WhatsApp) do agendamento.
  let agendEditandoId = null;

  function garantirModalEdicao() {
    let modalEd = document.getElementById("modal-editar-agendamento");
    if (modalEd) return modalEd;

    const estiloCampo = "width:100%; box-sizing:border-box; padding:9px 10px; border:1px solid #ccc; border-radius:8px; font:inherit;";
    modalEd = document.createElement("div");
    modalEd.id = "modal-editar-agendamento";
    modalEd.style.cssText = "display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); align-items:center; justify-content:center; z-index:1000; padding:16px;";
    modalEd.innerHTML =
      '<form id="form-editar-agendamento" novalidate style="background:var(--card, #fff); color:inherit; width:100%; max-width:420px; border-radius:12px; padding:20px; display:flex; flex-direction:column; gap:12px;">' +
        '<h3 style="margin:0;">Editar agendamento</h3>' +
        '<small id="edit-agend-resumo" style="color:var(--muted);"></small>' +
        '<label style="display:flex; flex-direction:column; gap:4px;">Cliente' +
          '<input id="edit-agend-cliente" type="text" autocomplete="off" style="' + estiloCampo + '">' +
        '</label>' +
        '<label style="display:flex; flex-direction:column; gap:4px;">Telefone (WhatsApp)' +
          '<span style="display:flex; gap:8px; align-items:center;">' +
            '<input id="edit-agend-whatsapp" type="tel" autocomplete="off" placeholder="(11) 91234-5678" style="' + estiloCampo + 'flex:1; min-width:0;">' +
            '<button type="button" id="btn-zap-edicao" title="Chamar no WhatsApp" aria-label="Chamar no WhatsApp" style="flex:none; width:38px; height:38px; padding:0; border:none; border-radius:8px; background:#25d366; cursor:pointer; display:flex; align-items:center; justify-content:center;">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2C6.5 2 2 6.2 2 11.4c0 2.1.8 4.1 2.1 5.7L3 22l5.2-1.6c1.1.5 2.5.8 3.8.8 5.5 0 10-4.2 10-9.4S17.5 2 12 2z"/></svg>' +
            '</button>' +
          '</span>' +
        '</label>' +
        '<small id="edit-agend-erro" style="color:#e11d48; display:none; white-space:pre-line;"></small>' +
        '<div style="display:flex; gap:10px; justify-content:flex-end; align-items:center;">' +
          '<button type="button" id="btn-cancelar-edicao" class="btn-link">Cancelar</button>' +
          '<button type="submit" id="btn-salvar-edicao">Salvar</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(modalEd);

    const form = modalEd.querySelector("form");
    const campoNomeEd = modalEd.querySelector("#edit-agend-cliente");
    const campoZapEd = modalEd.querySelector("#edit-agend-whatsapp");
    const erroEd = modalEd.querySelector("#edit-agend-erro");

    const fechar = () => { modalEd.style.display = "none"; agendEditandoId = null; erroEd.style.display = "none"; };
    const falhar = (msg, campo) => { erroEd.textContent = msg; erroEd.style.display = "block"; if (campo) campo.focus(); };

    modalEd.querySelector("#btn-cancelar-edicao").addEventListener("click", fechar);
    modalEd.addEventListener("click", (e) => { if (e.target === modalEd) fechar(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalEd.style.display !== "none") fechar(); });

    // Mesmas regras do cadastro de cliente: nome só com letras; telefone com máscara
    campoNomeEd.addEventListener("input", () => {
      campoNomeEd.value = campoNomeEd.value.replace(/[^\p{L}\s'-]/gu, "").replace(/\s{2,}/g, " ");
    });
    campoZapEd.addEventListener("input", () => { campoZapEd.value = formatarTelefone(campoZapEd.value); });
    modalEd.querySelector("#btn-zap-edicao").addEventListener("click", () => {
      const tel = telefoneValido(campoZapEd.value);
      if (!tel) { falhar("Digite um WhatsApp válido com DDD para abrir a conversa. Exemplo: (11) 91234-5678", campoZapEd); return; }
      erroEd.style.display = "none";
      window.open("https://wa.me/55" + tel, "_blank", "noopener");
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const alvo = agendamentos.find(a => a.id === agendEditandoId);
      if (!alvo || alvo.colaboradorId !== meuId) { fechar(); return; } // só edita a própria agenda

      const nome = campoNomeEd.value.trim();
      campoNomeEd.value = nome;
      if (!nome) { falhar("Preencha o nome do cliente.", campoNomeEd); return; }
      if (nome.length < AGEND_CLIENTE_MIN || nome.length > AGEND_CLIENTE_MAX) {
        falhar(`O nome do cliente deve ter de ${AGEND_CLIENTE_MIN} a ${AGEND_CLIENTE_MAX} caracteres.`, campoNomeEd);
        return;
      }
      if (!NOME_CLIENTE_REGEX.test(nome)) { falhar(mensagemNomeClienteInvalido(nome), campoNomeEd); return; }
      if (!nomeClienteComIniciaisMaiusculas(nome)) { falhar(MSG_NOME_CLIENTE_MAIUSCULA, campoNomeEd); return; }

      // Telefone é opcional no agendamento; se preencher, precisa ser válido
      let telefone = "";
      if (campoZapEd.value.trim()) {
        telefone = telefoneValido(campoZapEd.value);
        if (!telefone) { falhar("Digite um WhatsApp válido com DDD. Exemplo: (11) 91234-5678", campoZapEd); return; }
      }

      alvo.cliente = nome;
      alvo.whatsapp = telefone;
      salvarAgendamentosLocal(agendamentos);
      renderizarAgenda();
      fechar();
    });

    return modalEd;
  }

  function abrirEdicaoAgendamento(ag) {
    if (ag.colaboradorId !== meuId) return;
    const modalEd = garantirModalEdicao();
    agendEditandoId = ag.id;
    modalEd.querySelector("#edit-agend-erro").style.display = "none";
    modalEd.querySelector("#edit-agend-cliente").value = ag.cliente || "";
    modalEd.querySelector("#edit-agend-whatsapp").value = ag.whatsapp ? formatarTelefone(ag.whatsapp) : "";
    modalEd.querySelector("#edit-agend-resumo").textContent =
      `${ag.servico || "Serviço não informado"} · ${ag.data} às ${ag.horaInicio} · ${ag.duracaoMin} min` +
      (ag.valor ? " · " + formatarMoeda(ag.valor) : "");
    modalEd.style.display = "flex";
    modalEd.querySelector("#edit-agend-cliente").focus();
  }

  // --- DETALHES DO AGENDAMENTO (própria agenda): mostra os dados e o botão Editar ---
  function garantirModalDetalhes() {
    let modalDet = document.getElementById("modal-detalhes-agendamento");
    if (modalDet) return modalDet;

    const linha = (rotulo, id) =>
      '<div style="display:flex; justify-content:space-between; gap:16px; padding:9px 0; border-bottom:1px solid rgba(128,128,128,.25); font-size:14px;">' +
        '<span style="color:var(--muted, #8a93a6);">' + rotulo + '</span>' +
        '<strong id="' + id + '" style="text-align:right;"></strong>' +
      '</div>';

    modalDet = document.createElement("div");
    modalDet.id = "modal-detalhes-agendamento";
    modalDet.style.cssText = "display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); align-items:center; justify-content:center; z-index:1000; padding:16px;";
    modalDet.innerHTML =
      '<div style="background:var(--card, #fff); color:inherit; width:100%; max-width:460px; border-radius:16px; padding:22px 22px 18px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
          '<h3 style="margin:0; font-size:17px;">Detalhes do agendamento</h3>' +
          '<button type="button" id="det-agend-x" aria-label="Fechar" style="background:none; border:none; font-size:20px; cursor:pointer; color:inherit;">✕</button>' +
        '</div>' +
        linha("Cliente", "det-agend-cliente") +
        linha("Serviço", "det-agend-servico") +
        linha("Profissional", "det-agend-profissional") +
        linha("Data", "det-agend-data") +
        linha("Horário", "det-agend-horario") +
        linha("Duração", "det-agend-duracao") +
        linha("Valor", "det-agend-valor") +
        linha("WhatsApp", "det-agend-whatsapp") +
        '<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">' +
          '<button type="button" id="det-agend-zap" style="display:none; margin-right:auto; align-items:center; gap:6px; padding:9px 14px; border:none; background:#25d366; color:#fff; border-radius:8px; cursor:pointer; font:inherit; font-weight:600;">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2C6.5 2 2 6.2 2 11.4c0 2.1.8 4.1 2.1 5.7L3 22l5.2-1.6c1.1.5 2.5.8 3.8.8 5.5 0 10-4.2 10-9.4S17.5 2 12 2z"/></svg>WhatsApp' +
          '</button>' +
          '<button type="button" id="det-agend-fechar" style="padding:9px 18px; border:1px solid rgba(128,128,128,.4); background:transparent; color:inherit; border-radius:8px; cursor:pointer; font:inherit;">Fechar</button>' +
          '<button type="button" id="det-agend-editar" style="padding:9px 18px; border:none; background:#6c5ce7; color:#fff; border-radius:8px; cursor:pointer; font:inherit; font-weight:600;">✎ Editar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalDet);

    const fechar = () => { modalDet.style.display = "none"; };
    modalDet.querySelector("#det-agend-x").addEventListener("click", fechar);
    modalDet.querySelector("#det-agend-fechar").addEventListener("click", fechar);
    modalDet.addEventListener("click", (e) => { if (e.target === modalDet) fechar(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalDet.style.display !== "none") fechar(); });
    modalDet.querySelector("#det-agend-editar").addEventListener("click", () => {
      const ag = agendamentos.find(a => String(a.id) === modalDet.dataset.agendId);
      fechar();
      if (ag) abrirEdicaoAgendamento(ag);
    });
    modalDet.querySelector("#det-agend-zap").addEventListener("click", () => {
      const ag = agendamentos.find(a => String(a.id) === modalDet.dataset.agendId);
      if (ag && ag.whatsapp) window.open("https://wa.me/55" + String(ag.whatsapp).replace(/\D/g, ""), "_blank", "noopener");
    });
    return modalDet;
  }

  function abrirDetalhesAgendamento(ag) {
    const modalDet = garantirModalDetalhes();
    modalDet.dataset.agendId = ag.id;
    const dono = comDono(colaboradores).find(c => c.id === ag.colaboradorId);
    const [ano, mes, dia] = String(ag.data || "").split("-");
    const colocar = (id, texto) => { modalDet.querySelector("#" + id).textContent = texto; };
    colocar("det-agend-cliente", ag.cliente || "—");
    colocar("det-agend-servico", ag.servico || "Não informado");
    colocar("det-agend-profissional", (dono && dono.nome) || sessao.nome || "—");
    colocar("det-agend-data", ano && mes && dia ? `${dia}/${mes}/${ano}` : (ag.data || "—"));
    colocar("det-agend-horario", ag.horaInicio || "—");
    colocar("det-agend-duracao", ag.duracaoMin ? ag.duracaoMin + " min" : "—");
    colocar("det-agend-valor", formatarMoeda(ag.valor));
    colocar("det-agend-whatsapp", ag.whatsapp ? formatarTelefone(ag.whatsapp) : "Não informado");
    modalDet.querySelector("#det-agend-zap").style.display = ag.whatsapp ? "flex" : "none";
    modalDet.style.display = "flex";
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
          if (editavel) { abrirDetalhesAgendamento(ag); return; } // própria agenda: abre os detalhes, com botão Editar
          alert(`📋 Detalhes do Agendamento:\n\nCliente: ${ag.cliente}\nServiço: ${ag.servico || "Não informado"}\nInício: ${ag.horaInicio}\nDuração: ${ag.duracaoMin} min\nData: ${ag.data}${ag.valor ? "\nValor: " + formatarMoeda(ag.valor) : ""}`);
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
    atualizarServicosAgendamento();
    modal.hidden = false;
    recarregarServicosDoBanco(); // traz os serviços que o dono cadastrou/alterou há pouco
  });
  formAgend.addEventListener("reset", () => setTimeout(() => atualizarServicosAgendamento([]), 0));
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
    // WhatsApp do cliente (opcional; se preencher, precisa ser válido)
    let whatsappCliente = "";
    const campoZap = document.getElementById("agend-whatsapp");
    if (campoZap && campoZap.value.trim()) {
      whatsappCliente = telefoneValido(campoZap.value);
      if (!whatsappCliente) {
        mostrarErroForm(formAgend, "Digite um WhatsApp válido com DDD. Exemplo: (11) 91234-5678", campoZap);
        return;
      }
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
      cor: document.getElementById("agend-cor").value,
      valor: calcularTotalServicos(), // soma dos valores fixos dos serviços escolhidos
      whatsapp: whatsappCliente
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
  carregarClientes();
  recarregarServicosDoBanco();
}

document.addEventListener("DOMContentLoaded", iniciarColaborador);