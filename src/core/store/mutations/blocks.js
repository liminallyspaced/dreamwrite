/**
 * Pure block-list mutations. (project, payload) → project
 * No DOM. Structural sharing on the blocks array only.
 */

function nowIso() {
  return new Date().toISOString();
}

function touch(project) {
  return { ...project, updatedAt: nowIso() };
}

function findIndex(blocks, id) {
  return blocks.findIndex((b) => b && b.id === id);
}

/** @returns {object} */
export function setBlockText(project, { id, text }) {
  const blocks = project.blocks || [];
  const i = findIndex(blocks, id);
  if (i < 0) return project;
  if (blocks[i].text === text) return project;
  const next = blocks.slice();
  next[i] = { ...blocks[i], text: text ?? '' };
  return touch({ ...project, blocks: next });
}

/** @returns {object} */
export function setBlockType(project, { id, type, text }) {
  const blocks = project.blocks || [];
  const i = findIndex(blocks, id);
  if (i < 0) return project;
  const cur = blocks[i];
  const nextText = text !== undefined ? text : cur.text;
  if (cur.type === type && cur.text === nextText) return project;
  const next = blocks.slice();
  next[i] = { ...cur, type, text: nextText };
  return touch({ ...project, blocks: next });
}

/**
 * @param {{ index: number, block: object }} payload
 */
export function insertBlock(project, { index, block }) {
  if (!block || !block.id) return project;
  const blocks = (project.blocks || []).slice();
  const i = Math.max(0, Math.min(index, blocks.length));
  blocks.splice(i, 0, { ...block });
  return touch({ ...project, blocks });
}

/**
 * @param {{ id: string }} payload — removes by id
 * @returns {{ project: object, removed: object|null, index: number }}
 */
export function removeBlock(project, { id }) {
  const blocks = project.blocks || [];
  const i = findIndex(blocks, id);
  if (i < 0) return { project, removed: null, index: -1 };
  const removed = { ...blocks[i] };
  const next = blocks.slice();
  next.splice(i, 1);
  return { project: touch({ ...project, blocks: next }), removed, index: i };
}

/**
 * Replace entire blocks array (import, restore revision).
 * @param {{ blocks: object[] }} payload
 */
export function replaceBlocks(project, { blocks }) {
  return touch({
    ...project,
    blocks: Array.isArray(blocks) ? blocks.map((b) => ({ ...b })) : [],
  });
}

/**
 * Field-level text replace across all blocks (Replace All).
 * @param {{ find: string, replace: string, caseSensitive?: boolean }} payload
 * @returns {{ project: object, count: number, beforeBlocks: object[] }}
 */
export function replaceAllText(project, { find, replace, caseSensitive = false }) {
  const beforeBlocks = JSON.parse(JSON.stringify(project.blocks || []));
  if (!find) return { project, count: 0, beforeBlocks };

  const flags = caseSensitive ? 'g' : 'gi';
  // Escape regex specials in find string for literal match
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, flags);

  let count = 0;
  const blocks = (project.blocks || []).map((b) => {
    const text = b.text || '';
    if (!re.test(text)) {
      re.lastIndex = 0;
      return b;
    }
    re.lastIndex = 0;
    const next = text.replace(re, () => {
      count += 1;
      return replace;
    });
    return next === text ? b : { ...b, text: next };
  });

  if (count === 0) return { project, count: 0, beforeBlocks };
  return { project: touch({ ...project, blocks }), count, beforeBlocks };
}
