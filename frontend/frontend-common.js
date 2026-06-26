/**
 * Utilities common to frontend pages (PWA and UX helpers).
 *
 * - Exports `showFeedback()` which wraps the toast library and centralizes
 *   presentation and styles so pages don't need to duplicate code.
 *
 * Notes for maintainers:
 * - Keep `sw.js` in sync with caching rules when adding new static assets.
 * - Avoid using native `alert()` in PWA flows; prefer `showFeedback()`.
 */

import { preloadToastify, showToastWithToastify } from './src/utils/toastifyLoader.js';


// Função utilitária para exibir feedbacks (Evite alertas nativos em PWAs)
function writeFallbackMessage(message, isError = false) {
    const target = document.querySelector('[data-feedback]');
    if (!target) return;
    target.textContent = message;
    target.className = `form-feedback is-visible${isError ? ' is-error' : ''}`;
}

export const showFeedback = (message, isError = false) => {
    try {
        if (showToastWithToastify(message, { duration: 4000, isError })) {
            return;
        }
    } catch (error) {
        // fallback below
    }
    preloadToastify()
        .then(() => {
            showToastWithToastify(message, { duration: 4000, isError });
        })
        .catch(() => {
            writeFallbackMessage(message, isError);
        });
};
