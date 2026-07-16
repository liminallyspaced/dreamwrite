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

export function boardRemoveItem(project, { id }) {
  const p = ensureProjectBoards(project);
  return touch({
    ...p,
    boards: removeBoardItem(p.boards, id),
  });
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
