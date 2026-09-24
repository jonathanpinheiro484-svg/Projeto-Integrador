// ===================================================================
// DADOS DE EXEMPLO — no projeto real, cada bloco abaixo vira um
// fetch('algo.php') que devolve isso pronto, vindo do banco.
// ===================================================================

const financeiro = {
  receitas: 3150.00,
  despesas: 420.00,
  saldo: 2730.00
};

const pagamentos = { pix: 2400, cartao: 3900 };
const eixoMaximo = 6000;

const colaboradores = [
  { id: 1, nome: "Ana Beatriz Rocha", cargo: "Manicure", cor: "#c6c92c" },
  { id: 2, nome: "Joaquim Augusto", cargo: "Cabeleireiro", cor: "#e91e8c" },
  { id: 3, nome: "Laura Mendes", cargo: "Esteticista", cor: "#26b3c4" },
  { id: 4, nome: "Vitor Almeida", cargo: "Cabeleireiro", cor: "#f4a300" },
  { id: 5, nome: "Marina Lopes", cargo: "Esteticista", cor: "#9b59b6" }
];

let agendamentos = [
  { colaboradorId: 1, cliente: "Liliana Crivero", servico: "Mão/pé", inicio: "08:00", fimMin: 60, cor: "#3d5a80" },
  { colaboradorId: 1, cliente: "Davi de Luccas", servico: "", inicio: "11:00", fimMin: 30, cor: "#e0a458" },
  { colaboradorId: 1, cliente: "Cristina Aguilhera", servico: "Mão/pé", inicio: "13:00", fimMin: 60, cor: "#3d5a80" },
  { colaboradorId: 2, cliente: "Carlos Alcaraz", servico: "Mechas", inicio: "10:00", fimMin: 120, cor: "#8f8f8f" },
  { colaboradorId: 2, cliente: "Danilo", servico: "Cabelo", inicio: "10:30", fimMin: 60, cor: "#3d5a80" },
  { colaboradorId: 2, cliente: "Amanda Jesus Silva", servico: "Corte fem.", inicio: "13:00", fimMin: 60, cor: "#588157" },
  { colaboradorId: 3, cliente: "Patricia", servico: "Corte feminino", inicio: "08:00", fimMin: 60, cor: "#4361ee" },
  { colaboradorId: 3, cliente: "Beatriz", servico: "Escova", inicio: "10:00", fimMin: 90, cor: "#588157" },
  { colaboradorId: 4, cliente: "Rafael Souza", servico: "Barba", inicio: "09:00", fimMin: 30, cor: "#3d5a80" },
  { colaboradorId: 5, cliente: "Juliana Prado", servico: "Limpeza de pele", inicio: "10:00", fimMin: 90, cor: "#8f8f8f" }
];

const contratos = [
  { nome: "#202606100003 Mania Contrato", vencimento: "11/09/2026" },
  { nome: "#202606100005 Mania Contrato", vencimento: "26/09/2026" },
  { nome: "#202606100004 Mania Contrato", vencimento: "09/09/2026" }
];

// ===================================================================
// FINANCEIRO — preenche os 3 cards e o gráfico
// ===================================================================

function formatarMoeda(valor) {
  return "R$ " + valor.toFixed(2).replace(".", ",");
}

document.getElementById("valor-receitas").textContent = formatarMoeda(financeiro.receitas);
document.getElementById("valor-despesas").textContent = formatarMoeda(financeiro.despesas);
document.getElementById("valor-saldo").textContent = formatarMoeda(financeiro.saldo);

document.querySelector(".eixo-max").textContent = eixoMaximo.toLocaleString("pt-BR");
document.querySelector(".eixo-meio").textContent = (eixoMaximo / 2).toLocaleString("pt-BR");

const alturaPix = (pagamentos.pix / eixoMaximo) * 100;
const alturaCartao = (pagamentos.cartao / eixoMaximo) * 100;
document.querySelector('[data-meio="pix"] .barra').style.height = alturaPix + "%";
document.querySelector('[data-meio="pix"] .barra').style.background = "#26b3c4";
document.querySelector('[data-meio="cartao"] .barra').style.height = alturaCartao + "%";

// ===================================================================
// AGENDA — mesmo componente que já construímos
// ===================================================================

