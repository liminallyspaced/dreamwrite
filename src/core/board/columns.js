/**
 * Column container layout — pure. Phase 8c.
 * Children live in column.childIds; parentId on the child for reverse lookup.
 */

export const COLUMN_PAD = 12;
export const COLUMN_HEADER = 44;
export const COLUMN_GAP = 8;
export const COLUMN_FOOTER = 28;

/**
 * Semantic ink palette (ADR-0002) — act / thread / character / status only.
 */
export const SEMANTIC_COLORS = [
  { id: 'ink', label: 'Ink', value: '#f5f0e6' },
  { id: 'act', label: 'Act', value: '#e8e0d0' },
  { id: 'thread', label: 'Thread', value: '#ddd4c4' },
  { id: 'character', label: 'Character', value: '#d4cfc4' },
  { id: 'status', label: 'Status', value: '#cfc8b8' },
  { id: 'urgent', label: 'Urgent', value: '#c4b8a8' },
];

/**
 * @param {object} column
 * @param {Record<string, object>} items
 * @returns {{ updates: Array<{id:string, patch:object}>, columnPatch: object }}
 */
export function layoutColumnChildren(column, items) {
  if (!column || column.type !== 'column') {
    return { updates: [], columnPatch: {} };
  }
  const pad = COLUMN_PAD;
  const header = COLUMN_HEADER;
  const gap = COLUMN_GAP;
  const childIds = (column.childIds || []).filter((id) => items[id] && items[id].type !== 'connector');
  const updates = [];

  if (column.collapsed) {
    for (const id of childIds) {
      updates.push({
        id,
        patch: {
          parentId: column.id,
          // Park off-view while collapsed (still in graph)
          x: column.x + pad,
          y: column.y + header,
          w: Math.max(80, (column.w || 240) - pad * 2),
        },
      });
    }
    return {
      updates,
      columnPatch: {
        h: header + COLUMN_FOOTER,
        childIds,
      },
    };
  }

  let y = (column.y ?? 0) + header;
  const innerW = Math.max(80, (column.w || 240) - pad * 2);
  for (const id of childIds) {
    const child = items[id];
    const h = Math.max(48, child.h || 100);
    updates.push({
      id,
      patch: {
        parentId: column.id,
        x: Math.round((column.x ?? 0) + pad),
        y: Math.round(y),
        w: Math.round(innerW),
      },
    });
    y += h + gap;
  }
  const h = Math.max(120, Math.round(y - (column.y ?? 0) + pad));
  return {
    updates,
    columnPatch: { h, childIds },
  };
}

/**
 * Insert child id into column.childIds at index (clamped).
 * @param {string[]} childIds
 * @param {string} childId
 * @param {number} [index]
 */
export function insertChildId(childIds, childId, index = -1) {
  const next = (childIds || []).filter((id) => id !== childId);
  const i = index < 0 || index > next.length ? next.length : index;
  next.splice(i, 0, childId);
  return next;
}

/**
 * @param {string[]} childIds
 * @param {string} childId
 */
export function removeChildId(childIds, childId) {
  return (childIds || []).filter((id) => id !== childId);
}

/**
 * Index for insert from Y position inside column content area.
 * @param {object} column
 * @param {Record<string, object>} items
 * @param {number} worldY
 */
export function indexFromY(column, items, worldY) {
  const childIds = column.childIds || [];
  if (!childIds.length) return 0;
  let y = (column.y ?? 0) + COLUMN_HEADER;
  for (let i = 0; i < childIds.length; i++) {
    const child = items[childIds[i]];
    const h = Math.max(48, child?.h || 100);
    const mid = y + h / 2;
    if (worldY < mid) return i;
    y += h + COLUMN_GAP;
  }
  return childIds.length;
}

/**
 * Find column under a world point (topmost by z / list order).
 * Columns cannot nest in columns — only free columns.
 * @param {Array<object>} items
 * @param {{ x: number, y: number }} pt
 */
