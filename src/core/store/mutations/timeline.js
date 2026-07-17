/**
 * Pure timeline mutations on project.timeline
 */
import {
  createItem,
  syncScenesToTimeline,
  ensureProjectTimeline,
  demoItems,
  emptyTimeline,
} from '../../timeline/model.js';

function touch(project) {
  return { ...project, updatedAt: new Date().toISOString() };
}

export function setTimeline(project, { timeline }) {
  return touch({ ...project, timeline });
}

export function addTimelineItem(project, { item }) {
  const p = ensureProjectTimeline(project);
  const timeline = p.timeline;
  const next = createItem(item || {});
  return touch({
    ...p,
    timeline: {
      ...timeline,
      items: [...(timeline.items || []), next],
    },
  });
}

export function updateTimelineItem(project, { id, patch }) {
  const p = ensureProjectTimeline(project);
  const items = (p.timeline.items || []).map((it) => {
    if (it.id !== id) return it;
    const next = { ...it, ...patch, id: it.id };
    // Instant has no t1; explicit null clears it (Phase 9 kind toggle)
    if (next.kind === 'instant' || patch.t1 === null) {
      delete next.t1;
      next.kind = next.kind === 'span' && patch.t1 === null ? 'instant' : next.kind || 'instant';
      if (patch.kind === 'instant') next.kind = 'instant';
    }
    if (next.kind === 'span' && next.t1 == null) {
      next.t1 = (next.t0 || 0) + 365;
    }
    return next;
  });
  return touch({
    ...p,
    timeline: { ...p.timeline, items },
  });
}

export function removeTimelineItem(project, { id }) {
  const p = ensureProjectTimeline(project);
  return touch({
    ...p,
    timeline: {
      ...p.timeline,
      items: (p.timeline.items || []).filter((it) => it.id !== id),
    },
  });
}

export function syncTimelineFromScenes(project) {
  const p = ensureProjectTimeline(project);
  return touch({
    ...p,
    timeline: syncScenesToTimeline(p.timeline, p.blocks || []),
  });
}

export function seedDemoTimeline(project) {
  const p = ensureProjectTimeline(project);
  const base = p.timeline.items?.length ? p.timeline.items : [];
  const demos = demoItems().filter((d) => !base.some((b) => b.title === d.title));
  return touch({
    ...p,
    timeline: {
      ...p.timeline,
      items: [...base, ...demos],
    },
  });
}

export function resetTimeline(project) {
  return touch({
    ...project,
    timeline: emptyTimeline(),
  });
}
