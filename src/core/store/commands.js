/**
 * Command registry + execute helpers.
 * Pure apply/invert; store owns history side effects.
 */
import * as blocks from './mutations/blocks.js';
import * as cards from './mutations/cards.js';
import * as meta from './mutations/meta.js';
import * as bible from './mutations/bible.js';
import { restoreRevisionBlocks } from './mutations/compound.js';

/**
 * Registry: each entry knows how to apply and how to invert.
 * invert(project, payload) receives the *inverse* payload stored at execute time.
 */
export const registry = {
  'blocks.setText': {
    label: 'Typing',
    apply(project, payload) {
      return blocks.setBlockText(project, payload);
    },
    invert(project, payload) {
      // inverse payload is { id, text: previousText }
      return blocks.setBlockText(project, payload);
    },
  },

  'blocks.setType': {
    label: 'Change element',
    apply(project, payload) {
      return blocks.setBlockType(project, payload);
    },
    invert(project, payload) {
      return blocks.setBlockType(project, payload);
    },
  },

  'blocks.insert': {
    label: 'Insert block',
    apply(project, payload) {
      return blocks.insertBlock(project, payload);
    },
    invert(project, payload) {
      // inverse: { id } of inserted block
      return blocks.removeBlock(project, { id: payload.id }).project;
    },
  },

  'blocks.remove': {
    label: 'Delete block',
    apply(project, payload) {
      return blocks.removeBlock(project, { id: payload.id }).project;
    },
    invert(project, payload) {
      // inverse: { index, block }
      return blocks.insertBlock(project, {
        index: payload.index,
        block: payload.block,
      });
    },
  },

  'blocks.replaceAll': {
    label: 'Replace all',
    apply(project, payload) {
      // payload for do: { find, replace, caseSensitive }
      // if beforeBlocks present, this is undo path applying old blocks
      if (payload.beforeBlocks) {
        return blocks.replaceBlocks(project, { blocks: payload.beforeBlocks });
      }
      return blocks.replaceAllText(project, payload).project;
    },
    invert(project, payload) {
      // inverse payload always carries beforeBlocks
      return blocks.replaceBlocks(project, { blocks: payload.beforeBlocks });
    },
  },

  'blocks.replaceBlocks': {
    label: 'Replace script',
    apply(project, payload) {
      return blocks.replaceBlocks(project, payload);
    },
    invert(project, payload) {
      return blocks.replaceBlocks(project, { blocks: payload.beforeBlocks });
    },
  },

  'blocks.insertMany': {
    label: 'Insert blocks',
    apply(project, payload) {
      return blocks.insertBlocks(project, payload);
    },
    invert(project, payload) {
      // inverse: { ids }
      return blocks.removeBlocks(project, { ids: payload.ids });
    },
  },

  'cards.set': {
    label: 'Update cards',
    apply(project, payload) {
      return cards.setCards(project, payload);
    },
    invert(project, payload) {
      return cards.setCards(project, { cards: payload.beforeCards });
    },
  },

  'cards.update': {
    label: 'Edit card',
    apply(project, payload) {
      return cards.updateCard(project, payload);
    },
    invert(project, payload) {
      return cards.updateCard(project, {
        id: payload.id,
        patch: payload.beforePatch,
      });
    },
  },

  'cards.syncFromScenes': {
    label: 'Sync cards',
    apply(project) {
      return cards.syncCards(project).project;
    },
    invert(project, payload) {
      return cards.setCards(project, { cards: payload.beforeCards });
    },
  },

  'cards.add': {
    label: 'Add card',
    apply(project, payload) {
      return cards.addCard(project, payload);
    },
    invert(project, payload) {
      const next = (project.cards || []).filter((c) => c && c.id !== payload.id);
      return cards.setCards(project, { cards: next });
    },
  },

  'meta.setTitlePage': {
    label: 'Title page',
    apply(project, payload) {
      return meta.setTitlePage(project, payload);
    },
    invert(project, payload) {
      return meta.setTitlePage(project, { titlePage: payload.before });
    },
  },

  'meta.setNotes': {
    label: 'Notes',
    apply(project, payload) {
      return meta.setNotes(project, payload);
    },
    invert(project, payload) {
      return meta.setNotes(project, { notes: payload.before });
    },
  },

  'meta.setSettings': {
    label: 'Settings',
    apply(project, payload) {
      return meta.setSettings(project, payload);
    },
    invert(project, payload) {
      return meta.setSettings(project, { settings: payload.before });
    },
  },

  'bible.setCharacters': {
    label: 'Characters',
    apply(project, payload) {
      return bible.setCharacters(project, payload);
    },
    invert(project, payload) {
      return bible.setCharacters(project, { characters: payload.before });
    },
  },

  'bible.setLocations': {
    label: 'Locations',
    apply(project, payload) {
      return bible.setLocations(project, payload);
    },
    invert(project, payload) {
      return bible.setLocations(project, { locations: payload.before });
    },
  },

  'bible.updateCharacter': {
    label: 'Edit character',
    apply(project, payload) {
      return bible.updateCharacter(project, payload);
    },
    invert(project, payload) {
      return bible.updateCharacter(project, {
        id: payload.id,
        patch: payload.beforePatch,
      });
    },
  },

  'bible.updateLocation': {
    label: 'Edit location',
    apply(project, payload) {
      return bible.updateLocation(project, payload);
    },
    invert(project, payload) {
      return bible.updateLocation(project, {
        id: payload.id,
        patch: payload.beforePatch,
      });
    },
  },

  'bible.addCharacter': {
    label: 'Add character',
    apply(project, payload) {
      return bible.addCharacter(project, payload);
    },
    invert(project, payload) {
      return bible.removeCharacter(project, { id: payload.id });
    },
  },

  'bible.addLocation': {
    label: 'Add location',
    apply(project, payload) {
      return bible.addLocation(project, payload);
    },
    invert(project, payload) {
      return bible.removeLocation(project, { id: payload.id });
    },
  },

  'bible.removeCharacter': {
    label: 'Delete character',
    apply(project, payload) {
      return bible.removeCharacter(project, payload);
    },
    invert(project, payload) {
      return bible.addCharacter(project, { character: payload.character });
    },
  },

  'bible.removeLocation': {
    label: 'Delete location',
    apply(project, payload) {
      return bible.removeLocation(project, payload);
    },
    invert(project, payload) {
      return bible.addLocation(project, { location: payload.location });
    },
  },

  'project.restoreRevision': {
    label: 'Restore revision',
    apply(project, payload) {
      return restoreRevisionBlocks(project, { blocks: payload.blocks });
    },
    invert(project, payload) {
      return restoreRevisionBlocks(project, { blocks: payload.beforeBlocks });
    },
  },

  'meta.pushRevision': {
    label: 'Snapshot',
    apply(project, payload) {
      return meta.pushRevisionSnapshot(project, payload);
    },
    // Snapshots are append-only for long-term history; undo pops last if id matches
    invert(project, payload) {
      const history = Array.isArray(project.history) ? project.history.slice() : [];
      const i = history.findIndex((h) => h.id === payload.id);
      if (i >= 0) history.splice(i, 1);
      return { ...project, history, updatedAt: new Date().toISOString() };
    },
  },
};

