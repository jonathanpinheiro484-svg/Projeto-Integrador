// =====================================================
// BOTÃO FLUTUANTE DE WHATSAPP
// Usado em: agenda.html (pode ser usado em qualquer página).
// Não depende de nenhum outro arquivo: injeta o próprio CSS e HTML.
//
// Como funciona (100% no front, sem tocar na API):
//   - botão verde fixo no canto inferior direito;
//   - ao clicar, abre um cartão com o aviso e o botão "Iniciar conversa";
//   - "Iniciar conversa" abre o WhatsApp (app ou web) no número configurado;
//   - "Configurar número" (link vermelho) deixa salvar/trocar o número.
//
// Uso:
//   WhatsAppFlutuante.iniciar({ permitirConfigurar: true });
//   WhatsAppFlutuante.mostrar(true);   // aparece
//   WhatsAppFlutuante.mostrar(false);  // some
//
// Em outra página, com número fixo (sem "Configurar número"):
//   WhatsAppFlutuante.iniciar({ numero: "11912345678", permitirConfigurar: false });
//   WhatsAppFlutuante.mostrar(true);
// =====================================================
(function () {
  const CHAVE_NUMERO = "whatsappNumeroFlutuante";

  const config = {
    numero: "11912499740",
    mensagem: "Olá! Gostaria de falar com vocês.",
    permitirConfigurar: false,
  };

  let raiz = null;       // elemento principal
  let iniciado = false;

  // ---------- Telefone ----------
  // Devolve só os números com DDD (10 ou 11 dígitos) ou "" se for inválido
  function telefoneValido(valor) {
    const d = String(valor || "").replace(/\D/g, "");
    if (d.length < 10 || d.length > 11) return "";
    if (/^(\d)\1+$/.test(d)) return "";
    if (Number(d.slice(0, 2)) < 11) return "";
    if (d.length === 11 && d[2] !== "9") return "";
    return d;
  }

  function formatarTelefone(valor) {
    const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function lerNumeroSalvo() {
    try { return localStorage.getItem(CHAVE_NUMERO) || ""; } catch (e) { return ""; }
  }
  function numeroAtual() {
    return telefoneValido(config.numero) || telefoneValido(lerNumeroSalvo());
  }

  // ---------- CSS ----------
  const CSS = `
  .wa-flutuante { position: fixed; right: 20px; bottom: 20px; z-index: 900; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; font-family: inherit; }
  .wa-flutuante[hidden] { display: none; }
  .wa-botao { width: 52px; height: 52px; border-radius: 10px; border: 2px solid rgba(255,255,255,.55); background: #3d9a45; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,.35); transition: transform .15s ease, background .15s ease; padding: 0; }
  .wa-botao:hover { background: #2f8537; transform: translateY(-2px); }
  .wa-botao:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
  .wa-botao svg { width: 30px; height: 30px; fill: currentColor; }
  .wa-cartao { width: 270px; max-width: calc(100vw - 40px); background: #fff; color: #1f2430; border-radius: 12px; padding: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.3); font-size: 13px; line-height: 1.45; text-align: left; }
  .wa-cartao[hidden] { display: none; }
  .wa-cartao h4 { margin: 0 0 6px; font-size: 14px; color: #1f2430; }
  .wa-cartao p { margin: 0 0 12px; color: #4a5160; }
  .wa-iniciar { display: block; width: 100%; background: #25d366; color: #fff; border: none; border-radius: 8px; padding: 10px 12px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
  .wa-iniciar:hover { background: #1ebe5b; }
  .wa-config-link { display: inline-block; margin-top: 8px; padding: 0; background: none; border: none; color: #d32f2f; font-size: 12px; cursor: pointer; font-family: inherit; text-decoration: none; }
  .wa-config-link:hover { text-decoration: underline; }
  .wa-cartao .wa-numero-atual { margin: 8px 0 0; font-size: 11px; color: #7a8190; }
  .wa-config label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
  .wa-config input { width: 100%; border: 1px solid #cfd4de; border-radius: 7px; padding: 9px 10px; font-size: 13px; font-family: inherit; color: #1f2430; background: #fff; }
  .wa-config input:focus { outline: 2px solid #25d366; border-color: #25d366; }
  .wa-erro { color: #d32f2f; font-size: 11px; margin: 6px 0 0; min-height: 14px; }
  .wa-linha { display: flex; gap: 8px; margin-top: 10px; }
  .wa-linha button { flex: 1; border-radius: 8px; padding: 9px 10px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
  .wa-salvar { background: #25d366; color: #fff; border: none; }
  .wa-salvar:hover { background: #1ebe5b; }
  .wa-cancelar { background: #fff; color: #1f2430; border: 1px solid #cfd4de; }
  @media (max-width: 480px) { .wa-flutuante { right: 12px; bottom: 12px; } }
  `;

  // Logo do WhatsApp (SVG)
  const SVG_WHATSAPP = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.52.146-.181.194-.301.297-.497.1-.21.05-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.18 2.095 3.195 5.076 4.483.709.3 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.123-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';

  // ---------- Montagem ----------
  function montar() {
    if (raiz) return;

    const estilo = document.createElement("style");
    estilo.id = "wa-flutuante-css";
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    raiz = document.createElement("div");
    raiz.className = "wa-flutuante";
    raiz.id = "wa-flutuante";
    raiz.hidden = true;
    raiz.innerHTML = `
      <div class="wa-cartao" id="wa-cartao" role="dialog" aria-label="Conversar pelo WhatsApp" hidden>
        <div id="wa-vista-inicio">
          <h4>Fale pelo WhatsApp</h4>
          <p>A conversa será direcionada para o WhatsApp Web ou App.</p>
          <button type="button" class="wa-iniciar" id="wa-iniciar">Iniciar conversa</button>
          <p class="wa-numero-atual" id="wa-numero-atual"></p>
          <button type="button" class="wa-config-link" id="wa-abrir-config">Configurar número</button>
        </div>
        <div class="wa-config" id="wa-vista-config" hidden>
          <h4>Configurar número</h4>
          <label for="wa-input-numero">WhatsApp (com DDD)</label>
          <input type="tel" id="wa-input-numero" placeholder="(11) 91234-5678" inputmode="tel" maxlength="15" autocomplete="off">
          <p class="wa-erro" id="wa-erro" role="alert"></p>
          <div class="wa-linha">
            <button type="button" class="wa-salvar" id="wa-salvar">Salvar</button>
            <button type="button" class="wa-cancelar" id="wa-cancelar">Cancelar</button>
          </div>
        </div>
      </div>
      <button type="button" class="wa-botao" id="wa-botao" aria-label="Abrir conversa pelo WhatsApp" aria-expanded="false" aria-controls="wa-cartao">${SVG_WHATSAPP}</button>
    `;
    document.body.appendChild(raiz);

    const $ = (id) => document.getElementById(id);
    const cartao = $("wa-cartao");
    const botao = $("wa-botao");
    const vistaInicio = $("wa-vista-inicio");
    const vistaConfig = $("wa-vista-config");
    const campo = $("wa-input-numero");
    const erro = $("wa-erro");

    function atualizarTextoNumero() {
      const n = numeroAtual();
      $("wa-numero-atual").textContent = n ? `Número: ${formatarTelefone(n)}` : "Nenhum número configurado ainda.";
    }

    function mostrarInicio() {
      vistaConfig.hidden = true;
      vistaInicio.hidden = false;
      atualizarTextoNumero();
      $("wa-abrir-config").hidden = !config.permitirConfigurar;
    }

    function mostrarConfig() {
      vistaInicio.hidden = true;
      vistaConfig.hidden = false;
      erro.textContent = "";
      campo.value = formatarTelefone(numeroAtual());
      campo.focus();
    }

    function abrirCartao() {
      cartao.hidden = false;
      botao.setAttribute("aria-expanded", "true");
      // Sem número configurado: já abre direto na configuração (se puder configurar)
      if (!numeroAtual() && config.permitirConfigurar) mostrarConfig();
      else mostrarInicio();
    }

    function fecharCartao() {
      cartao.hidden = true;
      botao.setAttribute("aria-expanded", "false");
    }

    botao.addEventListener("click", () => { cartao.hidden ? abrirCartao() : fecharCartao(); });

    $("wa-iniciar").addEventListener("click", () => {
      const n = numeroAtual();
      if (!n) {
        if (config.permitirConfigurar) mostrarConfig();
        return;
      }
      const url = `https://wa.me/55${n}?text=${encodeURIComponent(config.mensagem)}`;
      window.open(url, "_blank", "noopener");
      fecharCartao();
    });

    $("wa-abrir-config").addEventListener("click", mostrarConfig);
    $("wa-cancelar").addEventListener("click", () => { numeroAtual() ? mostrarInicio() : fecharCartao(); });

    campo.addEventListener("input", () => { campo.value = formatarTelefone(campo.value); erro.textContent = ""; });
    campo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("wa-salvar").click(); } });

    $("wa-salvar").addEventListener("click", () => {
      const n = telefoneValido(campo.value);
      if (!n) {
        erro.textContent = "Digite um WhatsApp válido com DDD. Exemplo: (11) 91234-5678";
        campo.focus();
        return;
      }
      try { localStorage.setItem(CHAVE_NUMERO, n); } catch (e) { /* sem armazenamento: usa só nesta sessão */ }
      config.numero = n;
      mostrarInicio();
    });

    // Esc fecha; clicar fora fecha
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !cartao.hidden) { fecharCartao(); botao.focus(); } });
    document.addEventListener("click", (e) => { if (!cartao.hidden && !raiz.contains(e.target)) fecharCartao(); });
  }

  // ---------- API pública ----------
  window.WhatsAppFlutuante = {
    iniciar(opcoes) {
      Object.assign(config, opcoes || {});
      if (!document.body) {
        document.addEventListener("DOMContentLoaded", () => this.iniciar(opcoes));
        return;
      }
      montar();
      iniciado = true;
    },
    mostrar(visivel) {
      if (!iniciado) this.iniciar();
      if (!raiz) return;
      raiz.hidden = !visivel;
      if (!visivel) {
        const cartao = document.getElementById("wa-cartao");
        if (cartao) cartao.hidden = true;
      }
    },
  };
})();