const { getAllSpecies, insertUserPokemon } = require('./pokemonService');
const { removeItem } = require('./inventoryService');
const { calculatePokemonStats, SHINY_TYPE, rollPokemonIvOffsets } = require('./pokemonStatsService');
const { SHINY_CHANCE } = require('./captureService');

function pickRandom(arr = []) {
  if (!arr.length) return null;
  const index = Math.floor(Math.random() * arr.length);
  return arr[index] || null;
}

async function invokeMythicalPokemon({ slackUserId }) {
  const consumed = await removeItem(slackUserId, 'mythical_pokemon_token', 1);
  if (!consumed.ok) return { ok: false, reason: 'missing_ticket' };

  const allSpecies = await getAllSpecies();
  const mythicals = allSpecies.filter((species) => String(species.rarity || '').toLowerCase() === 'mythical');
  const selected = pickRandom(mythicals);

  if (!selected) return { ok: false, reason: 'mythical_catalog_empty' };

  const shiny = Math.random() < SHINY_CHANCE;
  const shinyType = shiny ? SHINY_TYPE.PRIME : null;
  const ivOffsets = rollPokemonIvOffsets({ shiny, shinyType, rarity: selected.rarity });
  const stats = calculatePokemonStats({ species: selected, level: 1, ivOffsets, shiny, shinyType });

  const captured = await insertUserPokemon({
    slackUserId,
    speciesId: selected.id,
    level: 1,
    shiny,
    shinyType,
    ivOffsets,
    stats,
    source: 'invoke',
  });

  return {
    ok: true,
    species: selected,
    captured,
    shiny,
    shinyType,
    ivOffsets,
  };
}

module.exports = {
  invokeMythicalPokemon,
};