/**
 * Build inverse payload *before* applying, from current project.
 * @returns {{ inversePayload: object, label: string, mergeKey?: string } | { error: string }}
 */
export function prepare(type, project, payload = {}) {
  const def = registry[type];
  if (!def) return { error: `Unknown command: ${type}` };

  switch (type) {
    case 'blocks.setText': {
      const b = (project.blocks || []).find((x) => x.id === payload.id);
      if (!b) return { error: 'Block not found' };
      if (b.text === payload.text) return { error: 'noop' };
      return {
        inversePayload: { id: payload.id, text: b.text ?? '' },
        label: def.label,
        mergeKey: payload.mergeKey || `block:${payload.id}`,
      };
    }
    case 'blocks.setType': {
      const b = (project.blocks || []).find((x) => x.id === payload.id);
      if (!b) return { error: 'Block not found' };
      return {
        inversePayload: { id: payload.id, type: b.type, text: b.text },
        label: payload.label || `Change to ${payload.type}`,
      };
    }
    case 'blocks.insert': {
      if (!payload.block?.id) return { error: 'insert requires block.id' };
      return {
        inversePayload: { id: payload.block.id },
        label: def.label,
      };
    }
    case 'blocks.remove': {
      const blocks = project.blocks || [];
      const i = blocks.findIndex((x) => x.id === payload.id);
      if (i < 0) return { error: 'Block not found' };
      // Refuse deleting the last block — leaves editor empty and unusable
      if (blocks.length <= 1) return { error: 'Cannot delete the only block' };
      return {
        inversePayload: { index: i, block: { ...blocks[i] } },
        label: def.label,
      };
    }
    case 'blocks.replaceAll': {
      const result = blocks.replaceAllText(project, payload);
      if (result.count === 0) return { error: 'noop' };
      return {
        inversePayload: { beforeBlocks: result.beforeBlocks },
        // Stash count on payload for UI via side channel — apply re-runs replace
        label: `Replace all (${result.count})`,
        // Also need beforeBlocks on do path for undo entry — apply uses find/replace
        // We store beforeBlocks only on inverse; do re-applies find/replace.
        // Risk: non-deterministic if project changed — but stack is linear so OK.
        doPayloadExtra: {},
      };
    }
    case 'blocks.replaceBlocks': {
      return {
        inversePayload: {
          beforeBlocks: JSON.parse(JSON.stringify(project.blocks || [])),
        },
        label: payload.label || def.label,
      };
    }
    case 'blocks.insertMany': {
      const list = payload.blocks || [];
      if (!list.length) return { error: 'noop' };
      if (list.some((b) => !b?.id)) return { error: 'insertMany requires block.id' };
      return {
        inversePayload: { ids: list.map((b) => b.id) },
        label: payload.label || def.label,
      };
    }
    case 'cards.set': {
      return {
        inversePayload: {
          beforeCards: JSON.parse(JSON.stringify(project.cards || [])),
        },
        label: def.label,
      };
    }
    case 'cards.update': {
      const c = (project.cards || []).find((x) => x.id === payload.id);
      if (!c) return { error: 'Card not found' };
      const beforePatch = {};
      for (const k of Object.keys(payload.patch || {})) {
        beforePatch[k] = c[k];
      }
      return {
        inversePayload: { id: payload.id, beforePatch },
        label: def.label,
        mergeKey: payload.mergeKey || `card:${payload.id}`,
      };
    }
    case 'cards.syncFromScenes': {
      return {
        inversePayload: {
          beforeCards: JSON.parse(JSON.stringify(project.cards || [])),
        },
        label: def.label,
      };
    }
    case 'cards.add': {
      if (!payload.card?.id) return { error: 'add requires card.id' };
      return {
        inversePayload: { id: payload.card.id },
        label: def.label,
      };
    }
    case 'meta.setTitlePage': {
      return {
        inversePayload: {
          before: { ...(project.titlePage || {}) },
        },
        label: def.label,
        mergeKey: payload.mergeKey || 'meta:title',
      };
    }
    case 'meta.setNotes': {
      if ((project.notes || '') === (payload.notes || '')) return { error: 'noop' };
      return {
        inversePayload: { before: project.notes || '' },
        label: def.label,
        mergeKey: 'meta:notes',
      };
    }
    case 'meta.setSettings': {
      return {
        inversePayload: {
          before: { ...(project.settings || {}) },
        },
        label: def.label,
        mergeKey: payload.mergeKey || 'meta:settings',
      };
    }
    case 'bible.setCharacters': {
      return {
        inversePayload: {
          before: JSON.parse(JSON.stringify(project.characters || [])),
        },
        label: payload.label || def.label,
      };
    }
    case 'bible.setLocations': {
      return {
        inversePayload: {
          before: JSON.parse(JSON.stringify(project.locations || [])),
        },
        label: payload.label || def.label,
      };
    }
    case 'bible.updateCharacter': {
      const c = (project.characters || []).find((x) => x.id === payload.id);
      if (!c) return { error: 'Character not found' };
      const beforePatch = {};
      for (const k of Object.keys(payload.patch || {})) beforePatch[k] = c[k];
      return {
        inversePayload: { id: payload.id, beforePatch },
        label: def.label,
        mergeKey: payload.mergeKey || `char:${payload.id}`,
      };
    }
    case 'bible.updateLocation': {
      const loc = (project.locations || []).find((x) => x.id === payload.id);
      if (!loc) return { error: 'Location not found' };
      const beforePatch = {};
      for (const k of Object.keys(payload.patch || {})) beforePatch[k] = loc[k];
      return {
        inversePayload: { id: payload.id, beforePatch },
        label: def.label,
        mergeKey: payload.mergeKey || `loc:${payload.id}`,
      };
    }
    case 'bible.addCharacter': {
      if (!payload.character?.id) return { error: 'add requires character.id' };
      return {
        inversePayload: { id: payload.character.id },
        label: def.label,
      };
    }
    case 'bible.addLocation': {
      if (!payload.location?.id) return { error: 'add requires location.id' };
      return {
        inversePayload: { id: payload.location.id },
        label: def.label,
      };
    }
    case 'bible.removeCharacter': {
      const c = (project.characters || []).find((x) => x.id === payload.id);
      if (!c) return { error: 'Character not found' };
      return {
        inversePayload: { character: { ...c } },
        label: def.label,
      };
    }
    case 'bible.removeLocation': {
      const loc = (project.locations || []).find((x) => x.id === payload.id);
      if (!loc) return { error: 'Location not found' };
      return {
        inversePayload: { location: { ...loc } },
        label: def.label,
      };
    }
    case 'project.restoreRevision': {
      if (!Array.isArray(payload.blocks)) return { error: 'restore requires blocks' };
      return {
        inversePayload: {
          beforeBlocks: JSON.parse(JSON.stringify(project.blocks || [])),
        },
        label: payload.label || def.label,
      };
    }
    case 'meta.pushRevision': {
      return {
        inversePayload: { id: payload.id },
        label: def.label,
      };
    }
    default:
      return { error: `No prepare for ${type}` };
  }
}

export function applyCommand(type, project, payload) {
  const def = registry[type];
  if (!def) throw new Error(`Unknown command: ${type}`);
  return def.apply(project, payload);
}

/** Apply the inverse of a forward command using the stored inverse payload. */
export function invertCommand(type, project, inversePayload) {
  const def = registry[type];
  if (!def) throw new Error(`Unknown command: ${type}`);
  if (typeof def.invert !== 'function') {
    throw new Error(`Command has no invert: ${type}`);
  }
  return def.invert(project, inversePayload);
}
