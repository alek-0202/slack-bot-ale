const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DUNGEON_SELECT_POKEMON_ACTION_ID,
  DUNGEON_SELECT_MODE_ACTION_ID,
  DUNGEON_START_FARM_ACTION_ID,
  DUNGEON_START_DAILY_ACTION_ID,
  buildIndexedActionId,
  renderDungeonPokemonSelection,
  renderDungeonModeSelection,
  renderDungeonFarmSelection,
  renderDungeonDailySelection,
  renderDungeonError,
  renderDungeonBattleState,
} = require('../adapters/slack/renderers/dungeonRenderer');

test('renderDungeonPokemonSelection cria botões de seleção do Pokémon', () => {
  const payload = renderDungeonPokemonSelection({
    slackUserId: 'U123',
    pokemons: [{ id: 99, level: 12, current_hp: 44, hp: 60, shiny: true, pokemon_species: { name: 'Pikachu' } }],
  });

  const actionBlocks = payload.blocks.filter((block) => block.type === 'actions');
  assert.equal(actionBlocks.length, 1);
  assert.equal(actionBlocks[0].elements[0].action_id, buildIndexedActionId(DUNGEON_SELECT_POKEMON_ACTION_ID, 99));
  assert.match(actionBlocks[0].elements[0].text.text, /Pikachu/);
});

test('renderDungeonModeSelection cria botões de Farm e Diária', () => {
  const payload = renderDungeonModeSelection({
    slackUserId: 'U123',
    pokemon: { id: 7, level: 20, current_hp: 50, hp: 80, pokemon_species: { name: 'Squirtle' } },
  });

  const actionIds = payload.blocks.find((block) => block.type === 'actions').elements.map((element) => element.action_id);
  assert.deepEqual(actionIds, [
    buildIndexedActionId(DUNGEON_SELECT_MODE_ACTION_ID, 'farm'),
    buildIndexedActionId(DUNGEON_SELECT_MODE_ACTION_ID, 'daily'),
  ]);
});

test('renderDungeonFarmSelection cria salas até nível 50', () => {
  const payload = renderDungeonFarmSelection({
    slackUserId: 'U123',
    pokemon: { id: 7, pokemon_species: { name: 'Squirtle' } },
    farmLevels: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  });

  const actionIds = payload.blocks.filter((block) => block.type === 'actions').flatMap((block) => block.elements.map((element) => element.action_id));
  assert.equal(actionIds.length, 10);
  assert.deepEqual(actionIds, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((level) => buildIndexedActionId(DUNGEON_START_FARM_ACTION_ID, level)));
});

test('renderDungeonDailySelection cria dificuldades normal e hard', () => {
  const payload = renderDungeonDailySelection({
    slackUserId: 'U123',
    pokemon: { id: 7, pokemon_species: { name: 'Squirtle' } },
  });

  const actionIds = payload.blocks.find((block) => block.type === 'actions').elements.map((element) => element.action_id);
  assert.deepEqual(actionIds, [
    buildIndexedActionId(DUNGEON_START_DAILY_ACTION_ID, 'normal'),
    buildIndexedActionId(DUNGEON_START_DAILY_ACTION_ID, 'hard'),
  ]);
});

test('renderDungeonError mostra mensagem de indisponibilidade', () => {
  const payload = renderDungeonError({ slackUserId: 'U123', text: 'Erro qualquer' });
  assert.match(payload.blocks[1].text.text, /Erro qualquer/);
});

test('renderDungeonBattleState força contexto de status em emoji ao invés de imagem', () => {
  const battle = {
    channelId: 'C-dungeon',
    status: 'active',
    round: 3,
    currentTurnUserId: 'U1',
    challengerId: 'U1',
    challengedId: 'U2',
    metadata: { mode: 'dungeon', slackUserId: 'U1', dungeonType: 'farm', dungeonLevel: 10 },
    players: {
      U1: {
        selectedPokemon: { id: 25, name: 'Pikachu', level: 50, types: ['electric'], elementTypes: ['electric'] },
        battleHp: { current: 100, max: 120 },
        elementalState: { effects: [{ id: 'psychic_barrier', name: 'Barreira Psíquica', remainingRounds: 2 }] },
      },
      U2: {
        selectedPokemon: { id: 4, name: 'Charmander', level: 40, types: ['fire'], elementTypes: ['fire'] },
        battleHp: { current: 90, max: 110 },
        elementalState: { statuses: [{ id: 'burn', name: 'Burn', remainingRounds: 1 }] },
      },
    },
  };

  const originalBaseUrl = process.env.RENDERED_IMAGE_PUBLIC_BASE_URL;
  process.env.RENDERED_IMAGE_PUBLIC_BASE_URL = 'https://cdn.example.com';
  const payload = renderDungeonBattleState(battle);
  const contextBlock = payload.blocks.find((block) => block.type === 'context' && Array.isArray(block.elements) && block.elements.some((entry) => entry.text?.includes('Barreira')));

  assert.ok(contextBlock);
  assert.equal(contextBlock.elements.some((entry) => entry.type === 'image'), false);
  assert.equal(contextBlock.elements.every((entry) => entry.type === 'mrkdwn'), true);
  process.env.RENDERED_IMAGE_PUBLIC_BASE_URL = originalBaseUrl;
});
