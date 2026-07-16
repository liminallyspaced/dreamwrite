/**
 * Characters + locations (bible) — pure project mutations.
 */

function touch(project) {
  return { ...project, updatedAt: new Date().toISOString() };
}

export function setCharacters(project, { characters }) {
  return touch({
    ...project,
    characters: Array.isArray(characters) ? characters.map((c) => ({ ...c })) : [],
  });
}

export function setLocations(project, { locations }) {
  return touch({
    ...project,
    locations: Array.isArray(locations) ? locations.map((l) => ({ ...l })) : [],
  });
}

export function updateCharacter(project, { id, patch }) {
  const list = project.characters || [];
  const i = list.findIndex((c) => c && c.id === id);
  if (i < 0) return project;
  const next = list.slice();
  next[i] = { ...list[i], ...patch, id: list[i].id };
  return touch({ ...project, characters: next });
}

export function updateLocation(project, { id, patch }) {
  const list = project.locations || [];
  const i = list.findIndex((l) => l && l.id === id);
  if (i < 0) return project;
  const next = list.slice();
  next[i] = { ...list[i], ...patch, id: list[i].id };
  return touch({ ...project, locations: next });
}

export function addCharacter(project, { character }) {
  if (!character?.id) return project;
  const characters = (project.characters || []).slice();
  characters.push({ ...character });
  return touch({ ...project, characters });
}

export function addLocation(project, { location }) {
  if (!location?.id) return project;
  const locations = (project.locations || []).slice();
  locations.push({ ...location });
  return touch({ ...project, locations });
}

export function removeCharacter(project, { id }) {
  const characters = (project.characters || []).filter((c) => c && c.id !== id);
  return touch({ ...project, characters });
}

export function removeLocation(project, { id }) {
  const locations = (project.locations || []).filter((l) => l && l.id !== id);
  return touch({ ...project, locations });
}
