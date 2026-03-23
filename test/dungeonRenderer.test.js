const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DUNGEON_SELECT_POKEMON_ACTION_ID,
  DUNGEON_SELECT_MODE_ACTION_ID,
  DUNGEON_START_FARM_ACTION_ID,
  DUNGEON_START_DAILY_ACTION_ID,
  renderDungeonPokemonSelection,
  renderDungeonModeSelection,
  renderDungeonFarmSelection,
  renderDungeonDailySelection,
  renderDungeonError,
} = require('../adapters/slack/renderers/dungeonRenderer');

test('renderDungeonPokemonSelection cria botões de seleção do Pokémon', () => {
  const payload = renderDungeonPokemonSelection({
    slackUserId: 'U123',
    pokemons: [{ id: 99, level: 12, current_hp: 44, hp: 60, shiny: true, pokemon_species: { name: 'Pikachu' } }],
  });

  const actionBlocks = payload.blocks.filter((block) => block.type === 'actions');
  assert.equal(actionBlocks.length, 1);
  assert.equal(actionBlocks[0].elements[0].action_id, DUNGEON_SELECT_POKEMON_ACTION_ID);
  assert.match(actionBlocks[0].elements[0].text.text, /Pikachu/);
});

test('renderDungeonModeSelection cria botões de Farm e Diária', () => {
  const payload = renderDungeonModeSelection({
    slackUserId: 'U123',
    pokemon: { id: 7, level: 20, current_hp: 50, hp: 80, pokemon_species: { name: 'Squirtle' } },
  });

  const actionIds = payload.blocks.find((block) => block.type === 'actions').elements.map((element) => element.action_id);
  assert.deepEqual(actionIds, [DUNGEON_SELECT_MODE_ACTION_ID, DUNGEON_SELECT_MODE_ACTION_ID]);
});

test('renderDungeonFarmSelection cria salas até nível 50', () => {
  const payload = renderDungeonFarmSelection({
    slackUserId: 'U123',
    pokemon: { id: 7, pokemon_species: { name: 'Squirtle' } },
    farmLevels: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  });

  const actionIds = payload.blocks.filter((block) => block.type === 'actions').flatMap((block) => block.elements.map((element) => element.action_id));
  assert.equal(actionIds.length, 10);
  assert.ok(actionIds.every((actionId) => actionId === DUNGEON_START_FARM_ACTION_ID));
});

test('renderDungeonDailySelection cria dificuldades normal e hard', () => {
  const payload = renderDungeonDailySelection({
    slackUserId: 'U123',
    pokemon: { id: 7, pokemon_species: { name: 'Squirtle' } },
  });

  const actionIds = payload.blocks.find((block) => block.type === 'actions').elements.map((element) => element.action_id);
  assert.deepEqual(actionIds, [DUNGEON_START_DAILY_ACTION_ID, DUNGEON_START_DAILY_ACTION_ID]);
});

test('renderDungeonError mostra mensagem de indisponibilidade', () => {
  const payload = renderDungeonError({ slackUserId: 'U123', text: 'Erro qualquer' });
  assert.match(payload.blocks[1].text.text, /Erro qualquer/);
});
