/**
 * Project library home — cover grid (AethelReader-inspired).
 * Phase 10.
 */
import {
  loadLibrary,
  removeLibraryEntry,
  updateLibraryEntry,
  duplicateLibraryEntry,
  THEMES,
} from '../../core/library/catalog.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   onNew: () => void,
 *   onOpen: () => void,
 *   onImport: () => void,
 *   onSample: () => void,
 *   onOpenEntry: (entry: object) => void,
 *   onTheme: (themeId: string) => void,
 *   getTheme: () => string,
 * }} handlers
 */
export function mountLibraryView(root, handlers) {
  if (!root) return { render() {}, destroy() {} };

  function render() {
    const entries = loadLibrary();
    const theme = handlers.getTheme?.() || 'carbon';
    root.innerHTML = `
      <div class="lib-shell">
        <header class="lib-head">
          <div class="lib-brand">
            <img src="../assets/ICON-DreamWrite.png" alt="" width="40" height="40" onerror="this.style.display='none'" />
            <div>
              <p class="lib-eyebrow">DreamWrite</p>
              <h1>Library</h1>
            </div>
          </div>
          <div class="lib-actions">
            <label class="lib-theme-label">Theme
              <select id="libTheme" aria-label="Theme">
                ${THEMES.map(
                  (t) =>
                    `<option value="${t.id}" ${t.id === theme ? 'selected' : ''}>${t.label}</option>`
                ).join('')}
              </select>
            </label>
            <button type="button" class="primary" data-lib="new">New</button>
            <button type="button" data-lib="open">Open…</button>
            <button type="button" data-lib="import">Import</button>
            <button type="button" class="ghost" data-lib="sample">Sample</button>
          </div>
        </header>
        <section class="lib-section">
          <h2>Recent projects</h2>
          ${
            entries.length
              ? `<div class="lib-grid" role="list">${entries.map(cardHtml).join('')}</div>`
              : `<p class="lib-empty muted">No recent projects yet. Start a new screenplay or open a folder from Documents/DreamWrite.</p>`
          }
        </section>
      </div>`;

    root.querySelector('[data-lib="new"]').onclick = () => handlers.onNew();
    root.querySelector('[data-lib="open"]').onclick = () => handlers.onOpen();
    root.querySelector('[data-lib="import"]').onclick = () => handlers.onImport();
    root.querySelector('[data-lib="sample"]').onclick = () => handlers.onSample();
    root.querySelector('#libTheme').onchange = (e) => handlers.onTheme(e.target.value);

    root.querySelectorAll('.lib-card').forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('.lib-card-main')?.addEventListener('click', () => {
        const entry = loadLibrary().find((e) => e.id === id);
        if (entry) handlers.onOpenEntry(entry);
      });
      card.querySelector('[data-act="cover"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        pickCover(id);
      });
      card.querySelector('[data-act="rename"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const entry = loadLibrary().find((x) => x.id === id);
        if (!entry) return;
        const title = await promptTitle(entry.title);
        if (title != null && title.trim()) {
          updateLibraryEntry(id, { title: title.trim() });
          render();
        }
      });
      card.querySelector('[data-act="dup"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        duplicateLibraryEntry(id);
        render();
      });
      card.querySelector('[data-act="del"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        // Undo-first: remove + toast
        const entry = loadLibrary().find((x) => x.id === id);
        removeLibraryEntry(id);
        render();
        if (entry && handlers.onDeleted) handlers.onDeleted(entry);
      });
    });
  }

  function cardHtml(e) {
    const cover = e.coverDataUrl
      ? `<img class="lib-cover-img" src="${escapeAttr(e.coverDataUrl)}" alt="" />`
      : `<div class="lib-cover-fallback"><span>${escapeHtml((e.title || '?').slice(0, 1).toUpperCase())}</span></div>`;
    const meta = [
      e.pageCount ? `${e.pageCount}p` : null,
      e.sceneCount ? `${e.sceneCount} sc` : null,
      e.kind || '',
    ]
      .filter(Boolean)
      .join(' · ');
    const when = e.lastOpened ? new Date(e.lastOpened).toLocaleString() : '';
    return `
      <article class="lib-card" data-id="${escapeAttr(e.id)}" role="listitem">
        <button type="button" class="lib-card-main">
          <div class="lib-cover">${cover}</div>
          <div class="lib-card-body">
            <strong class="lib-card-title">${escapeHtml(e.title || 'Untitled')}</strong>
            <span class="lib-card-meta muted">${escapeHtml(meta)}</span>
            <span class="lib-card-when muted">${escapeHtml(when)}</span>
          </div>
        </button>
        <div class="lib-card-ops">
          <button type="button" class="ghost" data-act="cover" title="Cover image">Cover</button>
          <button type="button" class="ghost" data-act="rename" title="Rename">Rename</button>
          <button type="button" class="ghost" data-act="dup" title="Duplicate entry">Dup</button>
          <button type="button" class="ghost" data-act="del" title="Remove from library">Remove</button>
        </div>
      </article>`;
  }

  function pickCover(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        updateLibraryEntry(id, { coverDataUrl: String(reader.result || '') });
        render();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function promptTitle(current) {
    if (handlers.promptTitle) return handlers.promptTitle(current);
    // Fallback when app does not inject promptModal
    return Promise.resolve(current);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  return {
    render,
    destroy() {
      root.innerHTML = '';
    },
  };
}
