/**
 * Infinite ink board — notes, scene cards, images, tables, sub-boards, templates.
 */
import { createCamera, screenToWorldX, screenToWorldY, zoomAt, panBy } from '../../core/geom/camera.js';
import {
  ensureProjectBoards,
  createBoardItem,
  breadcrumbPath,
  uid as boardUid,
} from '../../core/board/model.js';
import { listTemplates } from '../../core/board/templates.js';
import {
  normalizeTable,
  setCell as setTableCell,
  resizeTable,
  evaluateCellDisplay,
} from '../../core/board/table.js';
import { platenAssetUrl } from '../../core/project/format-v2.js';

/**
 * @param {HTMLElement} root
 * @param {{
 *   getProject: () => object,
 *   exec: Function,
 *   onJumpToScene: (id: string) => void,
 *   importImage?: () => Promise<{ id: string, mime?: string, ext?: string } | null>,
 *   assetUrl?: (hash: string, ext?: string) => string,
 * }} api
 */
export function mountBoardView(root, api) {
  if (root && root.__platenBoard) {
    root.__platenBoard.setApi(api);
    return root.__platenBoard;
  }
  if (!root) return { render() {}, destroy() {}, setApi() {} };

  const templates = listTemplates();
  root.innerHTML = `
    <div class="bd-toolbar">
      <strong class="section-kicker">Board</strong>
      <nav class="bd-crumbs" aria-label="Board path"></nav>
      <div class="bd-spacer"></div>
      <button type="button" class="primary-soft" data-bd="note">+ Note</button>
      <button type="button" class="ghost" data-bd="image" title="Import image asset">+ Image</button>
      <button type="button" class="ghost" data-bd="table" title="Add table card">+ Table</button>
      <button type="button" class="ghost" data-bd="sync" title="Place a card per scene">Sync scenes</button>
      <button type="button" class="ghost" data-bd="sub">+ Sub-board</button>
      <select class="bd-templates" title="Writing templates" aria-label="Templates">
        <option value="">Template…</option>
        ${templates.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div class="bd-stage" tabindex="0" role="application" aria-label="Story board">
      <div class="bd-grid" aria-hidden="true"></div>
      <div class="bd-layer"></div>
      <div class="bd-empty" hidden>
        <p><strong>Empty board</strong></p>
        <p class="muted">Double-click for a note · Image · Table · Sync scenes · or a template.</p>
      </div>
    </div>
  `;

  const stage = root.querySelector('.bd-stage');
  const layer = root.querySelector('.bd-layer');
  const crumbs = root.querySelector('.bd-crumbs');
  const emptyEl = root.querySelector('.bd-empty');
  let cam = createCamera({ scale: 1, lockY: false, minScale: 0.25, maxScale: 3, panX: 40, panY: 40 });
  let currentBoardId = null;
  let drag = null;
  let panning = null;
  let apiRef = api;

  function setApi(next) {
    apiRef = next;
  }

  function graph() {
    return ensureProjectBoards(apiRef.getProject()).boards;
  }

  function ensureBoardId() {
    const g = graph();
    if (!currentBoardId || !g.boards[currentBoardId]) currentBoardId = g.rootId;
    return currentBoardId;
  }

  function render() {
    const g = graph();
    const boardId = ensureBoardId();
    const board = g.boards[boardId];
    if (!board) return;

    const itemCount = (board.items || []).filter((id) => {
      const it = g.items[id];
      return it && it.type !== 'connector';
    }).length;
    if (emptyEl) emptyEl.hidden = itemCount > 0;

    // Breadcrumbs
    const path = breadcrumbPath(g, boardId);
    crumbs.innerHTML = path
      .map(
        (p, i) =>
          `<button type="button" class="ghost bd-crumb" data-board="${p.id}">${escapeHtml(p.title)}</button>${
            i < path.length - 1 ? '<span class="bd-crumb-sep">/</span>' : ''
          }`
      )
      .join('');
    crumbs.querySelectorAll('.bd-crumb').forEach((btn) => {
      btn.onclick = () => {
        currentBoardId = btn.dataset.board;
        render();
      };
    });

    layer.innerHTML = '';
    layer.style.transform = `translate(${cam.panX}px, ${cam.panY}px) scale(${cam.scale})`;
    layer.style.transformOrigin = '0 0';

    for (const id of board.items || []) {
      const it = g.items[id];
      if (!it || it.type === 'connector') continue;
      const el = document.createElement('div');
      el.className = `bd-card type-${it.type}`;
      el.dataset.id = it.id;
      el.style.left = `${it.x}px`;
      el.style.top = `${it.y}px`;
      el.style.width = `${it.w}px`;
      el.style.minHeight = `${it.h}px`;
      el.style.background = it.color || '#f5f0e6';

      if (it.type === 'note') {
        el.innerHTML = `
          <input class="bd-card-title" value="${escapeAttr(it.title || '')}" placeholder="Note" />
          <textarea class="bd-card-body" rows="3" placeholder="Write…">${escapeHtml(it.body || '')}</textarea>
        `;
      } else if (it.type === 'scene-card') {
        el.innerHTML = `
          <div class="bd-card-kicker">Scene</div>
          <div class="bd-card-title-static">${escapeHtml(it.title || '')}</div>
          <button type="button" class="ghost bd-open-scene">Open in script</button>
        `;
      } else if (it.type === 'column') {
        el.innerHTML = `<input class="bd-card-title" value="${escapeAttr(it.title || 'Column')}" />`;
        el.classList.add('bd-column');
      } else if (it.type === 'sub-board') {
        el.innerHTML = `
          <div class="bd-card-kicker">Board</div>
          <div class="bd-card-title-static">${escapeHtml(it.title || 'Sub-board')}</div>
          <button type="button" class="ghost bd-open-board">Open →</button>
        `;
      } else if (it.type === 'todo') {
        const tasks = (it.tasks || [])
          .map(
            (t) =>
              `<label class="bd-todo"><input type="checkbox" data-tid="${t.id}" ${t.done ? 'checked' : ''}/> <span>${escapeHtml(t.text || '')}</span></label>`
          )
          .join('');
        el.innerHTML = `<input class="bd-card-title" value="${escapeAttr(it.title || 'To-do')}" />${tasks}`;
      } else if (it.type === 'image') {
        const url =
          it.assetId &&
          (apiRef.assetUrl
            ? apiRef.assetUrl(it.assetId, it.ext || '')
            : platenAssetUrl(it.assetId, it.ext || ''));
        el.innerHTML = `
          <div class="bd-card-kicker">Image</div>
          <input class="bd-card-title" value="${escapeAttr(it.title || 'Image')}" placeholder="Title" />
          ${
            url
              ? `<img class="bd-image" src="${escapeAttr(url)}" alt="${escapeAttr(it.caption || it.title || 'Image')}" draggable="false" />`
              : `<div class="bd-image-missing muted">No asset — re-import</div>`
          }
          <input class="bd-card-caption" value="${escapeAttr(it.caption || '')}" placeholder="Caption" />
          <button type="button" class="ghost bd-replace-image">Replace…</button>
        `;
      } else if (it.type === 'table') {
        const table = normalizeTable(it);
        const rowsHtml = table.cells
          .map((row, ri) => {
            const cells = row
              .map((cell, ci) => {
                const display = evaluateCellDisplay(table, ri, ci);
                if (cell.type === 'checkbox') {
                  return `<td class="bd-td" data-r="${ri}" data-c="${ci}"><input type="checkbox" class="bd-cell-check" ${cell.value ? 'checked' : ''} /></td>`;
                }
                const shown =
                  cell.type === 'number'
                    ? String(cell.value ?? 0)
                    : String(cell.value ?? '');
                const formulaHint =
                  cell.type === 'text' && String(cell.value || '').startsWith('=')
                    ? ` title="= ${escapeAttr(String(display))}"`
                    : '';
                return `<td class="bd-td" data-r="${ri}" data-c="${ci}"${formulaHint}><input class="bd-cell" data-type="${escapeAttr(cell.type)}" value="${escapeAttr(shown)}" /></td>`;
              })
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');
        el.innerHTML = `
          <div class="bd-card-kicker">Table</div>
          <input class="bd-card-title" value="${escapeAttr(it.title || 'Table')}" placeholder="Table" />
          <div class="bd-table-wrap"><table class="bd-table"><tbody>${rowsHtml}</tbody></table></div>
          <div class="bd-table-tools">
            <button type="button" class="ghost bd-tbl-add-row" title="Add row">+ Row</button>
            <button type="button" class="ghost bd-tbl-add-col" title="Add column">+ Col</button>
          </div>
        `;
      } else {
        el.innerHTML = `<div class="bd-card-title-static">${escapeHtml(it.title || it.type)}</div>`;
      }

      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('input, textarea, button, label, select, table, img')) return;
        if (e.button !== 0) return;
        e.stopPropagation();
        drag = {
          id: it.id,
          ox: e.clientX,
          oy: e.clientY,
          x: it.x,
          y: it.y,
        };
        el.setPointerCapture(e.pointerId);
      });

      const titleIn = el.querySelector('.bd-card-title');
      if (titleIn) {
        titleIn.addEventListener('change', () => {
          apiRef.exec(
            'board.updateItem',
            { id: it.id, patch: { title: titleIn.value } },
            { mergeKey: `bd:${it.id}:title` }
          );
        });
      }
      const bodyIn = el.querySelector('.bd-card-body');
      if (bodyIn) {
        bodyIn.addEventListener('change', () => {
          apiRef.exec(
            'board.updateItem',
            { id: it.id, patch: { body: bodyIn.value } },
            { mergeKey: `bd:${it.id}:body` }
          );
        });
      }
      const captionIn = el.querySelector('.bd-card-caption');
      if (captionIn) {
        captionIn.addEventListener('change', () => {
          apiRef.exec(
            'board.updateItem',
            { id: it.id, patch: { caption: captionIn.value } },
            { mergeKey: `bd:${it.id}:caption` }
          );
        });
      }
      el.querySelector('.bd-open-scene')?.addEventListener('click', () => {
        if (it.sceneId) apiRef.onJumpToScene(it.sceneId);
      });
      el.querySelector('.bd-open-board')?.addEventListener('click', () => {
        if (it.targetBoardId) {
          currentBoardId = it.targetBoardId;
          render();
        }
      });
      el.querySelector('.bd-replace-image')?.addEventListener('click', async () => {
        await replaceImageAsset(it.id);
      });

      if (it.type === 'table') {
        el.querySelectorAll('.bd-cell').forEach((input) => {
          input.addEventListener('change', () => {
            const td = input.closest('.bd-td');
            if (!td) return;
            const r = +td.dataset.r;
            const c = +td.dataset.c;
            const type = input.dataset.type || 'text';
            let value = input.value;
            if (type === 'number') value = Number(value) || 0;
            const table = normalizeTable(it);
            const next = setTableCell(table, r, c, { type, value });
            apiRef.exec(
              'board.updateItem',
              {
                id: it.id,
                patch: {
                  rows: next.rows,
                  cols: next.cols,
                  cells: next.cells,
                  colWidths: next.colWidths,
                },
              },
              { mergeKey: `bd:${it.id}:cell:${r}:${c}` }
            );
            render();
          });
        });
        el.querySelectorAll('.bd-cell-check').forEach((input) => {
          input.addEventListener('change', () => {
            const td = input.closest('.bd-td');
            if (!td) return;
            const r = +td.dataset.r;
            const c = +td.dataset.c;
            const table = normalizeTable(it);
            const next = setTableCell(table, r, c, { type: 'checkbox', value: !!input.checked });
            apiRef.exec(
              'board.updateItem',
              { id: it.id, patch: { cells: next.cells } },
              { mergeKey: `bd:${it.id}:check:${r}:${c}` }
            );
          });
        });
        el.querySelector('.bd-tbl-add-row')?.addEventListener('click', () => {
          const table = normalizeTable(it);
          const next = resizeTable(table, table.rows + 1, table.cols);
          apiRef.exec(
            'board.updateItem',
            {
              id: it.id,
              patch: {
                rows: next.rows,
                cols: next.cols,
                cells: next.cells,
                colWidths: next.colWidths,
                h: Math.max(it.h || 120, next.rows * 36 + 56),
              },
            },
            { label: 'Add table row' }
          );
          render();
        });
        el.querySelector('.bd-tbl-add-col')?.addEventListener('click', () => {
          const table = normalizeTable(it);
          const next = resizeTable(table, table.rows, table.cols + 1);
          apiRef.exec(
            'board.updateItem',
            {
              id: it.id,
              patch: {
                rows: next.rows,
                cols: next.cols,
                cells: next.cells,
                colWidths: next.colWidths,
                w: Math.max(it.w || 200, next.cols * 90),
              },
            },
            { label: 'Add table column' }
          );
          render();
        });
      }

      if (it.type === 'sub-board') {
        el.addEventListener('dblclick', () => {
          if (it.targetBoardId) {
            currentBoardId = it.targetBoardId;
            render();
          }
        });
      }

      // Delete key when card focused
      el.tabIndex = 0;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (e.target.closest('input, textarea')) return;
          e.preventDefault();
          apiRef.exec('board.removeItem', { id: it.id }, { label: 'Delete card' });
          render();
        }
      });

      layer.appendChild(el);
    }

    // Connectors as SVG overlay inside layer
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('bd-connectors');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.overflow = 'visible';
    svg.setAttribute('width', '1');
    svg.setAttribute('height', '1');
    for (const id of board.items || []) {
      const c = g.items[id];
      if (!c || c.type !== 'connector') continue;
      const a = g.items[c.fromId];
      const b = g.items[c.toId];
      if (!a || !b) continue;
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h / 2;
      const x2 = b.x + b.w / 2;
      const y2 = b.y + b.h / 2;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (x1 + x2) / 2;
      const d = c.curved
        ? `M ${x1} ${y1} Q ${mx} ${y1} ${mx} ${(y1 + y2) / 2} T ${x2} ${y2}`
        : `M ${x1} ${y1} L ${x2} ${y2}`;
      line.setAttribute('d', d);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', 'rgba(30,25,20,0.45)');
      line.setAttribute('stroke-width', '1.5');
      svg.appendChild(line);
    }
    layer.appendChild(svg);
  }

  function worldDropPoint() {
    return {
      x: Math.round(80 - cam.panX / cam.scale),
      y: Math.round(80 - cam.panY / cam.scale),
    };
  }

  async function replaceImageAsset(itemId) {
    if (!apiRef.importImage) {
      alert('Image import requires the DreamWrite desktop app.');
      return;
    }
    const asset = await apiRef.importImage();
    if (!asset?.id) return;
    apiRef.exec(
      'board.updateItem',
      {
        id: itemId,
        patch: {
          assetId: asset.id,
          mime: asset.mime || 'image/png',
          ext: asset.ext || '.png',
        },
      },
      { label: 'Replace image' }
    );
    render();
  }

  root.querySelector('[data-bd="note"]').onclick = () => {
    const boardId = ensureBoardId();
    const pt = worldDropPoint();
    const item = createBoardItem('note', {
      id: boardUid('bit'),
      boardId,
      x: pt.x,
      y: pt.y,
      title: '',
      body: '',
    });
    apiRef.exec('board.addItem', { boardId, item }, { label: 'Add note' });
    render();
  };
  root.querySelector('[data-bd="image"]').onclick = async () => {
    if (!apiRef.importImage) {
      alert('Image import requires the DreamWrite desktop app.');
      return;
    }
    const asset = await apiRef.importImage();
    if (!asset?.id) return;
    const boardId = ensureBoardId();
    const pt = worldDropPoint();
    const item = createBoardItem('image', {
      id: boardUid('bit'),
      boardId,
      x: pt.x,
      y: pt.y,
      assetId: asset.id,
      mime: asset.mime || 'image/png',
      ext: asset.ext || '.png',
      title: asset.originalName || 'Image',
    });
    apiRef.exec('board.addItem', { boardId, item }, { label: 'Add image' });
    render();
  };
  root.querySelector('[data-bd="table"]').onclick = () => {
    const boardId = ensureBoardId();
    const pt = worldDropPoint();
    const item = createBoardItem('table', {
      id: boardUid('bit'),
      boardId,
      x: pt.x,
      y: pt.y,
      rows: 3,
      cols: 3,
      title: 'Table',
    });
    // Seed a simple SUM demo formula in last cell optional — keep blank
    apiRef.exec('board.addItem', { boardId, item }, { label: 'Add table' });
    render();
  };
  root.querySelector('[data-bd="sync"]').onclick = () => {
    apiRef.exec(
      'board.syncScenes',
      { boardId: ensureBoardId() },
      { label: 'Sync board from scenes' }
    );
    render();
  };
  root.querySelector('[data-bd="sub"]').onclick = () => {
    apiRef.exec(
      'board.createSubBoard',
      { parentBoardId: ensureBoardId(), title: 'Sub-board' },
      { label: 'Create sub-board' }
    );
    render();
  };
  root.querySelector('.bd-templates').onchange = (e) => {
    const id = e.target.value;
    if (!id) return;
    const name = listTemplates().find((t) => t.id === id)?.name || id;
    if (!confirm(`Apply “${name}”? This replaces the current board.`)) {
      e.target.value = '';
      return;
    }
    apiRef.exec('board.applyTemplate', { templateId: id, wipe: true }, { label: 'Apply template' });
    currentBoardId = graph().rootId;
    e.target.value = '';
    render();
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.target === stage)) {
      panning = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = (e.clientX - drag.ox) / cam.scale;
      const dy = (e.clientY - drag.oy) / cam.scale;
      apiRef.exec(
        'board.updateItem',
        {
          id: drag.id,
          patch: { x: Math.round(drag.x + dx), y: Math.round(drag.y + dy) },
        },
        { mergeKey: `bd:${drag.id}:pos` }
      );
      render();
      return;
    }
    if (!panning) return;
    cam = panBy(cam, e.clientX - panning.x, e.clientY - panning.y);
    panning = { x: e.clientX, y: e.clientY };
    render();
  });
  stage.addEventListener('pointerup', () => {
    drag = null;
    panning = null;
  });
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      cam = zoomAt(cam, e.deltaY > 0 ? 0.92 : 1.08, sx, sy);
      render();
    },
    { passive: false }
  );
  stage.addEventListener('dblclick', (e) => {
    if (e.target !== stage && e.target !== root.querySelector('.bd-grid')) return;
    const rect = stage.getBoundingClientRect();
    const wx = screenToWorldX(cam, e.clientX - rect.left);
    const wy = screenToWorldY(cam, e.clientY - rect.top);
    const boardId = ensureBoardId();
    const item = createBoardItem('note', {
      id: boardUid('bit'),
      boardId,
      x: Math.round(wx),
      y: Math.round(wy),
    });
    apiRef.exec('board.addItem', { boardId, item }, { label: 'Add note' });
    render();
  });

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

  function destroy() {
    root.innerHTML = '';
    delete root.__platenBoard;
  }

  const controller = { render, destroy, setApi };
  root.__platenBoard = controller;
  return controller;
}
