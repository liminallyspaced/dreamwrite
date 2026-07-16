/**
 * Timeline document model — pure.
 * Items store absolute integer ticks only.
 */

import { createBbyAbyCalendar, validateCalendar } from './calendar.js';

export function uid(prefix = 'tl') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyTimeline(opts = {}) {
  const calendar = opts.calendar || createBbyAbyCalendar();
  const v = validateCalendar(calendar);
  if (!v.ok) throw new Error(v.error);
  return {
    id: opts.id || uid('timeline'),
    name: opts.name || 'Story timeline',
    calendarId: calendar.id,
    calendar,
    items: [],
  };
}

/**
 * @param {Partial<{id, entityId, kind, t0, t1, title, description, color, lane, assetId}>} fields
 */
export function createItem(fields = {}) {
  const kind = fields.kind === 'span' ? 'span' : 'instant';
  const t0 = Number.isFinite(fields.t0) ? Math.trunc(fields.t0) : 0;
  const item = {
    id: fields.id || uid('item'),
    entityId: fields.entityId ?? null,
    kind,
    t0,
    title: fields.title || 'Untitled',
    description: fields.description || '',
    color: fields.color || '#333',
    icon: fields.icon || null,
    assetId: fields.assetId || null,
    lane: fields.lane != null ? fields.lane : null,
  };
  if (kind === 'span') {
    item.t1 = Number.isFinite(fields.t1) ? Math.trunc(fields.t1) : t0 + 365;
    if (item.t1 < item.t0) {
      const s = item.t0;
      item.t0 = item.t1;
      item.t1 = s;
    }
  }
  return item;
}

/**
 * Seed timeline instants from scene blocks (entity link).
 * Does not remove existing non-scene items.
 * @param {object} timeline
 * @param {Array<{id: string, type: string, text?: string}>} blocks
 * @param {{ startTick?: number, stepDays?: number }} [opts]
 */
export function syncScenesToTimeline(timeline, blocks, opts = {}) {
  const start = opts.startTick ?? -10 * 365;
  const step = opts.stepDays ?? 90;
  const scenes = (blocks || []).filter((b) => b.type === 'scene');
  const byEntity = new Map(
    (timeline.items || []).filter((i) => i.entityId).map((i) => [i.entityId, i])
  );
  const kept = (timeline.items || []).filter((i) => !i.entityId);
  let i = 0;
  for (const sc of scenes) {
    const existing = byEntity.get(sc.id);
    const title = (sc.text || 'Scene').trim() || 'Scene';
    if (existing) {
      kept.push({ ...existing, title, entityId: sc.id });
    } else {
      kept.push(
        createItem({
          entityId: sc.id,
          kind: 'instant',
          t0: start + i * step,
          title,
          color: '#222',
        })
      );
    }
    i += 1;
  }
  return { ...timeline, items: kept, updatedAt: new Date().toISOString() };
}

/**
 * Star Wars-flavoured demo items for the empty timeline (clip reference).
 */
export function demoItems() {
  const d = 365;
  return [
    createItem({ kind: 'span', t0: -22 * d, t1: -19 * d, title: 'Clone Wars', color: '#444' }),
    createItem({ kind: 'span', t0: -19 * d, t1: 4 * d, title: 'Galactic Empire', color: '#555' }),
    createItem({ kind: 'span', t0: 0, t1: 5 * d, title: 'Galactic Civil War', color: '#222' }),
    createItem({ kind: 'instant', t0: -22 * d, title: 'First Battle of Geonosis', color: '#333' }),
    createItem({ kind: 'instant', t0: -19 * d, title: 'Order 66', color: '#111' }),
    createItem({ kind: 'instant', t0: 0, title: 'Battle of Yavin', color: '#000' }),
    createItem({ kind: 'instant', t0: 3 * d, title: 'Battle of Hoth', color: '#333' }),
    createItem({ kind: 'instant', t0: 4 * d, title: 'Battle of Endor', color: '#222' }),
    createItem({ kind: 'span', t0: -19 * d, t1: 35 * d, title: 'Luke Skywalker', color: '#666' }),
  ];
}

export function ensureProjectTimeline(project) {
  if (project.timeline && project.timeline.calendar) return project;
  return {
    ...project,
    timeline: emptyTimeline(),
  };
}
