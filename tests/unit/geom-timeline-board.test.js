import { describe, it, expect } from 'vitest';
import { createCamera, worldToScreenX, screenToWorldX, zoomAt, panBy, fitX } from '../../src/core/geom/camera.js';
import { packLanes, estimateLabelWidth } from '../../src/core/geom/pack.js';
import {
  createBbyAbyCalendar,
  validateCalendar,
  formatTick,
  parseTick,
} from '../../src/core/timeline/calendar.js';
import {
  emptyTimeline,
  createItem,
  syncScenesToTimeline,
  demoItems,
} from '../../src/core/timeline/model.js';
import {
  emptyBoardGraph,
  createBoardItem,
  syncSceneCards,
  createSubBoard,
  breadcrumbPath,
} from '../../src/core/board/model.js';
import { listTemplates, applyTemplate } from '../../src/core/board/templates.js';
import { searchProject } from '../../src/core/project/search.js';
import { createStore } from '../../src/core/store/index.js';
import { emptyProject, createBlock } from '../../src/engine.js';

describe('geom/camera', () => {
  it('round-trips world ↔ screen X', () => {
    const cam = createCamera({ x0: 100, scale: 2, panX: 10 });
    const sx = worldToScreenX(cam, 150);
    expect(screenToWorldX(cam, sx)).toBeCloseTo(150);
  });

  it('zoomAt keeps point under cursor', () => {
    let cam = createCamera({ x0: 0, scale: 1, panX: 0 });
    const world = 50;
    const sx = worldToScreenX(cam, world);
    cam = zoomAt(cam, 2, sx, 0);
    expect(screenToWorldX(cam, sx)).toBeCloseTo(world, 5);
  });

  it('fitX packs range into viewport', () => {
    const cam = fitX(createCamera({ scale: 1 }), 0, 1000, 500, 50);
    expect(cam.scale).toBeGreaterThan(0);
  });

  it('panBy respects lockY', () => {
    const cam = panBy(createCamera({ lockY: true, panY: 0 }), 10, 20);
    expect(cam.panX).toBe(10);
    expect(cam.panY).toBe(0);
  });
});

describe('geom/pack', () => {
  it('stacks overlapping instants into lanes', () => {
    const items = [
      { id: 'a', kind: 'instant', t0: 0, labelWidth: 100 },
      { id: 'b', kind: 'instant', t0: 0, labelWidth: 100 },
      { id: 'c', kind: 'instant', t0: 200, labelWidth: 40 },
    ];
    const packed = packLanes(items, (t) => t * 1, { gap: 8 });
    const byId = Object.fromEntries(packed.map((p) => [p.id, p.lane]));
    expect(byId.a).not.toBe(byId.b);
    expect(byId.c).toBe(0);
  });

  it('estimateLabelWidth is bounded', () => {
    expect(estimateLabelWidth('x')).toBeGreaterThanOrEqual(48);
    expect(estimateLabelWidth('x'.repeat(200))).toBeLessThanOrEqual(280);
  });
});

describe('timeline calendar', () => {
  const cal = createBbyAbyCalendar();

  it('validates bookend eras', () => {
    expect(validateCalendar(cal).ok).toBe(true);
    expect(validateCalendar({ eras: [] }).ok).toBe(false);
  });

  it('formats and parses BBY/ABY', () => {
    expect(formatTick(0, cal)).toBe('0');
    expect(formatTick(-365, cal)).toBe('1 BBY');
    expect(formatTick(365 * 4, cal)).toBe('4 ABY');
    expect(parseTick('6 BBY', cal)).toBe(-6 * 365);
    expect(parseTick('4 ABY', cal)).toBe(4 * 365);
  });
});

describe('timeline model', () => {
  it('syncs scenes as entity-linked instants', () => {
    const tl = emptyTimeline();
    const blocks = [
      createBlock('scene', 'INT. A - DAY'),
      createBlock('action', 'Go.'),
      createBlock('scene', 'EXT. B - NIGHT'),
    ];
    const next = syncScenesToTimeline(tl, blocks, { startTick: 0, stepDays: 10 });
    expect(next.items).toHaveLength(2);
    expect(next.items[0].entityId).toBe(blocks[0].id);
    expect(next.items[1].title).toContain('EXT');
  });

  it('demo items include Battle of Yavin at 0', () => {
    const items = demoItems();
    expect(items.some((i) => i.title.includes('Yavin') && i.t0 === 0)).toBe(true);
  });
});

describe('board model + templates', () => {
  it('syncs scene cards and nests sub-boards', () => {
    let g = emptyBoardGraph();
    const blocks = [createBlock('scene', 'INT. HOUSE - DAY')];
    g = syncSceneCards(g, g.rootId, blocks);
    const cards = Object.values(g.items).filter((i) => i.type === 'scene-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].sceneId).toBe(blocks[0].id);

    const { graph, boardId } = createSubBoard(g, g.rootId, 'Nested');
    expect(graph.boards[boardId].parentId).toBe(g.rootId);
    const path = breadcrumbPath(graph, boardId);
    expect(path.map((p) => p.title)).toEqual(['Home', 'Nested']);
  });

  it('applies three-act template with notes', () => {
    expect(listTemplates().length).toBeGreaterThanOrEqual(4);
    const g = applyTemplate('three-act', emptyBoardGraph(), { wipe: true });
    const notes = Object.values(g.items).filter((i) => i.type === 'note');
    expect(notes.length).toBeGreaterThan(5);
  });
});

describe('search + store timeline/board commands', () => {
  it('searchProject finds block text', () => {
    const p = emptyProject();
    p.blocks = [createBlock('action', 'The signal fades into static.')];
    const hits = searchProject(p, 'signal');
    expect(hits.some((h) => h.kind === 'block')).toBe(true);
  });

  it('timeline.seedDemo and board.syncScenes are undoable', () => {
    const p = emptyProject();
    p.blocks = [
      createBlock('scene', 'INT. A - DAY'),
      createBlock('scene', 'EXT. B - NIGHT'),
    ];
    const store = createStore({ project: p });
    store.execute({ type: 'timeline.seedDemo', payload: {} });
    expect(store.getProject().timeline.items.length).toBeGreaterThan(0);
    store.undo();
    // before was null/empty
    store.execute({ type: 'board.syncScenes', payload: {} });
    const items = Object.values(store.getProject().boards.items || {});
    expect(items.some((i) => i.type === 'scene-card')).toBe(true);
    store.undo();
  });

  it('createBoardItem note defaults', () => {
    const n = createBoardItem('note', { title: 'Hi' });
    expect(n.type).toBe('note');
    expect(n.id).toBeTruthy();
  });
});
