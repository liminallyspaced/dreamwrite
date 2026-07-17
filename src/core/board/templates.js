/**
 * Offline board templates — seeded board JSON (Phase 5).
 * Save the Cat / Three Act / Character / Hero's Journey style structures.
 */

import { emptyBoardGraph, createBoardItem, addItemToBoard } from './model.js';

/**
 * @returns {{ id: string, name: string, description: string, apply: (graph) => object }[]}
 */
export function listTemplates() {
  return [
    {
      id: 'three-act',
      name: 'Three-Act Structure',
      description: 'Setup · Confrontation · Resolution columns with beat notes',
      apply: applyThreeAct,
    },
    {
      id: 'save-the-cat',
      name: 'Save the Cat (beats)',
      description: 'Blake Snyder beat sheet as ordered notes',
      apply: applySaveTheCat,
    },
    {
      id: 'heros-journey',
      name: "Hero's Journey",
      description: 'Campbell / Vogler stages as a path of notes',
      apply: applyHerosJourney,
    },
    {
      id: 'character-profile',
      name: 'Character Profile',
      description: 'Want / need / flaw / arc cards for one character',
      apply: applyCharacterProfile,
    },
    {
      id: 'story-map',
      name: 'Story Map',
      description: 'World · Plot · Character columns for brainstorming',
      apply: applyStoryMap,
    },
    {
      id: 'relationship-map',
      name: 'Character Relationship Map',
      description: 'Character nodes with labeled connectors (beyond Milanote)',
      apply: applyRelationshipMap,
    },
  ];
}

function applyThreeAct(graph) {
  const root = graph.rootId;
  let g = graph;
  const cols = [
    { title: 'Act I — Setup', x: 40, beats: ['Opening image', 'Theme stated', 'Catalyst', 'Debate', 'Break into Two'] },
    { title: 'Act II — Confrontation', x: 300, beats: ['B Story', 'Fun & Games', 'Midpoint', 'Bad Guys Close In', 'All Is Lost'] },
    { title: 'Act III — Resolution', x: 560, beats: ['Break into Three', 'Finale', 'Final image'] },
  ];
  for (const col of cols) {
    const childIds = [];
    const notes = [];
    let y = 100;
    for (const beat of col.beats) {
      const note = createBoardItem('note', {
        boardId: root,
        title: beat,
        body: '',
        x: col.x + 12,
        y,
        w: 216,
        h: 72,
      });
      notes.push(note);
      childIds.push(note.id);
      y += 84;
    }
    const column = createBoardItem('column', {
      boardId: root,
      title: col.title,
      x: col.x,
      y: 40,
      w: 240,
      h: 480,
      childIds,
    });
    g = addItemToBoard(g, root, column);
    for (const note of notes) {
      note.parentId = column.id;
      g = addItemToBoard(g, root, note);
    }
  }
  return g;
}

function applySaveTheCat(graph) {
  const beats = [
    'Opening Image',
    'Theme Stated',
    'Set-up',
    'Catalyst',
    'Debate',
    'Break into Two',
    'B Story',
    'Fun and Games',
    'Midpoint',
    'Bad Guys Close In',
    'All Is Lost',
    'Dark Night of the Soul',
    'Break into Three',
    'Finale',
    'Final Image',
  ];
  let g = graph;
  const root = graph.rootId;
  let x = 40;
  let y = 40;
  beats.forEach((title, i) => {
    const note = createBoardItem('note', {
      boardId: root,
      title: `${i + 1}. ${title}`,
      body: '',
      x,
      y,
      w: 180,
      h: 90,
    });
    g = addItemToBoard(g, root, note);
    x += 200;
    if (x > 800) {
      x = 40;
      y += 120;
    }
  });
  return g;
}

function applyHerosJourney(graph) {
  const stages = [
    'Ordinary World',
    'Call to Adventure',
    'Refusal',
    'Meeting the Mentor',
    'Crossing the Threshold',
    'Tests, Allies, Enemies',
    'Approach',
    'Ordeal',
    'Reward',
    'The Road Back',
    'Resurrection',
    'Return with Elixir',
  ];
  let g = graph;
  const root = graph.rootId;
  stages.forEach((title, i) => {
    const note = createBoardItem('note', {
      boardId: root,
      title,
      body: '',
      x: 60 + (i % 4) * 210,
      y: 60 + Math.floor(i / 4) * 140,
    });
    g = addItemToBoard(g, root, note);
  });
  return g;
}

