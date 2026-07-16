/**
 * Pure string helpers for the renderer — no DOM, no project state.
 * Extracted from app.js (split against the store, leaf first).
 */

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

/**
 * Only let a known-good colour reach a style attribute.
 * findings.md §5.5 — whitelist, do not CSS-escape into style=.
 */
export function safeColor(value, fallback = '#6ea8ff') {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(v) || /^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^[a-z]{3,20}$/i.test(v)) return v;
  return fallback;
}

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function slugify(s) {
  return (
    String(s || 'script')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'script'
  );
}

export function baseName(p) {
  return String(p || 'Imported')
    .split(/[/\\]/)
    .pop()
    .replace(/\.[^.]+$/, '');
}
