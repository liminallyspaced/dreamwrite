/**
 * Infinite ink board — notes, scene cards, images, tables, sub-boards, templates.
 * Phase 8a: selection, marquee, group move, card resize.
 */
import { createCamera, screenToWorldX, screenToWorldY, zoomAt, panBy } from '../../core/geom/camera.js';
import {
  ensureProjectBoards,
  createBoardItem,
  breadcrumbPath,
  uid as boardUid,
} from '../../core/board/model.js';
import {
  createSelection,
  selectOnly,
  toggleInSelection,
  clearSelection,
  selectAll,
  selectInRect,
  normalizeRect,
  clampResize,
} from '../../core/board/selection.js';
import {
  cardAnchor,
  facingSide,
  facingSides,
  constrainHV,
  connectorPathD,
  resolveEndpoints,
  hitTestCard,
  segmentMid,
  makeConnectorFields,
} from '../../core/board/connectors.js';
import {
  layoutColumnChildren,
  findColumnAtPoint,
  snapCardIntoColumn,
  detachCardFromColumn,
  indexFromY,
  SEMANTIC_COLORS,
} from '../../core/board/columns.js';
import {
  boundsOfItems,
  fitCameraToBounds,
  snapWithGuides,
  cloneBoardItem,
  moveItemToBoard,
  findSubBoardAtPoint,
} from '../../core/board/canvas.js';
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
      <button type="button" class="ghost" data-bd="todo" title="To-do list">+ To-do</button>
      <button type="button" class="ghost" data-bd="column" title="Column container">+ Column</button>
      <button type="button" class="ghost" data-bd="image" title="Import image asset">+ Image</button>
      <button type="button" class="ghost" data-bd="table" title="Add table card">+ Table</button>
      <button type="button" class="ghost" data-bd="arrow" title="Connect cards (or drag edge ports)">+ Arrow</button>
      <button type="button" class="ghost" data-bd="sync" title="Place a card per scene">Sync scenes</button>
      <button type="button" class="ghost" data-bd="sub">+ Sub-board</button>
      <div class="bd-color-strip" title="Semantic card color" aria-label="Card color">
        ${SEMANTIC_COLORS.map(
          (c) =>
            `<button type="button" class="bd-color-swatch" data-color="${c.value}" data-color-id="${c.id}" title="${c.label}" style="background:${c.value}"></button>`
        ).join('')}
      </div>
      <select class="bd-templates" title="Writing templates" aria-label="Templates">
        <option value="">Template…</option>
        ${templates.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div class="bd-stage" tabindex="0" role="application" aria-label="Story board">
      <div class="bd-grid" aria-hidden="true"></div>
      <div class="bd-layer"></div>
      <div class="bd-marquee" hidden aria-hidden="true"></div>
      <div class="bd-guides" aria-hidden="true"></div>
      <div class="bd-empty" hidden>
        <p><strong>Empty board</strong></p>
        <p class="muted">Double-click note · Z fit · Alt-drag duplicate · arrows nudge · drop on sub-board</p>
      </div>
    </div>
  `;

  const stage = root.querySelector('.bd-stage');
  const layer = root.querySelector('.bd-layer');
  const marqueeEl = root.querySelector('.bd-marquee');
  const guidesEl = root.querySelector('.bd-guides');
  const crumbs = root.querySelector('.bd-crumbs');
  const emptyEl = root.querySelector('.bd-empty');
  let cam = createCamera({ scale: 1, lockY: false, minScale: 0.25, maxScale: 3, panX: 40, panY: 40 });
  let currentBoardId = null;
  /** @type {Set<string>} */
  let selection = createSelection();
  /** @type {null | { mode: 'move', ids: string[], ox: number, oy: number, origins: Map<string,{x:number,y:number}> }} */
  let drag = null;
  /** @type {null | { id: string, ox: number, oy: number, ow: number, oh: number, free: boolean }} */
  let resize = null;
  /** @type {null | { x0: number, y0: number, additive: boolean }} */
  let marquee = null;
  /**
   * Active connector drag / toolbar link mode.
   * @type {null | {
   *   fromId: string,
   *   fromSide: string,
   *   x: number,
   *   y: number,
   *   shift: boolean,
   * }}
   */
  let linking = null;
  /** Toolbar: click first card then second */
  let linkArmed = false;
  /** @type {string | null} */
  let selectedConnectorId = null;
  let panning = null;
  let apiRef = api;
  /** Rubber-band SVG path while linking */
  let rubberEl = null;
  /** Breadcrumb hover timer for drop-into-ancestor (Phase 8d) */
  let crumbHold = null;

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
      // Hold-over breadcrumb while dragging → move selection into that board
      btn.addEventListener('pointerenter', () => {
        if (!drag || drag.mode !== 'move') return;
        clearTimeout(crumbHold);
        crumbHold = setTimeout(() => {
          const targetBoardId = btn.dataset.board;
          if (!targetBoardId || targetBoardId === ensureBoardId()) return;
          moveSelectionToBoard(targetBoardId);
          drag = null;
        }, 450);
      });
      btn.addEventListener('pointerleave', () => {
        clearTimeout(crumbHold);
        crumbHold = null;
      });
    });

    layer.innerHTML = '';
    layer.style.transform = `translate(${cam.panX}px, ${cam.panY}px) scale(${cam.scale})`;
    layer.style.transformOrigin = '0 0';

    // Hide children of collapsed columns
    const collapsedParents = new Set();
    for (const id of board.items || []) {
      const col = g.items[id];
      if (col?.type === 'column' && col.collapsed) collapsedParents.add(col.id);
    }

    for (const id of board.items || []) {
      const it = g.items[id];
      if (!it || it.type === 'connector') continue;
      if (it.parentId && collapsedParents.has(it.parentId)) continue;

      const el = document.createElement('div');
      el.className = `bd-card type-${it.type}`;
      if (selection.has(it.id)) el.classList.add('selected');
      if (it.parentId) el.classList.add('bd-in-column');
      if (it.locked) el.classList.add('bd-locked');
      el.dataset.id = it.id;
      el.style.left = `${it.x}px`;
      el.style.top = `${it.y}px`;
      el.style.width = `${it.w}px`;
      el.style.height = `${it.h}px`;
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
        const count = (it.childIds || []).length;
        el.innerHTML = `
          <div class="bd-col-head">
            <button type="button" class="ghost bd-col-toggle" title="Collapse / expand">${it.collapsed ? '▸' : '▾'}</button>
            <input class="bd-card-title" value="${escapeAttr(it.title || 'Column')}" />
            <span class="bd-col-count" title="Cards in column">${count}</span>
          </div>
          ${it.collapsed ? '<div class="bd-col-collapsed-hint muted">Collapsed</div>' : '<div class="bd-col-dropzone" aria-hidden="true"></div>'}
        `;
        el.classList.add('bd-column');
        if (it.collapsed) el.classList.add('bd-column-collapsed');
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
              `<label class="bd-todo"><input type="checkbox" data-tid="${t.id}" ${t.done ? 'checked' : ''}/> <input class="bd-todo-text" data-tid="${t.id}" value="${escapeAttr(t.text || '')}" placeholder="Task…" /></label>`
          )
          .join('');
        el.innerHTML = `
          <input class="bd-card-title" value="${escapeAttr(it.title || 'To-do')}" />
          ${tasks}
          <button type="button" class="ghost bd-todo-add">+ Task</button>
        `;
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
        if (e.target.closest('.bd-resize')) return;
        if (e.target.closest('input, textarea, button, label, select, table, img')) return;
        if (e.button !== 0) return;
        e.stopPropagation();
        stage.focus();
        selectedConnectorId = null;
        if (it.locked && !e.altKey) {
          // Allow select locked cards but not move
          if (e.shiftKey) selection = toggleInSelection(selection, it.id);
          else selection = selectOnly(selection, it.id);
          paintSelectionOnly();
          return;
        }
        if (e.shiftKey) {
          selection = toggleInSelection(selection, it.id);
        } else if (!selection.has(it.id)) {
          selection = selectOnly(selection, it.id);
        }
        // Group move: all selected (or just this card) + column children
        let ids = selection.has(it.id) ? [...selection] : [it.id];
        const idSet = new Set(ids);
        for (const sid of [...idSet]) {
          const item = g.items[sid];
          if (item?.type === 'column') {
            for (const cid of item.childIds || []) idSet.add(cid);
          }
        }
        ids = [...idSet].filter((id) => !g.items[id]?.locked);
        if (!ids.length) {
          paintSelectionOnly();
          return;
        }
        const origins = new Map();
        for (const id of ids) {
          const item = g.items[id];
          if (item) origins.set(id, { x: item.x, y: item.y, w: item.w, h: item.h });
        }
        drag = {
          mode: 'move',
          ids,
          primaryId: it.id,
          ox: e.clientX,
          oy: e.clientY,
          origins,
          altDup: !!e.altKey,
        };
        el.setPointerCapture(e.pointerId);
        paintSelectionOnly();
      });

      // Resize handle (bottom-right)
      const handle = document.createElement('div');
      handle.className = 'bd-resize';
      handle.title = 'Resize (Ctrl = free aspect for images)';
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        if (!selection.has(it.id)) selection = selectOnly(selection, it.id);
        resize = {
          id: it.id,
          ox: e.clientX,
          oy: e.clientY,
          ow: it.w || 200,
          oh: it.h || 120,
          free: e.ctrlKey || e.metaKey,
        };
        handle.setPointerCapture(e.pointerId);
        paintSelectionOnly();
      });
      el.appendChild(handle);

      // Connector ports on selected cards (Phase 8b)
      if (selection.has(it.id) || linkArmed) {
        for (const side of ['n', 'e', 's', 'w']) {
          const port = document.createElement('div');
          port.className = `bd-port bd-port-${side}`;
          port.dataset.side = side;
          port.title = 'Drag to connect';
          port.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();
            selectedConnectorId = null;
            const anchor = cardAnchor(it, side);
            linking = {
              fromId: it.id,
              fromSide: side,
              x: anchor.x,
              y: anchor.y,
              shift: e.shiftKey,
            };
            ensureRubber();
            updateRubber(anchor);
            stage.setPointerCapture(e.pointerId);
          });
          el.appendChild(port);
        }
      }

      // Toolbar link mode: click source then target
      if (linkArmed) {
        el.addEventListener(
          'click',
          (e) => {
            if (e.target.closest('input, textarea, button, .bd-resize, .bd-port')) return;
            e.stopPropagation();
            if (!linking) {
              const sides = facingSides(it, { x: it.x + (it.w || 100) + 40, y: it.y });
              linking = {
                fromId: it.id,
                fromSide: sides.fromSide,
                x: cardAnchor(it, sides.fromSide).x,
                y: cardAnchor(it, sides.fromSide).y,
                shift: false,
              };
              ensureRubber();
              return;
            }
            if (linking.fromId === it.id) return;
            finishLinkToCard(it.id);
          },
          { capture: true }
        );
      }

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
      el.querySelector('.bd-col-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        apiRef.exec(
          'board.updateItem',
          { id: it.id, patch: { collapsed: !it.collapsed } },
          { label: it.collapsed ? 'Expand column' : 'Collapse column' }
        );
        // Reflow after collapse
        const g2 = graph();
        const col = g2.items[it.id];
        if (col) {
          const laid = layoutColumnChildren(col, g2.items);
          const updates = [
            { id: col.id, patch: laid.columnPatch },
            ...laid.updates,
          ];
          apiRef.exec(
            'board.updateItems',
            { updates, label: 'Reflow column' },
            { label: 'Reflow column' }
          );
        }
        render();
      });
      el.querySelector('.bd-todo-add')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const tasks = [...(it.tasks || []), { id: boardUid('td'), text: '', done: false }];
        apiRef.exec(
          'board.updateItem',
          { id: it.id, patch: { tasks, h: Math.max(it.h || 120, 48 + tasks.length * 28) } },
          { label: 'Add task' }
        );
        render();
      });
      el.querySelectorAll('.bd-todo input[type="checkbox"]').forEach((input) => {
        input.addEventListener('change', () => {
          const tid = input.dataset.tid;
          const tasks = (it.tasks || []).map((t) =>
            t.id === tid ? { ...t, done: !!input.checked } : t
          );
          apiRef.exec(
            'board.updateItem',
            { id: it.id, patch: { tasks } },
            { mergeKey: `bd:${it.id}:todo:${tid}` }
          );
        });
      });
      el.querySelectorAll('.bd-todo-text').forEach((input) => {
        input.addEventListener('change', () => {
          const tid = input.dataset.tid;
          const tasks = (it.tasks || []).map((t) =>
            t.id === tid ? { ...t, text: input.value } : t
          );
          apiRef.exec(
            'board.updateItem',
            { id: it.id, patch: { tasks } },
            { mergeKey: `bd:${it.id}:todotext:${tid}` }
          );
        });
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

      el.tabIndex = 0;
      layer.appendChild(el);
    }

    // Connectors as interactive SVG overlay (Phase 8b)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('bd-connectors');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.overflow = 'visible';
    svg.style.pointerEvents = 'none';
    svg.setAttribute('width', '1');
    svg.setAttribute('height', '1');

    // defs arrowhead
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="bd-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="rgba(30,25,20,0.65)" />
      </marker>`;
    svg.appendChild(defs);

    for (const id of board.items || []) {
      const c = g.items[id];
      if (!c || c.type !== 'connector') continue;
      const ep = resolveEndpoints(c, g.items);
      if (!ep.ok) continue;
      const d = connectorPathD(ep.p0, ep.p1, { curved: c.curved !== false });
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '12');
      hit.style.pointerEvents = 'stroke';
      hit.style.cursor = 'pointer';
      hit.dataset.connectorId = id;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', d);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', c.color || 'rgba(30,25,20,0.55)');
      line.setAttribute('stroke-width', String(c.weight ?? 1.5));
      line.setAttribute('marker-end', 'url(#bd-arrow)');
      line.style.pointerEvents = 'none';
      if (selectedConnectorId === id) {
        line.setAttribute('stroke', '#111');
        line.setAttribute('stroke-width', '2.25');
      }

      hit.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        selectedConnectorId = id;
        selection = clearSelection();
        render();
      });
      hit.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        apiRef.exec(
          'board.updateItem',
          { id, patch: { curved: c.curved === false } },
          { label: 'Toggle connector curve' }
        );
        render();
      });

      svg.appendChild(hit);
      svg.appendChild(line);

      // Label at mid
      const mid = segmentMid(ep.p0, ep.p1);
      if (c.label || selectedConnectorId === id) {
        const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        fo.setAttribute('x', String(mid.x - 60));
        fo.setAttribute('y', String(mid.y - 12));
        fo.setAttribute('width', '120');
        fo.setAttribute('height', '24');
        fo.style.pointerEvents = 'auto';
        fo.style.overflow = 'visible';
        const input = document.createElement('input');
        input.className = 'bd-conn-label';
        input.value = c.label || '';
        input.placeholder = 'Label…';
        input.addEventListener('change', () => {
          apiRef.exec(
            'board.updateItem',
            { id, patch: { label: input.value } },
            { mergeKey: `bd:${id}:label`, label: 'Connector label' }
          );
        });
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        fo.appendChild(input);
        svg.appendChild(fo);
      }
    }

    // Rubber-band while linking
    rubberEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rubberEl.classList.add('bd-rubber');
    rubberEl.setAttribute('fill', 'none');
    rubberEl.setAttribute('stroke', 'rgba(30,25,20,0.45)');
    rubberEl.setAttribute('stroke-width', '1.5');
    rubberEl.setAttribute('stroke-dasharray', '4 3');
    rubberEl.style.pointerEvents = 'none';
    rubberEl.setAttribute('d', '');
    svg.appendChild(rubberEl);
    layer.appendChild(svg);

    if (linkArmed) {
      stage.classList.add('bd-link-armed');
    } else {
      stage.classList.remove('bd-link-armed');
    }
  }

  function ensureRubber() {
    if (rubberEl && linking) {
      const d = connectorPathD(
        { x: linking.x, y: linking.y },
        { x: linking.x, y: linking.y },
        { curved: false }
      );
      rubberEl.setAttribute('d', d);
    }
  }

  function updateRubber(worldPt) {
    if (!linking || !rubberEl) return;
    let p1 = worldPt;
    if (linking.shift) p1 = constrainHV({ x: linking.x, y: linking.y }, p1);
    rubberEl.setAttribute(
      'd',
      connectorPathD({ x: linking.x, y: linking.y }, p1, { curved: true })
    );
  }

  function finishLinkToCard(toId) {
    if (!linking || linking.fromId === toId) {
      linking = null;
      linkArmed = false;
      render();
      return;
    }
    const g = graph();
    const from = g.items[linking.fromId];
    const to = g.items[toId];
    if (!from || !to) {
      linking = null;
      render();
      return;
    }
    const sides = facingSides(from, to);
    const boardId = ensureBoardId();
    const fields = makeConnectorFields({
      fromId: linking.fromId,
      toId,
      fromSide: linking.fromSide || sides.fromSide,
      toSide: sides.toSide,
      curved: true,
    });
    const item = createBoardItem('connector', {
      id: boardUid('bit'),
      boardId,
      ...fields,
    });
    apiRef.exec('board.addItem', { boardId, item }, { label: 'Add connector' });
    selectedConnectorId = item.id;
    linking = null;
    linkArmed = false;
    render();
  }

  function finishLinkFree(worldPt) {
    if (!linking) return;
    let p1 = worldPt;
    if (linking.shift) p1 = constrainHV({ x: linking.x, y: linking.y }, p1);
    const boardId = ensureBoardId();
    const fields = makeConnectorFields({
      fromId: linking.fromId,
      toId: null,
      freeX: Math.round(p1.x),
      freeY: Math.round(p1.y),
      fromSide: linking.fromSide || facingSide(graph().items[linking.fromId], p1),
      curved: true,
    });
    const item = createBoardItem('connector', {
      id: boardUid('bit'),
      boardId,
      ...fields,
    });
    apiRef.exec('board.addItem', { boardId, item }, { label: 'Add connector' });
    selectedConnectorId = item.id;
    linking = null;
    linkArmed = false;
    render();
  }

  function worldDropPoint() {
    return {
      x: Math.round(80 - cam.panX / cam.scale),
      y: Math.round(80 - cam.panY / cam.scale),
    };
  }

  function paintGuides(guides) {
    if (!guidesEl) return;
    guidesEl.innerHTML = '';
    if (!guides?.length) {
      guidesEl.hidden = true;
      return;
    }
    guidesEl.hidden = false;
    const rect = stage.getBoundingClientRect();
    for (const g of guides) {
      const line = document.createElement('div');
      line.className = `bd-guide bd-guide-${g.type}`;
      if (g.type === 'v') {
        // world x → screen
        const sx = g.pos * cam.scale + cam.panX;
        line.style.left = `${sx}px`;
        line.style.top = '0';
        line.style.height = `${rect.height}px`;
      } else {
        const sy = g.pos * cam.scale + cam.panY;
        line.style.top = `${sy}px`;
        line.style.left = '0';
        line.style.width = `${rect.width}px`;
      }
      guidesEl.appendChild(line);
    }
  }

  function clearGuides() {
    if (!guidesEl) return;
    guidesEl.innerHTML = '';
    guidesEl.hidden = true;
  }

  function zoomToFit() {
    const items = selectableItems();
    const bounds = boundsOfItems(items);
    const rect = stage.getBoundingClientRect();
    cam = fitCameraToBounds(cam, bounds, { width: rect.width, height: rect.height }, 56);
    render();
  }

  function nudgeSelection(dx, dy) {
    const updates = [];
    for (const id of selection) {
      const it = graph().items[id];
      if (!it || it.locked || it.type === 'connector') continue;
      updates.push({
        id,
        patch: { x: Math.round((it.x || 0) + dx), y: Math.round((it.y || 0) + dy) },
      });
      // Move column children with parent
      if (it.type === 'column') {
        for (const cid of it.childIds || []) {
          const ch = graph().items[cid];
          if (!ch) continue;
          updates.push({
            id: cid,
            patch: { x: Math.round((ch.x || 0) + dx), y: Math.round((ch.y || 0) + dy) },
          });
        }
      }
    }
    if (!updates.length) return;
    apiRef.exec(
      'board.updateItems',
      { updates, label: 'Nudge cards' },
      { label: 'Nudge cards' }
    );
    render();
  }

  function toggleLockSelection() {
    if (!selection.size) return;
    const updates = [];
    for (const id of selection) {
      const it = graph().items[id];
      if (!it || it.type === 'connector') continue;
      updates.push({ id, patch: { locked: !it.locked } });
    }
    if (!updates.length) return;
    apiRef.exec(
      'board.updateItems',
      { updates, label: 'Toggle lock' },
      { label: 'Toggle lock' }
    );
    render();
  }

  function commitAltDuplicate(dragState, dx, dy) {
    const boardId = ensureBoardId();
    const g = graph();
    // Originals stay; create clones at offset positions
    for (const id of dragState.ids) {
      const src = g.items[id];
      const o = dragState.origins.get(id);
      if (!src || src.type === 'connector' || !o) continue;
      if (src.type === 'column') continue; // skip column shells (children handled if selected)
      const newId = boardUid('bit');
      const clone = cloneBoardItem(src, newId, { x: 0, y: 0 });
      clone.boardId = boardId;
      clone.x = Math.round(o.x + dx);
      clone.y = Math.round(o.y + dy);
      apiRef.exec('board.addItem', { boardId, item: clone }, { label: 'Duplicate card' });
    }
  }

  function tryDropOnSubBoard(dragState, dx, dy) {
    const g = graph();
    const primary = g.items[dragState.primaryId];
    const o = dragState.origins.get(dragState.primaryId);
    if (!primary || !o || primary.type === 'sub-board') return;
    const cx = o.x + dx + (primary.w || 100) / 2;
    const cy = o.y + dy + (primary.h || 50) / 2;
    const hit = findSubBoardAtPoint(selectableItems(), { x: cx, y: cy });
    if (!hit?.targetBoardId) return;
    // Don't drop into self via weird ids
    if (hit.id === primary.id) return;
    moveSelectionToBoard(hit.targetBoardId, [primary.id]);
  }

  function moveSelectionToBoard(targetBoardId, onlyIds) {
    const ids = onlyIds || [...selection];
    let g = graph();
    let moved = 0;
    for (const id of ids) {
      const res = moveItemToBoard(g, id, targetBoardId);
      if (res.error) continue;
      g = res.graph;
      moved += 1;
    }
    if (!moved) return;
    apiRef.exec('board.set', { boards: g }, { label: 'Move into board' });
    selection = clearSelection();
    currentBoardId = targetBoardId;
    render();
  }

  /**
   * Commit a group move, then snap free cards into / out of columns (Phase 8c).
   */
  function commitMoveWithColumns(dragState, dx, dy) {
    const g = graph();
    /** @type {Array<{id:string, patch:object}>} */
    let updates = [];
    for (const id of dragState.ids) {
      const o = dragState.origins.get(id);
      if (!o) continue;
      updates.push({
        id,
        patch: { x: Math.round(o.x + dx), y: Math.round(o.y + dy) },
      });
    }
    if (updates.length) {
      apiRef.exec(
        'board.updateItems',
        { updates, label: updates.length > 1 ? 'Move cards' : 'Move card' },
        { label: updates.length > 1 ? 'Move cards' : 'Move card' }
      );
    }

    // Snap primary (and any other free selected non-column cards) into columns
    const g2 = graph();
    const primary = g2.items[dragState.primaryId];
    if (!primary || primary.type === 'column' || primary.type === 'connector') return;

    const cx = (primary.x || 0) + (primary.w || 100) / 2;
    const cy = (primary.y || 0) + (primary.h || 50) / 2;
    const cols = Object.values(g2.items).filter((it) => it?.type === 'column');
    const hit = findColumnAtPoint(cols, { x: cx, y: cy });

    if (hit && hit.id !== primary.parentId) {
      // Don't nest columns
      if (primary.type === 'column') return;
      const idx = indexFromY(hit, g2.items, cy);
      const snapUpdates = snapCardIntoColumn(hit, primary, g2.items, idx);
      if (snapUpdates.length) {
        apiRef.exec(
          'board.updateItems',
          { updates: snapUpdates, label: 'Snap into column' },
          { label: 'Snap into column' }
        );
      }
    } else if (!hit && primary.parentId) {
      const freeUpdates = detachCardFromColumn(primary, g2.items, {
        x: primary.x,
        y: primary.y,
      });
      if (freeUpdates.length) {
        apiRef.exec(
          'board.updateItems',
          { updates: freeUpdates, label: 'Remove from column' },
          { label: 'Remove from column' }
        );
      }
    } else if (hit && hit.id === primary.parentId) {
      // Reorder within same column
      const idx = indexFromY(hit, g2.items, cy);
      const without = (hit.childIds || []).filter((id) => id !== primary.id);
      without.splice(Math.min(idx, without.length), 0, primary.id);
      const nextCol = { ...hit, childIds: without };
      const laid = layoutColumnChildren(nextCol, { ...g2.items, [hit.id]: nextCol });
      apiRef.exec(
        'board.updateItems',
        {
          updates: [
            { id: hit.id, patch: { childIds: without, ...laid.columnPatch } },
            ...laid.updates,
          ],
          label: 'Reorder in column',
        },
        { label: 'Reorder in column' }
      );
    }
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
    selection = selectOnly(selection, item.id);
    render();
  };
  root.querySelector('[data-bd="todo"]').onclick = () => {
    const boardId = ensureBoardId();
    const pt = worldDropPoint();
    const item = createBoardItem('todo', {
      id: boardUid('bit'),
      boardId,
      x: pt.x,
      y: pt.y,
      title: 'To-do',
      tasks: [
        { id: boardUid('td'), text: '', done: false },
        { id: boardUid('td'), text: '', done: false },
      ],
      h: 140,
    });
    apiRef.exec('board.addItem', { boardId, item }, { label: 'Add to-do' });
    selection = selectOnly(selection, item.id);
    render();
  };
  root.querySelector('[data-bd="column"]').onclick = () => {
    const boardId = ensureBoardId();
    const pt = worldDropPoint();
    const item = createBoardItem('column', {
      id: boardUid('bit'),
      boardId,
      x: pt.x,
      y: pt.y,
      title: 'Column',
      childIds: [],
      w: 240,
      h: 280,
    });
    apiRef.exec('board.addItem', { boardId, item }, { label: 'Add column' });
    selection = selectOnly(selection, item.id);
    render();
  };
  root.querySelectorAll('.bd-color-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!selection.size) return;
      const color = btn.dataset.color;
      const updates = [...selection]
        .map((id) => {
          const it = graph().items[id];
          if (!it || it.type === 'connector' || it.type === 'column') return null;
          return { id, patch: { color } };
        })
        .filter(Boolean);
      if (!updates.length) return;
      apiRef.exec(
        'board.updateItems',
        { updates, label: 'Set card color' },
        { label: 'Set card color' }
      );
      render();
    });
  });
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
  const arrowBtn = root.querySelector('[data-bd="arrow"]');
  if (arrowBtn) {
    arrowBtn.onclick = () => {
      // Arm click-to-connect: card → card
      linkArmed = !linkArmed;
      linking = null;
      selectedConnectorId = null;
      arrowBtn.classList.toggle('bd-arrow-on', linkArmed);
      if (linkArmed && selection.size === 1) {
        const id = [...selection][0];
        const it = graph().items[id];
        if (it) {
          const side = 'e';
          const a = cardAnchor(it, side);
          linking = { fromId: id, fromSide: side, x: a.x, y: a.y, shift: false };
        }
      }
      render();
      // re-find button after render
      root.querySelector('[data-bd="arrow"]')?.classList.toggle('bd-arrow-on', linkArmed);
    };
  }
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

  function paintSelectionOnly() {
    layer.querySelectorAll('.bd-card').forEach((el) => {
      el.classList.toggle('selected', selection.has(el.dataset.id));
    });
  }

  function selectableItems() {
    const g = graph();
    const board = g.boards[ensureBoardId()];
    if (!board) return [];
    return (board.items || [])
      .map((id) => g.items[id])
      .filter((it) => it && it.type !== 'connector');
  }

  function clientToWorld(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    return {
      x: screenToWorldX(cam, clientX - rect.left),
      y: screenToWorldY(cam, clientY - rect.top),
    };
  }

  function updateMarqueeVisual(x0, y0, x1, y1) {
    if (!marqueeEl) return;
    const rect = stage.getBoundingClientRect();
    const r = normalizeRect(x0 - rect.left, y0 - rect.top, x1 - rect.left, y1 - rect.top);
    marqueeEl.hidden = false;
    marqueeEl.style.left = `${r.x}px`;
    marqueeEl.style.top = `${r.y}px`;
    marqueeEl.style.width = `${r.w}px`;
    marqueeEl.style.height = `${r.h}px`;
  }

  function hideMarquee() {
    if (marqueeEl) marqueeEl.hidden = true;
  }

  stage.addEventListener('pointerdown', (e) => {
    const onEmpty =
      e.target === stage ||
      e.target === root.querySelector('.bd-grid') ||
      e.target === marqueeEl;
    if (e.button === 1) {
      panning = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 0 && onEmpty) {
      // Marquee select (Shift keeps prior selection)
      stage.focus();
      marquee = {
        x0: e.clientX,
        y0: e.clientY,
        additive: !!e.shiftKey,
      };
      if (!e.shiftKey) selection = clearSelection();
      updateMarqueeVisual(e.clientX, e.clientY, e.clientX, e.clientY);
      stage.setPointerCapture(e.pointerId);
      paintSelectionOnly();
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (linking) {
      linking.shift = e.shiftKey;
      const w = clientToWorld(e.clientX, e.clientY);
      updateRubber(w);
      return;
    }
    if (resize) {
      const dx = (e.clientX - resize.ox) / cam.scale;
      const dy = (e.clientY - resize.oy) / cam.scale;
      const g = graph();
      const it = g.items[resize.id];
      if (!it) return;
      const free = resize.free || e.ctrlKey || e.metaKey;
      const size = clampResize(it, resize.ow + dx, resize.oh + dy, { freeResize: free });
      const el = layer.querySelector(`.bd-card[data-id="${resize.id}"]`);
      if (el) {
        el.style.width = `${size.w}px`;
        el.style.height = `${size.h}px`;
        el.style.minHeight = `${size.h}px`;
      }
      resize._preview = size;
      return;
    }
    if (drag && drag.mode === 'move') {
      let dx = (e.clientX - drag.ox) / cam.scale;
      let dy = (e.clientY - drag.oy) / cam.scale;
      // Advisory smart guides on primary card
      const gLive = graph();
      const primary = gLive.items[drag.primaryId];
      const po = drag.origins.get(drag.primaryId);
      if (primary && po) {
        const others = selectableItems().filter((it) => !drag.ids.includes(it.id));
        const snapped = snapWithGuides(
          { id: primary.id, x: po.x + dx, y: po.y + dy, w: po.w || primary.w, h: po.h || primary.h },
          others,
          6 / cam.scale
        );
        dx = snapped.x - po.x;
        dy = snapped.y - po.y;
        paintGuides(snapped.guides);
      }
      for (const id of drag.ids) {
        const o = drag.origins.get(id);
        if (!o) continue;
        const cardEl = layer.querySelector(`.bd-card[data-id="${id}"]`);
        if (cardEl) {
          cardEl.style.left = `${Math.round(o.x + dx)}px`;
          cardEl.style.top = `${Math.round(o.y + dy)}px`;
        }
      }
      drag._dx = dx;
      drag._dy = dy;
      return;
    }
    if (marquee) {
      updateMarqueeVisual(marquee.x0, marquee.y0, e.clientX, e.clientY);
      const w0 = clientToWorld(marquee.x0, marquee.y0);
      const w1 = clientToWorld(e.clientX, e.clientY);
      const worldRect = normalizeRect(w0.x, w0.y, w1.x, w1.y);
      const hit = selectInRect(selectableItems(), worldRect);
      selection = marquee.additive
        ? new Set([...selection, ...hit])
        : hit;
      paintSelectionOnly();
      return;
    }
    if (!panning) return;
    cam = panBy(cam, e.clientX - panning.x, e.clientY - panning.y);
    panning = { x: e.clientX, y: e.clientY };
    render();
  });

  stage.addEventListener('pointerup', (e) => {
    if (linking) {
      linking.shift = e.shiftKey;
      let w = clientToWorld(e.clientX, e.clientY);
      if (linking.shift) w = constrainHV({ x: linking.x, y: linking.y }, w);
      const cards = selectableItems();
      const hit = hitTestCard(cards, w);
      if (hit && hit.id !== linking.fromId) {
        finishLinkToCard(hit.id);
      } else {
        // Free end if dragged far enough, else cancel
        const dist = Math.hypot(w.x - linking.x, w.y - linking.y);
        if (dist > 16) finishLinkFree(w);
        else {
          linking = null;
          linkArmed = false;
          render();
        }
      }
      return;
    }
    if (resize) {
      const size = resize._preview;
      if (size) {
        apiRef.exec(
          'board.updateItem',
          { id: resize.id, patch: { w: size.w, h: size.h } },
          { label: 'Resize card' }
        );
      }
      resize = null;
      render();
    } else if (drag && drag.mode === 'move') {
      const dx = drag._dx || 0;
      const dy = drag._dy || 0;
      clearGuides();
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        if (drag.altDup) {
          commitAltDuplicate(drag, dx, dy);
        } else {
          commitMoveWithColumns(drag, dx, dy);
          // Nested: drop on sub-board tile
          tryDropOnSubBoard(drag, dx, dy);
        }
      }
      drag = null;
      render();
    } else if (marquee) {
      hideMarquee();
      marquee = null;
      paintSelectionOnly();
    }
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
    selection = selectOnly(selection, item.id);
    render();
  });

  stage.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selection = selectAll(selectableItems().map((it) => it.id));
      paintSelectionOnly();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      selection = clearSelection();
      selectedConnectorId = null;
      linkArmed = false;
      paintSelectionOnly();
      return;
    }
    // Z = zoom to fit all cards
    if (e.key === 'z' && !mod && !e.shiftKey) {
      e.preventDefault();
      zoomToFit();
      return;
    }
    // L = lock / unlock selection
    if (e.key === 'l' && !mod) {
      e.preventDefault();
      toggleLockSelection();
      return;
    }
    // Arrow key nudge (Shift = coarse)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selection.size) {
      e.preventDefault();
      const step = e.shiftKey ? 20 : 4;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowUp') dy = -step;
      if (e.key === 'ArrowDown') dy = step;
      nudgeSelection(dx, dy);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnectorId) {
      e.preventDefault();
      apiRef.exec(
        'board.removeItem',
        { id: selectedConnectorId },
        { label: 'Delete connector' }
      );
      selectedConnectorId = null;
      render();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size) {
      e.preventDefault();
      const ids = [...selection].filter((id) => !graph().items[id]?.locked);
      if (!ids.length) return;
      apiRef.exec('board.removeItems', { ids }, { label: ids.length > 1 ? 'Delete cards' : 'Delete card' });
      selection = clearSelection();
      render();
    }
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

  const controller = {
    render,
    destroy,
    setApi,
    /** Test / radial hooks */
    getSelection: () => [...selection],
  };
  root.__platenBoard = controller;
  return controller;
}
