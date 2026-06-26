/**
 * Página que consome o token de reset enviado por e-mail e atualiza a senha.
 *
 * Validações cliente (UX):
 * - Confirmação de senha igual.
 * - Comprimento mínimo de 8 caracteres.
 * - Verificação do limite de 72 bytes (UTF-8) para compatibilidade com bcrypt.
 *
 * Observação de segurança: todas as validações críticas também ocorrem no
 * servidor; aqui são principalmente para melhor experiência do usuário.
 */
import { showFeedback } from '/frontend-common.js';

function getQueryParams() {
    const qs = new URLSearchParams(window.location.search);
    return {
        token: qs.get('token'),
        login: qs.get('login'),
    };
}

const form = document.querySelector('.reset-form');
if (!form) {
    // Nada a fazer se o formulário não estiver presente na página
    console.debug('reset-password: form not found');
} else {
    const { token } = getQueryParams();
    const tokenInput = document.getElementById('reset-token');
    if (tokenInput && token) {
        tokenInput.value = token;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentToken = document.getElementById('reset-token').value.trim();
        const senha = document.getElementById('new-password').value;
        const confirma = document.getElementById('new-password-confirm').value;

        if (!currentToken) return showFeedback('Informe o token de redefinição.', true);
        if (senha !== confirma) return showFeedback('As senhas não coincidem.', true);
        if (senha.length < 8) return showFeedback('A senha deve ter ao menos 8 caracteres.', true);
        if (new TextEncoder().encode(senha).length > 72)
            return showFeedback('A senha excede o limite de 72 bytes (após UTF-8). Use uma senha menor.', true);

        const btn = form.querySelector('button');
        btn.disabled = true;
        btn.innerText = 'Redefinindo...';

        try {
            const resp = await fetch('/auth/reset-senha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: currentToken, senha }),
            });

            const data = await resp.json();
            if (resp.ok) {
                showFeedback(data.message || 'Senha atualizada.');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 1200);
            } else {
                showFeedback(data.detail || data.message || 'Falha ao atualizar senha.', true);
            }
        } catch (err) {
            showFeedback('Erro de conexão. Tente novamente.', true);
        } finally {
            btn.disabled = false;
            btn.innerText = 'Redefinir senha';
        }
    });
}
