import { describe, it, expect } from 'vitest';
import {
  FORMAT_V2,
  assetRelativePath,
  collectAssetIds,
  documentForProjectJson,
  projectFromDisk,
  migrateV1Document,
  detectPackageKind,
  assetManifestEntry,
  extForMime,
  platenAssetUrl,
} from '../../src/core/project/format-v2.js';
import {
  emptyCell,
  createTableGrid,
  normalizeTable,
  setCell,
  resizeTable,
  evaluateCellDisplay,
} from '../../src/core/board/table.js';
import { createBoardItem, emptyBoardGraph, addItemToBoard } from '../../src/core/board/model.js';

describe('format-v2', () => {
  it('builds content-addressed fanout paths', () => {
    const h = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    expect(assetRelativePath(h, '.png')).toBe(`assets/ab/cd/${h}.png`);
    expect(assetRelativePath(h, 'jpg')).toBe(`assets/ab/cd/${h}.jpg`);
  });

  it('rejects short hashes', () => {
    expect(() => assetRelativePath('abc')).toThrow(/Invalid/);
  });

  it('collects asset ids from boards', () => {
    const project = {
      boards: {
        items: {
          a: { type: 'image', assetId: 'AAA111' },
          b: { type: 'note' },
          c: { type: 'image', assetId: 'bbb222' },
        },
      },
      timeline: { items: [{ assetId: 'ccc333' }] },
    };
    const ids = collectAssetIds(project);
    expect(ids).toContain('aaa111');
    expect(ids).toContain('bbb222');
    expect(ids).toContain('ccc333');
  });

  it('strips history for project.json and restores on load', () => {
    const project = {
      version: 1,
      format: 'platen',
      titlePage: { title: 'Test' },
      history: [{ t: 1 }, { t: 2 }],
      blocks: [],
    };
    const { document, history } = documentForProjectJson(project);
    expect(document.history).toBeUndefined();
    expect(document.version).toBe(FORMAT_V2);
    expect(history).toHaveLength(2);
    const restored = projectFromDisk(document, history);
    expect(restored.history).toHaveLength(2);
    expect(restored.version).toBe(FORMAT_V2);
  });

  it('migrates v1 in memory without dropping entities', () => {
    const v1 = {
      version: 1,
      format: 'platen',
      titlePage: { title: 'Old' },
      blocks: [{ id: 'b1', type: 'action', text: 'Hi' }],
      characters: [{ id: 'c1', name: 'A' }],
      history: [{ snap: true }],
    };
    const v2 = migrateV1Document(v1);
    expect(v2.version).toBe(FORMAT_V2);
    expect(v2.blocks[0].text).toBe('Hi');
    expect(v2.history).toHaveLength(1);
  });

  it('detects package kinds', () => {
    expect(detectPackageKind({ isDirectory: true, hasProjectJson: true })).toBe('v2-folder');
    expect(detectPackageKind({ isDirectory: true })).toBe('unknown-folder');
    expect(detectPackageKind({})).toBe('v1-file');
  });

  it('mime helpers and platen urls', () => {
    expect(extForMime('image/png')).toBe('.png');
    expect(extForMime('image/jpeg')).toBe('.jpg');
    expect(platenAssetUrl('deadbeef', '.png')).toBe('platen://asset/deadbeef.png');
    expect(assetManifestEntry('abc', { mime: 'image/png', bytes: 10 }).hash).toBe('abc');
  });
});

describe('board table', () => {
  it('creates and normalizes grids', () => {
    const g = createTableGrid(2, 3);
    expect(g.rows).toBe(2);
    expect(g.cols).toBe(3);
    expect(g.cells[0][0]).toEqual(emptyCell('text'));
    const n = normalizeTable({ rows: 1, cols: 1, cells: [[{ type: 'number', value: '5' }]] });
    expect(n.cells[0][0].value).toBe(5);
  });

  it('setCell and resize preserve data', () => {
    let t = createTableGrid(2, 2);
    t = setCell(t, 0, 0, { type: 'number', value: 3 });
    t = setCell(t, 0, 1, { type: 'number', value: 7 });
    expect(t.cells[0][0].value).toBe(3);
    const big = resizeTable(t, 3, 3);
    expect(big.cells[0][0].value).toBe(3);
    expect(big.rows).toBe(3);
    expect(big.cols).toBe(3);
  });

  it('evaluates =SUM(r0,c0:r0,c1)', () => {
    let t = createTableGrid(2, 2);
    t = setCell(t, 0, 0, { type: 'number', value: 10 });
    t = setCell(t, 0, 1, { type: 'number', value: 5 });
    t = setCell(t, 1, 0, { type: 'text', value: '=SUM(0,0:0,1)' });
    expect(evaluateCellDisplay(t, 1, 0)).toBe(15);
  });
});

describe('board image + table items', () => {
  it('createBoardItem image and table shapes', () => {
    const img = createBoardItem('image', { assetId: 'abc', mime: 'image/png', ext: '.png' });
    expect(img.type).toBe('image');
    expect(img.assetId).toBe('abc');
    const tbl = createBoardItem('table', { rows: 2, cols: 2 });
    expect(tbl.type).toBe('table');
    expect(tbl.cells).toHaveLength(2);
    expect(tbl.cells[0]).toHaveLength(2);
  });

  it('adds image to board graph', () => {
    let g = emptyBoardGraph();
    const item = createBoardItem('image', {
      boardId: g.rootId,
      assetId: 'hash1',
    });
    g = addItemToBoard(g, g.rootId, item);
    expect(g.items[item.id].type).toBe('image');
    expect(g.boards[g.rootId].items).toContain(item.id);
  });
});
