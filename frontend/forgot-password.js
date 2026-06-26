import { showFeedback } from '/frontend-common.js';

const forgotForm = document.querySelector('.forgot-form');
if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const btn = forgotForm.querySelector('button');
        btn.disabled = true;
        btn.innerText = 'Enviando...';
        try {
            const response = await fetch('/auth/esqueci-senha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.detail || data.message || 'Falha ao solicitar redefinição.');
            }
            showFeedback(data.message || 'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.');
        } catch (error) {
            showFeedback(error.message || 'Erro ao enviar link.', true);
        } finally {
            btn.disabled = false;
            btn.innerText = 'Enviar link';
        }
    });
}
