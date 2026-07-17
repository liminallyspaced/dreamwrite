/**
 * Slight per-page typewriter wander — authentic paper, not broken layout.
 *
 * Real typewriters rarely seat every sheet the same: left origin and first
 * line wander a hair. We mimic that with **deterministic** micro-offsets so:
 *   - page N always looks the same for a given seed
 *   - wrap / paginate / golden tests stay pure geometry (this is paint only)
 *
 * Ranges stay sub-millimeter-ish (±~0.03") so industry margins still read true.
 */

/**
 * @param {number} n
 * @param {number} [salt]
 * @returns {number} 0..1
 */
function unitHash(n, salt = 0) {
  let h = Math.imul(Math.max(1, n | 0) ^ (salt + 0x9e3779b9), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * @typedef {{
 *   dxIn: number,
 *   dyIn: number,
 *   dxPx: number,
 *   dyPx: number,
 * }} TypewriterJitter
 */

/**
 * Per-page micro offset. Pure / deterministic.
 *
 * @param {number} pageNumber 1-based
 * @param {{
 *   seed?: number,
 *   maxXIn?: number,
 *   maxYIn?: number,
 *   enabled?: boolean,
 *   dpi?: number,
 * }} [opts]
 * @returns {TypewriterJitter}
 */
export function pageTypewriterJitter(pageNumber, opts = {}) {
  if (opts.enabled === false) {
    return { dxIn: 0, dyIn: 0, dxPx: 0, dyPx: 0 };
  }
  const maxX = opts.maxXIn ?? 0.028; // ~0.7mm — barely visible, real platen drift
  const maxY = opts.maxYIn ?? 0.018; // ~0.45mm
  const seed = opts.seed ?? 0;
  const dpi = opts.dpi ?? 96;
  const n = Math.max(1, pageNumber | 0);

  // Independent axes; different salts so diagonal isn't correlated
  const rx = unitHash(n, seed + 1) * 2 - 1;
  const ry = unitHash(n, seed + 97) * 2 - 1;
  // Quantize to 0.001" so CSS/PDF strings stay stable
  const dxIn = Math.round(rx * maxX * 1000) / 1000;
  const dyIn = Math.round(ry * maxY * 1000) / 1000;
  return {
    dxIn,
    dyIn,
    dxPx: Math.round(dxIn * dpi * 10) / 10,
    dyPx: Math.round(dyIn * dpi * 10) / 10,
  };
}

/**
 * Stable seed from a project id / title so different scripts drift differently
 * without using Math.random().
 * @param {string|null|undefined} key
 * @returns {number}
 */
export function jitterSeedFromKey(key) {
  const s = String(key || 'dreamwrite');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
