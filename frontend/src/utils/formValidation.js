const getFieldLabel = (control) => {
  const field = control.closest('.field, label.field.checkbox');
  if (!field) {
    return control.getAttribute('aria-label') || control.getAttribute('name') || 'Campo obrigatório';
  }

  const label = field.querySelector('label');
  if (label) {
    return label.textContent.replace(/\*/g, '').trim();
  }

  const inlineText = field.querySelector('span');
  if (inlineText) {
    return inlineText.textContent.replace(/\*/g, '').trim();
  }

  return control.getAttribute('aria-label') || control.getAttribute('name') || 'Campo obrigatório';
};

export const buildRequiredFieldsMessage = (labels) => {
  if (!labels.length) return '';
  if (labels.length === 1) return `Preencha o campo obrigatório: ${labels[0]}.`;
  return `Preencha os campos obrigatórios: ${labels.join(', ')}.`;
};

export const validateFormInDomOrder = ({ form, notify, feedbackElementId }) => {
  if (!form) return true;

  const controls = Array.from(form.querySelectorAll('input, select, textarea'));
  const invalidControls = controls.filter((control) => {
    if (control.disabled || control.type === 'hidden') return false;
    if (typeof control.checkValidity !== 'function') return false;
    return !control.checkValidity();
  });

  const labels = invalidControls.map(getFieldLabel);
  if (!labels.length) {
    if (feedbackElementId && typeof document !== 'undefined') {
      const feedback = document.getElementById(feedbackElementId);
      if (feedback) {
        feedback.textContent = '';
        feedback.className = 'form-feedback';
      }
    }
    return true;
  }

  const message = buildRequiredFieldsMessage(labels);
  notify?.(message, { type: 'error', duration: 3500, fallbackTargetId: feedbackElementId || 'app-feedback' });

  if (feedbackElementId && typeof document !== 'undefined') {
    const feedback = document.getElementById(feedbackElementId);
    if (feedback) {
      feedback.textContent = message;
      feedback.className = 'form-feedback is-visible is-error';
    }
  }

  const firstInvalid = invalidControls[0];
  const target = firstInvalid.closest('.field, label.field.checkbox') || firstInvalid;
  target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  firstInvalid.focus?.();
  return false;
};
