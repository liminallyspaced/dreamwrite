/**
 * Side / secondary view renderers — scenes, cards, cast, locations, title.
 * Extracted from app.js (continuous split).
 */
import { escapeHtml, escapeAttr, safeColor } from '../shared/text.js';

/**
 * @param {HTMLElement} list
 * @param {object} project
 * @param {{ setView: Function, focusBlock: Function }} api
 */
export function renderScenesPanel(list, project, api) {
  if (!list) return;
  list.innerHTML = '';
  let n = 0;
  (project.blocks || []).forEach((b) => {
    if (b.type !== 'scene') return;
    n += 1;
    const item = document.createElement('div');
    item.className = 'scene-item';
    item.dataset.blockId = b.id;
    item.innerHTML = `<div class="scene-num">SCENE ${n}</div><div class="scene-title">${escapeHtml(b.text || 'Untitled scene')}</div>`;
    item.onclick = () => {
      api.setView('script');
      api.focusBlock(b.id, true);
      item.scrollIntoView({ block: 'nearest' });
    };
    list.appendChild(item);
  });
  if (!n) {
    list.innerHTML = `<div style="padding:12px;color:var(--text-faint);font-size:12px">No scenes yet. Add a Scene Heading (Ctrl+1) or press +.</div>`;
  }
}

/**
 * @param {string|null} blockId
 * @param {object} project
 * @param {(id: string) => number} indexOfBlock
 */
export function highlightSceneForBlock(blockId, project, indexOfBlock) {
  const idx = indexOfBlock(blockId);
  let sceneId = null;
  for (let i = idx; i >= 0; i--) {
    if (project.blocks[i]?.type === 'scene') {
      sceneId = project.blocks[i].id;
      break;
    }
  }
  document.querySelectorAll('.scene-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.blockId === sceneId);
  });
}

/**
 * @param {HTMLElement} board
 * @param {object} project
 * @param {{ exec: Function }} api
 */
export function renderCardsPanel(board, project, api) {
  if (!board) return;
  board.innerHTML = '';
  const cards = project.cards || [];
  if (!cards.length) {
    board.innerHTML = `<div style="grid-column:1/-1;color:var(--text-faint);padding:24px">No cards yet. Click “Sync from scenes” or add a beat card.</div>`;
    return;
  }
  cards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = card.orphaned ? 'card orphaned' : 'card';
    const swatch = safeColor(card.color);
    el.innerHTML = `
      <div class="card-top">
        <span class="card-swatch" style="background:${swatch}"></span>
        <span class="card-num">#${card.number || i + 1}</span>
        ${card.orphaned ? '<span class="card-orphan-tag" title="This card&#39;s scene is no longer in the script. Your notes were kept.">no scene</span>' : ''}
      </div>
      <input class="card-title-input" value="${escapeAttr(card.title || '')}" />
      <textarea class="card-summary" placeholder="What happens / emotional beat…">${escapeHtml(card.summary || '')}</textarea>
      <input class="card-beat" placeholder="Story beat (setup, turn, climax…)" value="${escapeAttr(card.beat || '')}" />
    `;
    el.querySelector('.card-title-input').oninput = (e) => {
      api.exec(
        'cards.update',
        { id: card.id, patch: { title: e.target.value } },
        { mergeKey: `card:${card.id}:title`, label: 'Edit card' }
      );
    };
    el.querySelector('.card-summary').oninput = (e) => {
      api.exec(
        'cards.update',
        { id: card.id, patch: { summary: e.target.value } },
        { mergeKey: `card:${card.id}:summary`, label: 'Edit card' }
      );
    };
    el.querySelector('.card-beat').oninput = (e) => {
      api.exec(
        'cards.update',
        { id: card.id, patch: { beat: e.target.value } },
        { mergeKey: `card:${card.id}:beat`, label: 'Edit card' }
      );
    };
    board.appendChild(el);
  });
}

/**
 * @param {HTMLElement} root
 * @param {object} project
 * @param {{ exec: Function, onChanged: () => void }} api
 */
export function renderCharactersPanel(root, project, api) {
  if (!root) return;
  root.innerHTML = '';
  const list = project.characters || [];
  if (!list.length) {
    root.innerHTML = `<div style="color:var(--text-faint);font-size:13px">No characters yet. Write dialogue or click Scan script.</div>`;
    return;
  }
  list.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'entity';
    el.innerHTML = `
      <div class="entity-head">
        <strong>${escapeHtml(c.name || 'Unnamed')}</strong>
        <button class="ghost danger-del">Delete</button>
      </div>
      <div class="fields">
        <input data-f="name" value="${escapeAttr(c.name || '')}" placeholder="NAME" />
        <input data-f="role" value="${escapeAttr(c.role || '')}" placeholder="Role (protagonist, foil…)" />
        <textarea data-f="description" placeholder="Description / look / want">${escapeHtml(c.description || '')}</textarea>
        <textarea data-f="notes" placeholder="Notes">${escapeHtml(c.notes || '')}</textarea>
      </div>
    `;
    el.querySelectorAll('[data-f]').forEach((input) => {
      input.addEventListener('input', () => {
        const field = input.dataset.f;
        api.exec(
          'bible.updateCharacter',
          { id: c.id, patch: { [field]: input.value } },
          { mergeKey: `char:${c.id}:${field}`, label: 'Edit character' }
        );
        if (field === 'name') {
          el.querySelector('strong').textContent = input.value || 'Unnamed';
        }
      });
    });
    el.querySelector('.danger-del').onclick = () => {
      api.exec('bible.removeCharacter', { id: c.id }, { label: 'Delete character' });
      api.onChanged();
    };
    root.appendChild(el);
  });
}

