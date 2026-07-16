/**
 * Shared 2D camera for timeline (X=time constrained) and board (free).
 * Pure. Layout: screen = (world - origin) * scale + offset.
 */

export function createCamera(opts = {}) {
  return {
    /** World origin in x (timeline: t0 ticks; board: world x) */
    x0: opts.x0 ?? 0,
    /** World origin in y (board only; timeline uses lanes) */
    y0: opts.y0 ?? 0,
    /** Pixels per world unit (timeline: pxPerTick) */
    scale: opts.scale ?? 4,
    /** Viewport pan offset in screen pixels */
    panX: opts.panX ?? 0,
    panY: opts.panY ?? 0,
    /** Constraints */
    lockY: opts.lockY ?? false,
    minScale: opts.minScale ?? 0.25,
    maxScale: opts.maxScale ?? 64,
  };
}

/** World → screen X */
export function worldToScreenX(cam, wx) {
  return (wx - cam.x0) * cam.scale + cam.panX;
}

/** Screen → world X */
export function screenToWorldX(cam, sx) {
  return (sx - cam.panX) / cam.scale + cam.x0;
}

export function worldToScreenY(cam, wy) {
  return (wy - cam.y0) * cam.scale + cam.panY;
}

export function screenToWorldY(cam, sy) {
  return (sy - cam.panY) / cam.scale + cam.y0;
}

/**
 * Zoom about a screen point (cursor).
 * @param {object} cam
 * @param {number} factor  e.g. 1.1 or 0.9
 * @param {number} screenX
 * @param {number} [screenY]
 */
export function zoomAt(cam, factor, screenX, screenY = 0) {
  const beforeX = screenToWorldX(cam, screenX);
  const beforeY = cam.lockY ? 0 : screenToWorldY(cam, screenY);
  let scale = cam.scale * factor;
  scale = Math.max(cam.minScale, Math.min(cam.maxScale, scale));
  const next = { ...cam, scale };
  // Keep world point under cursor
  next.panX = screenX - (beforeX - next.x0) * next.scale;
  if (!cam.lockY) {
    next.panY = screenY - (beforeY - next.y0) * next.scale;
  }
  return next;
}

export function panBy(cam, dx, dy) {
  return {
    ...cam,
    panX: cam.panX + dx,
    panY: cam.lockY ? cam.panY : cam.panY + dy,
  };
}

/** Fit world range [w0,w1] into viewport width with padding. */
export function fitX(cam, w0, w1, viewportWidth, pad = 48) {
  const span = Math.max(1, w1 - w0);
  const usable = Math.max(1, viewportWidth - pad * 2);
  const scale = Math.max(cam.minScale, Math.min(cam.maxScale, usable / span));
  return {
    ...cam,
    scale,
    x0: w0,
    panX: pad,
  };
}
