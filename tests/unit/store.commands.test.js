import { describe, it, expect } from 'vitest';
import { createStore } from '../../src/core/store/index.js';
import { emptyProject, createBlock, uid } from '../../src/engine.js';

function blankProject() {
  const p = emptyProject('Test');
  // deterministic ids for tests
  p.blocks = [
    { id: 's1', type: 'scene', text: 'INT. ROOM - DAY' },
    { id: 'a1', type: 'action', text: 'A cat sits.' },
  ];
  p.history = [];
  return p;
}

describe('createStore commands', () => {
  it('setText is undoable and mergeable into one undo step', () => {
    const store = createStore({ project: blankProject() }, { mergeWindowMs: 5000 });
    store.execute({
      type: 'blocks.setText',
      payload: { id: 'a1', text: 'A' },
    });
    store.execute({
      type: 'blocks.setText',
      payload: { id: 'a1', text: 'A cat' },
    });
    store.execute({
      type: 'blocks.setText',
      payload: { id: 'a1', text: 'A cat runs.' },
    });
    expect(store._history._depth().undo).toBe(1);
    expect(store.getProject().blocks.find((b) => b.id === 'a1').text).toBe('A cat runs.');

    store.undo();
    expect(store.getProject().blocks.find((b) => b.id === 'a1').text).toBe('A cat sits.');
    store.redo();
    expect(store.getProject().blocks.find((b) => b.id === 'a1').text).toBe('A cat runs.');
  });

  it('setType undoes type and text together', () => {
    const store = createStore({ project: blankProject() });
    store.execute({
      type: 'blocks.setType',
      payload: { id: 'a1', type: 'dialogue', text: 'HELLO' },
    });
    const b = store.getProject().blocks.find((x) => x.id === 'a1');
    expect(b.type).toBe('dialogue');
    expect(b.text).toBe('HELLO');
    store.undo();
    const u = store.getProject().blocks.find((x) => x.id === 'a1');
    expect(u.type).toBe('action');
    expect(u.text).toBe('A cat sits.');
  });

  it('insert then undo removes the block', () => {
    const store = createStore({ project: blankProject() });
    const block = { id: 'c1', type: 'character', text: 'MAYA' };
    store.execute({
      type: 'blocks.insert',
      payload: { index: 2, block },
    });
    expect(store.getProject().blocks).toHaveLength(3);
    store.undo();
    expect(store.getProject().blocks).toHaveLength(2);
    expect(store.getProject().blocks.map((b) => b.id)).toEqual(['s1', 'a1']);
  });

  it('remove then undo restores block at index', () => {
    const store = createStore({ project: blankProject() });
    store.execute({ type: 'blocks.remove', payload: { id: 'a1' } });
    expect(store.getProject().blocks).toHaveLength(1);
    store.undo();
    expect(store.getProject().blocks).toHaveLength(2);
    expect(store.getProject().blocks[1].id).toBe('a1');
    expect(store.getProject().blocks[1].text).toBe('A cat sits.');
  });

  it('refuses deleting the only block', () => {
    const p = blankProject();
    p.blocks = [{ id: 'only', type: 'action', text: 'x' }];
    const store = createStore({ project: p });
    const r = store.execute({ type: 'blocks.remove', payload: { id: 'only' } });
    expect(r.ok).toBe(false);
    expect(store.getProject().blocks).toHaveLength(1);
  });

  it('restoreRevision is one undoable command', () => {
    const store = createStore({ project: blankProject() });
    const snap = [
      { id: 's1', type: 'scene', text: 'EXT. STREET - NIGHT' },
      { id: 'a1', type: 'action', text: 'Rain.' },
    ];
    store.execute({
      type: 'project.restoreRevision',
      payload: { blocks: snap, label: 'Restore snapshot' },
    });
    expect(store.getProject().blocks[0].text).toBe('EXT. STREET - NIGHT');
    store.undo();
    expect(store.getProject().blocks[0].text).toBe('INT. ROOM - DAY');
    expect(store.getProject().blocks[1].text).toBe('A cat sits.');
  });

  it('replaceAll undoes to prior blocks', () => {
    const store = createStore({ project: blankProject() });
    store.execute({
      type: 'blocks.replaceAll',
      payload: { find: 'cat', replace: 'dog' },
    });
    expect(store.getProject().blocks[1].text).toBe('A dog sits.');
    store.undo();
    expect(store.getProject().blocks[1].text).toBe('A cat sits.');
  });

  it('resetDocument clears undo stacks', () => {
    const store = createStore({ project: blankProject() });
    store.execute({
      type: 'blocks.setText',
      payload: { id: 'a1', text: 'changed' },
    });
    expect(store.canUndo()).toBe(true);
    store.resetDocument(blankProject(), { filePath: '/tmp/x.platen' });
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.getState().session.filePath).toBe('/tmp/x.platen');
    expect(store.getState().session.dirty).toBe(false);
  });

  it('subscribers fire on execute and undo', () => {
    const store = createStore({ project: blankProject() });
    const events = [];
    store.subscribe((_s, e) => events.push(e.type));
    store.execute({ type: 'blocks.setText', payload: { id: 'a1', text: 'z' } });
    store.undo();
    expect(events).toEqual(['execute', 'undo']);
  });

  it('insertMany inserts then undoes as one step', () => {
    const store = createStore({ project: blankProject() });
    const blocks = [
      { id: 'c1', type: 'character', text: 'MAYA' },
      { id: 'd1', type: 'dialogue', text: 'Hi.' },
    ];
    store.execute({
      type: 'blocks.insertMany',
      payload: { index: 2, blocks },
    });
    expect(store.getProject().blocks.map((b) => b.id)).toEqual(['s1', 'a1', 'c1', 'd1']);
    store.undo();
    expect(store.getProject().blocks.map((b) => b.id)).toEqual(['s1', 'a1']);
  });

  it('bible character add/update/remove is undoable', () => {
    const store = createStore({ project: blankProject() });
    store.execute({
      type: 'bible.addCharacter',
      payload: { character: { id: 'ch1', name: 'MAYA', role: '', description: '', notes: '' } },
    });
    expect(store.getProject().characters).toHaveLength(1);
    store.execute({
      type: 'bible.updateCharacter',
      payload: { id: 'ch1', patch: { role: 'lead' } },
    });
    expect(store.getProject().characters[0].role).toBe('lead');
    store.undo();
    expect(store.getProject().characters[0].role).toBe('');
    store.undo();
    expect(store.getProject().characters).toHaveLength(0);
  });

  it('meta.setNotes merges typing into one undo step', () => {
    const store = createStore({ project: blankProject() }, { mergeWindowMs: 5000 });
    store.execute({ type: 'meta.setNotes', payload: { notes: 'a' }, mergeKey: 'meta:notes' });
    store.execute({ type: 'meta.setNotes', payload: { notes: 'ab' }, mergeKey: 'meta:notes' });
    store.execute({ type: 'meta.setNotes', payload: { notes: 'abc' }, mergeKey: 'meta:notes' });
    expect(store.getProject().notes).toBe('abc');
    expect(store._history._depth().undo).toBe(1);
    store.undo();
    expect(store.getProject().notes || '').toBe('');
  });

  it('cards.add then undo removes the card', () => {
    const store = createStore({ project: blankProject() });
    store.execute({
      type: 'cards.add',
      payload: {
        card: { id: 'card1', title: 'Beat 1', summary: '', number: 1, color: '#111', beat: '' },
      },
    });
    expect(store.getProject().cards).toHaveLength(1);
    store.undo();
    expect(store.getProject().cards || []).toHaveLength(0);
  });
});
