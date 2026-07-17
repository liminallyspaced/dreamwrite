/**
 * Project format v2 — folder container + content-addressed assets.
 * Pure helpers for document shape, asset paths, migration.
 *
 * @see docs/architecture/decisions/0004-project-format-v2-and-assets.md
 */

export const FORMAT_V2 = 2;
export const FORMAT_V1 = 1;

/**
 * Relative path for a content-addressed asset: assets/ab/cd/<hash><ext>
 * @param {string} hash  sha256 hex
 * @param {string} [ext] e.g. '.png'
 */
export function assetRelativePath(hash, ext = '') {
  const h = String(hash || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  if (h.length < 8) throw new Error('Invalid asset hash');
  const e = ext && ext.startsWith('.') ? ext : ext ? `.${ext}` : '';
  return ['assets', h.slice(0, 2), h.slice(2, 4), `${h}${e}`].join('/');
}

/**
 * Collect all asset hashes referenced by the project (boards + timeline).
 * @param {object} project
 * @returns {string[]}
 */
export function collectAssetIds(project) {
  const ids = new Set();
  const items = project?.boards?.items || {};
  for (const it of Object.values(items)) {
    if (it?.assetId) ids.add(String(it.assetId).toLowerCase());
  }
  for (const it of project?.timeline?.items || []) {
    if (it?.assetId) ids.add(String(it.assetId).toLowerCase());
  }
  return [...ids];
}

/**
 * Strip revision history from the live document for project.json.
 * History is stored under revisions/ on disk.
 * @param {object} project
 */
export function documentForProjectJson(project) {
  const clone = JSON.parse(JSON.stringify(project || {}));
  const history = Array.isArray(clone.history) ? clone.history : [];
  delete clone.history;
  clone.version = FORMAT_V2;
  clone.format = 'platen';
  clone.updatedAt = clone.updatedAt || new Date().toISOString();
  return { document: clone, history };
}

/**
 * Merge loaded project.json + optional history back into a runtime project.
 * @param {object} document
 * @param {object[]} [history]
 */
export function projectFromDisk(document, history = []) {
  const p = {
    ...document,
    version: FORMAT_V2,
    format: 'platen',
    history: Array.isArray(history) ? history : [],
  };
  return p;
}

/**
 * Migrate a v1 flat JSON object to v2 document shape (in memory).
 * Does not touch the filesystem — caller writes a copy.
 * @param {object} data
 */
export function migrateV1Document(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid project data');
  }
  const version = Number(data.version) || 1;
  if (version >= FORMAT_V2) {
    return projectFromDisk(data, data.history || []);
  }
  return projectFromDisk(
    {
      ...data,
      version: FORMAT_V2,
      format: 'platen',
      timeline: data.timeline || null,
      boards: data.boards || null,
      tags: data.tags || [],
    },
    data.history || []
  );
}

/**
 * Detect format of a path description (from main process metadata).
 * @param {{ isDirectory?: boolean, hasProjectJson?: boolean, version?: number }} meta
 */
export function detectPackageKind(meta = {}) {
  if (meta.isDirectory && meta.hasProjectJson) return 'v2-folder';
  if (meta.isDirectory) return 'unknown-folder';
  return 'v1-file';
}

/**
 * Empty asset index entry (optional sidecar; hashes are authoritative).
 * @param {string} hash
 * @param {{ mime?: string, ext?: string, bytes?: number, originalName?: string }} info
 */
export function assetManifestEntry(hash, info = {}) {
  return {
    hash: String(hash).toLowerCase(),
    mime: info.mime || 'application/octet-stream',
    ext: info.ext || '',
    bytes: info.bytes || 0,
    originalName: info.originalName || '',
    addedAt: new Date().toISOString(),
  };
}

/**
 * MIME → file extension
 * @param {string} mime
 */
export function extForMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/png') return '.png';
  if (m === 'image/jpeg' || m === 'image/jpg') return '.jpg';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/gif') return '.gif';
  if (m === 'image/svg+xml') return '.svg';
  return '';
}

/**
 * Build platen:// URL for an asset hash.
 * @param {string} hash
 * @param {string} [ext]
 */
export function platenAssetUrl(hash, ext = '') {
  const h = String(hash).toLowerCase();
  const e = ext && !ext.startsWith('.') ? `.${ext}` : ext || '';
  return `platen://asset/${h}${e}`;
}
