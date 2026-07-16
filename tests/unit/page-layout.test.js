import { describe, it, expect } from 'vitest';
import { planPageStack } from '../../src/views/script/page-layout.js';
import { paginate } from '../../src/core/script/paginate.js';

function B(type, text, id) {
  return { id: id || `${type}-1`, type, text };
}

describe('planPageStack', () => {
  it('empty pages → one empty plan page', () => {
    expect(planPageStack([])).toEqual([
      { number: 1, blockIds: [], showMore: false, showContd: false, contdText: '' },
    ]);
  });

  it('assigns each block to the page of first appearance', () => {
    const pages = paginate([
      B('scene', 'INT. HOUSE - DAY', 's1'),
      B('action', 'Light.', 'a1'),
    ]);
    const plan = planPageStack(pages);
    expect(plan).toHaveLength(1);
    expect(plan[0].blockIds).toEqual(['s1', 'a1']);
    expect(plan[0].showMore).toBe(false);
  });

  it('flags MORE and CONT\'D chrome on multi-page dialogue', () => {
    const speech = 'Word. '.repeat(400);
    const pages = paginate([
      B('character', 'BOB', 'c1'),
      B('dialogue', speech, 'd1'),
    ]);
    expect(pages.length).toBeGreaterThan(1);
    const plan = planPageStack(pages);
    expect(plan[0].blockIds).toContain('c1');
    expect(plan[0].blockIds).toContain('d1');
    // dialogue only listed on first page
    const later = plan.slice(1).flatMap((p) => p.blockIds);
    expect(later).not.toContain('d1');
    expect(plan.some((p) => p.showMore)).toBe(true);
    expect(plan.some((p) => p.showContd)).toBe(true);
  });

  it('page numbers stay sequential', () => {
    const blocks = [];
    for (let i = 0; i < 80; i++) {
      blocks.push(B('action', `Pad action line number ${i} with enough words here.`, `a${i}`));
    }
    const plan = planPageStack(paginate(blocks));
    expect(plan.map((p) => p.number)).toEqual(
      Array.from({ length: plan.length }, (_, i) => i + 1),
    );
  });
});
