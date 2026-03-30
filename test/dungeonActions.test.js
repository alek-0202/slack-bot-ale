const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const handlerPath = path.resolve(__dirname, '../handlers/dungeonActions.js');
const loggerPath = path.resolve(__dirname, '../utils/logger.js');
const actionServicePath = path.resolve(__dirname, '../services/slackPokemonActionService.js');
const dungeonServicePath = path.resolve(__dirname, '../services/dungeonService.js');
const actionResolverPath = path.resolve(__dirname, '../application/battle/domain/actionResolver.js');
const rendererPath = path.resolve(__dirname, '../adapters/slack/renderers/dungeonRenderer.js');

function loadDungeonActions({
  getDungeonBattleImpl,
  getDungeonOwnerUserIdImpl,
  isDungeonProcessingImpl = () => false,
  processDungeonTurnImpl = async () => ({ ok: true, battle: { status: 'active' } }),
}) {
  [handlerPath, loggerPath, actionServicePath, dungeonServicePath, actionResolverPath, rendererPath].forEach((modulePath) => {
    delete require.cache[modulePath];
  });

  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: { createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }) },
  };

  require.cache[actionServicePath] = {
    id: actionServicePath,
    filename: actionServicePath,
    loaded: true,
    exports: {
      parsePokemonActionValue: (value) => JSON.parse(value),
      buildUnauthorizedActionMessage: () => ({ response_type: 'ephemeral', text: 'unauthorized' }),
    },
  };

  require.cache[actionResolverPath] = {
    id: actionResolverPath,
    filename: actionResolverPath,
    loaded: true,
    exports: {
      BATTLE_ACTION: {
        ATTACK: 'attack',
        DEFENSE: 'defense',
        POTION: 'potion',
        MAGIC: 'magic',
      },
    },
  };

  require.cache[dungeonServicePath] = {
    id: dungeonServicePath,
    filename: dungeonServicePath,
    loaded: true,
    exports: {
      FARM_LEVELS: [],
      getEligibleDungeonPokemons: async () => [],
      validateDungeonPokemonSelection: async () => ({ ok: false, reason: 'x' }),
      startFarmDungeon: async () => ({ ok: false, reason: 'x' }),
      startDailyDungeon: async () => ({ ok: false, reason: 'x' }),
      mapDungeonFailureReason: (reason) => reason,
      processDungeonTurn: processDungeonTurnImpl,
      getDungeonBattle: getDungeonBattleImpl,
      getDungeonOwnerUserId: getDungeonOwnerUserIdImpl,
      isDungeonProcessing: isDungeonProcessingImpl,
    },
  };

  require.cache[rendererPath] = {
    id: rendererPath,
    filename: rendererPath,
    loaded: true,
    exports: {
      DUNGEON_SELECT_POKEMON_ACTION_ID: 'x',
      DUNGEON_SELECT_MODE_ACTION_ID: 'x',
      DUNGEON_START_FARM_ACTION_ID: 'x',
      DUNGEON_START_DAILY_ACTION_ID: 'x',
      DUNGEON_BATTLE_TURN_ACTION_ID: 'x',
      DUNGEON_BATTLE_MAGIC_ACTION_ID: 'x',
      DUNGEON_BATTLE_MAGIC_CANCEL_ACTION_ID: 'x',
      renderDungeonPokemonSelection: () => ({}),
      renderDungeonModeSelection: () => ({}),
      renderDungeonFarmSelection: () => ({}),
      renderDungeonDailySelection: () => ({}),
      renderDungeonError: ({ text }) => ({ text, blocks: [] }),
      renderDungeonBattleState: () => ({ text: 'battle', blocks: [] }),
      renderDungeonMagicOptions: () => ({ text: 'magic', blocks: [] }),
      renderDungeonBattleFinished: () => ({ text: 'finished', blocks: [] }),
    },
  };

  const mod = require(handlerPath);

  [handlerPath, loggerPath, actionServicePath, dungeonServicePath, actionResolverPath, rendererPath].forEach((modulePath) => {
    delete require.cache[modulePath];
  });

  return mod;
}

