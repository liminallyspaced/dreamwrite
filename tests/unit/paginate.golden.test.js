/**
 * Golden-file acceptance for pagination (pagination.md §8, ADR-0006).
 *
 * Locks a stable page count for a fixed Fountain fixture. When the engine
 * changes break rules or blanks-before-scene, this test forces a deliberate
 * update — never a silent drift.
 *
 * External bar (manual): ±1 page over ~100 pages vs Final Draft on a real
 * feature. Document deviation; do not invent dual-dialogue geometry.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromFountain } from '../../src/engine.js';
import { paginate } from '../../src/core/script/paginate.js';
import { DEFAULT_FORMAT } from '../../src/core/script/format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '../fixtures/golden-short.fountain');

/** Known-good page count for golden-short.fountain under DEFAULT_FORMAT. */
const GOLDEN_PAGE_COUNT = 2;

describe('golden-file pagination', () => {
  const fountain = readFileSync(fixturePath, 'utf8');
  const project = fromFountain(fountain);
  const pages = paginate(project.blocks);

  it('imports the fixture as real blocks', () => {
    expect(project.blocks.length).toBeGreaterThan(5);
    expect(project.blocks.some((b) => b.type === 'scene')).toBe(true);
    expect(project.blocks.some((b) => b.type === 'dialogue')).toBe(true);
  });

  it(`page count is stable at ${GOLDEN_PAGE_COUNT} (update deliberately if format changes)`, () => {
    // If this fails after an intentional format change, update GOLDEN_PAGE_COUNT
    // and note why in the commit message.
    expect(pages.length).toBe(GOLDEN_PAGE_COUNT);
  });

  it('no page exceeds bodyLines (54)', () => {
    for (const p of pages) {
      expect(p.rows.length).toBeLessThanOrEqual(DEFAULT_FORMAT.bodyLines);
    }
  });

  it('page numbers are sequential from 1', () => {
    expect(pages.map((p) => p.number)).toEqual(
      Array.from({ length: pages.length }, (_, i) => i + 1),
    );
  });

  it('does not inject CONT\'D into the document model', () => {
    for (const b of project.blocks) {
      if (b.type === 'character') {
        // Fixture has one intentional V.O.; no CONT'D in source
        expect(b.text).not.toMatch(/CONT'?D/i);
      }
    }
  });
});
