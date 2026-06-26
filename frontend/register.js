import { showFeedback } from '/frontend-common.js';

const registerForm = document.querySelector('.register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showFeedback('O cadastro público está desabilitado. Solicite a criação da conta ao administrador.', true);
    });
}