test('defesa na dungeon responde ephemeral e não processa turno nem desmonta UI', async () => {
  let processCalls = 0;
  const handlers = loadDungeonActions({
    getDungeonBattleImpl: () => ({ status: 'active', metadata: { slackUserId: 'U1' } }),
    getDungeonOwnerUserIdImpl: () => 'U1',
    processDungeonTurnImpl: async () => {
      processCalls += 1;
      return { ok: true, battle: { status: 'active' } };
    },
  });

  const responds = [];
  const updates = [];

  await handlers.handleDungeonBattleTurnAction({
    body: { user: { id: 'U1' }, channel: { id: 'C1' }, message: { ts: '123.456' } },
    action: { value: JSON.stringify({ action: 'defense', channelId: 'dungeon:U1', slackUserId: 'U1' }) },
    respond: async (payload) => { responds.push(payload); },
    client: { chat: { update: async (payload) => updates.push(payload) } },
  });

  assert.equal(processCalls, 0);
  assert.equal(updates.length, 0);
  assert.deepEqual(responds, [{ response_type: 'ephemeral', text: 'unsupported_action' }]);
});

test('clique de outro player na dungeon é no-op completo', async () => {
  let processCalls = 0;
  let processingChecks = 0;
  const handlers = loadDungeonActions({
    getDungeonBattleImpl: () => ({ status: 'active', metadata: { slackUserId: 'OWNER' } }),
    getDungeonOwnerUserIdImpl: () => 'OWNER',
    isDungeonProcessingImpl: () => {
      processingChecks += 1;
      return false;
    },
    processDungeonTurnImpl: async () => {
      processCalls += 1;
      return { ok: true, battle: { status: 'active' } };
    },
  });

  const responds = [];
  const updates = [];

  await handlers.handleDungeonBattleTurnAction({
    body: { user: { id: 'INTRUDER' }, channel: { id: 'C1' }, message: { ts: '123.456' } },
    action: { value: JSON.stringify({ action: 'attack', channelId: 'dungeon:OWNER', slackUserId: 'OWNER' }) },
    respond: async (payload) => { responds.push(payload); },
    client: { chat: { update: async (payload) => updates.push(payload) } },
  });

  assert.equal(processCalls, 0);
  assert.equal(processingChecks, 0);
  assert.equal(updates.length, 0);
  assert.deepEqual(responds, [{ response_type: 'ephemeral', text: 'Você não pode interagir na dungeon de outro jogador' }]);
});

test('ação fora do turno responde ephemeral e não sobrescreve mensagem principal', async () => {
  const handlers = loadDungeonActions({
    getDungeonBattleImpl: () => ({ status: 'active', metadata: { slackUserId: 'U1' }, currentTurnUserId: 'ENEMY' }),
    getDungeonOwnerUserIdImpl: () => 'U1',
    processDungeonTurnImpl: async () => ({
      ok: false,
      reason: 'not_actor_turn',
      validation: { currentTurnUserId: 'ENEMY' },
      battle: { status: 'active', currentTurnUserId: 'ENEMY' },
    }),
  });

  const responds = [];
  const updates = [];

  await handlers.handleDungeonBattleTurnAction({
    body: { user: { id: 'U1' }, channel: { id: 'C1' }, message: { ts: '123.456' } },
    action: { value: JSON.stringify({ action: 'attack', channelId: 'dungeon:U1', slackUserId: 'U1' }) },
    respond: async (payload) => { responds.push(payload); },
    client: { chat: { update: async (payload) => updates.push(payload) } },
  });

  assert.equal(updates.length, 0);
  assert.deepEqual(responds, [{ response_type: 'ephemeral', text: '⏳ Ainda não é o seu turno. O inimigo age automaticamente quando for a vez dele.' }]);
});

test('sessão de dungeon inexistente responde ephemeral sem atualizar blocks', async () => {
  const handlers = loadDungeonActions({
    getDungeonBattleImpl: () => null,
    getDungeonOwnerUserIdImpl: () => 'U1',
  });

  const responds = [];
  const updates = [];

  await handlers.handleDungeonBattleTurnAction({
    body: { user: { id: 'U1' }, channel: { id: 'C1' }, message: { ts: '123.456' } },
    action: { value: JSON.stringify({ action: 'attack', channelId: 'dungeon:U1', slackUserId: 'U1' }) },
    respond: async (payload) => { responds.push(payload); },
    client: { chat: { update: async (payload) => updates.push(payload) } },
  });

  assert.equal(updates.length, 0);
  assert.deepEqual(responds, [{ response_type: 'ephemeral', text: 'battle_not_found' }]);
});
