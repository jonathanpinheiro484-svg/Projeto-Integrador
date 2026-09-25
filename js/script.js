document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('container');
    const registerBtn = document.getElementById('register');
    const loginBtn = document.getElementById('login');

    if (registerBtn && loginBtn && container) {
        // Alterna para a aba de Cadastro
        registerBtn.addEventListener('click', () => {
            container.classList.add('active');
        });

        // Alterna para a aba de Entrar
        loginBtn.addEventListener('click', () => {
            container.classList.remove('active');
        });
    }

    // Lê se veio o parâmetro ?mode=signup para abrir no cadastro
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'signup' && container) {
        container.classList.add('active');
    }

    // Redirecionamento ao Clicar/Submeter o formulário de ENTRAR
    const signInForm = document.querySelector('.sign-in form');
    if (signInForm) {
        signInForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Impede o recarregamento padrão
            // Define o plano padrão como Grátis
            localStorage.setItem('planoContratado', 'Plano Básico (Grátis)');
            // Redireciona para a tela do sistema
            window.location.href = 'agenda.html'; // Altere para o nome correto do seu ficheiro da dashboard/agenda
        });
    }

    // Redirecionamento ao Clicar/Submeter o formulário de CADASTRAR
    const signUpForm = document.querySelector('.sign-up form');
    if (signUpForm) {
        signUpForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Impede o recarregamento padrão
            // Define o plano padrão como Grátis
            localStorage.setItem('planoContratado', 'Plano Básico (Grátis)');
            // Redireciona para a tela do sistema
            window.location.href = 'agenda.html'; // Altere para o nome correto do seu ficheiro da dashboard/agenda
        });
    }
});
// ----------------------------------------------------------------


