/**
 * Command palette (Ctrl+K) + shortcuts overlay.
 * Phase 10.
 */
import { KEYMAP, searchKeymap, keymapByGroup } from '../../core/keymap.js';

/**
 * @param {{
 *   run: (action: string) => void,
 *   extraCommands?: Array<{ id: string, label: string, group?: string, action: string, keys?: string }>,
 * }} api
 */
export function createCommandPalette(api) {
  let open = false;
  let el = null;
  let input = null;
  let list = null;
  let index = 0;
  /** @type {Array<{ id: string, label: string, keys?: string, action: string, group?: string }>} */
  let items = [];

  function ensure() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'commandPalette';
    el.className = 'cmd-palette';
    el.hidden = true;
    el.innerHTML = `
      <div class="cmd-palette-panel" role="dialog" aria-label="Command palette">
        <input type="search" class="cmd-input" placeholder="Type a command…" autocomplete="off" />
        <div class="cmd-list" role="listbox"></div>
        <footer class="cmd-foot muted">↑↓ navigate · Enter run · Esc close</footer>
      </div>`;
    document.body.appendChild(el);
    input = el.querySelector('.cmd-input');
    list = el.querySelector('.cmd-list');
    el.addEventListener('click', (e) => {
      if (e.target === el) close();
    });
    input.addEventListener('input', () => paint(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        index = Math.min(index + 1, items.length - 1);
        paint(input.value, true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        index = Math.max(index - 1, 0);
        paint(input.value, true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runSelected();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
  }

  function allCommands() {
    const base = KEYMAP.map((k) => ({
      id: k.id,
      label: k.label,
      keys: k.keys,
      action: k.action,
      group: k.group,
    }));
    return base.concat(api.extraCommands || []);
  }

  function paint(query, keepIndex = false) {
    const q = String(query || '').trim().toLowerCase();
    const pool = allCommands();
    items = q
      ? pool.filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            (c.keys || '').toLowerCase().includes(q) ||
            (c.group || '').toLowerCase().includes(q)
        )
      : pool;
    if (!keepIndex) index = 0;
    if (index >= items.length) index = Math.max(0, items.length - 1);
    list.innerHTML = items
      .map(
        (c, i) =>
          `<button type="button" class="cmd-item ${i === index ? 'active' : ''}" data-i="${i}" role="option">
            <span class="cmd-item-label">${esc(c.label)}</span>
            <span class="cmd-item-keys muted">${esc(c.keys || '')}</span>
          </button>`
      )
      .join('');
    list.querySelectorAll('.cmd-item').forEach((btn) => {
      btn.onmouseenter = () => {
        index = +btn.dataset.i;
        paint(input.value, true);
      };
      btn.onclick = () => {
        index = +btn.dataset.i;
        runSelected();
      };
    });
  }

  function runSelected() {
    const c = items[index];
    if (!c) return;
    close();
    api.run(c.action);
  }

  function openPalette() {
    ensure();
    open = true;
    el.hidden = false;
    paint('');
    input.value = '';
    input.focus();
  }

  function close() {
    if (!el) return;
    open = false;
    el.hidden = true;
  }

  function toggle() {
    if (open) close();
    else openPalette();
  }

  function isOpen() {
    return open;
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  return { open: openPalette, close, toggle, isOpen };
}

/**
 * Shortcuts overlay from keymap groups.
 * @param {HTMLElement} [mount]
 */
export function showShortcutsOverlay(mount) {
  let el = document.getElementById('shortcutsOverlay');
  if (el) {
    el.classList.add('show');
    return el;
  }
  el = document.createElement('div');
  el.id = 'shortcutsOverlay';
  el.className = 'shortcuts-overlay show';
  const groups = keymapByGroup();
  const sections = Object.keys(groups)
    .map((g) => {
      const rows = groups[g]
        .map(
          (k) =>
            `<tr><td><kbd>${esc(k.keys)}</kbd></td><td>${esc(k.label)}</td></tr>`
        )
        .join('');
      return `<section><h4>${esc(g)}</h4><table>${rows}</table></section>`;
    })
    .join('');
  el.innerHTML = `
    <div class="shortcuts-panel" role="dialog" aria-label="Keyboard shortcuts">
      <header>
        <h3>Keyboard shortcuts</h3>
        <button type="button" class="ghost" data-close>Close</button>
      </header>
      <div class="shortcuts-body">${sections}</div>
    </div>`;
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-close]')) {
      el.classList.remove('show');
    }
  });
  (mount || document.body).appendChild(el);
  return el;
}
