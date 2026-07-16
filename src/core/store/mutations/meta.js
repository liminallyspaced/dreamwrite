/**
 * Title page, notes, settings — pure project meta mutations.
 */

function touch(project) {
  return { ...project, updatedAt: new Date().toISOString() };
}

export function setTitlePage(project, { titlePage }) {
  return touch({
    ...project,
    titlePage: { ...(project.titlePage || {}), ...(titlePage || {}) },
  });
}

export function setNotes(project, { notes }) {
  if ((project.notes || '') === (notes || '')) return project;
  return touch({ ...project, notes: notes ?? '' });
}

export function setSettings(project, { settings }) {
  return touch({
    ...project,
    settings: { ...(project.settings || {}), ...(settings || {}) },
  });
}

/**
 * Manual revision snapshot list (long-term history, not interactive undo).
 * Kept separate from the command stack; still pure.
 */
export function pushRevisionSnapshot(project, { id, label, blocks, at }) {
  const history = Array.isArray(project.history) ? project.history.slice() : [];
  history.push({
    id,
    label: label || 'edit',
    at: at || new Date().toISOString(),
    blocks: JSON.parse(JSON.stringify(blocks ?? project.blocks ?? [])),
  });
  while (history.length > 30) history.shift();
  return touch({ ...project, history });
}