const horaInicio = 7;
const horaFim = 15;
const totalHoras = horaFim - horaInicio;

const agenda = document.getElementById("agenda");
agenda.style.setProperty("--n-horas", totalHoras);

const hoje = new Date();
document.getElementById("agenda-data").textContent =
  "Hoje: " + hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });

// ===================================================================
// PAGINAÇÃO — controla quantos colaboradores aparecem por vez
// ===================================================================

let colunasVisiveis = 3;
let paginaAtual = 0;

function obterColaboradoresPagina() {
  const inicio = paginaAtual * colunasVisiveis;
  return colaboradores.slice(inicio, inicio + colunasVisiveis);
}

function obterTotalPaginas() {
  return Math.ceil(colaboradores.length / colunasVisiveis);
}

function atualizarInfoPaginacao() {
  document.getElementById("pag-info").textContent =
    (paginaAtual + 1) + " de " + obterTotalPaginas();
}

// converte "08:30" em minutos (510) pra facilitar comparação de horários
function paraMinutos(hora) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

// recebe os agendamentos de UM colaborador e devolve, pra cada um,
// em qual "coluna" ele deve ficar e quantas colunas existem no total
// (isso é o que evita o card ficar em cima do outro quando o horário bate)
function calcularLayoutColuna(itens) {
  const ordenados = itens.slice().sort(function (a, b) {
    return paraMinutos(a.ag.inicio) - paraMinutos(b.ag.inicio);
  });

  const layout = [];
  let grupoAtual = [];
  let fimGrupo = -1;

  for (let i = 0; i < ordenados.length; i++) {
    const item = ordenados[i];
    const inicioMin = paraMinutos(item.ag.inicio);
    const fimMin = inicioMin + item.ag.fimMin;

    // se esse agendamento começa depois de todos os outros do grupo terminarem,
    // o grupo de sobreposição acabou aqui — fecha e processa
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

// dentro de um grupo que se sobrepõe, distribui cada item numa coluna livre
function processarGrupo(grupo, layoutSaida) {
  const finsColunas = []; // guarda o horário de término de cada coluna usada

  for (let i = 0; i < grupo.length; i++) {
    const item = grupo[i];
    const inicioMin = paraMinutos(item.ag.inicio);
    const fimMin = inicioMin + item.ag.fimMin;

    let colunaEncontrada = -1;
    for (let c = 0; c < finsColunas.length; c++) {
      if (finsColunas[c] <= inicioMin) {
        colunaEncontrada = c; // essa coluna já está livre nesse horário
        break;
      }
    }

    if (colunaEncontrada === -1) {
      colunaEncontrada = finsColunas.length; // precisa de uma coluna nova
      finsColunas.push(fimMin);
    } else {
      finsColunas[colunaEncontrada] = fimMin;
    }

    layoutSaida.push({ ag: item.ag, indiceOriginal: item.indiceOriginal, coluna: colunaEncontrada });
  }

  // todo item desse grupo divide a largura pelo total de colunas que o grupo usou
  const totalColunas = finsColunas.length;
  for (let i = layoutSaida.length - grupo.length; i < layoutSaida.length; i++) {
    layoutSaida[i].totalColunas = totalColunas;
  }
}

// desenha (ou redesenha) a agenda inteira a partir do array `agendamentos`
function renderizarAgenda() {
  agenda.innerHTML = ""; // limpa antes de redesenhar

  const colaboradoresPagina = obterColaboradoresPagina();
  agenda.style.setProperty("--n-colab", colaboradoresPagina.length);
  atualizarInfoPaginacao();

  agenda.insertAdjacentHTML("beforeend", `<div class="cab horario-cab"></div>`);

  for (let i = 0; i < colaboradoresPagina.length; i++) {
    const c = colaboradoresPagina[i];
    agenda.insertAdjacentHTML("beforeend", `
      <div class="cab" style="background:${c.cor}">
        <span class="cab-avatar"></span>${c.nome}<br>
        <small style="opacity:.85">${c.cargo}</small>
      </div>`);
  }

  const colHorarios = document.createElement("div");
  colHorarios.className = "col-horarios";
  for (let h = horaInicio; h < horaFim; h++) {
    colHorarios.insertAdjacentHTML("beforeend", `<div class="hora-label">${String(h).padStart(2, "0")}</div>`);
  }
  agenda.appendChild(colHorarios);

  for (let i = 0; i < colaboradoresPagina.length; i++) {
    const colaborador = colaboradoresPagina[i];
    const col = document.createElement("div");
    col.className = "col-colab";

    for (let h = horaInicio; h < horaFim; h++) {
      col.insertAdjacentHTML("beforeend", `<div class="linha-hora"></div>`);
    }

    // separa só os agendamentos desse colaborador, guardando o índice original
    // (precisamos do índice original pro botão "remover" saber o que tirar do array)
    const agendamentosColaborador = [];
    for (let j = 0; j < agendamentos.length; j++) {
      if (agendamentos[j].colaboradorId === colaborador.id) {
        agendamentosColaborador.push({ ag: agendamentos[j], indiceOriginal: j });
      }
    }

    const layoutColuna = calcularLayoutColuna(agendamentosColaborador);

    for (let k = 0; k < layoutColuna.length; k++) {
      const item = layoutColuna[k];
      const ag = item.ag;

      const [hIni, mIni] = ag.inicio.split(":").map(Number);
      const minutosDesdeInicio = (hIni - horaInicio) * 60 + mIni;
      const topPx = (minutosDesdeInicio / 60) * 48;
      const heightPx = (ag.fimMin / 60) * 48;

      // se não tem sobreposição, totalColunas é 1 e ocupa 100% como antes
      const largura = 100 / item.totalColunas;
      const esquerda = item.coluna * largura;

      const bloco = document.createElement("div");
      bloco.className = "agendamento";
      bloco.style.top = topPx + "px";
      bloco.style.height = heightPx + "px";
      bloco.style.left = "calc(" + esquerda + "% + 2px)";
      bloco.style.width = "calc(" + largura + "% - 4px)";
      bloco.style.background = ag.cor;
      bloco.innerHTML = `
        <button type="button" class="remover" data-index="${item.indiceOriginal}">✕</button>
        <strong>${ag.cliente}</strong><span>${ag.servico}</span>`;
      col.appendChild(bloco);
    }

    agenda.appendChild(col);
  }

  // liga o clique de cada botão "remover" recém-criado
  const botoesRemover = agenda.querySelectorAll(".remover");
  for (let i = 0; i < botoesRemover.length; i++) {
    botoesRemover[i].addEventListener("click", function () {
      const indice = Number(this.dataset.index);
      agendamentos.splice(indice, 1); // remove esse agendamento do array
      renderizarAgenda();             // redesenha tudo
      // no projeto real, aqui também entra um fetch DELETE pro PHP
    });
  }
}

renderizarAgenda();

// select de "Colunas" — muda quantos colaboradores aparecem por vez
document.getElementById("campo-colunas").addEventListener("change", function () {
  colunasVisiveis = Number(this.value);
  paginaAtual = 0; // volta pro início ao mudar a quantidade de colunas
  renderizarAgenda();
});

// setas de paginação — navegam entre os grupos de colaboradores
document.getElementById("btn-pag-anterior").addEventListener("click", function () {
  if (paginaAtual > 0) {
    paginaAtual--;
    renderizarAgenda();
  }
});

document.getElementById("btn-pag-proxima").addEventListener("click", function () {
  if (paginaAtual < obterTotalPaginas() - 1) {
    paginaAtual++;
    renderizarAgenda();
  }
});

// ===================================================================
// FORMULÁRIO — abrir/fechar e adicionar novo agendamento
// ===================================================================

const form = document.getElementById("form-agendamento");
const selectColaborador = document.getElementById("campo-colaborador");

document.getElementById("btn-novo-agendamento").addEventListener("click", function () {
  form.hidden = !form.hidden;
});

document.getElementById("btn-cancelar").addEventListener("click", function () {
  form.reset();
  form.hidden = true;
});

form.addEventListener("submit", function (evento) {
  evento.preventDefault(); // impede o formulário de recarregar a página

  const novoAgendamento = {
    colaboradorId: Number(selectColaborador.value),
    cliente: document.getElementById("campo-cliente").value,
    servico: document.getElementById("campo-servico").value,
    inicio: document.getElementById("campo-inicio").value,
    fimMin: Number(document.getElementById("campo-duracao").value),
    cor: document.getElementById("campo-cor").value // a cor escolhida no seletor
  };

  agendamentos.push(novoAgendamento); // adiciona no array
  renderizarAgenda();                 // redesenha com o novo bloco

  // no projeto real, aqui entra um fetch POST pro PHP salvando no banco

  form.reset();
  form.hidden = true;
});

// ===================================================================
// ADMINISTRATIVO — colaboradores ativos (mesmo array usado na agenda) + contratos
// ===================================================================

function renderizarColaboradoresAtivos() {
  const listaColaboradores = document.getElementById("colaboradores-lista");
  listaColaboradores.innerHTML = ""; // limpa antes de redesenhar

  for (let i = 0; i < colaboradores.length; i++) {
    const c = colaboradores[i];
    listaColaboradores.insertAdjacentHTML("beforeend", `
      <div class="colaborador-item" style="border-left:4px solid ${c.cor}">
        <span class="colaborador-avatar"></span>
        <div class="colaborador-info">
          <strong>${c.nome}</strong>
          <small>${c.cargo}</small><br>
          <span class="status-ativo">Ativo</span>
        </div>
        <button type="button" class="colaborador-remover" data-id="${c.id}">✕</button>
      </div>
    `);
  }

  // liga o clique de cada "x" recém-criado
  const botoesRemoverColab = listaColaboradores.querySelectorAll(".colaborador-remover");
  for (let i = 0; i < botoesRemoverColab.length; i++) {
    botoesRemoverColab[i].addEventListener("click", function () {
      const id = Number(this.dataset.id);
      removerColaborador(id);
    });
  }
}

function removerColaborador(id) {
  // acha e remove o colaborador do array
  for (let i = 0; i < colaboradores.length; i++) {
    if (colaboradores[i].id === id) {
      colaboradores.splice(i, 1);
      break;
    }
  }

  // remove também os agendamentos que eram desse colaborador
  agendamentos = agendamentos.filter(function (ag) {
    return ag.colaboradorId !== id;
  });

  // se a página atual da agenda ficou "vazia" depois da remoção, volta uma página
  const totalPaginas = Math.max(1, obterTotalPaginas());
  if (paginaAtual >= totalPaginas) paginaAtual = totalPaginas - 1;

  renderizarColaboradoresAtivos();
  atualizarSelectColaborador();
  renderizarAgenda();
  // no projeto real, aqui também entra um fetch DELETE pro PHP
}

function atualizarSelectColaborador() {
  const selectColaborador = document.getElementById("campo-colaborador");
  selectColaborador.innerHTML = "";
  for (let i = 0; i < colaboradores.length; i++) {
    const c = colaboradores[i];
    selectColaborador.insertAdjacentHTML("beforeend", `<option value="${c.id}">${c.nome}</option>`);
  }
}

function gerarNovoId(lista) {
  let maior = 0;
  for (let i = 0; i < lista.length; i++) {
    if (lista[i].id > maior) maior = lista[i].id;
  }
  return maior + 1;
}

renderizarColaboradoresAtivos();
atualizarSelectColaborador();

// formulário de novo colaborador
const formColaborador = document.getElementById("form-colaborador");

document.getElementById("btn-novo-colaborador").addEventListener("click", function () {
  formColaborador.hidden = !formColaborador.hidden;
});

document.getElementById("btn-colab-cancelar").addEventListener("click", function () {
  formColaborador.reset();
  formColaborador.hidden = true;
});

formColaborador.addEventListener("submit", function (evento) {
  evento.preventDefault();

  const novoColaborador = {
    id: gerarNovoId(colaboradores),
    nome: document.getElementById("campo-colab-nome").value,
    cargo: document.getElementById("campo-colab-cargo").value,
    cor: document.getElementById("campo-colab-cor").value
  };

  colaboradores.push(novoColaborador);

  renderizarColaboradoresAtivos();
  atualizarSelectColaborador();
  renderizarAgenda();
  // no projeto real, aqui entra um fetch POST pro PHP salvando no banco

  formColaborador.reset();
  formColaborador.hidden = true;
});

const listaContratos = document.getElementById("contratos-lista");
for (let i = 0; i < contratos.length; i++) {
  const ct = contratos[i];
  listaContratos.insertAdjacentHTML("beforeend",
    `<tr><td>${ct.nome}</td><td>${ct.vencimento}</td></tr>`);
}
