/**
 * Pure card-board mutations.
 */
import { syncCardsFromScenes } from '../../../engine.js';

function touch(project) {
  return { ...project, updatedAt: new Date().toISOString() };
}

export function setCards(project, { cards }) {
  return touch({
    ...project,
    cards: Array.isArray(cards) ? cards.map((c) => ({ ...c })) : [],
  });
}

export function updateCard(project, { id, patch }) {
  const cards = project.cards || [];
  const i = cards.findIndex((c) => c && c.id === id);
  if (i < 0) return project;
  const next = cards.slice();
  next[i] = { ...cards[i], ...patch, id: cards[i].id };
  return touch({ ...project, cards: next });
}

export function addCard(project, { card }) {
  if (!card || !card.id) return project;
  const cards = (project.cards || []).slice();
  cards.push({ ...card });
  return touch({ ...project, cards });
}

/**
 * Merge-sync board from script scenes (preserves prose / orphans).
 * @returns {{ project: object, beforeCards: object[], result: object }}
 */
export function syncCards(project) {
  const beforeCards = JSON.parse(JSON.stringify(project.cards || []));
  const result = syncCardsFromScenes(project);
  return {
    project: touch({ ...project, cards: result.cards }),
    beforeCards,
    result,
  };
}
