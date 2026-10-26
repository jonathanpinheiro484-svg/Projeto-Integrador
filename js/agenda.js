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

  // =====================================================
  // PROTEÇÃO DE LOGIN: só entra na agenda quem fez login.
  // Sem sessão (a pessoa saiu, ou voltou pela seta do navegador depois de sair),
  // a página some e vai para a tela de login. O "replace" não deixa a agenda no histórico.
  // =====================================================
  const PAGINA_LOGIN_DONO = "cadastro.html?modo=entrar";
  const PAGINA_INICIAL = "index.html"; // tela inicial do site (para onde vai quem cancela a assinatura)
  if (!lerJsonLocal(CHAVE_SESSAO, null)) {
    layoutPrincipal.style.display = "none";
    window.location.replace(PAGINA_LOGIN_DONO);
    return;
  }
  // Página restaurada do cache pela seta do navegador: confere a sessão de novo
  window.addEventListener("pageshow", function (e) {
    if (e.persisted && !lerJsonLocal(CHAVE_SESSAO, null)) {
      layoutPrincipal.style.display = "none";
      window.location.replace(PAGINA_LOGIN_DONO);
    }
  });

  // =====================================================
  // USUÁRIO NOVO COMEÇA ZERADO
  // Agenda, equipe e status ficam guardados neste navegador. Se entrou uma conta diferente
  // da última, apaga o que era da conta anterior para a nova começar sem nada.
  // (Serviços e clientes já vêm do banco, só do dono logado.)
  // =====================================================
  (function zerarDadosDeOutraConta() {
    const sessao = lerJsonLocal(CHAVE_SESSAO, null);
    if (sessao && sessao.perfil === "COLABORADOR") return; // colaborador usa os dados do próprio dono
    const emailAtual = (localStorage.getItem("emailUsuarioLogado") || "").trim().toLowerCase();
    if (!emailAtual) return;
    const dono = localStorage.getItem("donoDosDadosLocais");
    if (dono !== emailAtual) {
      [CHAVE_AGENDAMENTOS, CHAVE_COLABORADORES, "agendamentosOcultos", "colaboradoresRemovidos", "statusAgendamentosLocal"]
        .forEach(chave => localStorage.removeItem(chave));
      try { localStorage.setItem("donoDosDadosLocais", emailAtual); } catch (e) { /* sem armazenamento */ }
    }
  })();

  // =====================================================
  // DONO NA AGENDA
  // O dono também atende clientes, então aparece como uma coluna da agenda,
  // igual a um colaborador. Ele usa o id 0 (os colaboradores começam no 1),
  // por isso nunca se mistura com a equipe.
  // =====================================================
  // Nome do dono: o que foi guardado no cadastro. Se não tiver, usa o nome guardado para o
  // e-mail e, por último, a primeira parte do e-mail (jonathan@gmail.com -> "Jonathan").
  function nomeDoUsuario() {
    const salvo = (localStorage.getItem("nomeUsuarioCadastrado") || "").trim();
    if (salvo) return salvo;
    const email = (localStorage.getItem("emailUsuarioLogado") || "").trim().toLowerCase();
    const porEmail = (lerJsonLocal("nomesPorEmail", {})[email] || "").trim();
    if (porEmail) return porEmail;
    const parte = email.split("@")[0].split(/[._\-0-9]+/)[0];
    return parte ? parte.charAt(0).toUpperCase() + parte.slice(1) : "";
  }

  function obterDono() {
    return {
      id: 0,
      nome: nomeDoUsuario().split(/\s+/)[0] || "Dono", // só o primeiro nome
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
  // =====================================================
  // SERVIÇOS CADASTRADOS
  // Só o dono cria, edita e remove (valor e duração fixos). O colaborador só escolhe
  // na hora de agendar. Guardado no navegador até existir o endpoint na API.
  // =====================================================
  const CHAVE_SERVICOS = "servicosCadastrados";
  const TEXTO_DICA_SERVICOS = "Marque quantos serviços forem necessários.";
  // Lista de serviços usada no cadastro de serviços e no cargo do colaborador.
  // Mantenha igual às opções de #colab-cargo no agenda.html.
  const SERVICOS_PADRAO = ["Manicure", "Pedicure", "Cabeleireiro", "Barbeiro", "Spa", "Esteticista", "Massagista", "Maquiador", "Depilador", "Designer de Sobrancelhas"];
  // O BANCO é a única fonte dos serviços: a lista começa vazia e só é preenchida pelo GET da API.
  // Nada de serviço guardado no navegador (limpa o resto que versões antigas deixaram).
  try { localStorage.removeItem(CHAVE_SERVICOS); } catch (e) { /* sem armazenamento */ }
  let servicos = [];
  let erroCarregarServicos = ""; // motivo de a lista estar vazia quando o GET /Servicos falha

  // Cópia do que veio do BANCO, para a tela do colaborador (que não tem token da API) ler.
  // Não é uma fonte própria: é regravada a cada carga/alteração e fica vazia se o banco falhar.
  const chaveServicosDoBanco = () => "servicosDoBanco:" + (localStorage.getItem("emailUsuarioLogado") || "dono").trim().toLowerCase();

  function guardarServicos() {
    try { localStorage.setItem(chaveServicosDoBanco(), JSON.stringify(servicos)); } catch (e) { /* sem armazenamento */ }
    atualizarCargosColaborador(); // serviços do banco também entram na lista do colaborador
  }

  // Cada linha do agendamento é uma LISTA (select) com os serviços cadastrados.
  // Valor e duração vêm do cadastro do serviço (e o cadastro vem do banco, via API).
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

  // Refaz as listas do agendamento com os serviços cadastrados (mantém o que já estava escolhido)
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

  // Lista dos serviços marcados, ex.: ["Manicure", "Pedicure"]
  function lerServicosMarcados() {
    const nomes = selectsServicos().map(sel => sel.value).filter(Boolean);
    return nomes.filter((nome, i) => nomes.indexOf(nome) === i); // sem repetir o mesmo serviço
  }

  // Mesma validação de sempre (comum.js) + exigir pelo menos um serviço marcado
  function validarAgendamentoComServicos() {
    const marcados = lerServicosMarcados();
    const campoEscondido = document.getElementById("agend-servico");
    // O comum.js só entende 1 serviço em texto; damos um texto curto só para ele não reclamar
    if (campoEscondido) campoEscondido.value = marcados.length ? "serviços marcados" : "";

    const resultado = validarNovoAgendamento();
    // Sem serviço marcado a duração fica vazia de propósito: só o aviso do serviço aparece
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
  // Sem plano: quem cancelou a assinatura sai da conta e, ao entrar de novo, só enxerga a tela de
  // Planos até escolher um plano. >>> API: quando houver backend, o status do plano deve vir dele.
  const chaveSemPlano = () => "semPlano:" + (localStorage.getItem("emailUsuarioLogado") || "dono").trim().toLowerCase();
  let semPlano = false;
  if (usuarioLogado.perfil === "DONO" && localStorage.getItem(chaveSemPlano()) === "1") {
    if (planoAtual === "BASICO" || planoAtual === "PREMIUM" || planoAtual === "PRO") {
      localStorage.removeItem(chaveSemPlano()); // já pagou um plano: libera
    } else {
      semPlano = true;
      planoAtual = "NENHUM";
    }
  }
  // Plano vencido: assinatura paga por Pix/boleto cuja data de pagamento já passou
  const planoVencido = (function () {
    const reg = lerJsonLocal(CHAVE_ASSINATURA, null);
    if (!reg || reg.status !== "aprovada" || !reg.validoAte) return false;
    const metodo = String(reg.metodo || "").toLowerCase();
    return (metodo === "pix" || metodo === "boleto") && new Date(reg.validoAte) < new Date();
  })();
  const MSG_PLANO_VENCIDO = "Seu plano está vencido. Pague a mensalidade na aba Assinatura para voltar a usar este recurso.";
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
  // Há uma cópia de segurança separada por e-mail do dono: se a lista principal for apagada
  // (ex.: ao sair da conta), ela é restaurada a partir da cópia.
  const chaveBackupColaboradores = () => "colaboradoresBackup:" + (localStorage.getItem("emailUsuarioLogado") || "dono").trim().toLowerCase();
  const CHAVE_COLAB_REMOVIDOS = "colaboradoresRemovidos"; // ids desativados pelo ✕ (a API não tem DELETE de colaborador)
  let colaboradores = lerJsonLocal(CHAVE_COLABORADORES, []);
  if (!colaboradores.length) {
    const backup = lerJsonLocal(chaveBackupColaboradores(), []);
    if (Array.isArray(backup) && backup.length) {
      colaboradores = backup;
      salvarColaboradoresLocal(colaboradores);
    }
  }

  // Salva a lista de colaboradores (principal + cópia de segurança)
  function guardarColaboradores() {
    salvarColaboradoresLocal(colaboradores);
    try { localStorage.setItem(chaveBackupColaboradores(), JSON.stringify(colaboradores)); } catch (e) { /* sem armazenamento */ }
  }

  // Junta a lista que veio da API com a que já está no navegador.
  // O BANCO é a fonte da equipe: quem só existe aqui no navegador NÃO entra (usuário novo = lista vazia).
  // Do navegador só aproveita a cor escolhida de quem também está no banco.
  // A API pode devolver a lista direto ou dentro de um objeto ({ dados: [...] }, { items: [...] }...)
  function extrairLista(resposta) {
    if (Array.isArray(resposta)) return resposta;
    if (resposta && typeof resposta === "object") {
      for (const chave of ["dados", "data", "items", "itens", "colaboradores", "clientes", "Clientes", "agendamentos", "Agendamentos", "servicos", "Servicos", "servicosCadastrados", "result", "resultado", "$values", "value"]) {
        if (Array.isArray(resposta[chave])) return resposta[chave];
      }
    }
    return null;
  }

  // Status do banco (1/0, true/false, "Ativo"/"Inativo") -> true/false
  function lerAtivoApi(item) {
    const v = item.ativo ?? item.Ativo ?? item.status ?? item.Status;
    if (v === undefined || v === null) return undefined;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    const t = String(v).trim().toLowerCase();
    return !(t === "0" || t === "false" || t === "inativo" || t === "desativado");
  }

  function mesclarColaboradores(locais, daApi) {
    const chaveDe = c => String(c.id) + "|" + String(c.email || "").toLowerCase();
    const resultado = [];
    const usados = new Set();
    daApi.forEach(item => {
      if (!item) return;
      const api = {
        id: item.id ?? item.Id,
        nome: item.nome ?? item.Nome,
        cargo: item.cargo ?? item.Cargo,
        email: item.email ?? item.Email,
        cor: item.cor ?? item.Cor,
        ativo: lerAtivoApi(item)
      };
      if (api.id == null || !api.nome) return;
      if (lerJsonLocal(CHAVE_COLAB_REMOVIDOS, []).includes(Number(api.id))) return; // foi removido pelo ✕
      const local = locais.find(l => String(l.id) === String(api.id) ||
        (api.email && l.email && String(l.email).toLowerCase() === String(api.email).toLowerCase()));
      if (local) usados.add(chaveDe(local));
      resultado.push({
        id: Number(api.id),
        nome: api.nome,
        cargo: api.cargo || (local && local.cargo) || "",
        email: api.email || (local && local.email) || "",
        cor: api.cor || (local && local.cor) || "#00c0ef",
        ativo: api.ativo !== undefined && api.ativo !== null ? api.ativo : (local ? local.ativo !== false : true)
      });
    });
    return resultado;
  }

  // >>> API: agendamentos (começa vazio; guarda no localStorage até ter backend).
  let agendamentos = lerJsonLocal(CHAVE_AGENDAMENTOS, []);
  // Agendamentos apagados só desta tela: o banco pode continuar com eles, mas eles não voltam quando a agenda recarrega
  const CHAVE_AGENDAMENTOS_OCULTOS = "agendamentosOcultos";
  let agendamentosOcultos = lerJsonLocal(CHAVE_AGENDAMENTOS_OCULTOS, []);
  // Um agendamento escondido é reconhecido por id + data + hora (não só pelo id), para um agendamento novo
  // do banco que reaproveite o mesmo id nunca ficar bloqueado por um teste antigo.
  function assinaturaAgendamento(ag) {
    return `${ag.id}|${ag.data}|${ag.horaInicio}`;
  }
  let clientesProntos = Promise.resolve(); // vira a promessa de carregarClientes() na inicialização

  // >>> API: contratos próximos do vencimento (começa vazio).
  let contratos = [];

  // >>> API: carregamento inicial. Se falhar, mantém as listas vazias.
  // Serviços do banco: a API manda nome, duração e preço; o que só existe aqui no navegador é mantido
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
  // Só vale o que está no banco: serviço que existe só no navegador é descartado.
  function mesclarServicos(_locais, daApi) {
    return daApi.map(normalizarServicoApi).filter(Boolean);
  }

  // Lê os serviços do banco (GET /Servicos) e redesenha a tela. Se falhar, a lista fica vazia com o motivo.
  async function recarregarServicosDoBanco() {
    try {
      const dadosServicos = await apiRequest("SERVICOS"); // GET: serviços do dono (token)
      console.log("[API] resposta de serviços:", dadosServicos);
      // API sem conteúdo (204 / corpo vazio) = nenhum serviço no banco
      const listaServicosApi = (dadosServicos === null || dadosServicos === undefined || dadosServicos === "") ? [] : extrairLista(dadosServicos);
      if (listaServicosApi) {
        erroCarregarServicos = "";
        servicos = mesclarServicos(servicos, listaServicosApi);
      } else {
        servicos = [];
        erroCarregarServicos = "A API respondeu, mas não devolveu uma lista de serviços reconhecível (veja o console, F12).";
        console.warn(erroCarregarServicos, dadosServicos);
      }
    } catch (erro) {
      console.warn("Não foi possível carregar serviços da API.", erro.message);
      servicos = []; // sem banco, sem serviço
      erroCarregarServicos = "Não foi possível carregar os serviços do banco. " + mensagemErroApiComum(erro, "Erro ao buscar os serviços na API.");
    }
    guardarServicos();
    renderizarListaServicos();
    atualizarServicosAgendamento();
  }

  // Agendamento que veio da API -> formato usado pela agenda. >>> Ajuste os nomes aqui se a API devolver outros.
  // Aceita a data/hora separadas ou juntas, cliente e serviços como nome, objeto ou só o id (busca o nome nas listas já carregadas).
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

  // Status do agendamento: no banco fica "Agendado", "Concluido", "NaoCompareceu" ou "Cancelado" (sem acento).
  // "Remarcado" existe só na tela (fica guardado neste navegador; para a API ele vai como "Agendado").
  // Aceita maiúsculas/minúsculas e acento; se vier vazio ou desconhecido, devolve "" (a tela mostra "Agendado").
  function normalizarStatusAgendamento(v) {
    const t = String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.startsWith("conclu")) return "Concluido";
    if (t.startsWith("cancel")) return "Cancelado";
    if (t.startsWith("remarc")) return "Remarcado";
    if (t.startsWith("naocompar") || t.startsWith("nao compar") || t.startsWith("falt")) return "NaoCompareceu";
    if (t.startsWith("agend")) return "Agendado";
    return "";
  }

  // Enquanto a API não devolver o status no GET /Agendamentos, ele fica guardado neste navegador (id -> status).
  // Quando a API passar a devolver o status, o do banco vale e este daqui é ignorado.
  const CHAVE_STATUS_AGENDAMENTOS = "statusAgendamentosLocal";
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
    } catch (_) { /* sem armazenamento: o status só não fica guardado neste navegador */ }
  }

  // Status que vale: o do banco. Se o banco só devolve o padrão "Agendado" (ou nada) e existe um status
  // guardado neste navegador, usa o guardado (a API ainda pode não estar gravando o status no PUT).
  function resolverStatusAgendamento(statusApi, id) {
    const guardado = lerStatusLocal()[id] || "";
    if ((!statusApi || statusApi === "Agendado" || statusApi === "Remarcado") && guardado) return guardado;
    return statusApi || "";
  }

  function normalizarAgendamentoApi(item) {
    if (!item) return null;
    const id = Number(item.id ?? item.Id ?? item.agendamentoId ?? item.AgendamentoId);
    const brutoData = item.data ?? item.Data ?? item.dataAgendamento ?? item.DataAgendamento ?? item.dataHora ?? item.DataHora ?? item.dataHoraInicio ?? item.DataHoraInicio;
    const data = dataApiParaISO(brutoData);
    const hora = horaApiParaHHMM(item.horaInicio ?? item.HoraInicio ?? item.hora ?? item.Hora) || horaApiParaHHMM(brutoData);
    if (!Number.isFinite(id) || !data || !hora) {
      console.warn("[API] agendamento ignorado (faltou id, data ou hora):", item);
      return null;
    }

    // Cliente: nome direto, objeto, ou só o id (procura na lista de clientes)
    const cli = item.cliente ?? item.Cliente;
    const idCliente = item.clienteId ?? item.ClienteId ?? (cli && typeof cli === "object" ? (cli.id ?? cli.Id) : undefined);
    const clienteLista = idCliente != null ? clientes.find(c => String(c.id) === String(idCliente)) : null;
    const nomeCliente = item.clienteNome ?? item.ClienteNome ?? item.nomeCliente ?? item.NomeCliente
      ?? (cli && typeof cli === "object" ? (cli.nome ?? cli.Nome) : cli) ?? (clienteLista ? clienteLista.nome : "");
    const telefoneCliente = item.whatsapp ?? item.Whatsapp ?? item.telefone ?? item.Telefone
      ?? (cli && typeof cli === "object" ? (cli.telefone ?? cli.Telefone) : undefined) ?? (clienteLista ? clienteLista.telefone : "");

    // Serviços: lista de nomes/objetos, lista de ids, ou um id só
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
      colaboradorId: Number(item.colaboradorId ?? item.ColaboradorId ?? 0) || 0, // sem colaborador = o próprio dono
      data,
      horaInicio: hora,
      duracaoMin: duracaoApi > 0 ? duracaoApi : (cadastrados.reduce((s, sv) => s + (Number(sv.duracaoMin) || 0), 0) || 30),
      cor: item.cor ?? item.Cor ?? "#3d5a80",
      valor: Number.isFinite(valorApi) && valorApi > 0 ? valorApi : cadastrados.reduce((s, sv) => s + (Number(sv.valor) || 0), 0),
      whatsapp: String(telefoneCliente || "").replace(/\D/g, ""),
      status: resolverStatusAgendamento(normalizarStatusAgendamento(item.status ?? item.Status), id)
    };
  }

  // Lê os agendamentos do banco (GET /Agendamentos) e redesenha a agenda.
  // Devolve true se conseguiu ler; false se a API falhou ou veio num formato que não deu para entender.
  async function recarregarAgendamentosDoBanco() {
    try {
      const dadosAgendamentos = await apiRequest("AGENDAMENTOS");
      console.log("[API] resposta de agendamentos:", dadosAgendamentos);
      const listaAg = (dadosAgendamentos === null || dadosAgendamentos === undefined || dadosAgendamentos === "") ? [] : extrairLista(dadosAgendamentos);
      if (!listaAg) {
        console.warn("A API de agendamentos não devolveu uma lista reconhecível (veja a resposta acima).", dadosAgendamentos);
        return false;
      }
      const doBanco = listaAg.map(normalizarAgendamentoApi).filter(Boolean);
      if (listaAg.length && !doBanco.length) {
        console.warn("A API devolveu agendamentos num formato não reconhecido (veja o primeiro item).", listaAg[0]);
        return false;
      }
      // o que vale é o que está no banco (menos os apagados só da tela)
      agendamentos = doBanco.filter(ag => {
        const escondido = agendamentosOcultos.includes(assinaturaAgendamento(ag));
        if (escondido) console.warn("[agenda] agendamento escondido porque foi removido só desta tela:", ag.id);
        return !escondido;
      });
      salvarAgendamentosLocal(agendamentos);
      renderizarAgenda();
      return true;
    } catch (erro) {
      console.warn("Não foi possível carregar agendamentos da API.", erro.message);
      return false;
    }
  }

  async function carregarDadosIniciais() {
    await recarregarServicosDoBanco();

    try {
      const dadosColaboradores = await apiRequest("COLABORADORES");
      console.log("[API] resposta de colaboradores:", dadosColaboradores);
      const listaApi = extrairLista(dadosColaboradores);
      if (listaApi) {
        colaboradores = mesclarColaboradores(colaboradores, listaApi);
        guardarColaboradores();
      } else {
        console.warn("A API de colaboradores não devolveu uma lista reconhecível.", dadosColaboradores);
      }
    } catch (erro) {
      console.warn("Não foi possível carregar colaboradores da API.", erro.message);
    }

    await clientesProntos; // os nomes/telefones dos clientes e os serviços precisam estar carregados antes de montar a agenda
    await recarregarAgendamentosDoBanco();

    // GET /Financeiro: por enquanto só mostra no console para conferir o formato da resposta
    try {
      const dadosFinanceiro = await apiRequest("FINANCEIRO");
      console.log("[API] resposta do financeiro:", dadosFinanceiro);
    } catch (erro) {
      console.warn("Não foi possível carregar o financeiro da API.", erro.message);
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
    PRO: "Premium",
    NENHUM: "Sem plano"
  };

  // Card do plano -> chave do plano, e se esse é o plano que está ativo agora
  const alvoDoCard = btn => (btn.dataset.plano === "Básico" ? "BASICO" : "PREMIUM");
  const planoEhAtual = alvo => planoAtual === alvo || (alvo === "PREMIUM" && planoAtual === "PRO");

  // Escolheu um plano depois de cancelar: volta a ter acesso ao sistema
  function liberarSemPlano() {
    semPlano = false;
    localStorage.removeItem(chaveSemPlano());
    document.querySelectorAll(".menu-item").forEach(m => { m.style.display = ""; });
    aplicarPermissoes();
  }

  async function escolherPlano(novoPlano) {
    if (semPlano) liberarSemPlano();
    planoAtual = novoPlano;

    // API: PUT /Plano (melhor esforço: se falhar, o plano continua valendo neste navegador)
    if (API_CONFIG.token) {
      try {
        await alterarPlanoApi(novoPlano);
      } catch (erro) {
        console.warn("Não foi possível atualizar o plano na API.", erro.message);
      }
    }

    atualizarPlano();
    mudarAba(abaOrigemPlanos);
  }

  // Compara o plano daqui com o do banco (GET /Plano), sem nunca rebaixar o plano:
  // - banco pago e aqui Grátis (ex.: dados do navegador apagados) -> passa a usar o do banco;
  // - aqui pago (assinatura aprovada) e o banco diferente -> manda o plano daqui para o banco (PUT /Plano).
  async function sincronizarPlanoComApi() {
    if (usuarioLogado.perfil !== "DONO" || !API_CONFIG.token || semPlano) return;
    try {
      const doBanco = await obterPlanoApi();
      if (!doBanco) return; // não reconheceu a resposta: não mexe em nada
      const local = normalizarPlanoApi(planoAtual) || "FREE";
      if (doBanco === local) return;
      if (local === "FREE" && (doBanco === "BASICO" || doBanco === "PREMIUM")) {
        planoAtual = doBanco;
        atualizarPlano();
        atualizarWhatsApp();
      } else if (local !== "FREE") {
        await alterarPlanoApi(local);
      }
    } catch (erro) {
      console.warn("Não foi possível sincronizar o plano com a API.", erro.message);
    }
  }

  // --- TELA DE ASSINATURA ---
  // Mostra a assinatura do cliente (ativa e/ou aguardando o pagamento do boleto) com os botões
  // Ver boleto, Trocar forma de pagamento e Cancelar assinatura. Os cliques seguem nas mesmas
  // funções de antes, que leem o plano no data-plano de cada botão.
  // Forma de pagamento da assinatura ativa: "boleto", "pix", "cartao" (ou "" se não souber)
  function metodoDaAssinatura() {
    const reg = lerJsonLocal(CHAVE_ASSINATURA, null);
    if (!reg || typeof reg !== "object") return "";
    const m = String(reg.metodo || reg.formaPagamento || reg.meioPagamento || reg.pagamento || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (m.includes("BOLETO")) return "boleto";
    if (m.includes("PIX")) return "pix";
    if (m.includes("CART")) return "cartao";
    return reg.boleto ? "boleto" : "";
  }

  // O que cada plano pago inclui (igual ao que aparece na tela de Planos)
  const inclusoPorPlano = {
    BASICO: ["Sem limite de tempo", "Agendamentos ilimitados", "Até 10 colaboradores", "Suporte por e-mail"],
    PREMIUM: ["Sem limite de tempo", "Agendamentos ilimitados", "Colaboradores ilimitados", "Relatórios avançados (financeiro)", "Suporte prioritário (chat/telefone)", "Integração com WhatsApp", "Personalização de serviços e horários"]
  };

  function atualizarAssinatura() {
    const cartaoAtiva = document.getElementById("assinatura-ativa");
    const cartaoPendente = document.getElementById("assinatura-pendente");
    const cartaoVazio = document.getElementById("assinatura-vazia");
    if (!cartaoAtiva || !cartaoPendente || !cartaoVazio) return;

    const pagos = ["BASICO", "PREMIUM"];
    const ativo = normalizarPlanoBoleto(planoAtual);
    const planoAtivo = pagos.includes(ativo) ? ativo : null;
    const pendente = lerJsonLocal("assinaturaPendente", null);
    let planoPendente = pendente ? normalizarPlanoBoleto(pendente.plano) : null;
    if (!pagos.includes(planoPendente) || planoPendente === planoAtivo) planoPendente = null;

    const preencher = (cartao, plano) => {
      cartao.hidden = !plano;
      if (!plano) return;
      cartao.querySelector("h3").textContent = "Plano " + nomesPlanos[plano];
      cartao.querySelectorAll("button[data-plano]").forEach(btn => { btn.dataset.plano = nomesPlanos[plano]; });
      // lista "o que está incluso" do plano (mesmos itens da tela de Planos)
      const lista = cartao.querySelector(".sa-lista");
      if (lista) lista.innerHTML = (inclusoPorPlano[plano] || []).map(t => `<li>${t}</li>`).join("");
      const nota = cartao.querySelector(".sa-nota-plano");
      if (nota) nota.textContent = plano === "BASICO" ? "Relatórios financeiros, suporte prioritário e integração com WhatsApp ficam no plano Premium." : "";
    };
    preencher(cartaoAtiva, planoAtivo);
    preencher(cartaoPendente, planoPendente);
    cartaoVazio.hidden = !!(planoAtivo || planoPendente);

    // Botão de pagamento do card ativo, conforme a forma de pagamento da assinatura:
    // boleto -> "Ver boleto"; Pix -> "Pagar com Pix" (leva para a tela de pagamento e renova o plano); cartão -> nenhum.
    // O card que aguarda o pagamento do boleto continua com o "Ver boleto".
    const btnBoletoAtivo = cartaoAtiva.querySelector(".btn-ver-boleto");
    if (btnBoletoAtivo) {
      let btnPix = cartaoAtiva.querySelector(".btn-pagar-pix");
      if (!btnPix) {
        btnPix = btnBoletoAtivo.cloneNode(false); // copia só o botão (mesmo visual), sem o texto nem os cliques
        btnPix.removeAttribute("id");
        btnPix.classList.remove("btn-ver-boleto");
        btnPix.classList.add("btn-pagar-pix");
        btnPix.textContent = "💠 Pagar com Pix";
        btnPix.addEventListener("click", () => {
          window.location.href = `${PAGINA_ASSINATURA}?plano=${alvoDoCard(btnPix).toLowerCase()}&origem=painel&modo=renovar-pix`;
        });
        btnBoletoAtivo.insertAdjacentElement("afterend", btnPix);
      }
      btnPix.dataset.plano = btnBoletoAtivo.dataset.plano;
      const metodoAtivo = metodoDaAssinatura();
      const mostrar = (btn, sim) => { btn.hidden = !sim; btn.style.display = sim ? "" : "none"; };
      mostrar(btnBoletoAtivo, metodoAtivo === "boleto");
      mostrar(btnPix, metodoAtivo === "pix");
    }
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

    atualizarAssinatura(); // põe o plano certo nos botões da tela de Assinatura antes de mostrar/esconder
    atualizarWhatsAppFlutuante(); // botão do WhatsApp: só no Premium
    // Botão "Cancelar assinatura": aparece só no card do plano pago que está ativo
    // "Cancelar assinatura" também aparece no plano que está aguardando o pagamento do boleto.
    // "Trocar forma de pagamento" só aparece no plano que já está ativo.
    const pendente = lerJsonLocal("assinaturaPendente", null);
    const planoPendente = pendente ? normalizarPlanoBoleto(pendente.plano) : null;
    document.querySelectorAll(".btn-cancelar-assinatura, .btn-trocar-pagamento").forEach(btn => {
      const alvo = alvoDoCard(btn);
      const ativo = planoEhAtual(alvo);
      const aguardando = planoPendente === alvo;
      btn.hidden = btn.classList.contains("btn-trocar-pagamento") ? !ativo : !(ativo || aguardando);
    });

    const tagLock = document.getElementById("tag-lock-fin");
    if (tagLock) tagLock.hidden = temAcessoFinanceiro;

    const planos = [
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
    const secAssinatura = document.getElementById("secao-assinatura");
    const gridCardsFin = document.getElementById("grid-financeiro-cards");
    const avisoBloqueioFin = document.getElementById("aviso-bloqueio-financeiro-pagina");

    if (usuarioLogado.perfil === "COLABORADOR" && abaAtiva !== "Suporte") abaAtiva = "Agenda";

    // Sem plano (cancelou a assinatura): só a tela de Planos, com o aviso
    const avisoSemPlano = document.getElementById("aviso-sem-plano");
    if (avisoSemPlano) avisoSemPlano.hidden = !semPlano;
    if (semPlano && abaAtiva !== "Planos") {
      abaAtiva = "Planos";
      document.querySelectorAll(".menu-item").forEach(m => m.classList.toggle("ativo", m.dataset.menu === "Planos"));
    }

    secFin.style.display = "none";
    secAgenda.style.display = "none";
    secAdmin.style.display = "none";
    secSuporte.style.display = "none";
    secPlanos.style.display = "none";
    secAssinatura.style.display = "none";

    // Tabela e gráficos do financeiro só aparecem na aba Financeiro (não no Dashboard junto com a agenda)
    document.querySelectorAll("#secao-financeiro .so-financeiro").forEach(el => { el.hidden = abaAtiva !== "Financeiro"; });
    document.querySelectorAll("#secao-administrativo .so-administracao").forEach(el => { el.hidden = abaAtiva !== "Administracao"; });

    if (abaAtiva === "Dashboard") {
      // Dashboard sem o bloco financeiro (receitas, período dos valores etc.): ele fica só na aba Financeiro
      secFin.style.display = "none";
      gridCardsFin.style.display = "none";
      gridCardsFin.hidden = true;
      avisoBloqueioFin.hidden = true;
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
    } else if (abaAtiva === "Assinatura") {
      secAssinatura.style.display = "block";
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
      : nomeDoUsuario();
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

    select.innerHTML = `<option value="todos">Todos os Colaboradores</option>`;

    comDono(colaboradores).filter(c => c.ativo !== false).forEach(c => {
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

  // --- FINANCEIRO: FATURAMENTO POR COLABORADOR ---
  // Dia = data escolhida na agenda; Semana = segunda a domingo dessa data; Mês = mês dessa data.
  function limitesDosPeriodos(dataISO) {
    const [a, m, d] = dataISO.split("-").map(Number);
    const iso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const desdeSegunda = (new Date(a, m - 1, d).getDay() + 6) % 7; // segunda = 0
    return {
      Dia: [dataISO, dataISO],
      Semana: [iso(new Date(a, m - 1, d - desdeSegunda)), iso(new Date(a, m - 1, d - desdeSegunda + 6))],
      Mês: [iso(new Date(a, m - 1, 1)), iso(new Date(a, m, 0))]
    };
  }

  // Soma o valor dos agendamentos de cada colaborador em cada período.
  // >>> API: quando o endpoint FINANCEIRO existir, estes totais podem vir dele.
  function calcularFaturamentoPorColaborador() {
    const limites = limitesDosPeriodos(seletorData.value || obterDataHojeISO());
    const periodos = ["Dia", "Semana", "Mês"];
    const linhas = comDono(colaboradores).map(c => {
      const totais = { Dia: 0, Semana: 0, Mês: 0 };
      agendamentos.filter(a => a.colaboradorId === c.id).forEach(a => {
        periodos.forEach(p => {
          if (a.data >= limites[p][0] && a.data <= limites[p][1]) totais[p] += Number(a.valor) || 0;
        });
      });
      return { colaborador: c, totais };
    }).filter(l => l.colaborador.ativo !== false || periodos.some(p => l.totais[p] > 0));
    return { limites, linhas };
  }

  const corSegura = c => /^#[0-9a-fA-F]{3,8}$/.test(String(c || "")) ? c : "#6c5ce7";

  // Rosca: participação (%) de cada colaborador no faturamento do período escolhido; o total fica no meio
  function renderizarRosca(linhas) {
    const svg = document.getElementById("rosca-svg");
    const legenda = document.getElementById("rosca-legenda");
    if (!svg || !legenda) return;
    document.getElementById("titulo-rosca").textContent = `Participação por colaborador (${modoVisualizacao})`;

    const itens = linhas
      .map(l => ({ nome: l.colaborador.nome, cor: corSegura(l.colaborador.cor), valor: l.totais[modoVisualizacao] }))
      .filter(i => i.valor > 0)
      .sort((a, b) => b.valor - a.valor);
    const total = itens.reduce((soma, i) => soma + i.valor, 0);

    const R = 48, C = 2 * Math.PI * R;
    let desenho = `<circle cx="60" cy="60" r="${R}" fill="none" stroke-width="16" style="stroke: var(--hover-menu)"></circle>`;
    let acumulado = 0;
    itens.forEach(i => {
      const tamanho = (i.valor / total) * C;
      const visivel = itens.length > 1 ? Math.max(tamanho - 1.5, 0.5) : tamanho; // pequeno espaço entre as fatias
      desenho += `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${i.cor}" stroke-width="16" stroke-dasharray="${visivel} ${C - visivel}" stroke-dashoffset="${-acumulado}" transform="rotate(-90 60 60)"></circle>`;
      acumulado += tamanho;
    });
    desenho += `<text x="60" y="58" text-anchor="middle" class="rosca-total">${formatarMoeda(total)}</text><text x="60" y="71" text-anchor="middle">faturado</text>`;
    svg.innerHTML = desenho;

    legenda.innerHTML = "";
    if (!itens.length) {
      const vazio = document.createElement("p");
      vazio.className = "grafico-colab-vazio";
      vazio.textContent = "Sem faturamento neste período.";
      legenda.appendChild(vazio);
      return;
    }
    itens.forEach(i => {
      const item = document.createElement("div");
      const pct = document.createElement("span");
      pct.className = "rosca-pct";
      pct.style.color = i.cor;
      pct.textContent = Math.round((i.valor / total) * 100) + "%";
      const nome = document.createElement("span");
      nome.className = "rosca-nome";
      nome.textContent = i.nome;
      item.append(pct, nome);
      legenda.appendChild(item);
    });
  }

  // Faturamento acumulado dia a dia dentro de um mês (mes0 = 0 a 11), só dos colaboradores em "ids"
  function acumuladoDoMes(ano, mes0, ids) {
    const dias = new Date(ano, mes0 + 1, 0).getDate();
    const porDia = new Array(dias).fill(0);
    const prefixo = `${ano}-${String(mes0 + 1).padStart(2, "0")}-`;
    agendamentos.forEach(a => {
      if (!ids.has(a.colaboradorId) || typeof a.data !== "string" || !a.data.startsWith(prefixo)) return;
      const dia = parseInt(a.data.slice(8, 10), 10);
      if (dia >= 1 && dia <= dias) porDia[dia - 1] += Number(a.valor) || 0;
    });
    let soma = 0;
    return porDia.map(v => (soma += v));
  }

  // Linha com área: faturamento acumulado do mês escolhido (azul) contra o mês anterior (laranja)
  function renderizarLinhaMes(linhas, limites) {
    const area = document.getElementById("linha-grafico");
    const legenda = document.getElementById("linha-legenda");
    if (!area || !legenda) return;

    const ids = new Set(linhas.map(l => l.colaborador.id));
    const [ano, mes] = limites.Mês[0].split("-").map(Number);
    const anterior = new Date(ano, mes - 2, 1);
    const atual = acumuladoDoMes(ano, mes - 1, ids);
    const antes = acumuladoDoMes(anterior.getFullYear(), anterior.getMonth(), ids);
    const rotulo = (a, m) => `${String(m).padStart(2, "0")}/${a}`;
    const AZUL = "#29a3e8", LARANJA = "#f7b032";

    legenda.innerHTML =
      `<span><i class="linha-ponto" style="background:${AZUL}"></i>Mês escolhido (${rotulo(ano, mes)})</span>` +
      `<span><i class="linha-ponto" style="background:${LARANJA}"></i>Mês anterior (${rotulo(anterior.getFullYear(), anterior.getMonth() + 1)})</span>`;

    const maximo = Math.max(atual[atual.length - 1], antes[antes.length - 1], 0);
    if (maximo <= 0) {
      area.innerHTML = `<p class="grafico-colab-vazio">Sem faturamento neste período.</p>`;
      return;
    }

    const L = 44, T = 10, W = 376, H = 120;
    const dias = Math.max(atual.length, antes.length);
    const x = d => L + (dias === 1 ? 0 : ((d - 1) / (dias - 1)) * W);
    const y = v => T + H - (v / maximo) * H;
    const pontos = arr => arr.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`);

    let desenho = "";
    [0, 0.5, 1].forEach(f => {
      const yy = (T + H - f * H).toFixed(1);
      desenho += `<line class="linha-grade" x1="${L}" x2="${L + W}" y1="${yy}" y2="${yy}"></line>`;
      desenho += `<text x="${L - 5}" y="${(Number(yy) + 3).toFixed(1)}" text-anchor="end">${Math.round(maximo * f).toLocaleString("pt-BR")}</text>`;
    });
    [1, 5, 10, 15, 20, 25, 30].filter(d => d <= dias).forEach(d => {
      desenho += `<line class="linha-grade" x1="${x(d).toFixed(1)}" x2="${x(d).toFixed(1)}" y1="${T}" y2="${T + H}"></line>`;
      desenho += `<text x="${x(d).toFixed(1)}" y="${T + H + 13}" text-anchor="middle">${d}</text>`;
    });

    const ptsAtual = pontos(atual);
    desenho += `<path d="M ${ptsAtual.join(" L ")} L ${x(atual.length).toFixed(1)},${T + H} L ${x(1).toFixed(1)},${T + H} Z" fill="${AZUL}" fill-opacity="0.12"></path>`;
    desenho += `<path d="M ${pontos(antes).join(" L ")}" fill="none" stroke="${LARANJA}" stroke-width="2" stroke-linejoin="round"></path>`;
    desenho += `<path d="M ${ptsAtual.join(" L ")}" fill="none" stroke="${AZUL}" stroke-width="2" stroke-linejoin="round"></path>`;

    area.innerHTML = `<svg class="linha-svg" viewBox="0 0 430 150" role="img" aria-label="Faturamento acumulado no mês">${desenho}</svg>`;
  }

  function renderizarTabelaFinanceiro(limites, linhas) {
    const corpo = document.getElementById("tabela-financeiro-corpo");
    if (!corpo) return;
    const periodos = ["Dia", "Semana", "Mês"];
    const dm = iso => iso.split("-").reverse().slice(0, 2).join("/");
    const [aMes, mMes] = limites.Mês[0].split("-");
    document.getElementById("tabela-financeiro-info").textContent =
      `Dia ${dm(limites.Dia[0])} · Semana ${dm(limites.Semana[0])} a ${dm(limites.Semana[1])} · Mês ${mMes}/${aMes}`;

    corpo.innerHTML = "";
    linhas.forEach(l => {
      const tr = document.createElement("tr");
      const tdNome = document.createElement("td");
      tdNome.textContent = l.colaborador.nome;
      tr.appendChild(tdNome);
      periodos.forEach(p => {
        const td = document.createElement("td");
        td.dataset.periodo = p;
        td.textContent = formatarMoeda(l.totais[p]);
        tr.appendChild(td);
      });
      corpo.appendChild(tr);
    });

    const totais = { Dia: "total-fat-dia", Semana: "total-fat-semana", Mês: "total-fat-mes" };
    periodos.forEach(p => {
      document.getElementById(totais[p]).textContent = formatarMoeda(linhas.reduce((soma, l) => soma + l.totais[p], 0));
    });

    // destaca a coluna do período escolhido em "Período dos valores"
    document.querySelectorAll("#tabela-financeiro [data-periodo]").forEach(el => {
      el.classList.toggle("col-ativa", el.dataset.periodo === modoVisualizacao);
    });
  }

  // --- HISTÓRICO: QUEM DESMARCOU E QUEM REMARCOU ---
  // Cada vez que um agendamento é apagado ("desmarcou") ou muda de data/horário ("remarcou"), fica um registro
  // guardado no navegador (separado por e-mail do dono). >>> API: quando houver endpoint, estes registros podem vir dele.
  function chaveHistoricoAgenda() {
    return "historicoAgenda:" + (localStorage.getItem("emailUsuarioLogado") || "dono").trim().toLowerCase();
  }
  // Remarcar o mesmo agendamento várias vezes vira UMA linha só: "de <horário de origem> para <horário atual>",
  // e ela vai se atualizando. Se ele voltar ao horário de origem, a linha some (no fim não houve alteração).
  function consolidarRemarcacoes(lista) {
    const resultado = [];
    lista.forEach(e => {
      if (!e || e.tipo !== "remarcou") { resultado.push(e); return; }
      let i = -1;
      for (let k = resultado.length - 1; k >= 0; k--) {
        const x = resultado[k];
        if (x && x.tipo === "remarcou"
          && x.cliente === e.cliente && (x.servico || "") === (e.servico || "")
          && (x.agendamentoId == null || e.agendamentoId == null || x.agendamentoId === e.agendamentoId)
          && x.dataNova === e.dataOriginal && x.horaNova === e.horaOriginal) { i = k; break; }
      }
      if (i === -1) { resultado.push(e); return; }
      const junto = Object.assign({}, resultado[i], {
        dataNova: e.dataNova,
        horaNova: e.horaNova,
        quando: e.quando,
        colaboradorNome: e.colaboradorNome || resultado[i].colaboradorNome,
        agendamentoId: e.agendamentoId != null ? e.agendamentoId : resultado[i].agendamentoId
      });
      if (junto.dataOriginal === junto.dataNova && junto.horaOriginal === junto.horaNova) {
        resultado.splice(i, 1); // voltou ao horário de origem
      } else {
        resultado[i] = junto;
      }
    });
    return resultado;
  }
  function lerHistoricoAgenda() {
    const lista = lerJsonLocal(chaveHistoricoAgenda(), []);
    return Array.isArray(lista) ? consolidarRemarcacoes(lista) : [];
  }
  function registrarHistoricoAgenda(evento) {
    try {
      const lista = lerHistoricoAgenda();
      lista.push(Object.assign({}, evento, { quando: new Date().toISOString() }));
      localStorage.setItem(chaveHistoricoAgenda(), JSON.stringify(consolidarRemarcacoes(lista)));
    } catch (e) { /* sem armazenamento: a agenda continua funcionando */ }
  }

  // Barras por cliente (desmarcou x remarcou) + lista com o que aconteceu, no período escolhido (Dia/Semana/Mês).
  // O período vale para o dia do horário original do agendamento.
  function renderizarAlteracoes(limites) {
    const lista = document.getElementById("alt-lista");
    if (!lista) return;
    const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const br = iso => iso ? iso.split("-").reverse().join("/") : "";

    const [ini, fim] = limites[modoVisualizacao];
    // O quadro segue o STATUS ATUAL de cada agendamento:
    // - "remarcou" só conta enquanto o agendamento ainda está Remarcado (se virou Concluído/Cancelado, sai);
    // - todo agendamento Cancelado conta como "desmarcou" (se voltar a outro status, deixa de contar).
    const achaAg = id => (id == null ? null : agendamentos.find(a => a.id === id) || null);
    let eventos = lerHistoricoAgenda().filter(e => e.dataOriginal >= ini && e.dataOriginal <= fim).filter(e => {
      const a = achaAg(e.agendamentoId);
      if (e.tipo === "remarcou" && a && a.status !== "Remarcado") return false;
      if (e.tipo === "desmarcou" && e.agendamentoId != null && a && a.status !== "Cancelado") return false;
      return true;
    });
    agendamentos.filter(a => a.status === "Cancelado" && a.data >= ini && a.data <= fim).forEach(a => {
      if (eventos.some(e => e.tipo === "desmarcou" && e.agendamentoId === a.id)) return;
      const colab = colaboradores.find(c => c.id === a.colaboradorId);
      eventos.push({ tipo: "desmarcou", agendamentoId: a.id, cliente: a.cliente, servico: a.servico || "",
        colaboradorNome: colab ? colab.nome : "", dataOriginal: a.data, horaOriginal: a.horaInicio, quando: "" });
    });
    const desmarcados = eventos.filter(e => e.tipo === "desmarcou").length;
    const remarcados = eventos.filter(e => e.tipo === "remarcou").length;

    document.getElementById("valor-desmarcados").textContent = desmarcados;
    document.getElementById("valor-remarcados").textContent = remarcados;
    document.getElementById("titulo-alteracoes-resumo").textContent = `Desmarcações e remarcações (${modoVisualizacao})`;
    document.getElementById("titulo-alteracoes").textContent = `Quem desmarcou e quem remarcou (${modoVisualizacao})`;

    // Rosca igual à de "Participação por colaborador": fatia vermelha = desmarcou, amarela = remarcou
    const rosca = document.getElementById("alt-rosca");
    const legenda = document.getElementById("alt-legenda");
    const itens = [
      { nome: "Desmarcou", cor: "#e11d48", valor: desmarcados },
      { nome: "Remarcou", cor: "#f7b032", valor: remarcados }
    ].filter(i => i.valor > 0);
    const total = desmarcados + remarcados;

    const R = 48, C = 2 * Math.PI * R;
    let desenho = `<circle cx="60" cy="60" r="${R}" fill="none" stroke-width="16" style="stroke: var(--hover-menu)"></circle>`;
    let acumulado = 0;
    itens.forEach(i => {
      const tamanho = (i.valor / total) * C;
      const visivel = itens.length > 1 ? Math.max(tamanho - 1.5, 0.5) : tamanho;
      desenho += `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${i.cor}" stroke-width="16" stroke-dasharray="${visivel} ${C - visivel}" stroke-dashoffset="${-acumulado}" transform="rotate(-90 60 60)"></circle>`;
      acumulado += tamanho;
    });
    desenho += `<text x="60" y="58" text-anchor="middle" class="rosca-total">${total}</text><text x="60" y="71" text-anchor="middle">${total === 1 ? "alteração" : "alterações"}</text>`;
    rosca.innerHTML = desenho;

    if (!total) {
      legenda.innerHTML = `<p class="grafico-colab-vazio">Ninguém desmarcou nem remarcou neste período.</p>`;
      lista.innerHTML = "";
      return;
    }
    legenda.innerHTML = itens.map(i => `<div><span class="rosca-pct" style="color:${i.cor}">${Math.round((i.valor / total) * 100)}%</span><span class="rosca-nome">${i.nome} (${i.valor})</span></div>`).join("");

    lista.innerHTML = eventos.slice().sort((a, b) => String(b.quando).localeCompare(String(a.quando))).slice(0, 12).map(e => {
      const antes = `${br(e.dataOriginal)} às ${esc(e.horaOriginal)}`;
      const texto = e.tipo === "remarcou"
        ? `remarcou de ${antes} para ${br(e.dataNova)} às ${esc(e.horaNova)}`
        : `desmarcou o horário de ${antes}`;
      const detalhe = [e.servico, e.colaboradorNome].filter(Boolean).map(esc).join(" · ");
      return `<div class="alt-item"><i class="alt-ponto ${e.tipo === "remarcou" ? "alt-ponto-remarcou" : "alt-ponto-desmarcou"}"></i>
        <div><strong>${esc(e.cliente || "Sem nome")}</strong> ${texto}${detalhe ? `<small>${detalhe}</small>` : ""}</div></div>`;
    }).join("");
  }

  // Financeiro: lista dos agendamentos CONCLUÍDOS no período escolhido (Dia/Semana/Mês)
  function renderizarConcluidos(limites) {
    let caixa = document.getElementById("financeiro-concluidos");
    if (!caixa) {
      const tabela = document.getElementById("tabela-financeiro");
      if (!tabela) return;
      caixa = document.createElement("div");
      caixa.id = "financeiro-concluidos";
      caixa.className = "so-financeiro";
      caixa.style.cssText = "margin-top:16px;";
      const alvo = tabela.closest(".so-financeiro") || tabela;
      alvo.insertAdjacentElement("afterend", caixa);
    }
    caixa.hidden = abaAtiva !== "Financeiro";
    const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const [ini, fim] = limites[modoVisualizacao];
    const lista = agendamentos
      .filter(a => a.status === "Concluido" && a.data >= ini && a.data <= fim)
      .sort((a, b) => (a.data + a.horaInicio).localeCompare(b.data + b.horaInicio));
    const total = lista.reduce((soma, a) => soma + (Number(a.valor) || 0), 0);
    const titulo = `<h4 style="margin:0 0 8px;">Agendamentos concluídos (${modoVisualizacao}) · ${lista.length} · ${formatarMoeda(total)}</h4>`;
    if (!lista.length) {
      caixa.innerHTML = titulo + `<p class="grafico-colab-vazio">Nenhum agendamento concluído neste período.</p>`;
      return;
    }
    const linhas = lista.map(a => {
      const colab = comDono(colaboradores).find(c => c.id === a.colaboradorId);
      return `<tr><td>${esc(a.cliente)}</td><td>${esc(a.servico || "—")}</td><td>${esc(colab ? colab.nome : "—")}</td><td>${dataBR(a.data)} ${esc(a.horaInicio)}</td><td>${formatarMoeda(Number(a.valor) || 0)}</td></tr>`;
    }).join("");
    caixa.innerHTML = titulo + `<table class="tabela-contratos"><thead><tr><th>Cliente</th><th>Serviço</th><th>Profissional</th><th>Data</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody></table>`;
  }

  function atualizarFinanceiro() {
    // Receitas e saldo vêm da soma dos agendamentos de cada período (despesas continuam vindo de financeiroPorPeriodo)
    const { limites, linhas } = calcularFaturamentoPorColaborador();
    ["Dia", "Semana", "Mês"].forEach(p => {
      const receitas = linhas.reduce((soma, l) => soma + l.totais[p], 0);
      financeiroPorPeriodo[p].receitas = receitas;
      financeiroPorPeriodo[p].saldo = receitas - financeiroPorPeriodo[p].despesas;
    });
    const d = financeiroPorPeriodo[modoVisualizacao];
    document.getElementById("titulo-receitas").textContent = `Receitas (${modoVisualizacao})`;
    document.getElementById("valor-receitas").textContent = formatarMoeda(d.receitas);
    renderizarTabelaFinanceiro(limites, linhas);
    renderizarRosca(linhas);
    renderizarLinhaMes(linhas, limites);
    renderizarAlteracoes(limites);
    renderizarConcluidos(limites);
  }

  // --- PAGINAÇÃO DA AGENDA ---
  function obterColaboradoresPagina() {
    if (usuarioLogado.perfil === "COLABORADOR") {
      const meuPerfil = colaboradores.find(c => c.id === usuarioLogado.colaboradorId);
      return meuPerfil ? [meuPerfil] : [];
    }

    // Colaborador inativo some da agenda (os agendamentos dele continuam salvos)
    const colaboradoresAtivos = comDono(colaboradores).filter(c => c.ativo !== false);

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

    return Math.ceil(comDono(colaboradores).filter(c => c.ativo !== false).length / colunasVisiveis) || 1;
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
  const horaFim = 19;
  const totalHoras = horaFim - horaInicio;
  const agenda = document.getElementById("agenda");
  const seletorData = document.getElementById("seletor-data");
  const seletorColunas = document.getElementById("seletor-colunas");

  async function removerAgendamento(id, event) {
    if (event) event.stopPropagation();

    // A API não apaga agendamento: marca como Cancelado (PATCH /Agendamentos/{id}/status).
    // Se a API recusar, mostra o erro e o agendamento continua na agenda.
    try {
      await cancelarAgendamentoApi(id);
    } catch (erro) {
      alert(mensagemErroApiComum(erro, "Não foi possível remover o agendamento no banco."));
      return;
    }

    // No banco ele continua (como Cancelado): guarda como "escondido" para não voltar quando a agenda recarregar
    const agRemovido = agendamentos.find(a => a.id === id);
    const assinaturaRemovido = agRemovido ? assinaturaAgendamento(agRemovido) : null;
    if (assinaturaRemovido && !agendamentosOcultos.includes(assinaturaRemovido)) {
      agendamentosOcultos.push(assinaturaRemovido);
      localStorage.setItem(CHAVE_AGENDAMENTOS_OCULTOS, JSON.stringify(agendamentosOcultos));
    }
    const agDesmarcado = agendamentos.find(a => a.id === id);
    if (agDesmarcado) {
      const colab = colaboradores.find(c => c.id === agDesmarcado.colaboradorId);
      registrarHistoricoAgenda({
        tipo: "desmarcou",
        cliente: agDesmarcado.cliente,
        servico: agDesmarcado.servico || "",
        colaboradorNome: colab ? colab.nome : "",
        dataOriginal: agDesmarcado.data,
        horaOriginal: agDesmarcado.horaInicio
      });
    }
    agendamentos = agendamentos.filter(a => a.id !== id);
    salvarAgendamentosLocal(agendamentos);
    renderizarAgenda();
  }

  // =====================================================
  // WHATSAPP
  // Funciona 100% no front: o botão abre a conversa do WhatsApp (app ou web)
  // com a mensagem de lembrete já escrita; a pessoa só aperta "Enviar".
  // Envio automático (sem clicar) exige a API oficial do WhatsApp, feita no back-end.
  // =====================================================
  const WHATSAPP_SOMENTE_PREMIUM = true; // true = WhatsApp só no plano Premium (Grátis e Básico não veem o botão)
  const CHAVE_WHATSAPP_LIGADO = "whatsappLigado";
  let whatsappLigado = true; // segue o plano: Premium = ligado; Grátis/Básico/Sem plano = desligado
  let whatsappFlutuanteIniciado = false;

  function whatsappLiberadoNoPlano() {
    return !WHATSAPP_SOMENTE_PREMIUM || planoAtual === "PREMIUM" || planoAtual === "PRO";
  }

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

  function dataBR(iso) {
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
  }

  function abrirWhatsApp(ag) {
    const numero = telefoneValido(ag.whatsapp || "");
    if (!numero) {
      alert("Este agendamento não tem um WhatsApp válido.");
      return;
    }
    const colab = comDono(colaboradores).find(c => c.id === ag.colaboradorId);
    const mensagem =
      `Olá, ${ag.cliente}! Passando para lembrar do seu horário` +
      `${ag.servico ? " de " + ag.servico : ""} no dia ${dataBR(ag.data)} às ${ag.horaInicio}` +
      `${colab ? " com " + colab.nome : ""}. Você confirma?`;
    const url = `https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank", "noopener");
  }

  function atualizarWhatsApp() {
    const btn = document.getElementById("btn-toggle-whatsapp");
    const campo = document.getElementById("campo-whatsapp");
    whatsappLigado = whatsappLiberadoNoPlano(); // volta a ligar sozinho quando o plano passa a ser Premium
    if (btn) {
      btn.textContent = whatsappLigado ? "💬 Ligado" : "💬 Desligado";
      btn.classList.toggle("whatsapp-on", whatsappLigado);
      btn.setAttribute("aria-pressed", String(whatsappLigado));
    }
    if (campo) campo.hidden = false; // o campo Telefone aparece em todos os planos; só os botões de enviar WhatsApp são do Premium
    atualizarWhatsAppFlutuante();
    renderizarAgenda();
  }

  // Botão flutuante verde no canto da tela (js/whatsapp.js): só aparece no plano Premium
  function atualizarWhatsAppFlutuante() {
    if (!window.WhatsAppFlutuante) return;
    if (!whatsappFlutuanteIniciado) {
      WhatsAppFlutuante.iniciar({ permitirConfigurar: false, mensagem: "Olá! Gostaria de falar com o suporte." });
      whatsappFlutuanteIniciado = true;
    }
    WhatsAppFlutuante.mostrar(whatsappLiberadoNoPlano());
  }

  const btnToggleWhatsapp = document.getElementById("btn-toggle-whatsapp");
  if (btnToggleWhatsapp) {
    btnToggleWhatsapp.addEventListener("click", () => {
      if (!whatsappLiberadoNoPlano()) {
        alert("A integração com WhatsApp está disponível no plano Premium.");
        return;
      }
      whatsappLigado = !whatsappLigado;
      localStorage.setItem(CHAVE_WHATSAPP_LIGADO, whatsappLigado ? "1" : "0");
      atualizarWhatsApp();
    });
  }

  const campoWhatsapp = document.getElementById("agend-whatsapp");
  if (campoWhatsapp) {
    campoWhatsapp.addEventListener("input", () => {
      campoWhatsapp.value = formatarTelefone(campoWhatsapp.value);
    });
  }

  // Clicou no card: abre os detalhes, e de lá dá para editar
  function verDetalhesAgendamento(ag) {
    const modal = document.getElementById("modal-detalhes-agendamento");
    if (!modal) return;
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
    const btnZapDetalhes = document.getElementById("btn-whatsapp-detalhes");
    if (btnZapDetalhes) {
      btnZapDetalhes.hidden = !(whatsappLigado && telefoneValido(ag.whatsapp || ""));
      btnZapDetalhes.onclick = () => abrirWhatsApp(ag);
    }

    // Status do agendamento (lista): grava na API assim que a pessoa troca.
    // Valores no banco: Agendado | Concluido | NaoCompareceu | Cancelado (PATCH /Agendamentos/{id}/status).
    const selectStatus = document.getElementById("det-status");
    const msgStatus = document.getElementById("det-status-msg");
    if (selectStatus) {
      const pintarStatus = () => selectStatus.setAttribute("data-status", selectStatus.value);
      const mostrarMsgStatus = (texto) => {
        if (!msgStatus) return;
        msgStatus.textContent = texto;
        msgStatus.style.display = texto ? "block" : "none";
      };
      selectStatus.value = ag.status || "Agendado";
      pintarStatus();
      mostrarMsgStatus("");
      selectStatus.onchange = async () => {
        const anterior = ag.status || "Agendado";
        const novoStatus = selectStatus.value;
        pintarStatus();
        mostrarMsgStatus("");
        selectStatus.disabled = true;
        try {
          // PATCH /Agendamentos/{id}/status. Se a rota não existir, cai no PUT com o corpo completo (como antes).
          const montado = montarCorpoAgendamentoApi(Object.assign({}, ag, { status: novoStatus }));
          console.log("[API] enviando status do agendamento:", novoStatus);
          await atualizarStatusAgendamentoApi(ag.id, novoStatus, montado.erro ? null : montado.corpo);
          ag.status = novoStatus;
          guardarStatusLocal(ag.id, novoStatus);
          const naLista = agendamentos.find(a => a.id === ag.id);
          if (naLista) naLista.status = novoStatus;
          salvarAgendamentosLocal(agendamentos);
          // Cancelado conta como "desmarcou" no quadro do Financeiro (uma vez só por agendamento)
          if (novoStatus === "Cancelado" && anterior !== "Cancelado") {
            const jaRegistrado = lerHistoricoAgenda().some(h => h.tipo === "desmarcou" && h.agendamentoId === ag.id && h.dataOriginal === ag.data && h.horaOriginal === ag.horaInicio);
            if (!jaRegistrado) {
              const colabCanc = colaboradores.find(c => c.id === ag.colaboradorId);
              registrarHistoricoAgenda({
                tipo: "desmarcou",
                agendamentoId: ag.id,
                cliente: ag.cliente,
                servico: ag.servico || "",
                colaboradorNome: colabCanc ? colabCanc.nome : "",
                dataOriginal: ag.data,
                horaOriginal: ag.horaInicio
              });
            }
          }
          renderizarAgenda(); // atualiza também o Financeiro (desmarcações e concluídos)
        } catch (erro) {
          console.warn("[API] erro ao salvar o status do agendamento:", erro.message);
          selectStatus.value = anterior; // volta para o status que estava gravado
          pintarStatus();
          mostrarMsgStatus(erro.message && !/^Erro na API/.test(erro.message)
            ? erro.message
            : mensagemErroApiComum(erro, "Não foi possível salvar o status no banco."));
        } finally {
          selectStatus.disabled = false;
        }
      };
    }

    const fechar = () => { modal.hidden = true; };

    // Botão "Cancelar agendamento": muda o status para Cancelado (o agendamento continua na agenda;
    // para tirar da agenda de vez, use o ✕ do card)
    let btnCancelarAg = document.getElementById("btn-cancelar-agendamento-det");
    if (!btnCancelarAg) {
      btnCancelarAg = document.createElement("button");
      btnCancelarAg.type = "button";
      btnCancelarAg.id = "btn-cancelar-agendamento-det";
      btnCancelarAg.className = "btn-cancelar";
      btnCancelarAg.textContent = "Cancelar";
      btnCancelarAg.style.cssText = "color:#e11d48; border-color:#e11d48;";
      const btnFechar2 = document.getElementById("btn-fechar-detalhes-2");
      btnFechar2.parentElement.insertBefore(btnCancelarAg, btnFechar2);
    }
    btnCancelarAg.hidden = (ag.status === "Cancelado" || ag.status === "Concluido");
    btnCancelarAg.onclick = () => {
      if (!confirm("Cancelar este agendamento? O status vai mudar para Cancelado.")) return;
      if (selectStatus) {
        selectStatus.value = "Cancelado";
        selectStatus.onchange(); // reaproveita o mesmo salvamento do status (API)
        btnCancelarAg.hidden = true;
      }
    };

    document.getElementById("btn-fechar-detalhes").onclick = fechar;
    document.getElementById("btn-fechar-detalhes-2").onclick = fechar;
    modal.onclick = (e) => { if (e.target === modal) fechar(); };
    document.getElementById("btn-editar-agendamento").onclick = () => { fechar(); abrirEdicaoAgendamento(ag); };
    modal.hidden = false;
  }
  document.addEventListener("keydown", (e) => {
    const modalDet = document.getElementById("modal-detalhes-agendamento");
    if (e.key === "Escape" && modalDet && !modalDet.hidden) modalDet.hidden = true;
  });

  function renderizarAgenda() {
    agenda.innerHTML = "";
    atualizarFinanceiro();
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
        const heightPx = Math.max((ag.duracaoMin / 60) * 48, 52); // altura mínima: cabem o ✕ e o botão do WhatsApp
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
    const menuAssinatura = document.querySelector('.menu-item[data-menu="Assinatura"]');

    if (usuarioLogado.perfil === "COLABORADOR") {
      containerPaginacao.style.display = "none";
      seletorColunasDiv.style.display = "none";
      if (menuFinanceiro) menuFinanceiro.style.display = "none";
      if (menuAdministracao) menuAdministracao.style.display = "none";
      if (menuPlanos) menuPlanos.style.display = "none";
      if (menuAssinatura) menuAssinatura.style.display = "none";

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
      if (menuAssinatura) menuAssinatura.style.display = "flex";
      if (semPlano) {
        document.querySelectorAll(".menu-item[data-menu]").forEach(m => { if (m.dataset.menu !== "Planos") m.style.display = "none"; });
      }
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

  // id do agendamento que está sendo editado (null = é um agendamento novo)
  let agendamentoEditandoId = null;

  function popularProfissionaisAgendamento() {
    // O dono sempre aparece na lista de profissionais, então não exige colaborador cadastrado
    selectProfissional.innerHTML = "";
    comDono(colaboradores)
      .filter(c => c.ativo !== false)
      .filter(c => usuarioLogado.perfil !== "COLABORADOR" || c.id === usuarioLogado.colaboradorId)
      .forEach(c => {
      selectProfissional.insertAdjacentHTML("beforeend", `<option value="${c.id}">${c.nome}</option>`);
    });
  }

  function definirModoEdicaoAgendamento(editando) {
    const titulo = document.getElementById("modal-agendamento-titulo");
    const botao = document.getElementById("btn-confirmar-agendamento");
    if (titulo) titulo.textContent = editando ? "Editar Agendamento" : "Agendar Cliente";
    if (botao) botao.textContent = editando ? "Salvar alterações" : "Confirmar Agendamento";
  }

  // Botão ✎ do card: abre o mesmo formulário já preenchido com os dados do agendamento
  function abrirEdicaoAgendamento(ag) {
    agendamentoEditandoId = ag.id;
    definirModoEdicaoAgendamento(true);
    limparErroForm(formAgendamento);
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
    modalAgendamento.hidden = false;
  }

  btnAbrirAgendamento.addEventListener("click", () => {
    if (planoVencido) { alert(MSG_PLANO_VENCIDO); return; }
    agendamentoEditandoId = null;
    definirModoEdicaoAgendamento(false);
    popularProfissionaisAgendamento();
    const hojeISO = obterDataHojeISO();
    const campoData = document.getElementById("agend-data");
    campoData.min = hojeISO;
    campoData.value = (seletorData.value >= hojeISO) ? seletorData.value : hojeISO;
    atualizarServicosAgendamento();
    modalAgendamento.hidden = false;
    recarregarServicosDoBanco(); // traz o que está no banco agora
  });
  formAgendamento.addEventListener("reset", () => setTimeout(() => atualizarServicosAgendamento([]), 0));

  function fecharModalAgendamento() {
    modalAgendamento.hidden = true;
    limparErroForm(formAgendamento);
    if (agendamentoEditandoId !== null) { // cancelou/terminou uma edição: deixa o formulário limpo para o próximo agendamento
      agendamentoEditandoId = null;
      formAgendamento.reset();
      definirModoEdicaoAgendamento(false);
    }
  }
  btnFecharModal.addEventListener("click", fecharModalAgendamento);
  btnCancelarAgendamento.addEventListener("click", fecharModalAgendamento);

  // =====================================================
  // AGENDAMENTO NA API: POST /Agendamentos (novo) e PUT /Agendamentos/{id} (editar).
  // >>> Se a API reclamar de nome de campo, é SÓ aqui que se ajusta.
  // O dono (DonoId) vem do token. O cliente e os serviços vão pelo id do banco.
  // =====================================================
  function montarCorpoAgendamentoApi(ag) {
    const nomeCliente = String(ag.cliente || "").trim().toLowerCase();
    const cliente = clientes.find(c => c.nome.toLowerCase() === nomeCliente);
    if (!cliente || cliente.id === null || cliente.id === undefined) {
      return { erro: 'Escolha um cliente cadastrado na lista, ou cadastre um novo em "+ Cadastrar novo cliente".' };
    }
    const servicoIds = [];
    for (const nome of (ag.servicos || [])) {
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
        colaboradorId: ag.colaboradorId === 0 ? null : ag.colaboradorId, // 0 = o próprio dono (não é colaborador)
        servicoId: servicoIds[0],                        // a API pediu "o ID do serviço" (um só)
        servicoIds,                                     // lista completa (se a API aceitar vários, ela usa este)
        data: ag.data,                                  // "2026-10-21"
        horaInicio: hora.length === 5 ? hora + ":00" : hora, // "08:00:00"
        duracaoMinutos: ag.duracaoMin,
        valor: ag.valor,
        cor: ag.cor,
        ...(ag.status ? { status: ag.status } : {}) // Agendado | Remarcado | Cancelado | Concluido
      }
    };
  }

  formAgendamento.addEventListener("submit", async function(e) {
    e.preventDefault();

    const validacaoAgendamento = validarAgendamentoComServicos();
    if (validacaoAgendamento.erros.length > 0) {
      mostrarErroForm(formAgendamento, validacaoAgendamento.erros.join("\n"), validacaoAgendamento.campoErro);
      return;
    }
    // Telefone do cliente (opcional; se preencher, precisa ser válido). Vale para todos os planos.
    let whatsappCliente = "";
    const campoZap = document.getElementById("agend-whatsapp");
    if (campoZap && campoZap.value.trim()) {
      whatsappCliente = telefoneValido(campoZap.value);
      if (!whatsappCliente) {
        mostrarErroForm(formAgendamento, "Digite um telefone válido com DDD. Exemplo: (11) 91234-5678", campoZap);
        return;
      }
    }
    limparErroForm(formAgendamento);

    const dataEscolhida = document.getElementById("agend-data").value;
    const agendamentoOriginal = agendamentoEditandoId !== null ? agendamentos.find(a => a.id === agendamentoEditandoId) : null;
    const manteveData = !!agendamentoOriginal && agendamentoOriginal.data === dataEscolhida; // editar sem mudar o dia é permitido
    if (dataEscolhida < obterDataHojeISO() && !manteveData) {
      alert("Não é possível agendar em uma data que já passou. Escolha uma data de hoje em diante.");
      return;
    }

    // Editou e mudou o dia ou a hora = o status vira "Remarcado" (depois ainda dá para trocar na lista de status)
    const mudouDiaOuHora = !!agendamentoOriginal && (
      agendamentoOriginal.data !== dataEscolhida ||
      agendamentoOriginal.horaInicio !== document.getElementById("agend-hora-inicio").value
    );

    const novoAgendamento = {
      id: Date.now(),
      cliente: document.getElementById("agend-cliente").value,
      servico: listaEmTexto(lerServicosMarcados()), // texto: "Manicure e Pedicure"
      servicos: lerServicosMarcados(),              // lista: ["Manicure", "Pedicure"]
      colaboradorId: parseInt(selectProfissional.value),
      data: document.getElementById("agend-data").value,
      horaInicio: document.getElementById("agend-hora-inicio").value,
      duracaoMin: parseInt(document.getElementById("agend-duracao").value),
      cor: document.getElementById("agend-cor").value,
      valor: calcularTotalServicos(), // soma dos valores fixos dos serviços marcados
      whatsapp: whatsappCliente,
      status: mudouDiaOuHora ? "Remarcado" : (agendamentoOriginal ? agendamentoOriginal.status : undefined) // mudou dia/hora = Remarcado
    };

    // >>> API: POST /Agendamentos (novo) ou PUT /Agendamentos/{id} (edição).
    // Só entra na agenda o que foi gravado no banco.
    const montado = montarCorpoAgendamentoApi(novoAgendamento);
    if (montado.erro) {
      mostrarErroForm(formAgendamento, montado.erro, document.getElementById("agend-cliente"));
      return;
    }
    const btnConfirmar = document.getElementById("btn-confirmar-agendamento");
    if (btnConfirmar) btnConfirmar.disabled = true;
    try {
      console.log("[API] enviando agendamento:", montado.corpo);
      if (agendamentoEditandoId !== null) {
        await editarAgendamentoApi(agendamentoEditandoId, montado.corpo);
        novoAgendamento.id = agendamentoEditandoId;
        if (mudouDiaOuHora) guardarStatusLocal(agendamentoEditandoId, "Remarcado");
      } else {
        const criado = await criarAgendamentoApi(montado.corpo);
        console.log("[API] resposta do POST /Agendamentos:", criado);
        const idCriado = criado && typeof criado === "object" ? Number(criado.id ?? criado.Id) : NaN;
        if (Number.isFinite(idCriado)) {
          novoAgendamento.id = idCriado;
        } else {
          console.warn("A API não devolveu o id do agendamento; ele não poderá ser editado pela API até a agenda ser recarregada do banco.");
        }
      }
    } catch (erro) {
      console.warn("[API] erro ao salvar agendamento:", erro.message);
      mostrarErroForm(formAgendamento, mensagemErroApiComum(erro, "Não foi possível salvar o agendamento no banco."), null);
      return;
    } finally {
      if (btnConfirmar) btnConfirmar.disabled = false;
    }

    // Editou e mudou o dia ou o horário = remarcou
    if (agendamentoOriginal && (agendamentoOriginal.data !== novoAgendamento.data || agendamentoOriginal.horaInicio !== novoAgendamento.horaInicio)) {
      const colabRemarcou = colaboradores.find(c => c.id === novoAgendamento.colaboradorId);
      registrarHistoricoAgenda({
        tipo: "remarcou",
        agendamentoId: novoAgendamento.id,
        cliente: novoAgendamento.cliente,
        servico: novoAgendamento.servico || "",
        colaboradorNome: colabRemarcou ? colabRemarcou.nome : "",
        dataOriginal: agendamentoOriginal.data,
        horaOriginal: agendamentoOriginal.horaInicio,
        dataNova: novoAgendamento.data,
        horaNova: novoAgendamento.horaInicio
      });
    }

    // Volta ao banco para pegar o que ficou gravado (ids e valores de verdade).
    // Se não conseguir ler, usa o que acabou de ser salvo.
    const recarregou = await recarregarAgendamentosDoBanco();
    if (!recarregou) {
      if (agendamentoEditandoId !== null) {
        agendamentos = agendamentos.map(a => a.id === agendamentoEditandoId ? novoAgendamento : a);
      } else {
        agendamentos.push(novoAgendamento);
      }
      salvarAgendamentosLocal(agendamentos);
    }
    seletorData.value = novoAgendamento.data;
    renderizarAgenda();
    fecharModalAgendamento();
    formAgendamento.reset();
  });

  // =====================================================
  // CLIENTES (cada dono vê só os seus)
  // POST /Clientes cadastra { nome, telefone }; GET /Clientes devolve os clientes do dono do token.
  // O DonoId NÃO é enviado pelo front: a API tira do token. Enquanto o GET não existir na API,
  // a lista fica guardada no navegador, separada por e-mail do dono (um dono nunca vê os de outro).
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

  // Lista de telefones (datalist) do campo Telefone do agendamento; é criada aqui se não existir no HTML
  function obterListaTelefones() {
    const campo = document.getElementById("agend-whatsapp");
    if (!campo) return null;
    let lista = document.getElementById("lista-telefones");
    if (!lista) {
      lista = document.createElement("datalist");
      lista.id = "lista-telefones";
      campo.insertAdjacentElement("afterend", lista);
    }
    campo.setAttribute("list", "lista-telefones");
    return lista;
  }

  function atualizarListaClientes() {
    const ordenados = clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    // Lista de NOMES: o nome em cima e o telefone embaixo
    const lista = document.getElementById("lista-clientes");
    if (lista) {
      lista.innerHTML = "";
      ordenados.forEach(c => {
        const opcao = document.createElement("option");
        opcao.value = c.nome;
        if (c.telefone) opcao.label = formatarTelefone(c.telefone);
        lista.appendChild(opcao);
      });
    }

    // Lista de TELEFONES: o telefone em cima e o nome embaixo
    const listaTel = obterListaTelefones();
    if (listaTel) {
      listaTel.innerHTML = "";
      ordenados.filter(c => c.telefone).forEach(c => {
        const opcao = document.createElement("option");
        opcao.value = formatarTelefone(c.telefone);
        opcao.label = c.nome;
        listaTel.appendChild(opcao);
      });
    }

    renderizarListaClientes(); // tabela da Administração
  }

  async function carregarClientes() {
    clientes = lerJsonLocal(chaveClientes(), []).map(normalizarCliente).filter(Boolean);
    atualizarListaClientes();
    try {
      const dados = await apiRequest("CLIENTES"); // GET: a API devolve só os clientes do dono do token
      const listaClientesApi = extrairLista(dados);
      if (listaClientesApi) {
        clientes = listaClientesApi.map(normalizarCliente).filter(Boolean);
        salvarClientesLocal();
        atualizarListaClientes();
      }
    } catch (erro) {
      console.warn("Não foi possível carregar clientes da API.", erro.message);
    }
  }

  // Escolheu (ou digitou) um cliente cadastrado no agendamento: já traz o telefone dele no WhatsApp
  const campoClienteAgend = document.getElementById("agend-cliente");
  if (campoClienteAgend) {
    const preencherTelefoneDoCliente = () => {
      const nome = campoClienteAgend.value.trim().toLowerCase();
      const achado = nome ? clientes.find(c => c.nome.toLowerCase() === nome) : null;
      const zap = document.getElementById("agend-whatsapp");
      if (achado && achado.telefone && zap) zap.value = formatarTelefone(achado.telefone);
    };
    campoClienteAgend.addEventListener("input", preencherTelefoneDoCliente);
    campoClienteAgend.addEventListener("change", preencherTelefoneDoCliente);
  }

  // Campo Telefone do agendamento (é o #agend-whatsapp): escolheu/digitou um telefone cadastrado, o nome vem junto
  const campoTelefoneAgend = document.getElementById("agend-whatsapp");
  if (campoTelefoneAgend) {
    obterListaTelefones();
    const preencherNomeDoCliente = () => {
      const digitos = campoTelefoneAgend.value.replace(/\D/g, "");
      if (digitos.length < 10) return;
      const achado = clientes.find(c => c.telefone === digitos);
      if (achado && campoClienteAgend) campoClienteAgend.value = achado.nome;
    };
    campoTelefoneAgend.addEventListener("input", preencherNomeDoCliente);
    campoTelefoneAgend.addEventListener("change", preencherNomeDoCliente);
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
    await carregarClientes(); // pega o id real do banco (necessário para Editar/Remover e quando o cliente foi reativado)

    // Se o cadastro foi aberto de dentro do agendamento, já deixa o cliente escolhido lá
    if (!modalAgendamento.hidden && campoClienteAgend) {
      campoClienteAgend.value = nome;
      const zap = document.getElementById("agend-whatsapp");
      if (zap) zap.value = formatarTelefone(telefone);
    }
    fecharModalCliente();
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

      // email usado pelo suport trocar futura mente
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

  // --- SERVIÇOS (cadastro do dono: nome, valor fixo e duração) ---
  const formServico = document.getElementById("form-servico");
  const listaServicos = document.getElementById("servicos-lista");
  let servicoEditandoId = null;

  const escaparHtml = t => String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  function renderizarListaServicos() {
    if (!listaServicos) return;
    if (!servicos.length) {
      listaServicos.innerHTML = erroCarregarServicos
        ? `<p style="padding: 12px; color: #e11d48;">${escaparHtml(erroCarregarServicos)}</p>`
        : `<p style="padding: 12px; color: #888;">Nenhum serviço cadastrado.</p>`;
      return;
    }
    const linhas = servicos.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map(s => `
      <tr>
        <td>${escaparHtml(s.nome)}</td>
        <td>${formatarMoeda(Number(s.valor) || 0)}</td>
        <td>${Number(s.duracaoMin) || 0} min</td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="btn-link" data-acao="editar" data-id="${s.id}">Editar</button>
          <button type="button" class="btn-link" style="color:#e11d48; margin-left:8px;" data-acao="remover" data-id="${s.id}">Remover</button>
        </td>
      </tr>`).join("");
    listaServicos.innerHTML = `<table class="tabela-contratos"><thead><tr><th>Serviço</th><th>Valor</th><th>Duração</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`;
  }

  function sairModoEdicaoServico() {
    servicoEditandoId = null;
    const btn = document.getElementById("btn-salvar-servico");
    if (btn) btn.textContent = "Salvar Serviço";
  }

  // Nome do serviço: escolhe na lista (a mesma do cargo do colaborador) ou digita em "Outros"
  const SERV_OUTROS = "__outros__";
  function popularListaNomesServico() {
    const sel = document.getElementById("serv-nome-lista");
    if (!sel) return;
    const outros = sel.querySelector(`option[value="${SERV_OUTROS}"]`);
    SERVICOS_PADRAO.forEach(nome => {
      const opcao = document.createElement("option");
      opcao.value = nome;
      opcao.textContent = nome;
      sel.insertBefore(opcao, outros);
    });
  }
  // Mantém o campo de texto (que o cadastro lê) igual ao que foi escolhido na lista
  function sincronizarNomeServico() {
    const sel = document.getElementById("serv-nome-lista");
    const campo = document.getElementById("serv-nome");
    if (!sel || !campo) return;
    if (sel.value === SERV_OUTROS) { campo.hidden = false; }
    else { campo.hidden = true; campo.value = sel.value; }
  }
  function definirNomeServicoNoForm(nome) {
    const sel = document.getElementById("serv-nome-lista");
    const campo = document.getElementById("serv-nome");
    if (!sel || !campo) return;
    const padrao = SERVICOS_PADRAO.find(n => n.toLowerCase() === String(nome).toLowerCase());
    sel.value = padrao || SERV_OUTROS;
    campo.hidden = !!padrao;
    campo.value = padrao || nome;
  }

  // Duração: lista de tempos de 15 em 15 minutos (até 8 horas)
  function textoDuracao(min) {
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + " min";
    return m ? h + " h " + m + " min" : h + (h === 1 ? " hora" : " horas");
  }
  function popularListaDuracao() {
    const sel = document.getElementById("serv-duracao");
    if (!sel) return;
    for (let min = 15; min <= 480; min += 15) {
      const op = document.createElement("option");
      op.value = String(min);
      op.textContent = textoDuracao(min);
      sel.appendChild(op);
    }
  }
  function definirDuracaoServicoNoForm(min) {
    const sel = document.getElementById("serv-duracao");
    if (!sel) return;
    sel.querySelectorAll("option[data-extra]").forEach(o => o.remove());
    if (!Array.from(sel.options).some(o => o.value === String(min))) { // duração antiga que não está na lista
      const op = document.createElement("option");
      op.value = String(min);
      op.textContent = textoDuracao(Number(min));
      op.dataset.extra = "1";
      sel.appendChild(op);
    }
    sel.value = String(min);
  }

  if (formServico) {
    const campoNomeServ = document.getElementById("serv-nome");
    const selectNomeServ = document.getElementById("serv-nome-lista");
    const campoNomeFoco = () => (campoNomeServ.hidden ? selectNomeServ : campoNomeServ);
    selectNomeServ.addEventListener("change", () => {
      if (selectNomeServ.value === SERV_OUTROS) { campoNomeServ.value = ""; campoNomeServ.hidden = false; campoNomeServ.focus(); }
      else sincronizarNomeServico();
    });
    const campoValorServ = document.getElementById("serv-valor");
    const campoDuracaoServ = document.getElementById("serv-duracao");

    formServico.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (usuarioLogado.perfil !== "DONO") return; // só o dono mexe nos serviços

      const nome = campoNomeServ.value.trim().replace(/\s{2,}/g, " ");
      const valor = Number(String(campoValorServ.value).replace(",", "."));
      const duracao = parseInt(campoDuracaoServ.value, 10);

      if (!nome) { mostrarErroForm(formServico, "Escolha o serviço na lista (ou digite o nome em Outros).", campoNomeFoco()); return; }
      if (campoValorServ.value.trim() === "" || !isFinite(valor) || valor < 0) {
        mostrarErroForm(formServico, "Digite um valor válido para o serviço (ex: 45,00).", campoValorServ);
        return;
      }
      if (!duracao || duracao < 5 || duracao > 600) {
        mostrarErroForm(formServico, "Escolha a duração do serviço na lista.", campoDuracaoServ);
        return;
      }
      if (servicos.some(s => s.id !== servicoEditandoId && s.nome.toLowerCase() === nome.toLowerCase())) {
        mostrarErroForm(formServico, "Já existe um serviço com esse nome.", campoNomeFoco());
        return;
      }
      limparErroForm(formServico);

      const valorFixo = Math.round(valor * 100) / 100;
      if (servicoEditandoId !== null) {
        const existente = servicos.find(s => s.id === servicoEditandoId);
        try {
          // >>> API: PUT /Servicos/{id} (precisa existir no back-end)
          await apiRequest("SERVICOS", { method: "PUT", body: { nome, duracaoMinutos: duracao, preco: valorFixo } }, `/${servicoEditandoId}`);
        } catch (erro) {
          mostrarErroForm(formServico, "Não foi possível alterar o serviço no banco: " + erro.message, campoNomeFoco());
          return;
        }
        if (existente) { existente.nome = nome; existente.valor = valorFixo; existente.duracaoMin = duracao; }
        await recarregarServicosDoBanco(); // o que vale é o que ficou gravado no banco
      } else {
        const novo = { id: Date.now(), nome, valor: valorFixo, duracaoMin: duracao };
        // >>> API: POST /Servicos (tblServicos: DonoId vem do token; Nome, DuracaoMinutos, Preco).
        // Só o cadastro novo vai para o banco; editar/remover ainda não têm endpoint (PUT/DELETE).
        try {
          const criado = await apiRequest("SERVICOS", {
            method: "POST",
            body: { nome, duracaoMinutos: duracao, preco: valorFixo }
          });
          const idCriado = criado ? Number(criado.id ?? criado.Id) : NaN;
          if (Number.isFinite(idCriado)) novo.id = idCriado;
        } catch (erro) {
          console.warn("Não foi possível salvar o serviço na API.", erro.message);
          mostrarErroForm(formServico, "Não foi possível salvar o serviço no banco: " + erro.message, campoNomeFoco());
          return; // não entra na lista se não foi para o banco
        }
        await recarregarServicosDoBanco(); // o id verdadeiro vem do banco
      }

      guardarServicos();
      sairModoEdicaoServico();
      formServico.reset();
      renderizarListaServicos();
      atualizarServicosAgendamento();
    });

    formServico.addEventListener("reset", () => { sairModoEdicaoServico(); limparErroForm(formServico); setTimeout(() => { sincronizarNomeServico(); definirDuracaoServicoNoForm(""); }, 0); });
  }

  if (listaServicos) {
    listaServicos.addEventListener("click", async function (e) {
      const botao = e.target.closest("button[data-acao]");
      if (!botao || usuarioLogado.perfil !== "DONO") return;
      const id = Number(botao.dataset.id);
      const servico = servicos.find(s => s.id === id);
      if (!servico) return;

      if (botao.dataset.acao === "remover") {
        if (!confirm(`Remover o serviço "${servico.nome}"?`)) return;
        try {
          // >>> API: DELETE /Servicos/{id} (precisa existir no back-end)
          await apiRequest("SERVICOS", { method: "DELETE" }, `/${id}`);
        } catch (erro) {
          alert("Não foi possível remover o serviço no banco: " + erro.message);
          return; // continua na lista porque continua no banco
        }
        servicos = servicos.filter(s => s.id !== id);
        guardarServicos();
        if (servicoEditandoId === id) { formServico.reset(); }
        renderizarListaServicos();
        atualizarServicosAgendamento();
        await recarregarServicosDoBanco(); // confirma com o banco
      } else {
        definirNomeServicoNoForm(servico.nome);
        document.getElementById("serv-valor").value = servico.valor;
        definirDuracaoServicoNoForm(servico.duracaoMin);
        servicoEditandoId = id;
        document.getElementById("btn-salvar-servico").textContent = "Salvar alterações";
        document.getElementById("serv-nome-lista").focus();
      }
    });
  }
  popularListaNomesServico();
  popularListaDuracao();
  renderizarListaServicos();


  // =====================================================
  // CLIENTES (cadastro do dono) — mesmo formato dos serviços: formulário + lista com Editar/Remover.
  // O cliente é identificado pelo telefone (único). Cadastrar vai para a API (POST /Clientes);
  // editar e remover ainda não têm endpoint (PUT/DELETE), então valem só neste navegador.
  // =====================================================
  const formClienteAdmin = document.getElementById("form-cliente-admin");
  const listaClientesAdmin = document.getElementById("clientes-lista");
  let clienteEditandoTel = null;

  function renderizarListaClientes() {
    if (!listaClientesAdmin) return;
    if (!clientes.length) {
      listaClientesAdmin.innerHTML = `<p style="padding: 12px; color: #888;">Nenhum cliente cadastrado.</p>`;
      return;
    }
    const linhas = clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map(c => `
      <tr>
        <td>${escaparHtml(c.nome)}</td>
        <td>${escaparHtml(c.telefone ? formatarTelefone(c.telefone) : "—")}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="btn-link" data-acao="editar" data-tel="${escaparHtml(c.telefone)}">Editar</button>
          <button type="button" class="btn-link" style="color:#e11d48; margin-left:8px;" data-acao="remover" data-tel="${escaparHtml(c.telefone)}">Remover</button>
        </td>
      </tr>`).join("");
    listaClientesAdmin.innerHTML = `<table class="tabela-contratos"><thead><tr><th>Cliente</th><th>Telefone</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`;
  }

  function sairModoEdicaoCliente() {
    clienteEditandoTel = null;
    const btn = document.getElementById("btn-salvar-cliente-admin");
    if (btn) btn.textContent = "Salvar Cliente";
  }

  if (formClienteAdmin) {
    const campoNomeAdm = document.getElementById("cliadm-nome");
    const campoTelAdm = document.getElementById("cliadm-telefone");
    const btnSalvarAdm = document.getElementById("btn-salvar-cliente-admin");

    campoNomeAdm.addEventListener("input", () => {
      campoNomeAdm.value = campoNomeAdm.value.replace(/[^\p{L}\s'-]/gu, "").replace(/\s{2,}/g, " ");
    });
    campoTelAdm.addEventListener("input", () => { campoTelAdm.value = formatarTelefone(campoTelAdm.value); });

    formClienteAdmin.addEventListener("submit", async function (e) {
      e.preventDefault();
      const nome = campoNomeAdm.value.trim();
      campoNomeAdm.value = nome;
      const telefone = telefoneValido(campoTelAdm.value);

      if (!nome) { mostrarErroForm(formClienteAdmin, "Preencha o nome do cliente.", campoNomeAdm); return; }
      if (nome.length < AGEND_CLIENTE_MIN || nome.length > AGEND_CLIENTE_MAX) {
        mostrarErroForm(formClienteAdmin, `O nome do cliente deve ter de ${AGEND_CLIENTE_MIN} a ${AGEND_CLIENTE_MAX} caracteres.`, campoNomeAdm);
        return;
      }
      if (!NOME_CLIENTE_REGEX.test(nome)) { mostrarErroForm(formClienteAdmin, mensagemNomeClienteInvalido(nome), campoNomeAdm); return; }
      if (!nomeClienteComIniciaisMaiusculas(nome)) { mostrarErroForm(formClienteAdmin, MSG_NOME_CLIENTE_MAIUSCULA, campoNomeAdm); return; }
      if (!campoTelAdm.value.trim()) { mostrarErroForm(formClienteAdmin, "Preencha o telefone do cliente.", campoTelAdm); return; }
      if (!telefone) { mostrarErroForm(formClienteAdmin, "Digite um telefone válido com DDD. Exemplo: (11) 91234-5678", campoTelAdm); return; }
      if (clientes.some(c => c.telefone === telefone && c.telefone !== clienteEditandoTel)) {
        mostrarErroForm(formClienteAdmin, "Já existe um cliente cadastrado com esse telefone.", campoTelAdm);
        return;
      }
      limparErroForm(formClienteAdmin);

      if (clienteEditandoTel !== null) {
        const existente = clientes.find(c => c.telefone === clienteEditandoTel);
        if (!existente || existente.id === null || existente.id === undefined) {
          mostrarErroForm(formClienteAdmin, "Não foi possível identificar o cliente. Recarregue a página e tente de novo.", null);
          return;
        }
        btnSalvarAdm.disabled = true;
        try {
          // >>> API: PUT /Clientes/{id}. O DonoId vem do token, por isso não é enviado.
          await editarClienteApi(existente.id, nome, telefone);
        } catch (erro) {
          console.warn(erro.message);
          mostrarErroForm(formClienteAdmin, mensagemErroApiComum(erro, "Não foi possível editar o cliente."), null);
          btnSalvarAdm.disabled = false;
          return;
        }
        btnSalvarAdm.disabled = false;
        await carregarClientes(); // recarrega da API o que está no banco (não altera a lista local)
        sairModoEdicaoCliente();
        formClienteAdmin.reset();
        return;
      }

      btnSalvarAdm.disabled = true;
      let criado = null;
      try {
        // >>> API: POST /Clientes. O DonoId vem do token, por isso não é enviado.
        criado = await apiRequest("CLIENTES", { method: "POST", body: { nome, telefone } });
      } catch (erro) {
        console.warn(erro.message);
        mostrarErroForm(formClienteAdmin, mensagemErroApiComum(erro, "Não foi possível cadastrar o cliente."), null);
        btnSalvarAdm.disabled = false;
        return;
      }
      btnSalvarAdm.disabled = false;
      const novo = normalizarCliente(criado && typeof criado === "object" ? criado : null) || { id: null, nome, telefone };
      novo.nome = nome; novo.telefone = telefone;
      clientes.push(novo);
      salvarClientesLocal();
      atualizarListaClientes();
      await carregarClientes(); // pega o id real do banco (necessário para Editar/Remover e quando o cliente foi reativado)
      formClienteAdmin.reset();
    });

    formClienteAdmin.addEventListener("reset", () => { sairModoEdicaoCliente(); limparErroForm(formClienteAdmin); });
  }

  if (listaClientesAdmin) {
    listaClientesAdmin.addEventListener("click", async function (e) {
      const botao = e.target.closest("button[data-acao]");
      if (!botao) return;
      const cliente = clientes.find(c => c.telefone === botao.dataset.tel);
      if (!cliente) return;
      if (botao.dataset.acao === "remover") {
        if (!confirm(`Remover o cliente "${cliente.nome}"?`)) return;
        if (cliente.id === null || cliente.id === undefined) {
          mostrarErroForm(formClienteAdmin, "Não foi possível identificar o cliente. Recarregue a página e tente de novo.", null);
          return;
        }
        try {
          // >>> API: DELETE /Clientes/{id}. No banco o cliente fica inativo (Status = 0).
          await removerClienteApi(cliente.id);
        } catch (erro) {
          console.warn(erro.message);
          mostrarErroForm(formClienteAdmin, mensagemErroApiComum(erro, "Não foi possível remover o cliente."), null);
          return;
        }
        if (clienteEditandoTel === cliente.telefone) formClienteAdmin.reset();
        await carregarClientes(); // recarrega da API: o cliente inativo não vem mais na lista
      } else {
        document.getElementById("cliadm-nome").value = cliente.nome;
        document.getElementById("cliadm-telefone").value = formatarTelefone(cliente.telefone);
        clienteEditandoTel = cliente.telefone;
        document.getElementById("btn-salvar-cliente-admin").textContent = "Salvar alterações";
        document.getElementById("cliadm-nome").focus();
      }
    });
  }
  renderizarListaClientes();

  // --- CARGO / ESPECIALIDADE: lista + opção "Outros" ---
  // Ao escolher "Outros", aparece um campo para digitar o serviço. O texto digitado vira o
  // valor da própria opção, então o resto do sistema continua lendo #colab-cargo normalmente.
  const campoCargo = document.getElementById("colab-cargo");
  const campoOutros = document.getElementById("colab-cargo-outros");
  const opcaoOutros = campoCargo ? campoCargo.querySelector('option[value="__outros__"]') : null;

  // Serviços que o dono cadastrou como "Outros" também entram na lista de cargo do colaborador
  function atualizarCargosColaborador() {
    if (!campoCargo || !opcaoOutros) return;
    campoCargo.querySelectorAll("option[data-servico-cadastrado]").forEach(o => o.remove());
    const base = SERVICOS_PADRAO.map(n => n.toLowerCase());
    servicos.map(s => s.nome)
      .filter(nome => !base.includes(nome.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .forEach(nome => {
        const opcao = document.createElement("option");
        opcao.value = nome;
        opcao.textContent = nome;
        opcao.dataset.servicoCadastrado = "1";
        campoCargo.insertBefore(opcao, opcaoOutros);
      });
  }
  atualizarCargosColaborador();

  function sincronizarCargoOutros() {
    if (!campoCargo || !campoOutros || !opcaoOutros) return;
    const escolheuOutros = campoCargo.selectedOptions[0] === opcaoOutros;
    campoOutros.hidden = !escolheuOutros;
    campoOutros.required = escolheuOutros;
    opcaoOutros.value = campoOutros.value.trim() || "__outros__";
  }
  if (campoCargo && campoOutros && opcaoOutros) {
    campoCargo.addEventListener("change", () => {
      sincronizarCargoOutros();
      if (!campoOutros.hidden) campoOutros.focus();
    });
    campoOutros.addEventListener("input", sincronizarCargoOutros);
    document.getElementById("form-colaborador").addEventListener("reset", () => setTimeout(sincronizarCargoOutros, 0));
  }
  // --- Colaborador: máscara e tamanho de telefone, CPF e data de admissão ---
  const campoColabTel = document.getElementById("colab-telefone");
  const campoColabCpf = document.getElementById("colab-cpf");
  const campoColabAdmissao = document.getElementById("colab-data-admissao");

  // CPF com máscara 000.000.000-00 (no máximo 11 números)
  function formatarCpf(valor) {
    const d = String(valor).replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + "." + d.slice(3);
    if (d.length <= 9) return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
    return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
  }
  // Devolve só os 11 números se o CPF for válido (tamanho + dígitos verificadores), senão ""
  function cpfValido(valor) {
    const d = String(valor).replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return "";
    for (const tam of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < tam; i++) soma += Number(d[i]) * (tam + 1 - i);
      const dv = (soma * 10) % 11 % 10;
      if (dv !== Number(d[tam])) return "";
    }
    return d;
  }
  // Data de admissão: ano com 4 dígitos, de 1950 até hoje
  const ADMISSAO_ANO_MIN = 1950;
  function anoDaData(valor) { return String(valor || "").replace(/^[+-]/, "").split("-")[0]; }
  function admissaoValida(valor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor || "")) return false;
    if (Number(anoDaData(valor)) < ADMISSAO_ANO_MIN) return false;
    return valor <= obterDataHojeISO();
  }

  if (campoColabTel) {
    campoColabTel.maxLength = 15; // (11) 91234-5678
    campoColabTel.inputMode = "numeric";
    campoColabTel.addEventListener("input", () => { campoColabTel.value = formatarTelefone(campoColabTel.value); });
  }
  if (campoColabCpf) {
    campoColabCpf.maxLength = 14; // 000.000.000-00
    campoColabCpf.inputMode = "numeric";
    campoColabCpf.addEventListener("input", () => { campoColabCpf.value = formatarCpf(campoColabCpf.value); });
  }
  if (campoColabAdmissao) {
    campoColabAdmissao.min = ADMISSAO_ANO_MIN + "-01-01";
    campoColabAdmissao.max = obterDataHojeISO();
    // o campo de data deixa digitar ano com 5 ou 6 dígitos: corta para 4
    campoColabAdmissao.addEventListener("input", () => {
      const ano = anoDaData(campoColabAdmissao.value);
      if (ano.length > 4) campoColabAdmissao.value = campoColabAdmissao.value.replace(ano, ano.slice(0, 4));
    });
  }

  function validarCamposColaboradorExtras() {
    if (campoColabTel && !telefoneValido(campoColabTel.value)) {
      return { erro: "Telefone inválido: digite o DDD e o número completo, ex: (11) 91234-5678.", campo: campoColabTel };
    }
    if (campoColabCpf && !cpfValido(campoColabCpf.value)) {
      return { erro: "CPF inválido: digite os 11 números, ex: 123.456.789-09.", campo: campoColabCpf };
    }
    if (campoColabAdmissao && !admissaoValida(campoColabAdmissao.value)) {
      return { erro: "Data de admissão inválida: use o ano com 4 dígitos (de " + ADMISSAO_ANO_MIN + " até hoje).", campo: campoColabAdmissao };
    }
    return null;
  }

  formColab.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (planoVencido) { mostrarErroForm(formColab, MSG_PLANO_VENCIDO, null); return; }

    sincronizarCargoOutros();
    if (campoCargo.value === "__outros__") {
      mostrarErroForm(formColab, "Digite o nome do serviço em \"Outros\".", campoOutros);
      return;
    }
    const validacaoColab = validarNovoColaborador();
    if (validacaoColab.erros.length > 0) {
      mostrarErroForm(formColab, validacaoColab.erros.join("\n"), validacaoColab.campoErro);
      return;
    }
    const extrasColab = validarCamposColaboradorExtras();
    if (extrasColab) {
      mostrarErroForm(formColab, extrasColab.erro, extrasColab.campo);
      return;
    }
    limparErroForm(formColab);

    const limiteColaboradores = { FREE: 15, BASICO: 10, PREMIUM: Infinity };
    const limite = limiteColaboradores[planoAtual];

    if (colaboradores.length >= limite) {
      alert(`O plano ${planoAtual} permite até ${limite} colaboradores.`);
      return;
    }

    const nomeNovo = document.getElementById("colab-nome").value.trim();
    const cargoNovo = document.getElementById("colab-cargo").value;
    const emailNovo = document.getElementById("colab-email").value.trim().toLowerCase();
    const senhaNova = document.getElementById("colab-senha").value;
    const telefoneNovo = telefoneValido(document.getElementById("colab-telefone").value); // só números
    const cpfNovo = cpfValido(document.getElementById("colab-cpf").value); // só números
    const dataAdmissaoNova = document.getElementById("colab-data-admissao").value;
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
    try {
      const criado = await apiRequest("COLABORADORES",
      {
        method: "POST",
        body: { nome: nomeNovo,
                cargo: cargoNovo,
                telefone: telefoneNovo, 
                dataAdmissao: dataAdmissaoNova,
                senha: senhaNova,
                cpf: cpfNovo,
                email: emailNovo,
                cor: document.getElementById("colab-cor").value
              },
    });
      // Se a API devolver o id do colaborador (número), usa o dele em vez do id gerado aqui
      if (criado && Number.isFinite(Number(criado.id))) novoColab.id = Number(criado.id);
    } catch (erro) {
      console.warn(erro.message);
      mostrarErroForm(formColab, mensagemErroApiComum(erro, "Não foi possível cadastrar o colaborador."), null);
      return;
    }

    colaboradores.push(novoColab);
    guardarColaboradores();
    credenciais[emailNovo] = { colaboradorId: novoColab.id }; // só para avisar e-mail repetido; a senha fica só na API
    localStorage.setItem(CHAVE_CREDENCIAIS, JSON.stringify(credenciais));
    atualizarSelectLoginSimulado();
    atualizarOpcoesSeletorColunas();
    atualizarFiltroColaborador();
    renderizarListaColaboradores();
    renderizarAgenda();
    formColab.reset();
  });

  async function removerColaborador(id) {
    if (!confirm("Remover este colaborador? Ele será desativado no banco e sairá da lista.")) return;

    // PATCH /Colaboradores/{id} (a API não tem DELETE, então desativa no banco)
    if (API_CONFIG.token) {
      try {
        await atualizarStatusColaboradorApi(id, false);
      } catch (erro) {
        alert(mensagemErroApiComum(erro, "Não foi possível remover o colaborador no banco."));
        return; // continua na lista porque continua ativo no banco
      }
    }

    const removidos = lerJsonLocal(CHAVE_COLAB_REMOVIDOS, []);
    if (!removidos.includes(id)) removidos.push(id);
    localStorage.setItem(CHAVE_COLAB_REMOVIDOS, JSON.stringify(removidos));

    colaboradores = colaboradores.filter(c => c.id !== id);
    agendamentos = agendamentos.filter(a => a.colaboradorId !== id);
    salvarAgendamentosLocal(agendamentos);
    guardarColaboradores();
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
    guardarColaboradores();

    // API: PATCH /Colaboradores/{id} (melhor esforço: se falhar, a troca vale só neste navegador)
    if (API_CONFIG.token) {
      try {
        await atualizarStatusColaboradorApi(id, colab.ativo);
      } catch (erro) {
        console.warn("Não foi possível atualizar o status do colaborador na API.", erro.message);
      }
    }

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

  // =====================================================
  // BOLETO: se a assinatura foi paga por boleto, o card do plano mostra "Ver boleto".
  // Os dados vêm da assinatura salva (CHAVE_ASSINATURA) pela tela de pagamento.
  // =====================================================
  function semAcento(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); }

  let boletoExibido = null; // boleto que está aberto na janela (usado pelo botão Imprimir)

  function normalizarPlanoBoleto(p) {
    const n = semAcento(p);
    return (n === "PRO" || n === "PROFISSIONAL" || n === "COMPLETO") ? "PREMIUM" : n;
  }

  function lerDadosBoleto() {
    // 1) boleto gravado pela tela de compra (salvarBoleto, em comum.js)
    const salvo = lerBoleto();
    if (salvo && typeof salvo === "object") {
      return {
        plano: normalizarPlanoBoleto(salvo.plano),
        valor: salvo.valor,
        vencimento: salvo.vencimento || "",
        status: salvo.status || "",
        linha: salvo.linhaDigitavel || salvo.codigoBarras || "",
        url: salvo.url || salvo.link || ""
      };
    }
    // 2) compatibilidade: boleto dentro da própria assinatura salva
    const a = lerJsonLocal(CHAVE_ASSINATURA, null);
    if (!a || typeof a !== "object") return null;
    const metodo = String(a.metodo || a.formaPagamento || a.meioPagamento || a.pagamento || "").toLowerCase();
    const b = (a.boleto && typeof a.boleto === "object") ? a.boleto : {};
    if (!metodo.includes("boleto") && !a.boleto) return null;
    return {
      plano: normalizarPlanoBoleto(a.plano),
      valor: b.valor != null ? b.valor : a.valor,
      vencimento: b.vencimento || a.vencimento || "",
      status: b.status || a.status || "",
      linha: b.linhaDigitavel || b.codigoBarras || a.linhaDigitavel || a.codigoBarras || "",
      url: b.url || b.link || a.boletoUrl || a.urlBoleto || a.linkBoleto || ""
    };
  }

  function imprimirBoleto() {
    const d = boletoExibido;
    if (!d) return;
    const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const valorNum = Number(String(d.valor).replace(",", "."));
    const valor = (d.valor !== undefined && d.valor !== "" && !isNaN(valorNum)) ? formatarMoeda(valorNum) : "—";
    let venc = d.vencimento || "—";
    if (/^\d{4}-\d{2}-\d{2}/.test(venc)) venc = dataBR(venc.slice(0, 10));
    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Boleto - Gestão Integrada Pro</title>' +
      '<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;}h1{font-size:20px;margin:0 0 4px;}' +
      'p.sub{margin:0 0 20px;color:#555;font-size:13px;}table{width:100%;border-collapse:collapse;font-size:14px;}' +
      'td{border:1px solid #999;padding:10px 12px;}td.r{width:30%;background:#f3f3f3;font-weight:bold;}' +
      '.linha{margin-top:20px;border:1px solid #999;padding:14px;font-family:monospace;font-size:15px;word-break:break-all;}' +
      '.rodape{margin-top:24px;font-size:12px;color:#555;}</style></head><body>' +
      '<h1>Boleto da assinatura</h1><p class="sub">Gestão Integrada Pro</p>' +
      '<table><tr><td class="r">Plano</td><td>' + esc(nomesPlanos[d.plano] || d.plano) + '</td></tr>' +
      '<tr><td class="r">Valor</td><td>' + esc(valor) + '</td></tr>' +
      '<tr><td class="r">Vencimento</td><td>' + esc(venc) + '</td></tr>' +
      '<tr><td class="r">Status</td><td>' + esc(d.status || "Aguardando pagamento") + '</td></tr></table>' +
      (d.linha ? '<div class="linha"><strong>Linha digitável:</strong><br>' + esc(d.linha) + '</div>' : '') +
      (d.url ? '<p class="rodape">Boleto completo (com código de barras): ' + esc(d.url) + '</p>' : '') +
      '<p class="rodape">Pague até a data de vencimento. Após o pagamento, a liberação do plano pode levar até 3 dias úteis.</p>' +
      '</body></html>';
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed; right:0; bottom:0; width:0; height:0; border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 250);
  }

  function atualizarBoleto() { /* o botão "Ver boleto" fica sempre visível nos planos pagos */ }

  function abrirModalBoleto(planoDoCard) {
    const info = lerDadosBoleto();
    const modal = document.getElementById("modal-boleto");
    if (!modal) return;
    const temBoleto = !!(info && (!planoDoCard || info.plano === semAcento(planoDoCard)));
    const dados = temBoleto ? info : { plano: semAcento(planoDoCard), valor: "", vencimento: "", status: "", linha: "", url: "" };
    const valorNum = Number(String(dados.valor).replace(",", "."));
    document.getElementById("boleto-plano").textContent = nomesPlanos[dados.plano] || planoDoCard || "—";
    document.getElementById("boleto-valor").textContent = (dados.valor !== undefined && dados.valor !== "" && !isNaN(valorNum)) ? formatarMoeda(valorNum) : "—";
    let venc = dados.vencimento || "—";
    if (/^\d{4}-\d{2}-\d{2}/.test(venc)) venc = dataBR(venc.slice(0, 10));
    document.getElementById("boleto-vencimento").textContent = venc;
    document.getElementById("boleto-status").textContent = temBoleto ? (dados.status || "Aguardando pagamento") : "—";

    const codigo = document.getElementById("boleto-codigo");
    const btnCopiar = document.getElementById("btn-copiar-boleto");
    const btnAbrir = document.getElementById("btn-abrir-boleto");
    const aviso = document.getElementById("boleto-aviso");
    codigo.hidden = !dados.linha; codigo.textContent = dados.linha;
    btnCopiar.hidden = !dados.linha;
    const btnImprimir = document.getElementById("btn-imprimir-boleto");
    boletoExibido = temBoleto ? dados : null;
    if (btnImprimir) btnImprimir.hidden = !temBoleto;
    btnAbrir.hidden = !dados.url; if (dados.url) btnAbrir.href = dados.url;
    aviso.hidden = !!(dados.linha || dados.url);
    aviso.textContent = temBoleto
      ? "Não encontramos o código nem o link deste boleto. Gere-o novamente na tela de pagamento ou fale com o suporte."
      : "Nenhum boleto encontrado para este plano. O boleto aparece aqui quando a assinatura é paga por boleto.";
    modal.hidden = false;
  }

  document.querySelectorAll(".btn-ver-boleto").forEach(btn => btn.addEventListener("click", () => abrirModalBoleto(btn.dataset.plano)));
  const modalBoleto = document.getElementById("modal-boleto");
  if (modalBoleto) {
    const fecharBoleto = () => { modalBoleto.hidden = true; };
    document.getElementById("btn-fechar-boleto").addEventListener("click", fecharBoleto);
    modalBoleto.addEventListener("click", (e) => { if (e.target === modalBoleto) fecharBoleto(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalBoleto.hidden) fecharBoleto(); });
    const btnImprimirBoleto = document.getElementById("btn-imprimir-boleto");
    if (btnImprimirBoleto) btnImprimirBoleto.addEventListener("click", imprimirBoleto);
    document.getElementById("btn-copiar-boleto").addEventListener("click", function () {
      const texto = document.getElementById("boleto-codigo").textContent;
      const btn = this;
      (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject())
        .then(() => { btn.textContent = "Copiado!"; setTimeout(() => { btn.textContent = "Copiar código"; }, 1500); })
        .catch(() => alert("Não foi possível copiar. Selecione o código e copie manualmente."));
    });
  }

  // --- BOTÕES DE PLANOS (antes eram onclick="..." dentro do index.html) ---
  const btnAssinaturaVerPlanos = document.getElementById("btn-assinatura-ver-planos");
  if (btnAssinaturaVerPlanos) btnAssinaturaVerPlanos.addEventListener("click", () => irParaTelaPlanos("Assinatura"));
  const btnUpgradeFinanceiro = document.getElementById("btn-upgrade-financeiro");
  if (btnUpgradeFinanceiro) {
    btnUpgradeFinanceiro.addEventListener("click", () => irParaTelaPlanos("Financeiro"));
  }
  [
    ["btn-plano-basico", "BASICO"],
    ["btn-plano-premium", "PREMIUM"]
  ].forEach(([idBotao, plano]) => {
    const botao = document.getElementById(idBotao);
    if (!botao) return;
    botao.addEventListener("click", () => {
      if (plano === planoAtual) return; // já é o plano atual

      // Planos pagos abrem a tela de compra. Quando o pagamento é aprovado, a tela de compra
      // volta para a agenda já com o plano ativo (lido por lerPlanoAssinado).
      window.location.href = `${PAGINA_ASSINATURA}?plano=${plano.toLowerCase()}&origem=painel`;
    });
  });

  // --- CANCELAR ASSINATURA: pede confirmação; confirmando, volta para o plano Grátis ---
  const modalCancelamento = document.getElementById("modal-cancelar-assinatura");
  if (modalCancelamento) {
    const fecharCancelamento = () => { modalCancelamento.hidden = true; };
    let cancelandoPendente = false; // true = cancelando só o boleto que ainda não foi pago (não mexe no plano ativo)
    document.querySelectorAll(".btn-cancelar-assinatura").forEach(btn => {
      btn.addEventListener("click", () => {
        cancelandoPendente = !planoEhAtual(alvoDoCard(btn));
        modalCancelamento.hidden = false;
      });
    });
    // Trocar a forma de pagamento: abre a tela de pagamento só com as formas (não cobra nada agora)
    document.querySelectorAll(".btn-trocar-pagamento").forEach(btn => {
      btn.addEventListener("click", () => {
        window.location.href = `${PAGINA_ASSINATURA}?plano=${alvoDoCard(btn).toLowerCase()}&origem=painel&modo=trocar-pagamento`;
      });
    });
    const btnManter = document.getElementById("manter-plano");
    const btnFecharCanc = document.getElementById("btn-fechar-cancelamento");
    const btnConfirmarCanc = document.getElementById("confirmar-cancelamento");
    if (btnManter) btnManter.addEventListener("click", fecharCancelamento);
    if (btnFecharCanc) btnFecharCanc.addEventListener("click", fecharCancelamento);
    modalCancelamento.addEventListener("click", (e) => { if (e.target === modalCancelamento) fecharCancelamento(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalCancelamento.hidden) fecharCancelamento(); });
    if (btnConfirmarCanc) {
      btnConfirmarCanc.addEventListener("click", async () => {
        if (cancelandoPendente) { // só o boleto pendente: o plano que já está ativo continua como está
          localStorage.removeItem("assinaturaPendente");
          fecharCancelamento();
          atualizarPlano();
          return;
        }
        // API: DELETE /Plano (melhor esforço; precisa ser antes de apagar o token)
        if (API_CONFIG.token) {
          try { await cancelarPlanoApi(); }
          catch (erro) { console.warn("Não foi possível cancelar o plano na API.", erro.message); }
        }
        localStorage.removeItem("assinaturaPendente");
        localStorage.removeItem(CHAVE_ASSINATURA);
        limparBoleto();
        fecharCancelamento();
        // Sem plano: marca a conta, sai e volta para a tela inicial. Para entrar de novo, precisa escolher um plano.
        localStorage.setItem(chaveSemPlano(), "1"); // antes de sair, enquanto o e-mail da conta ainda está guardado
        sairDaConta();
        localStorage.removeItem("apiToken");
        API_CONFIG.token = null;
        window.location.replace(PAGINA_INICIAL);
      });
    }
  }

  // --- SAIR (painel do dono): pergunta "tem certeza?"; confirmando, apaga a sessão e volta para o login ---
  const btnSair = document.getElementById("btn-sair");
  if (btnSair) {
    const modalSair = document.getElementById("modal-sair");

    const sair = () => {
      sairDaConta();
      localStorage.removeItem("apiToken");
      API_CONFIG.token = null;
      // replace: a agenda não fica no histórico, então a seta do navegador não volta para ela
      window.location.replace(PAGINA_LOGIN_DONO);
    };
    const fecharModalSair = () => { if (modalSair) modalSair.hidden = true; };
    const pedirConfirmacaoSair = () => {
      if (!modalSair) { // segurança: se o modal não existir no HTML, usa a caixa padrão do navegador
        if (confirm("Tem certeza que deseja sair?")) sair();
        return;
      }
      modalSair.hidden = false;
      const botaoManter = document.getElementById("manter-login");
      if (botaoManter) botaoManter.focus();
    };

    btnSair.addEventListener("click", pedirConfirmacaoSair);
    btnSair.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pedirConfirmacaoSair(); } });

    if (modalSair) {
      const confirmar = document.getElementById("confirmar-sair");
      const manter = document.getElementById("manter-login");
      const fechar = document.getElementById("btn-fechar-sair");
      if (confirmar) confirmar.addEventListener("click", sair);
      if (manter) manter.addEventListener("click", fecharModalSair);
      if (fechar) fechar.addEventListener("click", fecharModalSair);
      modalSair.addEventListener("click", (e) => { if (e.target === modalSair) fecharModalSair(); }); // clicar fora fecha
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalSair.hidden) fecharModalSair(); });
    }
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

  // =====================================================
  // PLANO VENCIDO (Pix ou boleto não pago até a data)
  // Fica restrito: não cria agendamento nem colaborador até pagar. Agenda, Assinatura, Planos
  // e Suporte continuam abertos. Cartão renova sozinho, então não entra aqui.
  // =====================================================
  function mostrarAvisoPlanoVencido() {
    if (!planoVencido) return;
    const registro = lerJsonLocal(CHAVE_ASSINATURA, null) || {};
    const plano = String(registro.plano || "BASICO").toLowerCase();
    const conteudo = document.querySelector(".conteudo");
    if (!conteudo || document.getElementById("aviso-plano-vencido")) return;
    const aviso = document.createElement("div");
    aviso.id = "aviso-plano-vencido";
    aviso.setAttribute("role", "alert");
    aviso.style.cssText = "display:flex; flex-wrap:wrap; align-items:center; gap:12px; justify-content:space-between; margin:0 0 16px; padding:14px 18px; border:1.5px solid #e11d48; border-radius:12px; background:rgba(225,29,72,.08); font-size:14px;";
    const texto = document.createElement("span");
    texto.innerHTML = "<strong>Seu plano está vencido.</strong> O pagamento não foi feito até a data. Alguns recursos ficam restritos até você pagar.";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "btn-salvar btn-perigo";
    botao.textContent = "Pagar agora";
    botao.addEventListener("click", () => {
      window.location.href = `${PAGINA_ASSINATURA}?plano=${plano}&origem=painel`;
    });
    aviso.append(texto, botao);
    conteudo.insertBefore(aviso, conteudo.firstChild);
  }

  // --- INICIALIZAÇÃO DO DASHBOARD ---
  seletorData.value = obterDataHojeISO();
  mostrarAvisoPlanoVencido();
  atualizarFinanceiro();
  atualizarPlano();
  aplicarPermissoes();
  atualizarSelectLoginSimulado(); // mostra o nome já na abertura, sem esperar a API
  atualizarWhatsApp();
  atualizarBoleto();

  // Confere o token na API: se ela disser que o token não vale (401/403), volta para o login.
  // Se a API estiver fora do ar, não derruba a sessão. (Só o dono usa o token; colaborador entra pelo login local.)
  if (usuarioLogado.perfil === "DONO" && API_CONFIG.token) {
    validarSessaoApi().then(function (ok) {
      if (ok !== false) return;
      sairDaConta();
      localStorage.removeItem("apiToken");
      API_CONFIG.token = null;
      window.location.replace(PAGINA_LOGIN_DONO);
    });
  }

  // Voltou para esta aba (ex.: o colaborador marcou algo em outro aparelho): relê a agenda do banco
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) recarregarAgendamentosDoBanco();
  });

  clientesProntos = carregarClientes();
  carregarDadosIniciais();
  sincronizarPlanoComApi();
}

document.addEventListener("DOMContentLoaded", iniciarDashboard);



/* =====================================================================
   CONTADOR DO TESTE GRATUITO (30 dias)
   Cole em js/comum.js (ou carregue como js/contador-teste.js).
   ===================================================================== */
const DIAS_TESTE = 30;

/* O início do teste é guardado POR CONTA (e-mail): outra conta no mesmo navegador começa com 30 dias novos. */
function chaveInicioTeste() {
  return 'gt_inicio_teste:' + (localStorage.getItem('emailUsuarioLogado') || 'dono').trim().toLowerCase();
}

/* Chame UMA vez, no momento do cadastro da conta (quando o teste começa). */
function iniciarTeste() {
  if (!localStorage.getItem(chaveInicioTeste())) {
    localStorage.setItem(chaveInicioTeste(), new Date().toISOString());
  }
}

/* Plano novo (ex.: voltou para o Grátis): o teste recomeça do dia 1 de 30. */
function reiniciarTeste() {
  localStorage.setItem(chaveInicioTeste(), new Date().toISOString());
  if (typeof atualizarContadorTeste === 'function') atualizarContadorTeste();
}

function meiaNoite(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/* Calcula quantos dias já passaram e quantos faltam. */
function calcularTeste() {
  iniciarTeste(); // garante uma data de início mesmo em contas antigas
  const inicio = new Date(localStorage.getItem(chaveInicioTeste()));
  const MS_DIA = 24 * 60 * 60 * 1000;
  // Math.round evita erro de 1 dia na troca de horário de verão
  const decorridos = Math.round((meiaNoite(new Date()) - meiaNoite(inicio)) / MS_DIA);
  const usados = Math.min(Math.max(decorridos, 0), DIAS_TESTE);
  const restantes = DIAS_TESTE - usados;
  return {
    restantes,
    usados,
    percentual: Math.round((usados / DIAS_TESTE) * 100),
    expirado: restantes === 0,
  };
}

/* Escreve o resultado na tela (card do plano Grátis na aba Assinatura). */
function atualizarContadorTeste() {
  const elDias = document.getElementById('trial-dias');
  const elRotulo = document.getElementById('trial-rotulo');
  const elBarra = document.getElementById('trial-barra');
  if (!elDias) return; // a tela ainda não existe

  const t = calcularTeste();
  elDias.textContent = t.restantes;
  elRotulo.textContent = t.restantes === 1 ? 'dia restante' : 'dias restantes';
  elBarra.style.width = t.percentual + '%';

  // cor da barra: verde → âmbar (7 dias ou menos) → vermelho (acabou)
  elBarra.style.background = t.expirado ? '#d32f2f' : t.restantes <= 7 ? '#ffb020' : '#00c878';

  const aviso = document.getElementById('trial-aviso');
  if (aviso) {
    aviso.hidden = !t.expirado;
    aviso.textContent = 'Seu teste gratuito terminou. Escolha um plano para continuar usando o sistema.';
  }
}

/* Atualiza ao carregar a página e sempre que a aba Assinatura for aberta. */
document.addEventListener('DOMContentLoaded', atualizarContadorTeste);
// No seu código que troca de aba (data-menu="Assinatura"), chame também:
//   atualizarContadorTeste();