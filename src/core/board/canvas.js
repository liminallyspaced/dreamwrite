/**
 * Board canvas helpers — fit, guides, duplicate, nested-board moves.
 * Pure. Phase 8d.
 */

/**
 * Bounding box of visible items (skip connectors / locked optional).
 * @param {Array<object>} items
 * @returns {{ x0: number, y0: number, x1: number, y1: number } | null}
 */
export function boundsOfItems(items) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let any = false;
  for (const it of items || []) {
    if (!it || it.type === 'connector') continue;
    any = true;
    const w = it.w ?? 200;
    const h = it.h ?? 120;
    x0 = Math.min(x0, it.x ?? 0);
    y0 = Math.min(y0, it.y ?? 0);
    x1 = Math.max(x1, (it.x ?? 0) + w);
    y1 = Math.max(y1, (it.y ?? 0) + h);
  }
  if (!any) return null;
  return { x0, y0, x1, y1 };
}

/**
 * Camera pan/scale to fit bounds into a viewport (board free 2D).
 * @param {object} cam  { scale, panX, panY, minScale, maxScale, x0, y0, lockY }
 * @param {{ x0: number, y0: number, x1: number, y1: number }} bounds
 * @param {{ width: number, height: number }} viewport
 * @param {number} [pad]
 */
export function fitCameraToBounds(cam, bounds, viewport, pad = 48) {
  if (!bounds) return cam;
  const bw = Math.max(40, bounds.x1 - bounds.x0);
  const bh = Math.max(40, bounds.y1 - bounds.y0);
  const usableW = Math.max(1, (viewport.width || 800) - pad * 2);
  const usableH = Math.max(1, (viewport.height || 600) - pad * 2);
  let scale = Math.min(usableW / bw, usableH / bh);
  scale = Math.max(cam.minScale ?? 0.25, Math.min(cam.maxScale ?? 3, scale));
  // Center bounds in viewport: screen = world * scale + pan  (x0/y0 are 0 on board)
  const midX = (bounds.x0 + bounds.x1) / 2;
  const midY = (bounds.y0 + bounds.y1) / 2;
  const panX = (viewport.width || 800) / 2 - midX * scale;
  const panY = (viewport.height || 600) / 2 - midY * scale;
  return {
    ...cam,
    scale,
    panX,
    panY,
    x0: 0,
    y0: 0,
  };
}

/**
 * Advisory smart guides: snap delta so item edges align with others.
 * @param {{ x: number, y: number, w: number, h: number }} moving
 * @param {Array<{ x: number, y: number, w?: number, h?: number, id?: string }>} others
 * @param {number} [threshold]
 * @returns {{ x: number, y: number, guides: Array<{ type: string, pos: number }> }}
 */
export function snapWithGuides(moving, others, threshold = 6) {
  const mx0 = moving.x;
  const my0 = moving.y;
  const mw = moving.w ?? 200;
  const mh = moving.h ?? 120;
  const mx1 = mx0 + mw;
  const my1 = my0 + mh;
  const mcx = mx0 + mw / 2;
  const mcy = my0 + mh / 2;

  let dx = 0;
  let dy = 0;
  /** @type {Array<{ type: string, pos: number }>} */
  const guides = [];
  let bestX = threshold + 1;
  let bestY = threshold + 1;

  for (const o of others || []) {
    if (!o || o.id === moving.id) continue;
    const ox0 = o.x ?? 0;
    const oy0 = o.y ?? 0;
    const ow = o.w ?? 200;
    const oh = o.h ?? 120;
    const ox1 = ox0 + ow;
    const oy1 = oy0 + oh;
    const ocx = ox0 + ow / 2;
    const ocy = oy0 + oh / 2;

    const xPairs = [
      [mx0, ox0, 'v'],
      [mx0, ox1, 'v'],
      [mx1, ox0, 'v'],
      [mx1, ox1, 'v'],
      [mcx, ocx, 'v'],
    ];
    for (const [a, b, type] of xPairs) {
      const d = b - a;
      if (Math.abs(d) < bestX) {
        bestX = Math.abs(d);
        dx = d;
        // replace vertical guide
        const filtered = guides.filter((g) => g.type !== 'v');
        filtered.push({ type, pos: b });
        guides.length = 0;
        guides.push(...filtered);
      }
    }

    const yPairs = [
      [my0, oy0, 'h'],
      [my0, oy1, 'h'],
      [my1, oy0, 'h'],
      [my1, oy1, 'h'],
      [mcy, ocy, 'h'],
    ];
    for (const [a, b, type] of yPairs) {
      const d = b - a;
      if (Math.abs(d) < bestY) {
        bestY = Math.abs(d);
        dy = d;
        const filtered = guides.filter((g) => g.type !== 'h');
        filtered.push({ type, pos: b });
        guides.length = 0;
        guides.push(...filtered);
      }
    }
  }

  if (bestX > threshold) {
    dx = 0;
    for (let i = guides.length - 1; i >= 0; i--) if (guides[i].type === 'v') guides.splice(i, 1);
  }
  if (bestY > threshold) {
    dy = 0;
    for (let i = guides.length - 1; i >= 0; i--) if (guides[i].type === 'h') guides.splice(i, 1);
  }

  return {
    x: Math.round(mx0 + dx),
    y: Math.round(my0 + dy),
    guides,
  };
}

