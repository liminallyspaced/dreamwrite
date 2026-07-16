import { describe, it, expect } from 'vitest';
import {
  normalizeProject,
  sanitizeProject,
  exportReadyProject,
} from '../../src/core/project/document.js';
import { sampleFountain } from '../../src/core/project/sample.js';
import * as E from '../../src/engine.js';

const deps = {
  emptyProject: () => E.emptyProject(),
  normalizeType: E.normalizeType,
  uid: E.uid,
  elementLabels: E.ELEMENT_LABELS,
  normalizeProject: E.normalizeProject,
};

describe('normalizeProject', () => {
  it('fills missing fields from empty shell', () => {
    const p = normalizeProject({ titlePage: { title: 'X' }, blocks: [] }, deps);
    expect(p.titlePage.title).toBe('X');
    expect(p.blocks.length).toBeGreaterThan(0); // falls back to empty shell blocks
    expect(p.characters).toEqual([]);
    expect(p.format).toBe('platen');
  });

  it('keeps provided blocks', () => {
    const blocks = [{ id: 'a', type: 'action', text: 'Hi' }];
    const p = normalizeProject({ blocks }, deps);
    expect(p.blocks).toEqual(blocks);
  });
});

describe('sanitizeProject', () => {
  it('does not mutate the input', () => {
    const input = {
      blocks: [{ id: '1', type: 'action', text: 'ACTION' }],
    };
    const snap = JSON.stringify(input);
    sanitizeProject(input, deps);
    expect(JSON.stringify(input)).toBe(snap);
  });

  it('clears a block that is only a gutter label', () => {
    const p = sanitizeProject(
      { blocks: [{ id: '1', type: 'action', text: 'Action' }] },
      deps
    );
    expect(p.blocks[0].text).toBe('');
  });

  it('assigns ids and normalizes types', () => {
    const p = sanitizeProject(
      { blocks: [{ type: 'DIALOGUE', text: 'Hello.' }] },
      deps
    );
    expect(p.blocks[0].id).toBeTruthy();
    expect(p.blocks[0].type).toBe('dialogue');
  });

  it('reseeds empty block list', () => {
    const p = sanitizeProject({ blocks: [] }, deps);
    expect(p.blocks.length).toBeGreaterThan(0);
  });
});

describe('exportReadyProject', () => {
  it('returns a clone with CONT\'D pass available', () => {
    const src = E.emptyProject();
    src.blocks = [
      E.createBlock('character', 'MAYA'),
      E.createBlock('dialogue', 'One.'),
      E.createBlock('action', 'Beat.'),
      E.createBlock('character', 'MAYA'),
      E.createBlock('dialogue', 'Two.'),
    ];
    const out = exportReadyProject(src, deps, { contd: true });
    expect(out).not.toBe(src);
    expect(out.blocks).not.toBe(src.blocks);
  });
});

describe('sampleFountain', () => {
  it('includes title and scene headings', () => {
    const f = sampleFountain(new Date('2026-07-16T12:00:00Z'));
    expect(f).toContain('THE LAST SIGNAL');
    expect(f).toContain('INT. RADIO TOWER - NIGHT');
    expect(f).toContain('MAYA');
  });

  it('round-trips through Fountain import', () => {
    const p = E.fromFountain(sampleFountain(), 'THE LAST SIGNAL');
    expect(p.blocks.some((b) => b.type === 'scene')).toBe(true);
    expect(p.blocks.some((b) => b.type === 'dialogue')).toBe(true);
  });
});
