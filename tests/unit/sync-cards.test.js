/**
 * syncCardsFromScenes — reconciling the beat board against the script.
 *
 * Replaces a straight overwrite that destroyed every hand-written summary with no
 * merge and no confirmation (docs/plan/00-findings.md §5.5 #4).
 *
 * The guarantee under test: NEVER silently delete the writer's prose.
 */
import { describe, it, expect } from 'vitest';
import * as E from '../../src/engine.js';

const scene = (id, text) => ({ id, type: 'scene', text });
const action = (id, text) => ({ id, type: 'action', text });

const project = (blocks, cards = []) => ({ blocks, cards });

describe('syncCardsFromScenes', () => {
  it('creates a card per scene on an empty board', () => {
    const p = project([scene('s1', 'INT. HOUSE - DAY'), action('a1', 'x'), scene('s2', 'EXT. PARK - NIGHT')]);
    const { cards, added } = E.syncCardsFromScenes(p);

    expect(added).toBe(2);
    expect(cards.map((c) => c.title)).toEqual(['INT. HOUSE - DAY', 'EXT. PARK - NIGHT']);
    expect(cards.map((c) => c.sceneId)).toEqual(['s1', 's2']);
    expect(cards.map((c) => c.number)).toEqual([1, 2]);
  });

  it('PRESERVES a hand-written summary — the bug this replaces', () => {
    // The old code returned a fresh array from autoCardsFromScenes and assigned it
    // straight over project.cards. Everything below was silently destroyed.
    const p = project(
      [scene('s1', 'INT. HOUSE - DAY')],
      [{ id: 'c1', sceneId: 's1', number: 1, title: 'old title', summary: 'Sarah confronts her past.', beat: 'Turning point', color: '#111' }]
    );

    const { cards, updated, added } = E.syncCardsFromScenes(p);

    expect(added).toBe(0);
    expect(updated).toBe(1);
    expect(cards[0].summary).toBe('Sarah confronts her past.');
    expect(cards[0].beat).toBe('Turning point');
    expect(cards[0].color).toBe('#111');
    expect(cards[0].id).toBe('c1'); // identity preserved
  });

  it('refreshes title and number from the script — the script owns those', () => {
    const p = project(
      [action('a1', 'x'), scene('s1', 'INT. KITCHEN - NIGHT')],
      [{ id: 'c1', sceneId: 's1', number: 9, title: 'STALE SLUG', summary: 'keep me' }]
    );
    const { cards } = E.syncCardsFromScenes(p);

    expect(cards[0].title).toBe('INT. KITCHEN - NIGHT');
    expect(cards[0].number).toBe(1);
    expect(cards[0].summary).toBe('keep me');
  });

  it('adds cards for new scenes while keeping existing ones', () => {
    const p = project(
      [scene('s1', 'ONE'), scene('s2', 'TWO')],
      [{ id: 'c1', sceneId: 's1', number: 1, title: 'ONE', summary: 'written' }]
    );
    const { cards, added, updated } = E.syncCardsFromScenes(p);

    expect(added).toBe(1);
    expect(updated).toBe(1);
    expect(cards).toHaveLength(2);
    expect(cards[0].summary).toBe('written');
    expect(cards[1].summary).toBe('');
  });

  it('KEEPS a card with prose when its scene is deleted, marked orphaned', () => {
    // A cut scene may have been cut by accident, and the summary is often the more
    // valuable half. Never silently bin it.
    const p = project(
      [scene('s1', 'ONE')],
      [
        { id: 'c1', sceneId: 's1', number: 1, title: 'ONE' },
        { id: 'c2', sceneId: 'GONE', number: 2, title: 'TWO', summary: 'Precious notes about a cut scene.' },
      ]
    );
    const { cards, orphaned } = E.syncCardsFromScenes(p);

    expect(orphaned).toBe(1);
    const orphan = cards.find((c) => c.id === 'c2');
    expect(orphan).toBeDefined();
    expect(orphan.summary).toBe('Precious notes about a cut scene.');
    expect(orphan.orphaned).toBe(true);
  });

  it('keeps an orphan whose only content is a beat', () => {
    const p = project([], [{ id: 'c1', sceneId: 'GONE', beat: 'Midpoint reversal' }]);
    const { cards, orphaned } = E.syncCardsFromScenes(p);
    expect(orphaned).toBe(1);
    expect(cards[0].beat).toBe('Midpoint reversal');
  });

  it('DROPS a pristine auto-generated card whose scene is gone', () => {
    // Nothing the writer typed — no loss, and keeping it would just be litter.
    const p = project(
      [scene('s1', 'ONE')],
      [
        { id: 'c1', sceneId: 's1', number: 1, title: 'ONE' },
        { id: 'c2', sceneId: 'GONE', number: 2, title: 'TWO', summary: '', beat: '' },
      ]
    );
    const { cards, orphaned } = E.syncCardsFromScenes(p);

    expect(orphaned).toBe(0);
    expect(cards.find((c) => c.id === 'c2')).toBeUndefined();
  });

  it('treats whitespace-only content as empty', () => {
    const p = project([], [{ id: 'c1', sceneId: 'GONE', summary: '   ', beat: '\n' }]);
    expect(E.syncCardsFromScenes(p).orphaned).toBe(0);
  });

  it('keeps a manually-added card (no sceneId) even when empty', () => {
    // "Add card" makes cards with sceneId: null. They are not derived from the
    // script, so the script cannot invalidate them.
    const p = project([scene('s1', 'ONE')], [{ id: 'manual', sceneId: null, title: 'Beat 1', summary: '' }]);
    const { cards } = E.syncCardsFromScenes(p);
    expect(cards.find((c) => c.id === 'manual')).toBeDefined();
  });

  it('follows script order after scenes are reordered', () => {
    const p = project(
      [scene('s2', 'TWO'), scene('s1', 'ONE')],
      [
        { id: 'c1', sceneId: 's1', number: 1, title: 'ONE', summary: 'first' },
        { id: 'c2', sceneId: 's2', number: 2, title: 'TWO', summary: 'second' },
      ]
    );
    const { cards } = E.syncCardsFromScenes(p);

    expect(cards.map((c) => c.sceneId)).toEqual(['s2', 's1']);
    expect(cards.map((c) => c.number)).toEqual([1, 2]);
    expect(cards.map((c) => c.summary)).toEqual(['second', 'first']); // prose followed its scene
  });

  it('is idempotent', () => {
    const p = project([scene('s1', 'ONE'), scene('s2', 'TWO')]);
    const once = E.syncCardsFromScenes(p);
    const twice = E.syncCardsFromScenes({ ...p, cards: once.cards });

    expect(twice.added).toBe(0);
    expect(twice.orphaned).toBe(0);
    expect(twice.cards.map((c) => c.sceneId)).toEqual(once.cards.map((c) => c.sceneId));
  });

  it('does not mutate the input project', () => {
    const cards = [{ id: 'c1', sceneId: 's1', number: 1, title: 'old', summary: 'mine' }];
    const p = project([scene('s1', 'NEW SLUG')], cards);
    E.syncCardsFromScenes(p);

    expect(cards[0].title).toBe('old'); // untouched
    expect(p.cards).toBe(cards);
  });

  it('handles a project with no blocks or cards', () => {
    expect(E.syncCardsFromScenes({}).cards).toEqual([]);
    expect(E.syncCardsFromScenes({ blocks: [], cards: [] }).cards).toEqual([]);
  });
});
