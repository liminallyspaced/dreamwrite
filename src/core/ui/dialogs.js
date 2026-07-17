/**
 * Non-blocking ink dialogs + toast — replaces alert()/confirm().
 * Phase 10.
 */

let host = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.id = 'dwDialogHost';
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

/**
 * Toast (undo-first feedback).
 * @param {string} message
 * @param {{ actionLabel?: string, onAction?: () => void, ms?: number }} [opts]
 */
export function toast(message, opts = {}) {
  const root = ensureHost();
  const el = document.createElement('div');
  el.className = 'dw-toast';
  el.innerHTML = `<span class="dw-toast-msg"></span>`;
  el.querySelector('.dw-toast-msg').textContent = message;
  if (opts.actionLabel && opts.onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost dw-toast-action';
    btn.textContent = opts.actionLabel;
    btn.onclick = () => {
      opts.onAction();
      el.remove();
    };
    el.appendChild(btn);
  }
  root.appendChild(el);
  const ms = opts.ms ?? 4200;
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 280);
  }, ms);
  return el;
}

/**
 * Modal confirm. Resolves true/false.
 * @param {string} message
 * @param {{ title?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmModal(message, opts = {}) {
  return new Promise((resolve) => {
    const root = ensureHost();
    const backdrop = document.createElement('div');
    backdrop.className = 'dw-modal-backdrop show';
    backdrop.innerHTML = `
      <div class="dw-modal" role="dialog" aria-modal="true">
        <header class="dw-modal-head">
          <h3 class="dw-modal-title"></h3>
        </header>
        <div class="dw-modal-body"></div>
        <footer class="dw-modal-foot">
          <button type="button" class="ghost dw-cancel"></button>
          <button type="button" class="primary dw-ok"></button>
        </footer>
      </div>`;
    backdrop.querySelector('.dw-modal-title').textContent = opts.title || 'Confirm';
    backdrop.querySelector('.dw-modal-body').textContent = message;
    backdrop.querySelector('.dw-cancel').textContent = opts.cancelLabel || 'Cancel';
    const ok = backdrop.querySelector('.dw-ok');
    ok.textContent = opts.confirmLabel || 'OK';
    if (opts.danger) ok.classList.add('danger');
    const finish = (v) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    };
    backdrop.querySelector('.dw-cancel').onclick = () => finish(false);
    ok.onclick = () => finish(true);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(false);
    });
    document.addEventListener('keydown', onKey);
    root.appendChild(backdrop);
    ok.focus();
  });
}

/**
 * Modal alert (info only).
 * @param {string} message
 * @param {{ title?: string }} [opts]
 * @returns {Promise<void>}
 */
export function alertModal(message, opts = {}) {
  return confirmModal(message, {
    title: opts.title || 'DreamWrite',
    confirmLabel: 'OK',
    cancelLabel: 'Close',
  }).then(() => {});
}

/**
 * Modal text prompt. Resolves string or null if cancelled.
 * @param {string} message
 * @param {{ title?: string, defaultValue?: string, confirmLabel?: string }} [opts]
 * @returns {Promise<string|null>}
 */
export function promptModal(message, opts = {}) {
  return new Promise((resolve) => {
    const root = ensureHost();
    const backdrop = document.createElement('div');
    backdrop.className = 'dw-modal-backdrop show';
    backdrop.innerHTML = `
      <div class="dw-modal" role="dialog" aria-modal="true">
        <header class="dw-modal-head">
          <h3 class="dw-modal-title"></h3>
        </header>
        <div class="dw-modal-body">
          <p class="dw-modal-msg"></p>
          <input type="text" class="dw-prompt-input" />
        </div>
        <footer class="dw-modal-foot">
          <button type="button" class="ghost dw-cancel">Cancel</button>
          <button type="button" class="primary dw-ok"></button>
        </footer>
      </div>`;
    backdrop.querySelector('.dw-modal-title').textContent = opts.title || 'DreamWrite';
    backdrop.querySelector('.dw-modal-msg').textContent = message;
    const input = backdrop.querySelector('.dw-prompt-input');
    input.value = opts.defaultValue ?? '';
    backdrop.querySelector('.dw-ok').textContent = opts.confirmLabel || 'OK';
    const finish = (v) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(null);
      if (e.key === 'Enter') finish(input.value);
    };
    backdrop.querySelector('.dw-cancel').onclick = () => finish(null);
    backdrop.querySelector('.dw-ok').onclick = () => finish(input.value);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(null);
    });
    document.addEventListener('keydown', onKey);
    root.appendChild(backdrop);
    input.focus();
    input.select();
  });
}
