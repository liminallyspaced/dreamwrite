/**
 * Board graph — nested boards, notes, scene cards, columns, connectors.
 * Offline Milanote core. Pure.
 */

export function uid(prefix = 'bd') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {string} title
 * @param {string} [id]
 */
export function emptyBoard(title = 'Board', id) {
  return {
    id: id || uid('board'),
    title,
    kind: 'board',
    background: null,
    items: [], // cards on this board
    parentId: null,
  };
}

export function emptyBoardGraph() {
  const root = emptyBoard('Home', 'board_root');
  return {
    rootId: root.id,
    boards: { [root.id]: root },
    /** Flat item store by id (notes, cards, columns live here; board refs by boardId) */
    items: {},
  };
}

/**
 * @param {'note'|'scene-card'|'column'|'sub-board'|'connector'|'todo'|'image'|'table'} type
 * @param {object} fields
 */
export function createBoardItem(type, fields = {}) {
  const base = {
    id: fields.id || uid('bit'),
    type,
    boardId: fields.boardId || 'board_root',
    x: fields.x ?? 80,
    y: fields.y ?? 80,
    w: fields.w ?? 200,
    h: fields.h ?? 120,
    color: fields.color || '#f5f0e6',
    locked: !!fields.locked,
    tags: fields.tags || [],
    z: fields.z ?? 0,
  };
  switch (type) {
    case 'note':
      return {
        ...base,
        w: fields.w ?? 220,
        h: fields.h ?? 140,
        title: fields.title || '',
        body: fields.body || '',
      };
    case 'scene-card':
      return {
        ...base,
        w: fields.w ?? 200,
        h: fields.h ?? 100,
        sceneId: fields.sceneId || null,
        title: fields.title || 'Scene',
        summary: fields.summary || '',
      };
    case 'column':
      return {
        ...base,
        w: fields.w ?? 240,
        h: fields.h ?? 400,
        title: fields.title || 'Column',
        childIds: fields.childIds || [],
      };
    case 'sub-board':
      return {
        ...base,
        w: fields.w ?? 160,
        h: fields.h ?? 120,
        targetBoardId: fields.targetBoardId,
        title: fields.title || 'Sub-board',
      };
    case 'connector':
      return {
        ...base,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        fromId: fields.fromId,
        toId: fields.toId,
        label: fields.label || '',
        curved: fields.curved !== false,
      };
    case 'todo':
      return {
        ...base,
        title: fields.title || 'To-do',
        tasks: fields.tasks || [{ id: uid('td'), text: '', done: false }],
      };
    case 'image':
      return {
        ...base,
        w: fields.w ?? 240,
        h: fields.h ?? 180,
        assetId: fields.assetId || null,
        mime: fields.mime || 'image/png',
        ext: fields.ext || '.png',
        caption: fields.caption || '',
        title: fields.title || 'Image',
      };
    case 'table': {
      // Lazy import shape — avoid circular deps by inlining minimal grid
      const rows = fields.rows ?? 3;
      const cols = fields.cols ?? 3;
      let cells = fields.cells;
      if (!Array.isArray(cells)) {
        cells = [];
        for (let i = 0; i < rows; i++) {
          const row = [];
          for (let j = 0; j < cols; j++) row.push({ type: 'text', value: '' });
          cells.push(row);
        }
      }
      return {
        ...base,
        w: fields.w ?? Math.max(200, cols * 90),
        h: fields.h ?? Math.max(120, rows * 36 + 40),
        title: fields.title || 'Table',
        rows,
        cols,
        cells,
        colWidths: fields.colWidths || Array.from({ length: cols }, () => 88),
      };
    }
    default:
      return { ...base, title: fields.title || type };
  }
}

/**
 * Sync scene-cards from script scenes onto a board (merge by sceneId).
 */
export function syncSceneCards(graph, boardId, blocks) {
  const board = graph.boards[boardId];
  if (!board) return graph;
  const scenes = (blocks || []).filter((b) => b.type === 'scene');
  const items = { ...graph.items };
  const existingByScene = new Map();
  for (const id of board.items || []) {
    const it = items[id];
    if (it?.type === 'scene-card' && it.sceneId) existingByScene.set(it.sceneId, it);
  }
  const nextIds = (board.items || []).filter((id) => {
    const it = items[id];
    return !(it?.type === 'scene-card');
  });
  let col = 0;
  let row = 0;
  for (const sc of scenes) {
    const title = (sc.text || 'Scene').trim();
    let card = existingByScene.get(sc.id);
    if (card) {
      card = { ...card, title, sceneId: sc.id };
    } else {
      card = createBoardItem('scene-card', {
        boardId,
        sceneId: sc.id,
        title,
        x: 40 + col * 220,
        y: 40 + row * 130,
      });
      col += 1;
      if (col > 3) {
        col = 0;
        row += 1;
      }
    }
    items[card.id] = card;
    nextIds.push(card.id);
  }
  return {
    ...graph,
    items,
    boards: {
      ...graph.boards,
      [boardId]: { ...board, items: nextIds },
    },
  };
}

export function addItemToBoard(graph, boardId, item) {
  const board = graph.boards[boardId];
  if (!board) return graph;
  const it = { ...item, boardId };
  return {
    ...graph,
    items: { ...graph.items, [it.id]: it },
    boards: {
      ...graph.boards,
      [boardId]: { ...board, items: [...(board.items || []), it.id] },
    },
  };
}

export function updateBoardItem(graph, id, patch) {
  const it = graph.items[id];
  if (!it) return graph;
  return {
    ...graph,
    items: { ...graph.items, [id]: { ...it, ...patch, id: it.id } },
  };
}

export function removeBoardItem(graph, id) {
  const it = graph.items[id];
  if (!it) return graph;
  const items = { ...graph.items };
  delete items[id];
  const boards = { ...graph.boards };
  for (const bid of Object.keys(boards)) {
    const b = boards[bid];
    if ((b.items || []).includes(id)) {
      boards[bid] = { ...b, items: b.items.filter((x) => x !== id) };
    }
  }
  // Drop connectors that referenced it
  for (const [cid, c] of Object.entries(items)) {
    if (c.type === 'connector' && (c.fromId === id || c.toId === id)) {
      delete items[cid];
      for (const bid of Object.keys(boards)) {
        boards[bid] = {
          ...boards[bid],
          items: (boards[bid].items || []).filter((x) => x !== cid),
        };
      }
    }
  }
  return { ...graph, items, boards };
}

/**
 * Create nested board + tile on parent. Cycle-safe: target is new id only.
 */
export function createSubBoard(graph, parentBoardId, title = 'Sub-board') {
  const child = emptyBoard(title);
  child.parentId = parentBoardId;
  const tile = createBoardItem('sub-board', {
    boardId: parentBoardId,
    targetBoardId: child.id,
    title,
    x: 100,
    y: 100,
  });
  let next = {
    ...graph,
    boards: { ...graph.boards, [child.id]: child },
  };
  next = addItemToBoard(next, parentBoardId, tile);
  return { graph: next, boardId: child.id, tileId: tile.id };
}

export function breadcrumbPath(graph, boardId) {
  /** @type {{ id: string, title: string }[]} */
  const path = [];
  let id = boardId;
  const guard = new Set();
  while (id && graph.boards[id] && !guard.has(id)) {
    guard.add(id);
    const b = graph.boards[id];
    path.unshift({ id: b.id, title: b.title || 'Board' });
    id = b.parentId;
  }
  return path;
}

export function ensureProjectBoards(project) {
  if (project.boards?.rootId && project.boards?.boards) return project;
  return { ...project, boards: emptyBoardGraph() };
}
