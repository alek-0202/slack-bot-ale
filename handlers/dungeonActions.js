const { createLogger } = require('../utils/logger');
const { parsePokemonActionValue, buildUnauthorizedActionMessage } = require('../services/slackPokemonActionService');
const {
  FARM_LEVELS,
  getEligibleDungeonPokemons,
  validateDungeonPokemonSelection,
  startFarmDungeon,
  startDailyDungeon,
  mapDungeonFailureReason,
  processDungeonTurn,
  getDungeonBattle,
} = require('../services/dungeonService');
const { BATTLE_ACTION } = require('../application/battle/domain/actionResolver');
const {
  DUNGEON_SELECT_POKEMON_ACTION_ID,
  DUNGEON_SELECT_MODE_ACTION_ID,
  DUNGEON_START_FARM_ACTION_ID,
  DUNGEON_START_DAILY_ACTION_ID,
  DUNGEON_BATTLE_TURN_ACTION_ID,
  DUNGEON_BATTLE_MAGIC_ACTION_ID,
  DUNGEON_BATTLE_MAGIC_CANCEL_ACTION_ID,
  renderDungeonPokemonSelection,
  renderDungeonModeSelection,
  renderDungeonFarmSelection,
  renderDungeonDailySelection,
  renderDungeonError,
  renderDungeonBattleState,
  renderDungeonMagicOptions,
  renderDungeonBattleFinished,
} = require('../adapters/slack/renderers/dungeonRenderer');

const logger = createLogger('handler:dungeon-actions');

const DUNGEON_SELECT_POKEMON_ACTION_PATTERN = new RegExp(`^${DUNGEON_SELECT_POKEMON_ACTION_ID}_.+$`);
const DUNGEON_SELECT_MODE_ACTION_PATTERN = new RegExp(`^${DUNGEON_SELECT_MODE_ACTION_ID}_.+$`);
const DUNGEON_START_FARM_ACTION_PATTERN = new RegExp(`^${DUNGEON_START_FARM_ACTION_ID}_.+$`);
const DUNGEON_START_DAILY_ACTION_PATTERN = new RegExp(`^${DUNGEON_START_DAILY_ACTION_ID}_.+$`);
const DUNGEON_BATTLE_TURN_ACTION_PATTERN = new RegExp(`^${DUNGEON_BATTLE_TURN_ACTION_ID}_.+$`);
const DUNGEON_BATTLE_MAGIC_ACTION_PATTERN = new RegExp(`^${DUNGEON_BATTLE_MAGIC_ACTION_ID}_.+$`);

async function updateMessage(client, body, payload) {
  await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: payload.text, blocks: payload.blocks });
}

async function handleDungeonCommand({ event, say }) {
  logger.info('Entrada do comando !dungeon', {
    file: 'handlers/dungeonActions.js',
    handler: 'handleDungeonCommand',
    slackUserId: event.user,
    channelId: event.channel,
  });

  const pokemons = await getEligibleDungeonPokemons(event.user);
  const payload = pokemons.length
    ? renderDungeonPokemonSelection({ slackUserId: event.user, pokemons })
    : renderDungeonError({ slackUserId: event.user, text: 'Nenhum Pokémon elegível para dungeon agora. Verifique heal station, HP e batalhas ativas.' });
  await say(payload);
}

async function handleDungeonSelectPokemonAction({ body, action, client, respond }) {
  const payload = parsePokemonActionValue(action?.value);
  const actorUserId = body.user?.id;
  logger.info('Seleção de Pokémon da dungeon recebida', {
    file: 'handlers/dungeonActions.js',
    handler: 'handleDungeonSelectPokemonAction',
    actionId: action?.action_id,
    actorUserId,
    payload,
  });
  if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));

  const validation = await validateDungeonPokemonSelection({ slackUserId: actorUserId, pokemonId: payload.pokemonId });
  if (!validation.ok) {
    return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason(validation.reason) }));
  }

  return updateMessage(client, body, renderDungeonModeSelection({ slackUserId: actorUserId, pokemon: validation.pokemon }));
}

async function handleDungeonSelectModeAction({ body, action, client, respond }) {
  const payload = parsePokemonActionValue(action?.value);
  const actorUserId = body.user?.id;
  logger.info('Seleção de modo da dungeon recebida', {
    file: 'handlers/dungeonActions.js',
    handler: 'handleDungeonSelectModeAction',
    actionId: action?.action_id,
    actorUserId,
    payload,
  });
  if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));

  const validation = await validateDungeonPokemonSelection({ slackUserId: actorUserId, pokemonId: payload.pokemonId });
  if (!validation.ok) {
    return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason(validation.reason) }));
  }

  if (payload.mode === 'farm') {
    return updateMessage(client, body, renderDungeonFarmSelection({ slackUserId: actorUserId, pokemon: validation.pokemon, farmLevels: FARM_LEVELS }));
  }

  return updateMessage(client, body, renderDungeonDailySelection({ slackUserId: actorUserId, pokemon: validation.pokemon }));
}

