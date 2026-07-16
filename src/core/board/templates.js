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
    const column = createBoardItem('column', {
      boardId: root,
      title: col.title,
      x: col.x,
      y: 40,
      w: 240,
      h: 480,
    });
    g = addItemToBoard(g, root, column);
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
      g = addItemToBoard(g, root, note);
      y += 84;
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
  return applyThreeAct(graph); // columns variant already good; could differentiate later
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
