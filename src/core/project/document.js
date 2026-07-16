/**
 * Pure project document helpers — normalize loaded JSON, scrub gutter-label leaks.
 * No DOM. No store. Callers pass engine deps so this stays unit-testable without Electron.
 */

/**
 * Merge partial / imported project data onto an empty shell.
 * @param {object} data
 * @param {{ emptyProject: () => object }} deps
 */
export function normalizeProject(data, deps) {
  const base = deps.emptyProject();
  if (!data || typeof data !== 'object') return base;
  return {
    ...base,
    ...data,
    titlePage: { ...base.titlePage, ...(data.titlePage || {}) },
    blocks: Array.isArray(data.blocks) && data.blocks.length ? data.blocks : base.blocks,
    characters: data.characters || [],
    locations: data.locations || [],
    cards: data.cards || [],
    notes: data.notes || '',
    settings: { ...base.settings, ...(data.settings || {}) },
    history: data.history || [],
  };
}

/**
 * Strip gutter labels that used to leak into text when the gutter lived inside
 * contentEditable. Returns a new project; does not mutate the input.
 *
 * @param {object} project
 * @param {{
 *   normalizeType: (t: string) => string,
 *   uid: () => string,
 *   elementLabels: Record<string, string>,
 *   emptyProject: () => object,
 * }} deps
 */
export function sanitizeProject(project, deps) {
  const labels = Object.values(deps.elementLabels || {}).map((s) => String(s).toUpperCase());
  labels.push(
    'ACTION',
    'SCENE HEADING',
    'CHARACTER',
    'PARENTHETICAL',
    'DIALOGUE',
    'TRANSITION',
    'SHOT',
    'GENERAL'
  );

  const blocks = (project.blocks || []).map((b) => {
    let t = typeof b.text === 'string' ? b.text.replace(/\r\n/g, '\n') : '';
    for (const lab of labels) {
      const escaped = lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reEnd = new RegExp(`\\s*${escaped}\\s*$`, 'i');
      if (t.trim().toUpperCase() === lab) t = '';
      else if (reEnd.test(t) && t.trim().length <= lab.length + 2) t = t.replace(reEnd, '');
    }
    return {
      ...b,
      text: t,
      type: deps.normalizeType(b.type),
      id: b.id || deps.uid(),
    };
  });

  if (!blocks.length) {
    return {
      ...project,
      blocks: deps.emptyProject().blocks,
    };
  }

  return { ...project, blocks };
}

/**
 * Deep clone + industry normalize for export (CONT'D pass optional via engine).
 * @param {object} project
 * @param {{ normalizeProject: (p: object, opts?: object) => object }} deps
 * @param {{ contd?: boolean }} [opts]
 */
export function exportReadyProject(project, deps, opts = { contd: true }) {
  const clone = JSON.parse(JSON.stringify(project));
  return deps.normalizeProject(clone, opts);
}
