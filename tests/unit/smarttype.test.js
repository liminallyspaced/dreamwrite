import { describe, it, expect } from 'vitest';
import {
  smarttypeSuggestions,
  sceneTabAdvance,
  sceneSlugPhase,
  harvestLocations,
  harvestCharacters,
  applySceneSuggestion,
  SCENE_PREFIXES,
} from '../../src/core/script/smarttype.js';

const blocks = [
  { type: 'scene', text: 'INT. RADIO TOWER - NIGHT' },
  { type: 'character', text: 'MAYA' },
  { type: 'dialogue', text: 'Hello.' },
  { type: 'action', text: 'Static.' },
  { type: 'character', text: 'VOICE (V.O.)' },
  { type: 'dialogue', text: 'Hi.' },
  { type: 'scene', text: 'EXT. TOWER BASE - CONTINUOUS' },
  { type: 'character', text: 'MAYA' },
];

describe('smarttype scene phases', () => {
  it('classifies empty / prefix / location / time', () => {
    expect(sceneSlugPhase('')).toBe('empty');
    expect(sceneSlugPhase('INT.')).toBe('prefix');
    expect(sceneSlugPhase('INT. ')).toBe('prefix');
    expect(sceneSlugPhase('INT. RADIO')).toBe('location');
    expect(sceneSlugPhase('INT. RADIO - ')).toBe('time');
    expect(sceneSlugPhase('INT. RADIO - NIGHT')).toBe('done');
  });

  it('Tab advances empty → INT. → location gap → time gap', () => {
    expect(sceneTabAdvance('').text).toBe('INT. ');
    expect(sceneTabAdvance('INT.').text).toMatch(/^INT\.\s/);
    const mid = sceneTabAdvance('INT. RADIO TOWER');
    expect(mid.handled).toBe(true);
    expect(mid.text).toMatch(/ - $/);
    expect(sceneTabAdvance('INT. RADIO - NIGHT').handled).toBe(false);
  });
});

describe('smarttype suggestions', () => {
  it('offers INT./EXT. for empty scene', () => {
    const s = smarttypeSuggestions('scene', '', { blocks });
    expect(s[0]).toBe('INT.');
    expect(s).toEqual(expect.arrayContaining(SCENE_PREFIXES.slice(0, 3)));
  });

  it('offers remembered locations after prefix', () => {
    const s = smarttypeSuggestions('scene', 'INT. RAD', { blocks });
    expect(s.some((x) => x.includes('RADIO'))).toBe(true);
  });

  it('offers times after dash', () => {
    const s = smarttypeSuggestions('scene', 'INT. RADIO TOWER - N', { blocks });
    expect(s).toContain('NIGHT');
  });

  it('ranks characters by recency', () => {
    const s = smarttypeSuggestions('character', '', { blocks });
    expect(s[0]).toBe('MAYA'); // most recent character cue
    expect(s).toContain('VOICE');
  });

  it('offers transitions', () => {
    const s = smarttypeSuggestions('transition', 'CUT', { blocks });
    expect(s.some((t) => t.startsWith('CUT'))).toBe(true);
  });

  it('applies scene suggestions by phase', () => {
    expect(applySceneSuggestion('', 'EXT.')).toMatch(/^EXT\./);
    expect(applySceneSuggestion('INT. ', 'RADIO TOWER')).toBe('INT. RADIO TOWER ');
    expect(applySceneSuggestion('INT. RADIO TOWER - ', 'NIGHT')).toBe('INT. RADIO TOWER - NIGHT');
  });
});

describe('harvest', () => {
  it('harvests unique locations', () => {
    expect(harvestLocations(blocks)).toEqual(
      expect.arrayContaining(['RADIO TOWER', 'TOWER BASE'])
    );
  });

  it('harvests characters with bible merge', () => {
    const names = harvestCharacters(blocks, [{ name: 'BANKS' }]);
    expect(names).toContain('BANKS');
    expect(names).toContain('MAYA');
  });
});
