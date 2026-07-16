/**
 * Offline project search — pure.
 */

/**
 * @param {object} project
 * @param {string} query
 * @returns {{ kind: string, id: string, title: string, snippet: string }[]}
 */
export function searchProject(project, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  /** @type {{ kind: string, id: string, title: string, snippet: string }[]} */
  const hits = [];

  for (const b of project.blocks || []) {
    const text = b.text || '';
    if (text.toLowerCase().includes(q)) {
      hits.push({
        kind: 'block',
        id: b.id,
        title: b.type,
        snippet: text.slice(0, 120),
      });
    }
  }
  for (const c of project.characters || []) {
    const blob = `${c.name || ''} ${c.role || ''} ${c.description || ''} ${c.notes || ''}`;
    if (blob.toLowerCase().includes(q)) {
      hits.push({ kind: 'character', id: c.id, title: c.name || 'Character', snippet: c.role || '' });
    }
  }
  for (const it of project.timeline?.items || []) {
    const blob = `${it.title || ''} ${it.description || ''}`;
    if (blob.toLowerCase().includes(q)) {
      hits.push({
        kind: 'timeline',
        id: it.id,
        title: it.title || 'Event',
        snippet: it.description || '',
      });
    }
  }
  for (const it of Object.values(project.boards?.items || {})) {
    const blob = `${it.title || ''} ${it.body || ''} ${it.summary || ''}`;
    if (blob.toLowerCase().includes(q)) {
      hits.push({
        kind: 'board',
        id: it.id,
        title: it.title || it.type,
        snippet: (it.body || it.summary || '').slice(0, 120),
      });
    }
  }
  return hits.slice(0, 50);
}