async function handleDungeonStartFarmAction({ body, action, client, respond }) {
  const payload = parsePokemonActionValue(action?.value);
  const actorUserId = body.user?.id;
  logger.info('Início de dungeon farm solicitado', {
    file: 'handlers/dungeonActions.js',
    handler: 'handleDungeonStartFarmAction',
    actionId: action?.action_id,
    slackUserId: actorUserId,
    pokemonId: payload?.pokemonId,
    level: payload?.level,
  });
  if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));

  try {
    const result = await startFarmDungeon({ slackUserId: actorUserId, pokemonId: payload.pokemonId, level: payload.level });
    if (!result.ok) {
      return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason(result.reason) }));
    }

    if (result.completion) {
      return updateMessage(client, body, renderDungeonBattleFinished({ battle: result.battle, completion: result.completion }));
    }

    return updateMessage(client, body, renderDungeonBattleState(result.battle));
  } catch (error) {
    logger.error('Falha ao iniciar dungeon farm via block action', {
      file: 'handlers/dungeonActions.js',
      handler: 'handleDungeonStartFarmAction',
      actionId: action?.action_id,
      slackUserId: actorUserId,
      pokemonId: payload?.pokemonId,
      level: payload?.level,
      error,
    });
    return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: 'Erro interno ao iniciar a dungeon farm.' }));
  }
}

async function handleDungeonStartDailyAction({ body, action, client, respond }) {
  const payload = parsePokemonActionValue(action?.value);
  const actorUserId = body.user?.id;
  logger.info('Início de dungeon daily solicitado', {
    file: 'handlers/dungeonActions.js',
    handler: 'handleDungeonStartDailyAction',
    actionId: action?.action_id,
    slackUserId: actorUserId,
    pokemonId: payload?.pokemonId,
    difficulty: payload?.difficulty,
  });
  if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));

  try {
    const result = await startDailyDungeon({ slackUserId: actorUserId, pokemonId: payload.pokemonId, mode: payload.difficulty });
    if (!result.ok) {
      return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason(result.reason) }));
    }

    if (result.completion) {
      return updateMessage(client, body, renderDungeonBattleFinished({ battle: result.battle, completion: result.completion }));
    }

    return updateMessage(client, body, renderDungeonBattleState(result.battle));
  } catch (error) {
    logger.error('Falha ao iniciar dungeon daily via block action', {
      file: 'handlers/dungeonActions.js',
      handler: 'handleDungeonStartDailyAction',
      actionId: action?.action_id,
      slackUserId: actorUserId,
      pokemonId: payload?.pokemonId,
      difficulty: payload?.difficulty,
      error,
    });
    return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: 'Erro interno ao iniciar a dungeon diária.' }));
  }
}

async function handleDungeonBattleTurnAction({ body, action, client, respond }) {
  const payload = parsePokemonActionValue(action?.value) || {};
  const actorUserId = body.user?.id;
  const actionName = String(payload.action || '').toLowerCase();
  const channelId = payload.channelId;

  logger.info('Ação de turno da dungeon recebida', {
    file: 'handlers/dungeonActions.js',
    handler: 'handleDungeonBattleTurnAction',
    actionId: action?.action_id,
    slackUserId: actorUserId,
    sessionId: channelId,
    actionName,
  });

  if (actionName === 'magic') {
    const battle = getDungeonBattle(channelId);
    if (!battle) {
      return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason('battle_not_found') }));
    }
    if (battle.currentTurnUserId !== actorUserId) {
      logger.warn('Clique fora do turno válido na dungeon (abertura de magia)', {
        file: 'handlers/dungeonActions.js',
        handler: 'handleDungeonBattleTurnAction',
        actionId: action?.action_id,
        slackUserId: actorUserId,
        sessionId: channelId,
        currentTurnUserId: battle.currentTurnUserId,
      });
      if (respond) await respond({ response_type: 'ephemeral', text: '⏳ Aguarde: o turno automático do inimigo ainda está sendo resolvido.' });
      return updateMessage(client, body, renderDungeonBattleState(battle));
    }
    return updateMessage(client, body, renderDungeonMagicOptions({
      battle,
      actorUserId,
      magicSlots: battle.players[actorUserId]?.magicSlots || [],
    }));
  }

  const actionTypeMap = {
    attack: BATTLE_ACTION.ATTACK,
    potion: BATTLE_ACTION.POTION,
    defense: BATTLE_ACTION.DEFENSE,
  };
  const result = await processDungeonTurn({ channelId, actorUserId, actionType: actionTypeMap[actionName] });

  if (!result.ok) {
    if (result.reason === 'not_actor_turn') {
      logger.warn('Clique fora do turno válido na dungeon', {
        file: 'handlers/dungeonActions.js',
        handler: 'handleDungeonBattleTurnAction',
        actionId: action?.action_id,
        slackUserId: actorUserId,
        sessionId: channelId,
        currentTurnUserId: result.validation?.currentTurnUserId || result.battle?.currentTurnUserId || null,
        attemptedAction: actionName,
      });
      if (respond) await respond({ response_type: 'ephemeral', text: '⏳ Ainda não é o seu turno. O inimigo age automaticamente quando for a vez dele.' });
      if (result.battle) return updateMessage(client, body, renderDungeonBattleState(result.battle));
    }
    logger.warn('Falha controlada ao processar turno da dungeon', {
      file: 'handlers/dungeonActions.js',
      handler: 'handleDungeonBattleTurnAction',
      actionId: action?.action_id,
      slackUserId: actorUserId,
      sessionId: channelId,
      reason: result.reason,
    });
    return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason(result.reason) }));
  }

  if (result.completion) {
    return updateMessage(client, body, renderDungeonBattleFinished({ battle: result.battle, completion: result.completion }));
  }

  return updateMessage(client, body, renderDungeonBattleState(result.battle));
}

