// Tela de abertura (teste). Aparece sempre que a página carrega.
const intro = document.getElementById("intro");

if (intro) {
    document.body.classList.add("intro-ativa");

    setTimeout(() => {
        intro.classList.add("sair");

        setTimeout(() => {
            intro.remove();
            document.body.classList.remove("intro-ativa");
        }, 900);
    }, 2000);
}