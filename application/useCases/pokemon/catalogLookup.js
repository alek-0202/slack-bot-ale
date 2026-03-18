const { getAllSpeciesCatalog } = require('../../../services/speciesCatalogViewService');
const { createLogger } = require('../../../utils/logger');

const logger = createLogger('pokemon-catalog-lookup');

function normalizeSearchText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTag(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/^[#№\s]+/, '').trim();
}

function buildChainForSpecies(targetSpeciesId, allSpecies) {
  const byId = new Map((allSpecies || []).map((species) => [species.id, species]));
  let current = byId.get(targetSpeciesId);

  if (!current) return [];

  const visited = new Set();
  while (current?.evolves_from && !visited.has(current.evolves_from)) {
    visited.add(current.id);
    const previous = byId.get(current.evolves_from);
    if (!previous) break;
    current = previous;
  }

  const chain = [];
  const chainVisited = new Set();
  while (current && !chainVisited.has(current.id)) {
    chain.push(current);
    chainVisited.add(current.id);
    if (!current.evolves_to) break;
    current = byId.get(current.evolves_to);
  }

  return chain;
}

function buildViewPayload(species, speciesList) {
  const chain = buildChainForSpecies(species.id, speciesList);
  const speciesIds = chain.length > 1 ? chain.map((entry) => entry.id) : [species.id];
  const index = speciesIds.indexOf(species.id);

  return {
    species,
    speciesIds,
    index: index >= 0 ? index : 0,
    chainSize: chain.length || 1,
  };
}

function resolveCatalogSpeciesByName(rawQuery, speciesList) {
  const normalizedQuery = normalizeSearchText(rawQuery);

  if (!normalizedQuery) {
    return { ok: false, reason: 'empty_query' };
  }

  const exactMatches = (speciesList || []).filter((species) => normalizeSearchText(species.name) === normalizedQuery);

  if (exactMatches.length === 1) {
    return {
      ok: true,
      matchType: 'exact',
      ...buildViewPayload(exactMatches[0], speciesList),
    };
  }

  if (exactMatches.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous',
      matches: exactMatches.map((species) => ({ id: species.id, name: species.name })),
    };
  }

  return { ok: false, reason: 'not_found' };
}

function resolveCatalogSpeciesByTag(rawTag, speciesList) {
  const normalizedTag = normalizeTag(rawTag);

  if (!normalizedTag) {
    return { ok: false, reason: 'empty_query' };
  }

  const numericTag = Number(normalizedTag);
  if (!Number.isInteger(numericTag) || numericTag <= 0) {
    return { ok: false, reason: 'invalid_tag' };
  }

  const matches = (speciesList || []).filter((species) => species.id === numericTag);

  if (matches.length === 1) {
    return {
      ok: true,
      matchType: 'tag',
      ...buildViewPayload(matches[0], speciesList),
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous',
      matches: matches.map((species) => ({ id: species.id, name: species.name })),
    };
  }

  return { ok: false, reason: 'not_found' };
}

async function findCatalogSpeciesByName(rawQuery) {
  const normalizedQuery = normalizeSearchText(rawQuery);
  logger.info('Busca por nome no catálogo iniciada', { rawQuery, normalizedQuery });
  const speciesList = await getAllSpeciesCatalog();
  const result = resolveCatalogSpeciesByName(rawQuery, speciesList);

  if (result.ok) {
    logger.info('Busca por nome encontrou match exato', {
      rawQuery,
      speciesId: result.species.id,
      speciesName: result.species.name,
    });
  } else if (result.reason === 'ambiguous') {
    logger.warn('Busca por nome retornou múltiplos matches exatos', {
      rawQuery,
      speciesIds: result.matches.map((species) => species.id),
    });
  } else {
    logger.warn('Busca por nome sem match exato/normalizado', { rawQuery, normalizedQuery });
  }

  return result;
}

async function findCatalogSpeciesByTag(rawTag) {
  const normalizedTag = normalizeTag(rawTag);
  logger.info('Busca por tag no catálogo iniciada', { rawTag, normalizedTag });
  const speciesList = await getAllSpeciesCatalog();
  const result = resolveCatalogSpeciesByTag(rawTag, speciesList);

  if (result.ok) {
    logger.info('Busca por tag encontrou resultado', {
      rawTag,
      speciesId: result.species.id,
      speciesName: result.species.name,
    });
  } else if (result.reason === 'ambiguous') {
    logger.warn('Busca por tag retornou duplicidade inesperada', {
      rawTag,
      normalizedTag,
      speciesIds: result.matches.map((species) => species.id),
    });
  } else if (result.reason === 'invalid_tag') {
    logger.warn('Busca por tag recebeu valor inválido', { rawTag, normalizedTag });
  } else {
    logger.warn('Busca por tag não encontrou resultado', { rawTag, normalizedTag });
  }

  return result;
}

module.exports = {
  normalizeSearchText,
  normalizeTag,
  resolveCatalogSpeciesByName,
  resolveCatalogSpeciesByTag,
  findCatalogSpeciesByName,
  findCatalogSpeciesByTag,
};