function applyCharacterProfile(graph) {
  let g = graph;
  const root = graph.rootId;
  const fields = [
    ['Name', 'Who are they?'],
    ['Want', 'External goal'],
    ['Need', 'Internal need'],
    ['Flaw', 'What holds them back'],
    ['Arc', 'How they change'],
    ['Voice', 'How they speak'],
  ];
  fields.forEach(([title, body], i) => {
    const note = createBoardItem('note', {
      boardId: root,
      title,
      body,
      x: 60 + (i % 3) * 240,
      y: 60 + Math.floor(i / 3) * 160,
      w: 220,
      h: 140,
    });
    g = addItemToBoard(g, root, note);
  });
  return g;
}

function applyStoryMap(graph) {
  const root = graph.rootId;
  let g = graph;
  const cols = [
    { title: 'World', x: 40, beats: ['Setting', 'Rules', 'Tone'] },
    { title: 'Plot', x: 300, beats: ['Inciting incident', 'Midpoint', 'Climax'] },
    { title: 'Character', x: 560, beats: ['Protagonist', 'Antagonist', 'Ally'] },
  ];
  for (const col of cols) {
    const childIds = [];
    const notes = [];
    let y = 100;
    for (const beat of col.beats) {
      const note = createBoardItem('note', {
        boardId: root,
        title: beat,
        body: '',
        x: col.x + 12,
        y,
        w: 216,
        h: 72,
      });
      notes.push(note);
      childIds.push(note.id);
      y += 84;
    }
    const column = createBoardItem('column', {
      boardId: root,
      title: col.title,
      x: col.x,
      y: 40,
      w: 240,
      h: 320,
      childIds,
    });
    g = addItemToBoard(g, root, column);
    for (const note of notes) {
      note.parentId = column.id;
      g = addItemToBoard(g, root, note);
    }
  }
  return g;
}

/**
 * Character Relationship Map — nodes + labeled connectors (Phase 8d).
 */
function applyRelationshipMap(graph) {
  const root = graph.rootId;
  let g = graph;
  const nodes = [
    { id: 'rel_pro', title: 'Protagonist', x: 280, y: 200, color: '#e8e0d0' },
    { id: 'rel_ant', title: 'Antagonist', x: 520, y: 80, color: '#c4b8a8' },
    { id: 'rel_ally', title: 'Ally', x: 80, y: 80, color: '#d4cfc4' },
    { id: 'rel_love', title: 'Love interest', x: 80, y: 320, color: '#ddd4c4' },
    { id: 'rel_men', title: 'Mentor', x: 520, y: 320, color: '#cfc8b8' },
  ];
  for (const n of nodes) {
    const note = createBoardItem('note', {
      id: n.id,
      boardId: root,
      title: n.title,
      body: '',
      x: n.x,
      y: n.y,
      w: 160,
      h: 90,
      color: n.color,
    });
    g = addItemToBoard(g, root, note);
  }
  const edges = [
    { from: 'rel_pro', to: 'rel_ant', label: 'opposes' },
    { from: 'rel_pro', to: 'rel_ally', label: 'trusts' },
    { from: 'rel_pro', to: 'rel_love', label: 'desires' },
    { from: 'rel_pro', to: 'rel_men', label: 'learns from' },
    { from: 'rel_ally', to: 'rel_ant', label: 'fears' },
  ];
  edges.forEach((e, i) => {
    const conn = createBoardItem('connector', {
      id: `rel_c_${i}`,
      boardId: root,
      fromId: e.from,
      toId: e.to,
      label: e.label,
      curved: true,
    });
    g = addItemToBoard(g, root, conn);
  });
  return g;
}

/**
 * Apply template by id onto a fresh or existing graph (replaces root items if wipe).
 * @param {string} templateId
 * @param {object} [graph]
 * @param {{ wipe?: boolean }} [opts]
 */
export function applyTemplate(templateId, graph, opts = {}) {
  const tpl = listTemplates().find((t) => t.id === templateId);
  if (!tpl) return graph || emptyBoardGraph();
  let g = graph || emptyBoardGraph();
  if (opts.wipe) {
    g = emptyBoardGraph();
    g.boards[g.rootId].title = tpl.name;
  }
  return tpl.apply(g);
}
