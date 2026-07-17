/**
 * Connector geometry — pure. Phase 8b.
 * Anchors attach to card edges and reflow when cards move.
 */

/**
 * @typedef {{ x: number, y: number, w?: number, h?: number }} CardBox
 * @typedef {'n'|'s'|'e'|'w'|'c'} Side
 */

/**
 * Point on a card for a named side (world coords).
 * @param {CardBox} card
 * @param {Side} [side]
 */
export function cardAnchor(card, side = 'c') {
  const x = card.x ?? 0;
  const y = card.y ?? 0;
  const w = Math.max(1, card.w ?? 200);
  const h = Math.max(1, card.h ?? 120);
  switch (side) {
    case 'n':
      return { x: x + w / 2, y };
    case 's':
      return { x: x + w / 2, y: y + h };
    case 'e':
      return { x: x + w, y: y + h / 2 };
    case 'w':
      return { x, y: y + h / 2 };
    case 'c':
    default:
      return { x: x + w / 2, y: y + h / 2 };
  }
}

/**
 * Best side of `from` facing toward `to` point/card center.
 * @param {CardBox} from
 * @param {{ x: number, y: number }} toward
 * @returns {Side}
 */
export function facingSide(from, toward) {
  const c = cardAnchor(from, 'c');
  const dx = (toward.x ?? 0) - c.x;
  const dy = (toward.y ?? 0) - c.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'e' : 'w';
  return dy >= 0 ? 's' : 'n';
}

/**
 * Pick sides for two cards (outward toward each other).
 * @param {CardBox} a
 * @param {CardBox} b
 */
export function facingSides(a, b) {
  const ca = cardAnchor(a, 'c');
  const cb = cardAnchor(b, 'c');
  return {
    fromSide: facingSide(a, cb),
    toSide: facingSide(b, ca),
  };
}

/**
 * Shift-constrain a free endpoint to H or V relative to origin.
 * @param {{ x: number, y: number }} origin
 * @param {{ x: number, y: number }} point
 */
export function constrainHV(origin, point) {
  const dx = Math.abs((point.x ?? 0) - (origin.x ?? 0));
  const dy = Math.abs((point.y ?? 0) - (origin.y ?? 0));
  if (dx >= dy) return { x: point.x, y: origin.y };
  return { x: origin.x, y: point.y };
}

/**
 * SVG path for a connector.
 * @param {{ x: number, y: number }} p0
 * @param {{ x: number, y: number }} p1
 * @param {{ curved?: boolean, mid?: { x: number, y: number } | null }} [opts]
 */
export function connectorPathD(p0, p1, opts = {}) {
  const x1 = p0.x;
  const y1 = p0.y;
  const x2 = p1.x;
  const y2 = p1.y;
  if (!opts.curved) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  // Mid control: default elbow-ish quadratic
  const mid = opts.mid || {
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
  };
  // Pull control off the chord for a visible curve
  const cx = mid.x + (y2 - y1) * 0.15;
  const cy = mid.y - (x2 - x1) * 0.15;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

/**
 * Midpoint of segment (for labels / curve handles).
 * @param {{ x: number, y: number }} p0
 * @param {{ x: number, y: number }} p1
 */
export function segmentMid(p0, p1) {
  return {
    x: ((p0.x ?? 0) + (p1.x ?? 0)) / 2,
    y: ((p0.y ?? 0) + (p1.y ?? 0)) / 2,
  };
}

/**
 * Resolve endpoints for a connector item given the item store.
 * @param {object} connector
 * @param {Record<string, object>} items
 * @returns {{ p0: {x:number,y:number}, p1: {x:number,y:number}, ok: boolean }}
 */
export function resolveEndpoints(connector, items) {
  const from = items?.[connector.fromId];
  if (!from) return { p0: { x: 0, y: 0 }, p1: { x: 0, y: 0 }, ok: false };

  let p1;
  let toSide = connector.toSide;
  if (connector.toId && items[connector.toId]) {
    const to = items[connector.toId];
    if (!connector.fromSide || !connector.toSide) {
      const auto = facingSides(from, to);
      p1 = cardAnchor(to, connector.toSide || auto.toSide);
      toSide = connector.toSide || auto.toSide;
    } else {
      p1 = cardAnchor(to, toSide);
    }
  } else if (connector.freeX != null && connector.freeY != null) {
    p1 = { x: connector.freeX, y: connector.freeY };
  } else {
    return { p0: { x: 0, y: 0 }, p1: { x: 0, y: 0 }, ok: false };
  }

  const fromSide =
    connector.fromSide ||
    (connector.toId && items[connector.toId]
      ? facingSides(from, items[connector.toId]).fromSide
      : facingSide(from, p1));
  const p0 = cardAnchor(from, fromSide);
  return { p0, p1, ok: true, fromSide, toSide };
}

/**
 * Hit-test which card contains a world point.
 * @param {Array<object>} cards
 * @param {{ x: number, y: number }} pt
 */
export function hitTestCard(cards, pt) {
  // Topmost last in list wins — reverse scan
  for (let i = (cards || []).length - 1; i >= 0; i--) {
    const c = cards[i];
    if (!c || c.type === 'connector') continue;
    const w = c.w ?? 200;
    const h = c.h ?? 120;
    if (pt.x >= c.x && pt.x <= c.x + w && pt.y >= c.y && pt.y <= c.y + h) {
      return c;
    }
  }
  return null;
}

/**
 * Build a connector item payload (not yet in graph).
 * @param {object} fields
 */
export function makeConnectorFields(fields = {}) {
  return {
    type: 'connector',
    fromId: fields.fromId,
    toId: fields.toId ?? null,
    freeX: fields.freeX ?? null,
    freeY: fields.freeY ?? null,
    fromSide: fields.fromSide || null,
    toSide: fields.toSide || null,
    label: fields.label || '',
    curved: fields.curved !== false,
    color: fields.color || 'rgba(30,25,20,0.55)',
    weight: fields.weight ?? 1.5,
  };
}
