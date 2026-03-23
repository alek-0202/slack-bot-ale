const DUNGEON_SELECT_POKEMON_ACTION_ID = 'dungeon_select_pokemon';
const DUNGEON_SELECT_MODE_ACTION_ID = 'dungeon_select_mode';
const DUNGEON_START_FARM_ACTION_ID = 'dungeon_start_farm';
const DUNGEON_START_DAILY_ACTION_ID = 'dungeon_start_daily';

function buildActionValue(payload) {
  return JSON.stringify(payload);
}

function buildRows(elements, perRow = 5) {
  const rows = [];
  for (let index = 0; index < elements.length; index += perRow) {
    rows.push({ type: 'actions', elements: elements.slice(index, index + perRow) });
  }
  return rows;
}

function buildPokemonLabel(pokemon) {
  const speciesName = pokemon.pokemon_species?.name || pokemon.speciesName || 'Pokémon';
  const level = Number(pokemon.level) || 1;
  const hp = Number(pokemon.current_hp) || 0;
  const maxHp = Number(pokemon.hp) || 0;
  const shiny = pokemon.shiny ? '✨ ' : '';
  return `${shiny}#${pokemon.id} ${speciesName} Lv${level} HP ${hp}/${maxHp}`.slice(0, 75);
}

function renderDungeonPokemonSelection({ slackUserId, pokemons = [] }) {
  const text = pokemons.length
    ? 'Escolha primeiro o Pokémon que vai entrar na dungeon.'
    : 'Você não tem Pokémon elegível para dungeon agora.';

  const buttons = pokemons.slice(0, 25).map((pokemon) => ({
    type: 'button',
    text: { type: 'plain_text', text: buildPokemonLabel(pokemon), emoji: true },
    action_id: DUNGEON_SELECT_POKEMON_ACTION_ID,
    value: buildActionValue({ slackUserId, pokemonId: pokemon.id }),
  }));

  return {
    text: `Dungeon de ${slackUserId}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏰 Dungeon', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Treinador:* <@${slackUserId}>\n${text}` } },
      ...(buttons.length ? buildRows(buttons) : []),
      ...(!buttons.length ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: 'Verifique se seu Pokémon não está na heal station, com HP zerado ou em outra batalha.' }] }] : []),
    ],
  };
}

function renderDungeonModeSelection({ slackUserId, pokemon }) {
  const speciesName = pokemon.pokemon_species?.name || 'Pokémon';
  return {
    text: `Modo de dungeon para #${pokemon.id}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏰 Dungeon — escolher modo', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Treinador:* <@${slackUserId}>\n*Pokémon:* *${speciesName}* (#${pokemon.id}) • Lv ${pokemon.level} • ❤️ ${pokemon.current_hp}/${pokemon.hp}` } },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Farm', emoji: true }, action_id: DUNGEON_SELECT_MODE_ACTION_ID, style: 'primary', value: buildActionValue({ slackUserId, pokemonId: pokemon.id, mode: 'farm' }) },
          { type: 'button', text: { type: 'plain_text', text: 'Diária', emoji: true }, action_id: DUNGEON_SELECT_MODE_ACTION_ID, value: buildActionValue({ slackUserId, pokemonId: pokemon.id, mode: 'daily' }) },
        ],
      },
    ],
  };
}

function renderDungeonFarmSelection({ slackUserId, pokemon, farmLevels = [] }) {
  const buttons = farmLevels.map((level) => ({
    type: 'button',
    text: { type: 'plain_text', text: `Nível ${level}`, emoji: true },
    action_id: DUNGEON_START_FARM_ACTION_ID,
    value: buildActionValue({ slackUserId, pokemonId: pokemon.id, level }),
  }));

  return {
    text: `Farm dungeon para #${pokemon.id}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏰 Dungeon Farm — escolher sala', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Pokémon selecionado:* *${pokemon.pokemon_species?.name || 'Pokémon'}* (#${pokemon.id})\nEscolha a sala da Farm.` } },
      ...buildRows(buttons),
    ],
  };
}

function renderDungeonDailySelection({ slackUserId, pokemon }) {
  return {
    text: `Daily dungeon para #${pokemon.id}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏰 Dungeon Diária — escolher dificuldade', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Pokémon selecionado:* *${pokemon.pokemon_species?.name || 'Pokémon'}* (#${pokemon.id})\nEscolha a dificuldade da diária.` } },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Normal', emoji: true }, action_id: DUNGEON_START_DAILY_ACTION_ID, style: 'primary', value: buildActionValue({ slackUserId, pokemonId: pokemon.id, difficulty: 'normal' }) },
          { type: 'button', text: { type: 'plain_text', text: 'Difícil', emoji: true }, action_id: DUNGEON_START_DAILY_ACTION_ID, value: buildActionValue({ slackUserId, pokemonId: pokemon.id, difficulty: 'hard' }) },
        ],
      },
    ],
  };
}

function renderDungeonError({ slackUserId, text }) {
  return {
    text,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '⚠️ Dungeon indisponível', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Treinador:* <@${slackUserId}>\n${text}` } },
    ],
  };
}

module.exports = {
  DUNGEON_SELECT_POKEMON_ACTION_ID,
  DUNGEON_SELECT_MODE_ACTION_ID,
  DUNGEON_START_FARM_ACTION_ID,
  DUNGEON_START_DAILY_ACTION_ID,
  buildActionValue,
  renderDungeonPokemonSelection,
  renderDungeonModeSelection,
  renderDungeonFarmSelection,
  renderDungeonDailySelection,
  renderDungeonError,
};