async function handleDungeonBattleMagicAction({ body, action, client, respond }) {
  const payload = parsePokemonActionValue(action?.value) || {};
  const actorUserId = body.user?.id;
  const channelId = payload.channelId;

  logger.info('Ação de magia da dungeon recebida', {
    file: 'handlers/dungeonActions.js',
    handler: 'handleDungeonBattleMagicAction',
    actionId: action?.action_id,
    slackUserId: actorUserId,
    sessionId: channelId,
    magicSlot: payload.magicSlot,
  });

  const result = await processDungeonTurn({
    channelId,
    actorUserId,
    actionType: BATTLE_ACTION.MAGIC,
    actionPayload: { magicSlot: payload.magicSlot },
  });

  if (!result.ok) {
    if (result.reason === 'not_actor_turn') {
      logger.warn('Clique fora do turno válido na dungeon (magia)', {
        file: 'handlers/dungeonActions.js',
        handler: 'handleDungeonBattleMagicAction',
        actionId: action?.action_id,
        slackUserId: actorUserId,
        sessionId: channelId,
        currentTurnUserId: result.validation?.currentTurnUserId || result.battle?.currentTurnUserId || null,
        magicSlot: payload.magicSlot,
      });
      if (respond) await respond({ response_type: 'ephemeral', text: '⏳ Ainda não é o seu turno para usar magia.' });
      if (result.battle) return updateMessage(client, body, renderDungeonBattleState(result.battle));
    }
    return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason(result.reason) }));
  }

  if (result.completion) {
    return updateMessage(client, body, renderDungeonBattleFinished({ battle: result.battle, completion: result.completion }));
  }

  return updateMessage(client, body, renderDungeonBattleState(result.battle));
}

async function handleDungeonBattleMagicCancelAction({ body, action, client }) {
  const payload = parsePokemonActionValue(action?.value) || {};
  const actorUserId = body.user?.id;
  const battle = getDungeonBattle(payload.channelId);

  logger.info('Retorno da seleção de magia da dungeon', {
    file: 'handlers/dungeonActions.js',
    handler: 'handleDungeonBattleMagicCancelAction',
    actionId: action?.action_id,
    slackUserId: actorUserId,
    sessionId: payload.channelId,
  });

  if (!battle) {
    return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason('battle_not_found') }));
  }

  return updateMessage(client, body, renderDungeonBattleState(battle));
}

function registerDungeonActions(app) {
  app.action(DUNGEON_SELECT_POKEMON_ACTION_PATTERN, async ({ ack, body, action, client, respond }) => {
    await ack();
    await handleDungeonSelectPokemonAction({ body, action, client, respond });
  });

  app.action(DUNGEON_SELECT_MODE_ACTION_PATTERN, async ({ ack, body, action, client, respond }) => {
    await ack();
    await handleDungeonSelectModeAction({ body, action, client, respond });
  });

  app.action(DUNGEON_START_FARM_ACTION_PATTERN, async ({ ack, body, action, client, respond }) => {
    await ack();
    await handleDungeonStartFarmAction({ body, action, client, respond });
  });

  app.action(DUNGEON_START_DAILY_ACTION_PATTERN, async ({ ack, body, action, client, respond }) => {
    await ack();
    await handleDungeonStartDailyAction({ body, action, client, respond });
  });

  app.action(DUNGEON_BATTLE_TURN_ACTION_PATTERN, async ({ ack, body, action, client, respond }) => {
    await ack();
    await handleDungeonBattleTurnAction({ body, action, client, respond });
  });

  app.action(DUNGEON_BATTLE_MAGIC_ACTION_PATTERN, async ({ ack, body, action, client, respond }) => {
    await ack();
    await handleDungeonBattleMagicAction({ body, action, client, respond });
  });

  app.action(DUNGEON_BATTLE_MAGIC_CANCEL_ACTION_ID, async ({ ack, body, action, client }) => {
    await ack();
    await handleDungeonBattleMagicCancelAction({ body, action, client });
  });
}

module.exports = {
  registerDungeonActions,
  handleDungeonCommand,
  handleDungeonSelectPokemonAction,
  handleDungeonSelectModeAction,
  handleDungeonStartFarmAction,
  handleDungeonStartDailyAction,
  handleDungeonBattleTurnAction,
  handleDungeonBattleMagicAction,
};
