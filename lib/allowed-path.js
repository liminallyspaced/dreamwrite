/**
 * Phase 6 fs gate — pure path check for renderer-supplied paths.
 * Main process and unit tests share this module.
 *
 * @param {string} filePath
 * @param {string[]} allowedRoots absolute roots that may contain the path
 * @param {(p: string) => string} resolve path.resolve-compatible
 * @param {string} sep path.sep
 * @returns {string} resolved absolute path
 */
function assertPathAllowed(filePath, allowedRoots, resolve, sep) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Path required');
  }
  const resolved = resolve(filePath);
  const roots = (allowedRoots || []).filter(Boolean).map((r) => resolve(r));
  const ok = roots.some((root) => resolved === root || resolved.startsWith(root + sep));
  if (!ok) {
    throw new Error('Path outside allowed directories');
  }
  return resolved;
}

module.exports = { assertPathAllowed };
