// =====================================================
// GERADOR DE QR CODE (sem bibliotecas externas, funciona offline)
// Usado em: assinatura.html (QR do Pix)
//
// Uso:
//   QRPix.svg("texto do pix", 180)  -> devolve o <svg> pronto (string)
//
// Detalhes: modo byte (UTF-8), correção de erro nível M, versões 1 a 15
// (até ~330 caracteres, suficiente para um Pix copia e cola).
// Se o texto for grande demais, devolve "" (o código copia e cola continua valendo).
// =====================================================
(function () {
  // [total de bytes, bytes de correção por bloco, nº de blocos] — nível M
  const VERSOES = {
    1: [26, 10, 1], 2: [44, 16, 1], 3: [70, 26, 1], 4: [100, 18, 2], 5: [134, 24, 2],
    6: [172, 16, 4], 7: [196, 18, 4], 8: [242, 22, 4], 9: [292, 22, 5], 10: [346, 26, 5],
    11: [404, 30, 5], 12: [466, 22, 8], 13: [532, 22, 9], 14: [581, 24, 9], 15: [655, 24, 10],
  };
  const ALINHAMENTO = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42],
    9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70],
  };
  const MAX_VERSAO = 15;

  // ---------- Matemática de Reed-Solomon (campo de Galois 256) ----------
  const EXP = new Array(512), LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function geradorRS(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const novo = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { novo[j] ^= g[j]; novo[j + 1] ^= mul(g[j], EXP[i]); }
      g = novo;
    }
    return g;
  }
  function correcaoRS(dados, n) {
    const g = geradorRS(n);
    const r = new Array(n).fill(0);
    for (const d of dados) {
      const f = d ^ r.shift();
      r.push(0);
      for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f);
    }
    return r;
  }

  // ---------- Dados ----------
  function estruturaBlocos(versao) {
    const [total, ec, blocos] = VERSOES[versao];
    const dados = total - blocos * ec;
    const menores = blocos - (dados % blocos);
    const tamanho = Math.floor(dados / blocos);
    return { total, ec, blocos, dados, menores, tamanho };
  }

  function montarCodewords(bytes, versao) {
    const est = estruturaBlocos(versao);
    const bits = [];
    const add = (valor, qtd) => { for (let i = qtd - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
    add(4, 4);                                  // modo byte
    add(bytes.length, versao < 10 ? 8 : 16);    // quantidade de caracteres
    bytes.forEach((b) => add(b, 8));
    const capacidade = est.dados * 8;
    for (let i = 0; i < 4 && bits.length < capacidade; i++) bits.push(0); // terminador
    while (bits.length % 8) bits.push(0);
    const cw = [];
    for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let p = 0; cw.length < est.dados; p++) cw.push(p % 2 ? 0x11 : 0xec); // preenchimento

    // divide em blocos, calcula a correção e intercala
    const blocosDados = [], blocosEc = [];
    let pos = 0;
    for (let b = 0; b < est.blocos; b++) {
      const tam = est.tamanho + (b >= est.menores ? 1 : 0);
      const parte = cw.slice(pos, pos + tam);
      pos += tam;
      blocosDados.push(parte);
      blocosEc.push(correcaoRS(parte, est.ec));
    }
    const saida = [];
    const maior = est.tamanho + 1;
    for (let i = 0; i < maior; i++) blocosDados.forEach((b) => { if (i < b.length) saida.push(b[i]); });
    for (let i = 0; i < est.ec; i++) blocosEc.forEach((b) => saida.push(b[i]));
    return saida;
  }

  // ---------- Matriz ----------
  function criarMatriz(versao, codewords) {
    const n = 17 + 4 * versao;
    const m = Array.from({ length: n }, () => new Array(n).fill(false));
    const fixo = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, v) => { m[y][x] = v; fixo[y][x] = true; };

    // padrões de localização (cantos) + separadores
    [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([left, top]) => {
      for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
        const x = left + dx, y = top + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const dentro = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const escuro = dentro && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        set(x, y, escuro);
      }
    });
    // linhas de sincronismo
    for (let i = 8; i < n - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
    // alinhamento
    const pos = ALINHAMENTO[versao];
    pos.forEach((cy, i) => pos.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    // reserva as áreas de formato e de versão (preenchidas depois)
    for (let i = 0; i < 9; i++) { fixo[8][i] = true; fixo[i][8] = true; }
    for (let i = 0; i < 8; i++) { fixo[8][n - 1 - i] = true; fixo[n - 1 - i][8] = true; }
    if (versao >= 7) {
      let resto = versao;
      for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
      const bits = (versao << 12) | resto;
      for (let i = 0; i < 18; i++) {
        const cor = ((bits >>> i) & 1) === 1;
        const a = n - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, cor); set(b, a, cor);
      }
    }
    // módulo escuro fixo
    set(8, n - 8, true);

    // dados em zigue-zague
    let k = 0;
    const total = codewords.length * 8;
    for (let direita = n - 1; direita >= 1; direita -= 2) {
      if (direita === 6) direita = 5;
      for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
        const x = direita - j;
        const sobe = ((direita + 1) & 2) === 0;
        const y = sobe ? n - 1 - v : v;
        if (!fixo[y][x] && k < total) { m[y][x] = ((codewords[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
      }
    }
    return { m, fixo, n };
  }

  const MASCARAS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  function gravarFormato(m, n, mascara) {
    const dados = (0 << 3) | mascara; // nível M = 00
    let resto = dados;
    for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
    const bits = ((dados << 10) | resto) ^ 0x5412;
    const b = (i) => ((bits >>> i) & 1) === 1;
    const set = (x, y, v) => { m[y][x] = v; };
    for (let i = 0; i <= 5; i++) set(8, i, b(i));
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, b(i));
    set(8, n - 8, true);
  }

  function penalidade(m, n) {
    let p = 0;
    // regra 1: sequências de 5+ módulos iguais (linhas e colunas)
    for (let t = 0; t < 2; t++) for (let a = 0; a < n; a++) {
      let cor = null, seq = 0;
      for (let b = 0; b < n; b++) {
        const v = t === 0 ? m[a][b] : m[b][a];
        if (v === cor) { seq++; if (seq === 5) p += 3; else if (seq > 5) p++; } else { cor = v; seq = 1; }
      }
    }
    // regra 2: blocos 2x2 da mesma cor
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
      if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    // regra 3: padrão parecido com o marcador de canto
    const padrao = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], inverso = padrao.slice().reverse();
    for (let t = 0; t < 2; t++) for (let a = 0; a < n; a++) for (let b = 0; b <= n - 11; b++) {
      let igual = true, igualInv = true;
      for (let i = 0; i < 11; i++) {
        const v = (t === 0 ? m[a][b + i] : m[b + i][a]) ? 1 : 0;
        if (v !== padrao[i]) igual = false;
        if (v !== inverso[i]) igualInv = false;
        if (!igual && !igualInv) break;
      }
      if (igual) p += 40;
      if (igualInv) p += 40;
    }
    // regra 4: proporção de módulos escuros
    let escuros = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) escuros++;
    p += Math.floor(Math.abs(escuros * 100 / (n * n) - 50) / 5) * 10;
    return p;
  }

  // Devolve a matriz de módulos (true = escuro) ou null se o texto não couber
  function gerarMatriz(texto) {
    const bytes = Array.from(new TextEncoder().encode(String(texto)));
    let versao = 0;
    for (let v = 1; v <= MAX_VERSAO; v++) {
      const bitsCont = v < 10 ? 8 : 16;
      if (4 + bitsCont + bytes.length * 8 <= estruturaBlocos(v).dados * 8) { versao = v; break; }
    }
    if (!versao) return null;
    const { m, fixo, n } = criarMatriz(versao, montarCodewords(bytes, versao));

    let melhor = null, melhorNota = Infinity;
    for (let mascara = 0; mascara < 8; mascara++) {
      const copia = m.map((l) => l.slice());
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!fixo[y][x] && MASCARAS[mascara](x, y)) copia[y][x] = !copia[y][x];
      }
      gravarFormato(copia, n, mascara);
      const nota = penalidade(copia, n);
      if (nota < melhorNota) { melhorNota = nota; melhor = copia; }
    }
    return melhor;
  }

  // Desenha o QR como SVG (fundo branco + borda de 4 módulos, como manda o padrão)
  function svg(texto, tamanho) {
    const m = gerarMatriz(texto);
    if (!m) return "";
    const n = m.length, borda = 4, total = n + borda * 2;
    let caminho = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (m[y][x]) caminho += "M" + (x + borda) + "," + (y + borda) + "h1v1h-1z";
    }
    const px = tamanho || 180;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + " " + total + '" width="' + px + '" height="' + px +
      '" shape-rendering="crispEdges" role="img" aria-label="QR Code do Pix"><rect width="' + total + '" height="' + total +
      '" fill="#ffffff"/><path d="' + caminho + '" fill="#000000"/></svg>';
  }

  window.QRPix = { svg, matriz: gerarMatriz };
})();

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
  const DESCONTO_ANUAL = 0;                // sem desconto: o anual é 12x o mensal (Básico R$ 960 / Premium R$ 1.800 à vista, como na tela de Planos)
  const CHAVE_ASSINATURA = "assinaturaAtual";
  const CHAVE_SESSAO = "sessaoUsuario";    // a mesma usada pelo js/comum.js e pelo login/cadastro
  const CHAVE_CARTOES = "cartoesSalvos";   // cartões da pessoa (só dados de exibição, nunca número completo/CVV)
  const CHAVE_ASSINATURA_PENDENTE = "assinaturaPendente"; // boleto gerado e ainda não pago (a agenda ignora esta chave)
  const BOLETO_PRAZO_DIAS = 3;             // dias entre gerar o boleto e o vencimento
  // false = o plano só libera depois do pagamento do boleto (o certo). true = libera na hora, só para demonstração.
  const BOLETO_LIBERA_NA_HORA = false;
  const BOLETO_BANCO = "999";              // código de banco fictício (o boleto é uma simulação)
  const PIX_VALIDADE_MS = 110 * 1000;      // tempo para pagar o Pix (1 min e 50 s). Passou disso: erro e a pessoa tenta de novo. Mude aqui se quiser outro tempo.
  const ENDPOINT_PIX_STATUS = "";          // >>> API: rota do backend que diz se o Pix foi pago (GET ?codigo=...  ->  { "pago": true }). Vazia = nunca confirma sozinho.
  const ENDPOINT_NOTA = "api/notas-fiscais.php"; // >>> API: backend que emite a nota fiscal e envia por e-mail
  // MODO TESTE: true = simula a nota na tela (sem backend, sem e-mail, sem pagamento real).
  // Troque para false quando o backend estiver pronto.
  const MODO_TESTE = true;
  // Envio de e-mail no modo teste, sem backend, pelo EmailJS (emailjs.com). Deixe vazio para só simular.
  // Só para teste: a chave pública fica visível no navegador. Em produção o envio é pelo backend PHP.
  const EMAILJS = { servico: "service_hyuknnn", modelo: "template_25gznvb", chavePublica: "ujHV-oJdL3QrtE_-X" };

  // >>> PREÇOS: Básico (R$ 80/mês) e Premium (R$ 150/mês) seguem os valores da tela de Planos da agenda.
  // Profissional e Completo continuam com os valores do planos.html.
  const PLANOS = {
    FREE: {
      nome: "Grátis", mensal: 0, duracaoDias: 30,
      itens: ["30 dias de uso", "Até 15 colaboradores", "Agenda simples"]
    },
    BASICO: {
      nome: "Básico", mensal: 80,
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
      nome: "Premium", mensal: 150, destaque: "Mais completo",
      itens: ["Colaboradores ilimitados", "Relatórios financeiros", "Suporte prioritário"]
    }
  };

  // =====================================================
  // ESTADO
  // =====================================================
  let planoEscolhido = "PREMIUM";
  let ciclo = "mensal";
  let cadastro = { nome: "", email: "", cpf: "" }; // dados do cadastro (vêm da sessão, não podem ser trocados aqui)
  let cartoes = [];        // cartões salvos: { id, bandeira, final, nome, validade }
  let cartaoSelId = null;  // cartão escolhido para pagar
  let notaTesteHtml = "";  // nota simulada (só no modo teste)
  let boletoAtual = null;  // boleto gerado nesta tela (ao apertar Assinar): { linha, codigo, vencimento, valor }
  let modoTrocar = false;  // true = só trocar a forma de pagamento de uma assinatura que já existe (assinatura.html?modo=trocar-pagamento)
  let modoRenovar = false; // true = renovar o plano pagando pelo Pix (assinatura.html?modo=renovar-pix)
  let renovarBase = null;  // fim do período atual: a renovação soma a partir dele (se ainda não venceu)

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

  function dataRenovacao(chave, cicloEscolhido, base) {
    const d = (base && base > new Date()) ? new Date(base) : new Date();
    if (chave === "FREE") d.setDate(d.getDate() + PLANOS.FREE.duracaoDias);
    else if (cicloEscolhido === "anual") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }

  // Data da próxima cobrança escolhida pela pessoa (sem escolha válida = 1 mês depois, o padrão).
  // Só vale na compra normal; renovar pelo Pix e trocar a forma de pagamento usam a data padrão.
  function proximaData() {
    const padrao = dataRenovacao(planoEscolhido, ciclo, renovarBase);
    const campo = $("ass-prox-cobranca");
    if (!campo || !campo.value || modoTrocar || modoRenovar || planoEscolhido === "FREE") return padrao;
    if (campo.value < campo.min || campo.value > campo.max) return padrao;
    const [a, m, d] = campo.value.split("-").map(Number);
    return new Date(a, m - 1, d, 12, 0, 0);
  }

  // =====================================================
  // RENDERIZAÇÃO
  // =====================================================
  function atualizarResumo() {
    const p = PLANOS[planoEscolhido];
    const gratis = planoEscolhido === "FREE";
    const preco = calcularPreco(planoEscolhido, ciclo);
    const subtotal = gratis ? 0 : p.mensal * (ciclo === "anual" ? 12 : 1);

    $("titulo-pagina").textContent = modoTrocar ? "Trocar forma de pagamento" : (modoRenovar ? "Renovar plano " + p.nome : "Assinar plano " + p.nome);
    $("res-plano").textContent = p.nome;
    // Cobrança sempre mensal. No cartão ela é automática durante o período de 1 ano (contrato de 12 meses);
    // no Pix e no boleto a pessoa paga cada mensalidade pelo site.
    const metodoResumo = modoRenovar ? "pix" : metodoAtual();
    $("res-ciclo").textContent = gratis ? "30 dias grátis" : (metodoResumo === "cartao" ? "Mensal automático (contrato de 12 meses)" : "Mensal (você paga pelo site)");
    $("res-subtotal").textContent = moeda(subtotal);
    $("linha-desconto").hidden = !(preco.desconto > 0);
    $("res-desconto").textContent = "- " + moeda(preco.desconto);
    $("res-renovacao").textContent = gratis ? "Nenhuma" : proximaData().toLocaleDateString("pt-BR");
    // Data da compra (hoje), uma linha acima da próxima cobrança
    if (!$("res-renovacao-compra")) {
      const linhaRenov = $("res-renovacao").parentElement;
      const linhaCompra = linhaRenov.cloneNode(true);
      linhaCompra.setAttribute("data-linha-compra", "");
      if (linhaCompra.id) linhaCompra.id += "-compra";
      linhaCompra.querySelectorAll("[id]").forEach((el) => { el.id += "-compra"; });
      const valorClone = linhaCompra.querySelector("#res-renovacao-compra");
      const rotuloClone = Array.from(linhaCompra.children).find((el) => !el.contains(valorClone));
      if (rotuloClone) rotuloClone.textContent = "Data da compra";
      linhaRenov.parentElement.insertBefore(linhaCompra, linhaRenov);
    }
    $("res-renovacao-compra").textContent = new Date().toLocaleDateString("pt-BR");
    document.querySelector("[data-linha-compra]").hidden = modoTrocar; // trocar a forma de pagamento não é uma compra nova
    $("res-total").textContent = moeda(preco.total);

    $("btn-assinar").textContent = gratis ? "Ativar plano grátis" : "Assinar " + p.nome + " · " + moeda(preco.total);
    $("aviso-cobranca").textContent = gratis
      ? "Sem cobrança. Ao fim dos 30 dias, escolha um plano pago para continuar."
      : (metodoResumo === "cartao"
        ? "Cobrança mensal automática no cartão durante o contrato de 12 meses. Você pode cancelar quando quiser."
        : "Pagamento mensal feito por você no site. Se não pagar até a data, o plano fica vencido e algumas funções ficam restritas.");

    // Renovar pelo Pix: mesmo plano e ciclo da assinatura, só com a forma de pagamento Pix
    if (modoRenovar) {
      $("sub-pagina").textContent = "Pague com Pix para renovar o seu plano " + p.nome + ".";
      $("btn-assinar").textContent = "Renovar " + p.nome + " · " + moeda(preco.total);
    }

    // Trocar forma de pagamento: não cobra nada agora, só muda como as próximas cobranças serão feitas
    if (modoTrocar) {
      $("sub-pagina").textContent = "Escolha como prefere pagar as próximas cobranças do plano " + p.nome + ".";
      $("btn-assinar").textContent = "Salvar forma de pagamento";
      $("aviso-cobranca").textContent = "Nenhuma cobrança agora. A nova forma vale a partir da próxima cobrança.";
      $("rotulo-total").textContent = "Cobrado agora";
      $("res-total").textContent = moeda(0);
      $("txt-pix").textContent = "A partir da próxima cobrança, o código Pix será gerado para você pagar no app do seu banco.";
      $("txt-boleto").textContent = "A partir da próxima cobrança, o boleto será gerado com os seus dados (pagamento confirmado em 1 a 3 dias úteis).";
    }

    // Plano grátis não precisa de pagamento
    $("bloco-pagamento").hidden = gratis;
  }

  // =====================================================
  // CADASTRO (dados fixos) E CARTÕES SALVOS
  // =====================================================
  // E-mail e CPF vêm do cadastro e ficam travados: a nota fiscal vai para esse e-mail/CPF.
  function carregarCadastro(sessao) {
    const u = sessao.usuario || sessao;
    cadastro.nome = String(u.nome || "").trim();
    cadastro.email = String(u.email || localStorage.getItem("emailUsuarioLogado") || "").trim();
    cadastro.cpf = soDigitos(String(u.cpf || ""));
    if (cadastro.nome) $("ass-nome").value = cadastro.nome;
    // O e-mail NÃO vem preenchido: a pessoa precisa digitar o e-mail do cadastro (conferido na validação)
    if (cadastro.cpf) { $("ass-cpf").value = mascaraCpf(cadastro.cpf); $("ass-cpf").readOnly = true; }
    carregarCartoes();
  }

  const chaveCartoes = () => CHAVE_CARTOES + ":" + (cadastro.email || "anonimo").toLowerCase();

  function carregarCartoes() {
    try { cartoes = JSON.parse(localStorage.getItem(chaveCartoes())) || []; } catch (e) { cartoes = []; }
    if (!Array.isArray(cartoes)) cartoes = [];
    cartaoSelId = cartoes.length ? cartoes[0].id : null;
    renderCartoes();
  }
  function salvarCartoes() {
    try { localStorage.setItem(chaveCartoes(), JSON.stringify(cartoes)); } catch (e) { /* sem armazenamento: vale só nesta visita */ }
  }
  const cartaoSelecionado = () => cartoes.find((c) => c.id === cartaoSelId) || null;

  function bandeiraDoCartao(numero) {
    const n = soDigitos(numero);
    if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) return "Elo";
    if (/^(606282|3841)/.test(n)) return "Hipercard";
    if (/^4/.test(n)) return "Visa";
    if (/^(5[1-5]|2(2[2-9][1-9]|[3-6]\d\d|7[01]\d|720))/.test(n)) return "Mastercard";
    if (/^3[47]/.test(n)) return "Amex";
    return "Cartão";
  }

  function renderCartoes() {
    const lista = $("lista-cartoes");
    lista.textContent = "";
    $("cartao-vazio").hidden = cartoes.length > 0 || !$("form-novo-cartao").hidden;
    cartoes.forEach((c) => {
      const rotulo = document.createElement("label");
      rotulo.className = "cartao-item" + (c.id === cartaoSelId ? " sel" : "");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "cartao-salvo";
      radio.checked = c.id === cartaoSelId;
      radio.addEventListener("change", () => { cartaoSelId = c.id; renderCartoes(); });
      const info = document.createElement("span");
      info.className = "cartao-info";
      info.textContent = c.bandeira + " •••• " + c.final;
      const detalhe = document.createElement("small");
      detalhe.textContent = (c.nome ? c.nome + " · " : "") + "Validade " + c.validade; // o nome no cartão é opcional
      info.appendChild(detalhe);
      const remover = document.createElement("button");
      remover.type = "button";
      remover.className = "btn-sec";
      remover.textContent = "Remover";
      remover.addEventListener("click", () => removerCartao(c.id));
      rotulo.append(radio, info, remover);
      lista.appendChild(rotulo);
    });
  }

  function removerCartao(id) {
    cartoes = cartoes.filter((c) => c.id !== id);
    if (cartaoSelId === id) cartaoSelId = cartoes.length ? cartoes[0].id : null;
    salvarCartoes();
    renderCartoes();
  }

  function abrirFormCartao(abrir) {
    $("form-novo-cartao").hidden = !abrir;
    $("erro-cartao").hidden = true;
    if (abrir) $("cc-numero").focus();
    else ["cc-numero", "cc-nome", "cc-validade", "cc-cvv"].forEach((id) => { $(id).value = ""; });
    renderCartoes();
  }

  function salvarNovoCartao() {
    const erros = validarNovoCartao();
    const erroEl = $("erro-cartao");
    if (erros.erros.length > 0) {
      erroEl.textContent = erros.erros.join("\n");
      erroEl.hidden = false;
      if (erros.primeiro) erros.primeiro.focus();
      return;
    }
    const numero = $("cc-numero").value;
    const final = soDigitos(numero).slice(-4);
    const bandeira = bandeiraDoCartao(numero);
    const validade = $("cc-validade").value;
    if (cartoes.some((c) => c.final === final && c.validade === validade && c.bandeira === bandeira)) {
      erroEl.textContent = "Este cartão já foi adicionado.";
      erroEl.hidden = false;
      return;
    }
    // >>> API: aqui o gateway tokeniza o cartão (número + validade + CVV) e devolve só um token; guarde só o token no backend.
    // O CVV é pedido aqui, no cadastro do cartão, e NUNCA é guardado (nem no front, nem no banco). No front fica apenas o que aparece na lista.
    const cartao = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      bandeira, final, validade,
      nome: $("cc-nome").value.trim().toUpperCase()
    };
    cartoes.push(cartao);
    cartaoSelId = cartao.id;
    salvarCartoes();
    abrirFormCartao(false);
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

  // Rejeita números "preguiçosos": todos iguais (1111...), blocos repetidos (4242 4242 4242 4242,
  // 1234 1234 1234 1234) e sequências crescentes/decrescentes (1234 5678 9012 3456)
  function cartaoSequencial(numero) {
    const n = soDigitos(numero);
    if (n.length !== 16) return false;
    for (const tam of [1, 2, 4, 8]) {
      if (n === n.slice(0, tam).repeat(16 / tam)) return true;
    }
    const passos = [...n].slice(1).map((d, i) => (Number(d) - Number(n[i]) + 10) % 10);
    return passos.every((p) => p === 1) || passos.every((p) => p === 9);
  }

  // Validade do cartão novo: não pode estar vencida e não pode passar de 5 anos a partir de hoje
  function validadeDentroDeCincoAnos(v) {
    const m = v.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return false;
    const limite = new Date();
    limite.setFullYear(limite.getFullYear() + 5);
    return new Date(2000 + Number(m[2]), Number(m[1]) - 1, 1) <= limite;
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

  function validarFormulario(opcoes = {}) {
    const erros = [];
    let primeiro = null;
    const falhar = (msg, id) => { erros.push(msg); if (!primeiro) primeiro = $(id); };

    const nome = $("ass-nome").value.trim();
    $("ass-nome").value = nome;
    if (!nome) falhar("Preencha o nome completo.", "ass-nome");
    else if (nome.length < 5 || nome.length > 60) falhar("O nome deve ter de 5 a 60 caracteres.", "ass-nome");
    else if (/[^\p{L}\s]/u.test(nome)) falhar("O nome deve ter apenas letras (sem números, símbolos ou pontuação).", "ass-nome");
    else if (!NOME_REGEX.test(nome)) falhar("Digite o nome completo, sem abreviar: nome e sobrenome. Exemplo: Fernanda Lima", "ass-nome");

    const email = $("ass-email").value.trim();
    if (!email) falhar("Digite o e-mail do seu cadastro.", "ass-email");
    else if (!EMAIL_REGEX.test(email)) falhar("Digite um e-mail válido.", "ass-email");
    else if (cadastro.email && email.toLowerCase() !== cadastro.email.toLowerCase()) falhar("O e-mail precisa ser o mesmo do seu cadastro.", "ass-email");


    if (!$("ass-cpf").value.trim()) falhar("Preencha o CPF.", "ass-cpf");
    else if (soDigitos($("ass-cpf").value).length !== 11) falhar("O CPF deve ter 11 números.", "ass-cpf");
    else if (!cpfValido($("ass-cpf").value)) falhar("O CPF informado não é válido.", "ass-cpf");
    else if (cadastro.cpf && soDigitos($("ass-cpf").value) !== cadastro.cpf) falhar("O CPF precisa ser o mesmo do seu cadastro.", "ass-cpf");

    const campoProx = $("ass-prox-cobranca");
    if (campoProx && !modoTrocar && !modoRenovar && planoEscolhido !== "FREE" &&
        (!campoProx.value || campoProx.value < campoProx.min || campoProx.value > campoProx.max)) {
      falhar("Escolha uma data de próxima cobrança entre amanhã e daqui a 1 mês.", "ass-prox-cobranca");
    }

    if (planoEscolhido !== "FREE" && metodoAtual() === "cartao") {
      const cartao = cartaoSelecionado();
      if (!cartao) falhar("Adicione um cartão ou escolha um dos seus cartões para pagar.", "btn-novo-cartao");
      else if (!validadeValida(cartao.validade)) falhar("O cartão selecionado está vencido. Escolha outro ou adicione um novo.", "btn-novo-cartao");
    }
    return { erros, primeiro };
  }

  // Valida os campos do formulário "Adicionar cartão"
  function validarNovoCartao() {
    const erros = [];
    let primeiro = null;
    const falhar = (msg, id) => { erros.push(msg); if (!primeiro) primeiro = $(id); };

    const numeroCartao = $("cc-numero").value.trim();
    if (!numeroCartao) falhar("Preencha o número do cartão.", "cc-numero");
    else if (/[^\d\s]/.test(numeroCartao)) falhar("O número do cartão deve ter apenas números.", "cc-numero");
    else if (soDigitos(numeroCartao).length !== 16) falhar("O número do cartão deve ter exatamente 16 números.", "cc-numero");
    else if (cartaoSequencial(numeroCartao)) falhar("Número de cartão inválido: não pode ter sequência ou números repetidos.", "cc-numero");
    else if (!cartaoValido(numeroCartao)) falhar("O número do cartão não é válido. Confira os números digitados.", "cc-numero");
    const validadeCartao = $("cc-validade").value;
    if (!validadeValida(validadeCartao)) falhar("Validade inválida ou vencida. Use o formato MM/AA.", "cc-validade");
    else if (!validadeDentroDeCincoAnos(validadeCartao)) falhar("Validade inválida: o cartão não pode vencer em mais de 5 anos.", "cc-validade");
    // Nome impresso no cartão: só letras (sem números nem símbolos). Continua opcional.
    const nomeCartao = $("cc-nome").value.trim();
    if (nomeCartao && /[^\p{L}\s]/u.test(nomeCartao)) falhar("O nome no cartão deve ter apenas letras, sem números ou símbolos.", "cc-nome");
    const cvv = $("cc-cvv").value.trim();
    if (!cvv) falhar("Preencha o CVV do cartão.", "cc-cvv");
    else if (!/^\d{3,4}$/.test(cvv)) falhar("O CVV deve ter 3 ou 4 números.", "cc-cvv");
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
  // BOLETO — gerado aqui no front (simulação: não é um boleto real e não pode ser pago)
  // Segue o formato do boleto bancário: linha digitável de 47 números e código de barras de 44.
  // >>> API: com o backend/gateway real, o boleto vem pronto de lá (linha digitável + link do PDF).
  // =====================================================
  const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Dígito verificador módulo 10 (campos 1, 2 e 3 da linha digitável)
  function dvModulo10(numeros) {
    let soma = 0, peso = 2;
    for (let i = numeros.length - 1; i >= 0; i--) {
      const produto = Number(numeros[i]) * peso;
      soma += produto > 9 ? produto - 9 : produto; // soma dos algarismos do produto
      peso = peso === 2 ? 1 : 2;
    }
    return (10 - (soma % 10)) % 10;
  }

  // Dígito verificador geral do código de barras (módulo 11, pesos de 2 a 9)
  function dvGeralBoleto(numeros43) {
    let soma = 0, peso = 2;
    for (let i = numeros43.length - 1; i >= 0; i--) {
      soma += Number(numeros43[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const dv = 11 - (soma % 11);
    return (dv === 0 || dv === 10 || dv === 11) ? 1 : dv;
  }

  // Fator de vencimento: dias desde 07/10/1997 (a partir de 22/02/2025 a contagem volta para 1000)
  function fatorVencimento(data) {
    const base = Date.UTC(1997, 9, 7);
    const dias = Math.floor((Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) - base) / 86400000);
    return String(((dias - 1000) % 9000) + 1000);
  }

  // Código de barras no padrão do boleto (Intercalado 2 de 5), desenhado em SVG
  function svgCodigoBarras(numeros) {
    const padrao = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];
    const LARGO = 3; // o traço estreito vale 1
    let x = 0, retangulos = "";
    const barra = (larg) => { retangulos += '<rect x="' + x + '" y="0" width="' + larg + '" height="60"/>'; x += larg; };
    const espaco = (larg) => { x += larg; };
    barra(1); espaco(1); barra(1); espaco(1); // início
    for (let i = 0; i < numeros.length; i += 2) {
      const barras = padrao[Number(numeros[i])], espacos = padrao[Number(numeros[i + 1])];
      for (let k = 0; k < 5; k++) {
        barra(barras[k] === "w" ? LARGO : 1);
        espaco(espacos[k] === "w" ? LARGO : 1);
      }
    }
    barra(LARGO); espaco(1); barra(1); // fim
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + x + ' 60" preserveAspectRatio="none" width="100%" height="60" shape-rendering="crispEdges" role="img" aria-label="Código de barras do boleto">' +
      '<rect width="' + x + '" height="60" fill="#fff"/><g fill="#000">' + retangulos + "</g></svg>";
  }

  function gerarBoleto(total) {
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + BOLETO_PRAZO_DIAS);
    const fator = fatorVencimento(vencimento);
    const valor = String(Math.round(total * 100)).padStart(10, "0");
    let livre = ""; // campo livre (25 números): identifica o boleto
    for (let i = 0; i < 25; i++) livre += Math.floor(Math.random() * 10);

    const dv = dvGeralBoleto(BOLETO_BANCO + "9" + fator + valor + livre);
    const codigo = BOLETO_BANCO + "9" + dv + fator + valor + livre; // 44 números

    const c1 = codigo.slice(0, 4) + codigo.slice(19, 24);
    const c2 = codigo.slice(24, 34);
    const c3 = codigo.slice(34, 44);
    const campo1 = c1 + dvModulo10(c1);
    const campo2 = c2 + dvModulo10(c2);
    const campo3 = c3 + dvModulo10(c3);
    const linha = campo1.slice(0, 5) + "." + campo1.slice(5) + " " +
      campo2.slice(0, 5) + "." + campo2.slice(5) + " " +
      campo3.slice(0, 5) + "." + campo3.slice(5) + " " +
      dv + " " + fator + valor;
    return { linha, codigo, vencimento, valor: total };
  }

  // Página do boleto (abre em outra aba para ver, imprimir ou salvar em PDF)
  function gerarBoletoHtml(boleto, pedido) {
    const cpf = pedido.cpf.length === 11 ? "***." + pedido.cpf.slice(3, 6) + "." + pedido.cpf.slice(6, 9) + "-**" : "";
    const tr = (rotulo, valor) => '<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b">' + escHtml(rotulo) +
      '</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">' + escHtml(valor) + "</td></tr>";
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Boleto - Gestão Integrada Pro</title>' +
      '<style>@media print{.nao-imprimir{display:none}}</style></head>' +
      '<body style="font-family:Arial,sans-serif;max-width:640px;margin:30px auto;color:#1f2430">' +
      '<p style="background:#fff4d6;border:1px solid #f0d58a;padding:8px 12px;border-radius:6px;font-size:12px">SIMULAÇÃO: este boleto foi gerado só para teste e não pode ser pago.</p>' +
      '<h2 style="margin:0 0 4px">Gestão Integrada Pro</h2><h3 style="margin:0 0 14px">Boleto de pagamento</h3>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
      tr("Beneficiário", "Gestão Integrada Pro") + tr("Pagador", pedido.nome) + tr("CPF", cpf) +
      tr("Plano", PLANOS[pedido.plano].nome + " (" + (pedido.ciclo === "anual" ? "anual" : "mensal") + ")") +
      tr("Vencimento", boleto.vencimento.toLocaleDateString("pt-BR")) + tr("Valor do documento", moeda(boleto.valor)) + "</table>" +
      '<p style="margin:18px 0 4px;font-size:12px;color:#64748b">Linha digitável</p>' +
      '<p style="margin:0 0 14px;font-size:17px;font-weight:700;font-family:Consolas,monospace;word-break:break-all">' + escHtml(boleto.linha) + "</p>" +
      '<div style="border:1px solid #e2e8f0;padding:10px 12px">' + svgCodigoBarras(boleto.codigo) + "</div>" +
      '<p style="font-size:12px;color:#64748b;margin-top:14px">Pague até o vencimento. O plano é liberado depois que o pagamento for confirmado (de 1 a 3 dias úteis).</p>' +
      '<p class="nao-imprimir"><button onclick="window.print()" style="padding:10px 16px;font-size:14px;cursor:pointer">Imprimir / salvar em PDF</button></p>' +
      "</body></html>";
  }

  function dadosDoPedidoBoleto() {
    return {
      nome: $("ass-nome").value.trim(),
      cpf: cadastro.cpf || soDigitos($("ass-cpf").value),
      plano: planoEscolhido,
      ciclo
    };
  }

  function mostrarBoleto() {
    $("boleto-resultado").hidden = !boletoAtual;
    if (!boletoAtual) return;
    $("boleto-venc").textContent = boletoAtual.vencimento.toLocaleDateString("pt-BR");
    $("boleto-valor").textContent = moeda(boletoAtual.valor);
    $("boleto-linha").value = boletoAtual.linha;
    $("boleto-barras").innerHTML = svgCodigoBarras(boletoAtual.codigo);
    $("boleto-aviso-teste").hidden = !MODO_TESTE;
  }

  function abrirBoleto() {
    if (!boletoAtual) return;
    const pagina = gerarBoletoHtml(boletoAtual, dadosDoPedidoBoleto());
    window.open(URL.createObjectURL(new Blob([pagina], { type: "text/html" })), "_blank");
  }

  // =====================================================
  // EVENTOS
  // =====================================================
  document.querySelectorAll('input[name="metodo"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const metodo = metodoAtual();
      $("painel-pix").hidden = metodo !== "pix";
      $("painel-cartao").hidden = metodo !== "cartao";
      $("painel-boleto").hidden = metodo !== "boleto";
      document.querySelectorAll(".metodo").forEach((l) => l.classList.toggle("sel", l.querySelector("input").checked));
      if (metodo === "cartao" && cartoes.length === 0) abrirFormCartao(true); // sem cartão ainda: já abre o cadastro
      limparErro();
      avisoPixCancelado();
      atualizarResumo(); // o texto da cobrança muda conforme a forma de pagamento
    });
  });

  // Nome: só aceita letras e espaços (descarta o resto enquanto a pessoa digita)
  $("ass-nome").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^\p{L}\s]/gu, ""); });
  // Nome no cartão: só aceita letras e espaços
  // e converte tudo para MAIÚSCULAS enquanto digita
  $("cc-nome").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^\p{L}\s]/gu, "").toUpperCase(); }); // só letras e espaço, em maiúsculas
  $("ass-cpf").addEventListener("input", (e) => { e.target.value = mascaraCpf(e.target.value); });
  $("cc-numero").addEventListener("input", (e) => { e.target.value = mascaraCartao(e.target.value); });
  $("cc-validade").addEventListener("input", (e) => { e.target.value = mascaraValidade(e.target.value); });
  $("cc-cvv").addEventListener("input", (e) => { e.target.value = soDigitos(e.target.value); });
  $("form-assinatura").addEventListener("input", limparErro);

  // Boleto: ele é gerado quando a pessoa aperta "Assinar" e aparece na tela de confirmação
  $("btn-ver-boleto").addEventListener("click", abrirBoleto);
  $("btn-copiar-boleto").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("boleto-linha").value);
      $("btn-copiar-boleto").textContent = "Copiado";
    } catch (e) {
      $("boleto-linha").select();
    }
    setTimeout(() => { $("btn-copiar-boleto").textContent = "Copiar"; }, 2000);
  });

  // Cartões: o botão de cima abre o cadastro (pode adicionar quantos quiser)
  $("btn-novo-cartao").addEventListener("click", () => abrirFormCartao(true));
  $("btn-salvar-cartao").addEventListener("click", salvarNovoCartao);
  $("btn-cancelar-cartao").addEventListener("click", () => abrirFormCartao(false));
  $("form-novo-cartao").addEventListener("input", () => { $("erro-cartao").hidden = true; });
  // Enter dentro do cadastro do cartão salva o cartão (e não envia o pedido inteiro)
  $("form-novo-cartao").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); salvarNovoCartao(); } });

  // Aviso (laranja) mostrado depois que a pessoa cancela o Pix; sem texto, remove o aviso
  function avisoPixCancelado(texto) {
    let el = $("aviso-pix-cancelado");
    if (!texto) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("p");
      el.id = "aviso-pix-cancelado";
      el.className = "pix-dica";
      el.setAttribute("role", "status");
      el.style.cssText = "margin:10px 0 0;color:#b45309;font-weight:600";
      $("pix-resultado").insertAdjacentElement("beforebegin", el);
    }
    el.textContent = texto;
  }

  // Botão "Cancelar operação do Pix": aparece junto com o QR Code
  const btnCancelarPix = $("btn-cancelar-pix");
  if (btnCancelarPix) btnCancelarPix.addEventListener("click", () => { if (cancelarPixAtual) cancelarPixAtual(); });

  $("btn-copiar-pix").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("pix-codigo").value);
      $("btn-copiar-pix").textContent = "Copiado";
    } catch (e) {
      $("pix-codigo").select();
    }
    setTimeout(() => { $("btn-copiar-pix").textContent = "Copiar"; }, 2000);
  });

  // =====================================================
  // TELA DE PROCESSAMENTO DO PAGAMENTO (Pix, cartão e boleto)
  // Fundo escurecido, círculo girando na cor do site e as etapas aparecendo uma a uma.
  // É criada aqui mesmo (não precisa mexer no HTML) e usa as cores do site (var(--roxo), var(--card)...).
  // >>> API: com o gateway real, troque os tempos (ms) por esperas de verdade (resposta do gateway / webhook).
  // =====================================================
  const Processamento = (function () {
    let overlay = null, elTitulo = null, elSub = null, elLista = null;
    const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

    function criar() {
      if (overlay) return;
      const estilo = document.createElement("style");
      estilo.textContent =
        ".proc-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(4,14,28,.72);backdrop-filter:blur(4px)}" +
        ".proc-overlay[hidden]{display:none}" +
        ".proc-card{width:100%;max-width:380px;background:#0b2239;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:26px 24px 20px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.45);animation:proc-entra .25s ease}" +
        ".proc-icone{width:64px;height:64px;margin:0 auto 14px;position:relative}" +
        ".proc-spin{position:absolute;inset:0;border-radius:50%;border:5px solid rgba(255,255,255,.12);border-top-color:#00c46a;animation:proc-gira .9s linear infinite}" +
        ".proc-ok{position:absolute;inset:0;border-radius:50%;background:#00c46a;color:#fff;font-size:32px;font-weight:700;display:none;align-items:center;justify-content:center;animation:proc-pop .35s ease}" +
        ".proc-overlay.ok .proc-spin{display:none}.proc-overlay.ok .proc-ok{display:flex}" +
        ".proc-logo{font-weight:800;font-size:15px;line-height:1.05;letter-spacing:.5px;color:#fff;margin:0 0 18px}" +
        ".proc-titulo{font-size:18px;margin:0 0 4px;color:#fff}" +
        ".proc-sub{font-size:13px;color:#9fb3c8;margin:0 0 16px;line-height:1.5}" +
        ".proc-passos{list-style:none;margin:0 0 14px;padding:0;text-align:left;font-size:13px}" +
        ".proc-passos li{display:flex;align-items:center;gap:10px;padding:7px 4px;color:#9fb3c8}" +
        ".proc-passos li::before{content:'';width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.25);flex:none;box-sizing:border-box}" +
        ".proc-passos li.ativo{color:#fff;font-weight:600}" +
        ".proc-passos li.ativo::before{border-color:#00c46a;border-top-color:transparent;animation:proc-gira .8s linear infinite}" +
        ".proc-passos li.feito{color:#fff}" +
        ".proc-passos li.feito::before{content:'✓';background:#00c46a;border-color:#00c46a;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;line-height:1}" +
        ".proc-aviso{font-size:11px;color:#7f96ad;margin:0}" +
        ".pix-status{display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;color:var(--muted,#64748b);margin:8px 0 0}" +
        ".pix-status .proc-mini{width:14px;height:14px;border-radius:50%;border:2px solid var(--roxo-claro,#efeaff);border-top-color:var(--roxo,#6c5ce7);animation:proc-gira .9s linear infinite}" +
        "@keyframes proc-gira{to{transform:rotate(360deg)}}" +
        "@keyframes proc-entra{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}" +
        "@keyframes proc-pop{from{transform:scale(.4)}to{transform:scale(1)}}" +
        "@media (prefers-reduced-motion:reduce){.proc-spin,.proc-passos li.ativo::before,.pix-status .proc-mini{animation-duration:3s}.proc-card,.proc-ok{animation:none}}";
      document.head.appendChild(estilo);

      overlay = document.createElement("div");
      overlay.className = "proc-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "alertdialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-live", "polite");
      overlay.setAttribute("aria-busy", "true");
      overlay.innerHTML =
        '<div class="proc-card">' +
        '<div class="proc-logo">GET<br>TIME</div>' +
        '<div class="proc-icone"><span class="proc-spin"></span><span class="proc-ok">✓</span></div>' +
        '<h2 class="proc-titulo"></h2><p class="proc-sub"></p><ul class="proc-passos"></ul>' +
        '<p class="proc-aviso">🔒 Pagamento seguro. Não feche nem atualize esta página.</p></div>';
      document.body.appendChild(overlay);
      elTitulo = overlay.querySelector(".proc-titulo");
      elSub = overlay.querySelector(".proc-sub");
      elLista = overlay.querySelector(".proc-passos");
    }

    // Mostra a tela e vai marcando as etapas, uma de cada vez. A tela continua aberta no final
    // (use fechar() ou concluir() depois).
    async function rodar(opcoes) {
      criar();
      overlay.classList.remove("ok");
      overlay.setAttribute("aria-busy", "true");
      elTitulo.textContent = opcoes.titulo || "Processando...";
      elSub.textContent = opcoes.subtitulo || "Não feche esta página.";
      elLista.innerHTML = "";
      const itens = (opcoes.passos || []).map((p) => {
        const li = document.createElement("li");
        li.textContent = p.t;
        elLista.appendChild(li);
        return li;
      });
      overlay.hidden = false;
      for (let i = 0; i < itens.length; i++) {
        itens[i].className = "ativo";
        await dormir(opcoes.passos[i].ms || 800);
        itens[i].className = "feito";
      }
      await dormir(250);
    }

    function mensagem(texto) { if (overlay) elSub.textContent = texto; }

    // Marca como concluído (✓ verde), espera um instante e fecha
    async function concluir(titulo, subtitulo, ms) {
      if (!overlay || overlay.hidden) return;
      overlay.classList.add("ok");
      overlay.setAttribute("aria-busy", "false");
      elTitulo.textContent = titulo;
      elSub.textContent = subtitulo || "";
      elLista.querySelectorAll("li").forEach((li) => { li.className = "feito"; });
      await dormir(ms || 1200);
      fechar();
    }

    function fechar() { if (overlay) overlay.hidden = true; }

    return { rodar, mensagem, concluir, fechar };
  })();

  // Pix: troca o "Aguardando..." por um aviso com círculo girando
  function mostrarEsperaPix() {
    const caixa = $("pix-resultado");
    let aviso = Array.from(caixa.querySelectorAll("p")).find((p) => /Aguardando/.test(p.textContent));
    if (!aviso) {
      aviso = document.createElement("p");
      $("pix-teste").insertAdjacentElement("beforebegin", aviso);
    }
    aviso.className = "pix-status";
    aviso.innerHTML = '<span class="proc-mini"></span><span id="pix-status-texto">Aguardando a confirmação do pagamento...</span>';
  }

  // Pix: o código só é gerado quando a pessoa aperta "Assinar"; depois a tela espera o pagamento
  function gerarCodigoPix() {
    // >>> API: com o gateway real, use o "copia e cola" que ele devolver
    return "00020126-SIMULACAO-" + Math.random().toString(36).slice(2, 12).toUpperCase();
  }

  // Pergunta ao backend se o Pix já foi pago. Sem a rota configurada, o Pix nunca é confirmado.
  async function consultarPagamentoPix() {
    if (!ENDPOINT_PIX_STATUS) return false;
    try {
      const resp = await fetch(ENDPOINT_PIX_STATUS + "?codigo=" + encodeURIComponent($("pix-codigo").value));
      if (!resp.ok) return false;
      const dados = await resp.json();
      return dados.pago === true || String(dados.status || "").toLowerCase() === "pago";
    } catch (e) {
      return false;
    }
  }

  // Espera o pagamento de verdade: mostra o tempo que falta e consulta o backend de 3 em 3 segundos.
  // Devolve true quando pagou, ou false se o tempo acabou sem pagamento.
  // Guarda a função que cancela a espera atual do Pix (usada pelo botão "Cancelar operação do Pix")
  let cancelarPixAtual = null;

  function aguardarPagamentoPix() {
    return new Promise((resolve) => {
      const inicio = Date.now();
      let ciclos = 0;
      let consultando = false;
      const timer = setInterval(async () => {
        const restante = PIX_VALIDADE_MS - (Date.now() - inicio);
        if (restante <= 0) { clearInterval(timer); cancelarPixAtual = null; resolve(false); return; }
        const texto = $("pix-status-texto");
        if (texto) {
          const min = Math.floor(restante / 60000);
          const seg = String(Math.floor((restante % 60000) / 1000)).padStart(2, "0");
          texto.textContent = "Aguardando o pagamento... o código expira em " + String(min).padStart(2, "0") + ":" + seg;
        }
        ciclos++;
        if (ciclos % 3 === 0 && !consultando) {
          consultando = true;
          const pago = await consultarPagamentoPix();
          consultando = false;
          if (pago) { clearInterval(timer); cancelarPixAtual = null; resolve(true); }
        }
      }, 1000);
      // Cancelar operação: para a espera e devolve "cancelado" (a pessoa vai escolher cartão ou boleto)
      cancelarPixAtual = () => { clearInterval(timer); cancelarPixAtual = null; resolve("cancelado"); };
    });
  }

  // O tempo do Pix acabou: mostra duas opções e devolve "novo" (gerar outro Pix) ou "trocar" (escolher outra forma de pagamento)
  function perguntarPixExpirado() {
    return new Promise((resolve) => {
      const caixa = document.createElement("div");
      caixa.id = "pix-expirado";
      caixa.style.cssText = "margin-top:16px;padding:16px;border:1px solid #f0d58a;background:#fff9e6;border-radius:10px;";
      caixa.innerHTML =
        '<p style="margin:0 0 4px;font-weight:700;color:#7a5b00">O tempo para pagar o Pix acabou</p>' +
        '<p style="margin:0 0 8px;font-size:14px;color:#7a5b00">Não identificamos o pagamento. O que você prefere fazer?</p>';
      const botao = (texto, estilo, valor) => {
        const b = document.createElement("button");
        b.type = "button"; // dentro do formulário: não pode enviar
        b.textContent = texto;
        b.style.cssText = "display:block;width:100%;margin-top:8px;padding:13px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;" + estilo;
        b.addEventListener("click", () => { caixa.remove(); resolve(valor); });
        caixa.appendChild(b);
      };
      botao("Tentar novamente (gerar novo Pix)", "background:#6c5ce7;color:#fff;border:0;", "novo");
      botao("Trocar forma de pagamento", "background:#fff;color:#1f2430;border:1px solid #dfe3ec;", "trocar");
      $("pix-resultado").insertAdjacentElement("afterend", caixa);
      caixa.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // Trocar a forma de pagamento de uma assinatura que já existe (não cobra nada agora)
  async function salvarTrocaPagamento() {
    const metodo = metodoAtual();
    const cartaoUsado = metodo === "cartao" ? cartaoSelecionado() : null;
    let reg = null;
    try { reg = JSON.parse(localStorage.getItem(CHAVE_ASSINATURA)); } catch (e) { reg = null; }
    if (!reg) { mostrarErro("Não encontramos uma assinatura ativa para trocar a forma de pagamento.", null); return; }

    const btn = $("btn-assinar");
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Salvando...";
    // >>> API: avisar o backend/gateway da nova forma de pagamento (PUT na assinatura, com o token do cartão).
    await Processamento.rodar({
      titulo: "Salvando a forma de pagamento",
      subtitulo: "Só um instante...",
      passos: [{ t: "Conferindo os dados", ms: 600 }, { t: "Atualizando sua assinatura", ms: 800 }]
    });

    reg.metodo = metodo;
    reg.cartaoFinal = cartaoUsado ? cartaoUsado.final : null;
    if (metodo === "cartao") {
      const fimContrato = new Date();
      fimContrato.setFullYear(fimContrato.getFullYear() + 1);
      reg.contratoAte = fimContrato.toISOString();
    } else {
      delete reg.contratoAte;
    }
    delete reg.boletoVencimento;
    delete reg.boletoLinha;
    localStorage.setItem(CHAVE_ASSINATURA, JSON.stringify(reg));

    await Processamento.concluir("Forma de pagamento atualizada!", "As próximas cobranças usarão a nova forma.");
    btn.disabled = false;
    btn.textContent = textoOriginal;
    mostrarSucessoTroca(metodo, cartaoUsado, reg);
  }

  function mostrarSucessoTroca(metodo, cartao, reg) {
    const p = PLANOS[planoEscolhido];
    const nomes = { pix: "Pix", boleto: "Boleto", cartao: cartao ? cartao.bandeira + " •••• " + cartao.final : "Cartão de crédito" };
    $("suc-titulo").textContent = "Forma de pagamento atualizada";
    $("suc-sub").textContent = "As próximas cobranças do plano " + p.nome + " serão por " + nomes[metodo] + ".";
    $("suc-plano").textContent = p.nome;
    $("suc-ciclo").textContent = ciclo === "anual" ? "Anual" : "Mensal";
    $("suc-total").textContent = moeda(Number(reg.total) || calcularPreco(planoEscolhido, ciclo).total);
    $("suc-rotulo-data").textContent = "Próxima cobrança";
    const proxima = reg.validoAte ? new Date(reg.validoAte) : dataRenovacao(planoEscolhido, ciclo);
    $("suc-data").textContent = proxima.toLocaleDateString("pt-BR");
    $("suc-nota").hidden = true;
    $("suc-boleto").hidden = true;
    $("suc-redireciona").textContent = "";
    $("btn-ir-painel").textContent = "Voltar para a agenda";
    $("etapa-checkout").hidden = true;
    if ($("link-voltar")) $("link-voltar").hidden = true; // na tela de pagamento realizado não aparece o "Voltar"
    $("etapa-sucesso").hidden = false;
    window.scrollTo(0, 0);
  }

  $("form-assinatura").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await processarEnvio();
    } catch (erro) {
      console.error("Erro ao processar a assinatura:", erro);
      mostrarErro("Não foi possível concluir agora. Tente novamente.", null);
      atualizarTela(); // volta o botão ao normal
      $("btn-assinar").disabled = false;
    } finally {
      Processamento.fechar(); // a tela de processamento nunca fica presa
    }
  });

  async function processarEnvio() {
    const { erros, primeiro } = validarFormulario();
    if (erros.length > 0) { mostrarErro(erros.join("\n"), primeiro); return; }
    limparErro();

    if (modoTrocar) { await salvarTrocaPagamento(); return; }

    const gratis = planoEscolhido === "FREE";
    const preco = calcularPreco(planoEscolhido, ciclo);
    const metodo = gratis ? null : (modoRenovar ? "pix" : metodoAtual());
    const validoAte = proximaData(); // data da próxima cobrança (a escolhida pela pessoa)
    if (metodo === "boleto") boletoAtual = gerarBoleto(preco.total); // o boleto só é gerado agora, ao apertar Assinar
    const boleto = metodo === "boleto" ? boletoAtual : null;
    const pendente = !!boleto && !BOLETO_LIBERA_NA_HORA; // boleto: o plano só libera depois do pagamento
    const cartaoUsado = metodo === "cartao" ? cartaoSelecionado() : null;
    // E-mail e CPF sempre os do cadastro (quando existem)
    const emailNota = String(cadastro.email || $("ass-email").value || "").trim().toLowerCase(); // qualquer provedor (Gmail, Outlook, Yahoo, e-mail próprio...)
    const cpfNota = cadastro.cpf || soDigitos($("ass-cpf").value);

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
    if (metodo === "pix") {
      let pago = false;
      while (!pago) { // se o tempo acabar, a pessoa escolhe: gerar um novo Pix ou trocar a forma de pagamento
        avisoPixCancelado(); // some o aviso de "Pix cancelado", se houver
        // 1) Gera o Pix
        await Processamento.rodar({
          titulo: "Gerando seu Pix",
          subtitulo: "Só um instante...",
          passos: [{ t: "Conferindo seus dados", ms: 600 }, { t: "Criando o código Pix", ms: 800 }]
        });
        Processamento.fechar();
        // 2) Mostra o QR Code e o copia e cola e espera o pagamento
        $("pix-codigo").value = gerarCodigoPix();
        atualizarQrPix();
        $("pix-resultado").hidden = false;
        $("pix-teste").hidden = true; // não existe mais pagamento simulado: só segue quando o pagamento for confirmado
        mostrarEsperaPix();
        btn.textContent = "Aguardando o pagamento do Pix...";
        $("pix-resultado").scrollIntoView({ behavior: "smooth", block: "center" });
        pago = await aguardarPagamentoPix();
        if (pago === "cancelado") { // a pessoa cancelou o Pix para pagar de outra forma
          $("pix-resultado").hidden = true;
          $("pix-codigo").value = "";
          $("pix-qr").innerHTML = "";
          atualizarTela(); // volta o botão e o resumo ao normal
          btn.disabled = false;
          avisoPixCancelado("Pix cancelado. Escolha Cartão de crédito ou Boleto acima, ou clique em Assinar para gerar um novo Pix.");
          const formas = document.querySelector(".metodo");
          if (formas) formas.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        if (!pago) { // o Pix expirou sem pagamento
          $("pix-resultado").hidden = true;
          btn.textContent = "Pix expirado";
          const escolha = await perguntarPixExpirado();
          if (escolha === "trocar") {
            atualizarTela(); // volta o botão e o resumo ao normal
            btn.disabled = false;
            const formas = document.querySelector(".metodo");
            if (formas) formas.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
          // "novo": o laço volta e gera outro código e outro QR Code
        }
      }
      // 3) Pagamento recebido: confirma e libera o plano
      await Processamento.rodar({
        titulo: "Pagamento recebido!",
        subtitulo: "Estamos confirmando com o banco. Não feche esta página.",
        passos: [{ t: "Confirmando o pagamento", ms: 900 }, { t: "Liberando o seu plano", ms: 800 }]
      });
    } else if (metodo === "boleto") {
      await Processamento.rodar({
        titulo: "Gerando seu boleto",
        subtitulo: "Só um instante...",
        passos: [{ t: "Conferindo seus dados", ms: 600 }, { t: "Registrando o boleto", ms: 900 }, { t: "Gerando o código de barras", ms: 800 }]
      });
    } else if (metodo === "cartao") {
      await Processamento.rodar({
        titulo: "Processando seu pagamento",
        subtitulo: "Não feche nem atualize esta página.",
        passos: [{ t: "Verificando os dados do cartão", ms: 900 }, { t: "Falando com o banco", ms: 1300 }, { t: "Confirmando o pagamento", ms: 900 }]
      });
    } else {
      await Processamento.rodar({
        titulo: "Ativando o seu plano",
        subtitulo: "Só um instante...",
        passos: [{ t: "Criando a sua assinatura", ms: 800 }, { t: "Liberando o acesso", ms: 700 }]
      });
    }

    // Só guarda dados do pedido. Nunca número, validade ou CVV do cartão.
    const registro = {
      plano: planoEscolhido,
      status: "aprovada", // o painel (agenda) só libera o plano quando está aprovada
      ciclo: gratis ? "teste" : ciclo,
      metodo,
      cartaoFinal: cartaoUsado ? cartaoUsado.final : null,
      total: preco.total,
      contratadoEm: new Date().toISOString(),
      validoAte: validoAte.toISOString()
    };
    if (metodo === "cartao") {
      const fimContrato = new Date();
      fimContrato.setFullYear(fimContrato.getFullYear() + 1);
      registro.contratoAte = fimContrato.toISOString(); // período de 1 ano (contrato de 12 meses)
    }
    if (boleto) {
      registro.boletoVencimento = boleto.vencimento.toISOString();
      registro.boletoLinha = boleto.linha;
    }
    if (pendente) {
      // Boleto ainda não pago: guarda à parte e NÃO mexe na assinatura atual da pessoa
      registro.status = "pendente";
      localStorage.setItem(CHAVE_ASSINATURA_PENDENTE, JSON.stringify(registro));
    } else {
      localStorage.setItem(CHAVE_ASSINATURA, JSON.stringify(registro));
    }

    // Nota fiscal por e-mail (só para plano pago; no boleto, só depois que o pagamento for confirmado)
    let notaEnviada = false;
    if (!gratis && !pendente) {
      Processamento.mensagem("Enviando a nota fiscal para o seu e-mail...");
      const pedidoNota = {
        nome: $("ass-nome").value.trim(),
        email: emailNota,
        cpf: cpfNota,
        plano: planoEscolhido,
        ciclo,
        metodo,
        total: preco.total,
        contratadoEm: new Date().toISOString()
      };
      if (MODO_TESTE) {
        notaTesteHtml = gerarNotaTeste(pedidoNota);
        notaEnviada = await enviarEmailJS(pedidoNota, notaTesteHtml);
      } else notaEnviada = await enviarNotaFiscal(pedidoNota);
    }

    await Processamento.concluir(
      pendente ? "Boleto gerado!" : (gratis ? "Plano ativado!" : "Pagamento aprovado!"),
      pendente ? "O plano é liberado assim que o pagamento do boleto for confirmado." : "Tudo certo! Levando você para a confirmação..."
    );
    btn.disabled = false;
    btn.textContent = textoOriginal;
    mostrarSucesso(gratis, preco.total, metodo, validoAte, notaEnviada, emailNota, pendente);
  }

  // QR Code do Pix: desenhado a partir do código copia e cola
  function atualizarQrPix() {
    const alvo = $("pix-qr");
    alvo.innerHTML = "";
    try { if (window.QRPix) alvo.innerHTML = QRPix.svg($("pix-codigo").value, 180); } catch (e) { /* sem QR: o copia e cola continua valendo */ }
  }

  // MODO TESTE: dados da empresa que aparecem na nota (troque pelos dados reais quando tiver o CNPJ)
  const EMPRESA = { nome: "Get Time", cnpj: "00.000.000/0001-00 (fictício, só para teste)", email: "jonathanpinheiro484@gmail.com" };

  // MODO TESTE: monta a nota que seria enviada por e-mail, só para visualizar
  // (HTML de e-mail: tabelas e estilos inline, sem imagens externas, para funcionar em Gmail/Outlook)
  function gerarNotaTeste(pedido) {
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    // Nome com a inicial maiúscula (o campo aceita maiúscula e minúscula), "da/de/do/das/dos/e" ficam minúsculos
    const nomeBonito = (n) => n.trim().toLowerCase().split(/\s+/)
      .map((p, i) => (i > 0 && ["da", "de", "do", "das", "dos", "e"].includes(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    const cpf = pedido.cpf.length === 11 ? "***." + pedido.cpf.slice(3, 6) + "." + pedido.cpf.slice(6, 9) + "-**" : "";
    const pagto = pedido.metodo === "pix" ? "Pix" : (pedido.metodo === "boleto" ? "Boleto bancário" : "Cartão de crédito");
    const plano = PLANOS[pedido.plano];
    const cobranca = pedido.ciclo === "anual" ? "anual" : "mensal";
    const agora = new Date();
    const dataEmissao = agora.toLocaleDateString("pt-BR") + " às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const dataCompra = new Date(pedido.contratadoEm || agora).toLocaleDateString("pt-BR");
    const fim = dataRenovacao(pedido.plano, pedido.ciclo, renovarBase);
    const inicio = (renovarBase && renovarBase > agora) ? renovarBase : agora; // renovação: o período novo começa quando o atual termina
    const periodo = inicio.toLocaleDateString("pt-BR") + " a " + fim.toLocaleDateString("pt-BR");
    const numero = "TESTE-" + Date.now().toString().slice(-6);
    const codigo = "GT-" + Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

    // Campo: rótulo pequeno em cima, valor embaixo (funciona bem em telas estreitas)
    const campo = (rotulo, valor, extra) =>
      '<tr><td style="padding:11px 18px;border-top:1px solid #e3ebf6">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#64748b">' + esc(rotulo) + "</div>" +
      '<div style="font-size:15px;font-weight:600;color:#0a1f38;margin-top:3px;word-break:break-word;' + (extra || "") + '">' + esc(valor) + "</div></td></tr>";
    // Bloco com faixa de título, como nos documentos fiscais
    const secao = (titulo, corpo) =>
      '<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dbe5f2;border-radius:14px;border-collapse:separate;overflow:hidden">' +
      '<tr><td style="background:#eaf1fc;padding:10px 18px;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0a1f38">' + esc(titulo) + "</td></tr>" +
      corpo + "</table></td></tr>";

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Get Time - Nota da compra</title></head>' +
      '<body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0a1f38">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6fb"><tr><td align="center" style="padding:24px 12px">' +
      '<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #dbe5f2;border-radius:22px;overflow:hidden">' +

      // Cabeçalho: marca à esquerda, título e número da nota à direita
      '<tr><td style="padding:26px 28px 22px;background:#0a1f38;border-bottom:4px solid #00c878"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="background:#00c878;color:#0a1f38;font-size:18px;font-weight:800;width:44px;height:44px;text-align:center;border-radius:12px;letter-spacing:.5px">GT</td>' +
      '<td style="padding-left:12px;font-size:24px;font-weight:800;letter-spacing:1px;color:#ffffff">GET TIME</td></tr></table></td>' +
      '<td valign="middle" align="right"><div style="font-size:15px;font-weight:800;letter-spacing:2px;color:#00c878">NOTA FISCAL</div>' +
      '<div style="font-size:13px;color:#c4d3e6;margin-top:4px">Nº <b style="color:#ffffff">' + esc(numero) + "</b></div></td>" +
      "</tr></table></td></tr>" +

      // Aviso de teste
      '<tr><td style="padding:16px 28px 0"><div style="background:#fff4d6;border:1px solid #f0d58a;padding:9px 14px;border-radius:10px;font-size:12px;color:#7a5b00">' +
      "MODO TESTE: esta nota é só uma simulação e não tem valor fiscal.</div></td></tr>" +

      // Emissão
      secao("Emissão", campo("Data e hora de emissão", dataEmissao)) +

      // Prestador
      secao("Prestador do serviço", campo("Nome", EMPRESA.nome) + campo("CNPJ", EMPRESA.cnpj) + campo("E-mail", EMPRESA.email)) +

      // Tomador
      secao("Tomador do serviço (cliente)", campo("Nome", nomeBonito(pedido.nome)) + campo("CPF", cpf) + campo("E-mail", pedido.email)) +

      // Discriminação do serviço
      secao("Discriminação do serviço",
        '<tr><td style="padding:14px 18px;border-top:1px solid #e3ebf6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td valign="top"><div style="font-size:15px;font-weight:700;color:#0a1f38">Assinatura do sistema Get Time, plano ' + esc(plano.nome) + "</div>" +
        '<div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.5">Cobrança ' + esc(cobranca) + " · Quantidade: 1<br>Período: " + esc(periodo) + "</div></td>" +
        '<td valign="top" align="right" style="padding-left:16px;font-size:15px;font-weight:700;white-space:nowrap">' + esc(moeda(pedido.total)) + "</td></tr></table></td></tr>" +
        '<tr><td style="background:#e3f9ef;padding:16px 18px;border-top:1px solid #bdeed6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#0a1f38">Valor total da nota</td>' +
        '<td align="right" style="padding-left:16px;font-size:24px;font-weight:800;color:#007a4d;white-space:nowrap">' + esc(moeda(pedido.total)) + "</td></tr></table></td></tr>") +

      // Pagamento
      secao("Pagamento",
        campo("Data da compra", dataCompra) +
        campo("Forma de pagamento", pagto) +
        campo("Situação", "Pagamento confirmado", "color:#15803d") +
        campo("Próxima cobrança", fim.toLocaleDateString("pt-BR"))) +

      // Código de verificação
      secao("Código de verificação (simulado)", campo("Código", codigo, "font-family:Consolas,Menlo,monospace;letter-spacing:1px")) +

      // Rodapé
      '<tr><td style="padding:22px 28px 28px"><p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;text-align:center">' +
      "Guarde esta nota. Em caso de dúvida, é só responder este e-mail.<br>Get Time · Obrigado por escolher a gente!</p></td></tr>" +

      "</table></td></tr></table></body></html>";
  }

  // MODO TESTE: envia a nota de teste por e-mail usando o EmailJS (sem backend).
  // Funciona para qualquer destinatário (Gmail, Outlook, Hotmail, Yahoo, e-mail de empresa...),
  // desde que no modelo do EmailJS o campo "To Email" esteja como {{to_email}} e o corpo use {{{nota_html}}}.
  async function enviarEmailJS(pedido, html) {
    if (!EMAILJS.servico || !EMAILJS.modelo || !EMAILJS.chavePublica) return false;
    const destino = String(pedido.email || "").trim().toLowerCase();
    if (!EMAIL_REGEX.test(destino)) { console.error("EmailJS: e-mail de destino inválido:", destino); return false; }
    try {
      const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: EMAILJS.servico,
          template_id: EMAILJS.modelo,
          user_id: EMAILJS.chavePublica,
          template_params: {
            to_email: destino,
            email: destino,      // alguns modelos usam {{email}}
            reply_to: destino,
            to_name: pedido.nome,
            assunto: "Get Time - Nota da sua compra (TESTE)",
            nota_html: html
          }
        })
      });
      if (!resp.ok) console.error("EmailJS recusou o envio:", resp.status, await resp.text()); // F12 > Console mostra o motivo
      return resp.ok;
    } catch (e) {
      console.error("Erro ao enviar pelo EmailJS:", e);
      return false;
    }
  }

  // Pede ao backend para emitir a nota fiscal e enviar por e-mail. Devolve true se o backend aceitou.
  async function enviarNotaFiscal(pedido) {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 6000);
    try {
      // >>> API: o backend deve conferir e-mail/CPF com o cadastro da conta (não confiar no que vem do navegador)
      const resp = await fetch(ENDPOINT_NOTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido),
        signal: controle.signal
      });
      return resp.ok;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(limite);
    }
  }

  function mostrarSucesso(gratis, total, metodo, validoAte, notaEnviada, emailNota, pendente) {
    const p = PLANOS[planoEscolhido];
    $("suc-titulo").textContent = gratis ? "Plano grátis ativado" : (pendente ? "Boleto gerado" : "Pagamento aprovado");
    $("suc-sub").textContent = gratis
      ? "Você tem 30 dias para testar o sistema."
      : (pendente
        ? "Pague o boleto até " + boletoAtual.vencimento.toLocaleDateString("pt-BR") + ". O plano " + p.nome + " será liberado assim que o pagamento for confirmado."
        : (modoRenovar ? "Seu plano " + p.nome + " foi renovado." : "Seu plano " + p.nome + " já está ativo."));
    $("suc-plano").textContent = p.nome;
    $("suc-ciclo").textContent = gratis ? "30 dias grátis" : (metodo === "cartao" ? "Mensal automático (contrato de 12 meses)" : "Mensal");
    $("suc-total").textContent = moeda(total);
    const nota = $("suc-nota");
    nota.hidden = gratis;
    nota.textContent = pendente
      ? "A nota fiscal será enviada para o seu e-mail quando o pagamento for confirmado."
      : (notaEnviada
        ? "Enviamos a nota fiscal para o seu e-mail."
        : (MODO_TESTE
          ? "Não foi possível enviar a nota por e-mail agora. Você pode baixá-la pelo botão abaixo."
          : "A nota fiscal será enviada para o seu e-mail."));
    // Botão "Baixar nota fiscal": aparece quando o pagamento já foi aprovado (Pix e cartão).
    // No boleto só depois que o pagamento for confirmado; no plano grátis não há nota.
    // >>> API: em produção, troque pelo link/PDF da nota que o backend emitiu.
    const podeBaixarNota = !gratis && !pendente && !!notaTesteHtml;
    let btnNota = $("btn-baixar-nota");
    if (podeBaixarNota) {
      if (!btnNota) {
        const caixa = document.createElement("p");
        caixa.style.marginTop = "14px";
        btnNota = document.createElement("button");
        btnNota.type = "button";
        btnNota.id = "btn-baixar-nota";
        btnNota.className = "btn-sec";
        btnNota.style.cssText = "display:block;width:100%;padding:12px;font-size:14px;font-weight:600;";
        btnNota.textContent = "⬇ Baixar nota fiscal";
        btnNota.addEventListener("click", () => {
          const agora = new Date();
          const pad = (n) => String(n).padStart(2, "0");
          const carimbo = agora.getFullYear() + pad(agora.getMonth() + 1) + pad(agora.getDate()) + "-" + pad(agora.getHours()) + pad(agora.getMinutes());
          const url = URL.createObjectURL(new Blob([notaTesteHtml], { type: "text/html;charset=utf-8" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = "nota-fiscal-get-time-" + carimbo + ".html";
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          btnNota.textContent = "✓ Nota baixada";
          setTimeout(() => { btnNota.textContent = "⬇ Baixar nota fiscal"; }, 2500);
        });
        caixa.appendChild(btnNota);
        const alvo = $("btn-ir-painel").parentElement;
        alvo.parentElement.insertBefore(caixa, alvo);
      }
      btnNota.parentElement.hidden = false;
    } else if (btnNota) {
      btnNota.parentElement.hidden = true;
    }
    $("suc-boleto").hidden = !pendente;
    if (pendente) mostrarBoleto();
    $("suc-rotulo-data").textContent = gratis ? "Teste até" : (pendente ? "Vencimento do boleto" : "Próxima cobrança");
    $("suc-data").textContent = (pendente ? boletoAtual.vencimento : validoAte).toLocaleDateString("pt-BR");
    // Dia em que a assinatura foi feita: uma linha acima da data de vencimento/próxima cobrança
    const rotuloVenc = $("suc-rotulo-data"), valorVenc = $("suc-data");
    let linhaFeita = $("suc-feita-linha");
    if (!linhaFeita && rotuloVenc.parentElement === valorVenc.parentElement) {
      linhaFeita = valorVenc.parentElement.cloneNode(true);
      linhaFeita.id = "suc-feita-linha";
      linhaFeita.querySelector("#suc-rotulo-data").id = "suc-rotulo-feita";
      linhaFeita.querySelector("#suc-data").id = "suc-feita";
      valorVenc.parentElement.parentElement.insertBefore(linhaFeita, valorVenc.parentElement);
    }
    if (linhaFeita) {
      $("suc-rotulo-feita").textContent = "Data da assinatura";
      $("suc-feita").textContent = new Date().toLocaleDateString("pt-BR");
    }
    $("etapa-checkout").hidden = true;
    if ($("link-voltar")) $("link-voltar").hidden = true; // na tela de pagamento realizado não aparece o "Voltar"
    $("etapa-sucesso").hidden = false;
    window.scrollTo(0, 0);

    // No modo teste (e no boleto, que fica aguardando pagamento) não redireciona sozinho, para dar tempo de ver a nota/o boleto
    if (MODO_TESTE || pendente) { $("suc-redireciona").textContent = ""; return; }

    // Aprovado: volta para a agenda sozinho, já com o plano ativo (o botão leva na hora)
    let segundos = podeBaixarNota ? 15 : 4; // com a nota para baixar, dá mais tempo antes de abrir a agenda
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

  // Próxima cobrança: a pessoa escolhe de amanhã até 1 mês (padrão = 1 mês)
  (function prepararProximaCobranca() {
    const campo = $("ass-prox-cobranca");
    if (!campo) return;
    const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    const limite = new Date(); limite.setMonth(limite.getMonth() + 1);
    campo.min = iso(amanha);
    campo.max = iso(limite);
    campo.value = iso(limite);
    campo.addEventListener("change", atualizarResumo);
  })();

  // O plano vem da tela de Planos: assinatura.html?plano=profissional
  const params = new URLSearchParams(window.location.search);
  modoTrocar = params.get("modo") === "trocar-pagamento";
  modoRenovar = params.get("modo") === "renovar-pix";
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
    } else {
      carregarCadastro(sessao);

      // Trocar forma de pagamento: usa o plano e o ciclo da assinatura que já existe
      if (modoTrocar) {
        let reg = null;
        try { reg = JSON.parse(localStorage.getItem(CHAVE_ASSINATURA)); } catch (e) { reg = null; }
        const chaveReg = String((reg && reg.plano) || "").toUpperCase();
        if (!reg || !chaveReg || chaveReg === "FREE") {
          podeContinuar = false;
          window.location.replace(PAGINA_PAINEL); // sem assinatura paga, não há o que trocar
        } else {
          if (PLANOS[chaveReg]) planoEscolhido = chaveReg;
          if (reg.ciclo === "anual" || reg.ciclo === "mensal") ciclo = reg.ciclo;
        }
      }
      // Renovar pelo Pix: usa o plano e o ciclo da assinatura que já existe e só oferece o Pix
      if (modoRenovar) {
        let reg = null;
        try { reg = JSON.parse(localStorage.getItem(CHAVE_ASSINATURA)); } catch (e) { reg = null; }
        const chaveReg = String((reg && reg.plano) || "").toUpperCase();
        if (!reg || !chaveReg || chaveReg === "FREE") {
          podeContinuar = false;
          window.location.replace(PAGINA_PAINEL); // sem assinatura paga, não há o que renovar
        } else {
          if (PLANOS[chaveReg]) planoEscolhido = chaveReg;
          if (reg.ciclo === "anual" || reg.ciclo === "mensal") ciclo = reg.ciclo;
          renovarBase = reg.validoAte ? new Date(reg.validoAte) : null;
          const radioPix = document.querySelector('input[name="metodo"][value="pix"]');
          if (radioPix) {
            radioPix.checked = true;
            radioPix.dispatchEvent(new Event("change")); // mostra o painel do Pix
            document.querySelectorAll(".metodo").forEach((l) => { l.hidden = l.querySelector("input") !== radioPix; });
          }
        }
      }
    }
  }

  // Botão "voltar" do topo
  if (params.get("origem") === "painel" || modoTrocar) {
    // Veio da agenda: volta para a agenda (continua logado)
    $("link-voltar").textContent = "Voltar à agenda";
    $("link-voltar").href = PAGINA_PAINEL;
  } else {
    // Veio da tela de planos do site: sai da conta e volta para o login, mantendo o plano escolhido
    $("link-voltar").textContent = "Voltar ao login";
    $("link-voltar").href = PAGINA_CADASTRO + "?modo=entrar&plano=" + planoUrl.toLowerCase();
    $("link-voltar").addEventListener("click", sairDaConta);
  }

  // Botão "Cancelar": desiste da compra (ou da troca) e volta para a agenda/tela de planos
  $("btn-cancelar-compra").addEventListener("click", () => {
    window.location.href = (params.get("origem") === "painel" || modoTrocar) ? PAGINA_PAINEL : PAGINA_PLANOS;
  });

  // Trocar a forma de pagamento e renovar pelo Pix não escolhem data de cobrança
  if ($("campo-prox-cobranca")) $("campo-prox-cobranca").hidden = modoTrocar || modoRenovar;

  if (podeContinuar) atualizarTela();
}

document.addEventListener("DOMContentLoaded", iniciarAssinatura);