export function findColumnAtPoint(items, pt) {
  let hit = null;
  for (const it of items || []) {
    if (!it || it.type !== 'column') continue;
    const w = it.w ?? 240;
    const h = it.collapsed ? COLUMN_HEADER + COLUMN_FOOTER : it.h ?? 200;
    if (pt.x >= it.x && pt.x <= it.x + w && pt.y >= it.y && pt.y <= it.y + h) {
      hit = it;
    }
  }
  return hit;
}

/**
 * Patches to move a column and all its children by dx, dy.
 * @param {object} column
 * @param {Record<string, object>} items
 * @param {number} dx
 * @param {number} dy
 */
export function moveColumnUnit(column, items, dx, dy) {
  const updates = [
    {
      id: column.id,
      patch: {
        x: Math.round((column.x ?? 0) + dx),
        y: Math.round((column.y ?? 0) + dy),
      },
    },
  ];
  for (const id of column.childIds || []) {
    const child = items[id];
    if (!child) continue;
    updates.push({
      id,
      patch: {
        x: Math.round((child.x ?? 0) + dx),
        y: Math.round((child.y ?? 0) + dy),
      },
    });
  }
  return updates;
}

/**
 * Build batch updates for snapping a card into a column.
 * @param {object} column
 * @param {object} card
 * @param {Record<string, object>} items
 * @param {number} [index]
 */
export function snapCardIntoColumn(column, card, items, index = -1) {
  // Detach from previous column if any
  const prevParent = card.parentId ? items[card.parentId] : null;
  /** @type {Array<{id:string, patch:object}>} */
  const updates = [];
  let col = { ...column, childIds: [...(column.childIds || [])] };

  if (prevParent && prevParent.type === 'column' && prevParent.id !== column.id) {
    const stripped = removeChildId(prevParent.childIds, card.id);
    const prevNext = { ...prevParent, childIds: stripped };
    const laid = layoutColumnChildren(prevNext, { ...items, [prevParent.id]: prevNext });
    updates.push({ id: prevParent.id, patch: { childIds: stripped, ...laid.columnPatch } });
    updates.push(...laid.updates);
  }

  col.childIds = insertChildId(col.childIds, card.id, index);
  const itemsNext = { ...items, [col.id]: col, [card.id]: { ...card, parentId: col.id } };
  // Apply intermediate parent strips to itemsNext for layout accuracy
  for (const u of updates) {
    if (itemsNext[u.id]) itemsNext[u.id] = { ...itemsNext[u.id], ...u.patch };
  }
  const laid = layoutColumnChildren(col, itemsNext);
  updates.push({ id: col.id, patch: { childIds: col.childIds, ...laid.columnPatch } });
  updates.push(...laid.updates);
  return updates;
}

/**
 * Detach card from its parent column; leave free at given x,y.
 * @param {object} card
 * @param {Record<string, object>} items
 * @param {{ x: number, y: number }} freePos
 */
export function detachCardFromColumn(card, items, freePos) {
  const parent = card.parentId ? items[card.parentId] : null;
  /** @type {Array<{id:string, patch:object}>} */
  const updates = [
    {
      id: card.id,
      patch: {
        parentId: null,
        x: Math.round(freePos.x),
        y: Math.round(freePos.y),
      },
    },
  ];
  if (parent && parent.type === 'column') {
    const stripped = removeChildId(parent.childIds, card.id);
    const nextCol = { ...parent, childIds: stripped };
    const itemsNext = {
      ...items,
      [parent.id]: nextCol,
      [card.id]: { ...card, parentId: null },
    };
    const laid = layoutColumnChildren(nextCol, itemsNext);
    updates.push({ id: parent.id, patch: { childIds: stripped, ...laid.columnPatch } });
    updates.push(...laid.updates.filter((u) => u.id !== card.id));
  }
  return updates;
}
