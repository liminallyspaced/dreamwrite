/**
 * Pure board graph mutations on project.boards
 */
import {
  ensureProjectBoards,
  addItemToBoard,
  updateBoardItem,
  removeBoardItem,
  createBoardItem,
  createSubBoard,
  syncSceneCards,
  emptyBoardGraph,
} from '../../board/model.js';
import { applyTemplate } from '../../board/templates.js';

function touch(project) {
  return { ...project, updatedAt: new Date().toISOString() };
}

export function setBoards(project, { boards }) {
  return touch({ ...project, boards });
}

export function boardAddItem(project, { boardId, item }) {
  const p = ensureProjectBoards(project);
  const it =
    item?.id && item?.type
      ? item
      : createBoardItem(item?.type || 'note', { ...item, boardId: boardId || p.boards.rootId });
  const bid = boardId || p.boards.rootId;
  return touch({
    ...p,
    boards: addItemToBoard(p.boards, bid, it),
  });
}

export function boardUpdateItem(project, { id, patch }) {
  const p = ensureProjectBoards(project);
  return touch({
    ...p,
    boards: updateBoardItem(p.boards, id, patch),
  });
}

/**
 * Batch update many items in one gesture (group move / multi-resize).
 * @param {object} project
 * @param {{ updates: Array<{ id: string, patch: object }> }} payload
 */
export function boardUpdateItems(project, { updates }) {
  let p = ensureProjectBoards(project);
  let boards = p.boards;
  for (const u of updates || []) {
    if (!u?.id || !u.patch) continue;
    boards = updateBoardItem(boards, u.id, u.patch);
  }
  return touch({ ...p, boards });
}

export function boardRemoveItem(project, { id }) {
  const p = ensureProjectBoards(project);
  return touch({
    ...p,
    boards: removeBoardItem(p.boards, id),
  });
}

/**
 * Bulk delete in one undo step.
 * @param {object} project
 * @param {{ ids: string[] }} payload
 */
export function boardRemoveItems(project, { ids }) {
  let p = ensureProjectBoards(project);
  let boards = p.boards;
  for (const id of ids || []) {
    boards = removeBoardItem(boards, id);
  }
  return touch({ ...p, boards });
}

export function boardSyncScenes(project, { boardId } = {}) {
  const p = ensureProjectBoards(project);
  const bid = boardId || p.boards.rootId;
  return touch({
    ...p,
    boards: syncSceneCards(p.boards, bid, p.blocks || []),
  });
}

export function boardCreateSubBoard(project, { parentBoardId, title }) {
  const p = ensureProjectBoards(project);
  const parent = parentBoardId || p.boards.rootId;
  const { graph } = createSubBoard(p.boards, parent, title || 'Sub-board');
  return touch({ ...p, boards: graph });
}

export function boardApplyTemplate(project, { templateId, wipe }) {
  const p = ensureProjectBoards(project);
  const boards = applyTemplate(templateId, wipe ? emptyBoardGraph() : p.boards, { wipe: !!wipe });
  return touch({ ...p, boards });
}