/**
 * Deep-ish clone of a board item with a new id (no shared nested refs we care about).
 * @param {object} item
 * @param {string} newId
 * @param {{ x?: number, y?: number }} [offset]
 */
export function cloneBoardItem(item, newId, offset = {}) {
  const copy = JSON.parse(JSON.stringify(item));
  copy.id = newId;
  copy.x = Math.round((item.x ?? 0) + (offset.x ?? 24));
  copy.y = Math.round((item.y ?? 0) + (offset.y ?? 24));
  copy.parentId = null;
  // Don't clone into same column membership
  if (copy.childIds) copy.childIds = [];
  return copy;
}

/**
 * Would moving item into targetBoard create a cycle?
 * (Only meaningful for sub-board tiles pointing at boards.)
 * @param {object} graph
 * @param {string} itemId
 * @param {string} targetBoardId
 */
export function wouldCreateBoardCycle(graph, itemId, targetBoardId) {
  const item = graph.items?.[itemId];
  if (!item) return false;
  // If the item is a sub-board tile, its target must not be an ancestor of targetBoardId
  if (item.type === 'sub-board' && item.targetBoardId) {
    // Moving the tile that opens board X into board X or a descendant of X
    if (item.targetBoardId === targetBoardId) return true;
    // Walk ancestors of targetBoardId — if we hit targetBoardId of the tile, cycle
    let id = targetBoardId;
    const guard = new Set();
    while (id && graph.boards?.[id] && !guard.has(id)) {
      guard.add(id);
      if (id === item.targetBoardId) return true;
      id = graph.boards[id].parentId;
    }
  }
  return false;
}

/**
 * Move an item from its current board into another board (nested polish).
 * @param {object} graph
 * @param {string} itemId
 * @param {string} targetBoardId
 * @returns {{ graph: object, error?: string }}
 */
export function moveItemToBoard(graph, itemId, targetBoardId) {
  const item = graph.items?.[itemId];
  const target = graph.boards?.[targetBoardId];
  if (!item) return { graph, error: 'item not found' };
  if (!target) return { graph, error: 'target board not found' };
  if (item.type === 'connector') return { graph, error: 'cannot move connector' };
  if (wouldCreateBoardCycle(graph, itemId, targetBoardId)) {
    return { graph, error: 'cycle' };
  }

  const fromBoardId = item.boardId;
  if (fromBoardId === targetBoardId) return { graph };

  // Remove from source board list
  let boards = { ...graph.boards };
  const fromBoard = boards[fromBoardId];
  if (fromBoard) {
    boards[fromBoardId] = {
      ...fromBoard,
      items: (fromBoard.items || []).filter((id) => id !== itemId),
    };
  }
  // Strip from parent column if any
  let items = { ...graph.items };
  if (item.parentId && items[item.parentId]?.type === 'column') {
    const col = items[item.parentId];
    items[item.parentId] = {
      ...col,
      childIds: (col.childIds || []).filter((id) => id !== itemId),
    };
  }

  const moved = {
    ...item,
    boardId: targetBoardId,
    parentId: null,
    x: 80,
    y: 80,
  };
  items[itemId] = moved;

  const tb = boards[targetBoardId];
  boards[targetBoardId] = {
    ...tb,
    items: [...(tb.items || []).filter((id) => id !== itemId), itemId],
  };

  return { graph: { ...graph, items, boards } };
}

/**
 * Hit-test sub-board tile under point.
 * @param {Array<object>} items
 * @param {{ x: number, y: number }} pt
 */
export function findSubBoardAtPoint(items, pt) {
  let hit = null;
  for (const it of items || []) {
    if (!it || it.type !== 'sub-board') continue;
    const w = it.w ?? 160;
    const h = it.h ?? 120;
    if (pt.x >= it.x && pt.x <= it.x + w && pt.y >= it.y && pt.y <= it.y + h) {
      hit = it;
    }
  }
  return hit;
}