/**
 * @param {HTMLElement} root
 * @param {object} project
 * @param {{ exec: Function, onChanged: () => void }} api
 */
export function renderLocationsPanel(root, project, api) {
  if (!root) return;
  root.innerHTML = '';
  const list = project.locations || [];
  if (!list.length) {
    root.innerHTML = `<div style="color:var(--text-faint);font-size:13px">No locations yet. Add scene headings or click Scan script.</div>`;
    return;
  }
  list.forEach((loc) => {
    const el = document.createElement('div');
    el.className = 'entity';
    el.innerHTML = `
      <div class="entity-head">
        <strong>${escapeHtml(loc.name || 'Unnamed')}</strong>
        <button class="ghost danger-del">Delete</button>
      </div>
      <div class="fields">
        <input data-f="name" value="${escapeAttr(loc.name || '')}" placeholder="Location name" />
        <input data-f="intExt" value="${escapeAttr(loc.intExt || '')}" placeholder="INT / EXT / I-E" />
        <input data-f="times" value="${escapeAttr((loc.times || []).join(', '))}" placeholder="Times of day" />
        <textarea data-f="notes" placeholder="Notes / production">${escapeHtml(loc.notes || '')}</textarea>
      </div>
    `;
    el.querySelectorAll('[data-f]').forEach((input) => {
      input.addEventListener('input', () => {
        const field = input.dataset.f;
        const patch =
          field === 'times'
            ? { times: input.value.split(',').map((s) => s.trim()).filter(Boolean) }
            : { [field]: input.value };
        api.exec(
          'bible.updateLocation',
          { id: loc.id, patch },
          { mergeKey: `loc:${loc.id}:${field}`, label: 'Edit location' }
        );
        if (field === 'name') el.querySelector('strong').textContent = input.value || 'Unnamed';
      });
    });
    el.querySelector('.danger-del').onclick = () => {
      api.exec('bible.removeLocation', { id: loc.id }, { label: 'Delete location' });
      api.onChanged();
    };
    root.appendChild(el);
  });
}

/**
 * @param {object} project
 * @param {(sel: string) => HTMLElement|null} $
 */
export function renderTitleFormPanel(project, $) {
  const tp = project.titlePage || {};
  const t = $('#tpTitle');
  const a = $('#tpAuthor');
  const b = $('#tpBased');
  const d = $('#tpDate');
  const c = $('#tpContact');
  if (t) t.value = tp.title || '';
  if (a) a.value = tp.writtenBy || '';
  if (b) b.value = tp.basedOn || '';
  if (d) d.value = tp.draftDate || '';
  if (c) c.value = tp.contact || '';
  paintTitlePreview(project, $);
}

/**
 * @param {object} project
 * @param {(sel: string) => HTMLElement|null} $
 */
export function paintTitlePreview(project, $) {
  const tp = project.titlePage || {};
  const title = $('#tpPrevTitle');
  const author = $('#tpPrevAuthor');
  const based = $('#tpPrevBased');
  const date = $('#tpPrevDate');
  const contact = $('#tpPrevContact');
  if (title) title.textContent = (tp.title || 'Untitled').toUpperCase();
  if (author) author.textContent = tp.writtenBy || '';
  if (based) {
    if (tp.basedOn) {
      based.hidden = false;
      based.textContent = `Based on ${tp.basedOn}`;
    } else {
      based.hidden = true;
      based.textContent = '';
    }
  }
  if (date) date.textContent = tp.draftDate || '';
  if (contact) contact.textContent = tp.contact || '';
}

/**
 * @param {object} project
 * @param {(sel: string) => HTMLElement|null} $
 * @param {{ exec: Function, updateChrome: Function }} api
 */
export function syncTitleFromForm(project, $, api) {
  api.exec(
    'meta.setTitlePage',
    {
      titlePage: {
        ...(project.titlePage || {}),
        title: $('#tpTitle')?.value || '',
        writtenBy: $('#tpAuthor')?.value || '',
        basedOn: $('#tpBased')?.value || '',
        draftDate: $('#tpDate')?.value || '',
        contact: $('#tpContact')?.value || '',
      },
    },
    { mergeKey: 'meta:title', label: 'Title page' }
  );
  paintTitlePreview(project, $);
  api.updateChrome();
}
