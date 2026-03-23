const { createLogger } = require('../utils/logger');
const { parsePokemonActionValue, buildUnauthorizedActionMessage } = require('../services/slackPokemonActionService');
const {
  FARM_LEVELS,
  getEligibleDungeonPokemons,
  validateDungeonPokemonSelection,
  startFarmDungeon,
  startDailyDungeon,
  mapDungeonFailureReason,
} = require('../services/dungeonService');
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

const logger = createLogger('handler:dungeon-actions');

const DUNGEON_SELECT_POKEMON_ACTION_PATTERN = new RegExp(`^${DUNGEON_SELECT_POKEMON_ACTION_ID}_.+$`);
const DUNGEON_SELECT_MODE_ACTION_PATTERN = new RegExp(`^${DUNGEON_SELECT_MODE_ACTION_ID}_.+$`);
const DUNGEON_START_FARM_ACTION_PATTERN = new RegExp(`^${DUNGEON_START_FARM_ACTION_ID}_.+$`);
const DUNGEON_START_DAILY_ACTION_PATTERN = new RegExp(`^${DUNGEON_START_DAILY_ACTION_ID}_.+$`);

function buildDungeonSuccessMessage(actorUserId, result) {
  if (result.mode === 'farm') {
    return {
      text: `🏆 <@${actorUserId}> concluiu a Dungeon Farm Lv ${result.level}!`,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: [
        `🏆 <@${actorUserId}> concluiu a *Dungeon Farm Lv ${result.level}*!`,
        `💰 Gold: +${result.rewards.goldReward}`,
        `✨ XP da conta: +${result.rewards.xpResult.grantedXp}`,
        `📚 Livro Ancião: +${result.level >= 25 ? 2 : 1}`,
        result.rewards.xpResult.leveledUp ? `🆙 Level up! Agora você está no nível *${result.rewards.xpResult.current.level}*.` : null,
      ].filter(Boolean).join('\n') } }],
    };
  }

  const speciesName = result.capturedSpecies?.name || result.rewards.captured?.pokemon_species?.name || 'Pokémon';
  return {
    text: `🏆 <@${actorUserId}> venceu a Dungeon Diária!`,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: [
      `🏆 <@${actorUserId}> venceu a *Dungeon Diária ${result.mode === 'hard' ? 'Difícil' : 'Normal'}*!`,
      `💰 Gold: +${result.rewards.goldReward}`,
      `✨ XP da conta: +${result.rewards.xpResult.grantedXp}`,
      `🎁 Pokémon recebido: *${speciesName}*`,
      result.rewards.xpResult.leveledUp ? `🆙 Level up! Agora você está no nível *${result.rewards.xpResult.current.level}*.` : null,
    ].filter(Boolean).join('\n') } }],
  };
}

async function updateMessage(client, body, payload) {
  await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: payload.text, blocks: payload.blocks });
}

async function handleDungeonCommand({ event, say }) {
  const pokemons = await getEligibleDungeonPokemons(event.user);
  const payload = pokemons.length
    ? renderDungeonPokemonSelection({ slackUserId: event.user, pokemons })
    : renderDungeonError({ slackUserId: event.user, text: 'Nenhum Pokémon elegível para dungeon agora. Verifique heal station, HP e batalhas ativas.' });
  await say(payload);
}

async function handleDungeonSelectPokemonAction({ body, action, client, respond }) {
  const payload = parsePokemonActionValue(action?.value);
  const actorUserId = body.user?.id;
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
  if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));

  const result = await startFarmDungeon({ slackUserId: actorUserId, pokemonId: payload.pokemonId, level: payload.level });
  if (!result.ok) {
    return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason(result.reason) }));
  }

  logger.info('Dungeon farm iniciada via botão', { actorUserId, pokemonId: payload.pokemonId, level: payload.level });
  return updateMessage(client, body, buildDungeonSuccessMessage(actorUserId, result));
}

async function handleDungeonStartDailyAction({ body, action, client, respond }) {
  const payload = parsePokemonActionValue(action?.value);
  const actorUserId = body.user?.id;
  if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));

  const result = await startDailyDungeon({ slackUserId: actorUserId, pokemonId: payload.pokemonId, mode: payload.difficulty });
  if (!result.ok) {
    return updateMessage(client, body, renderDungeonError({ slackUserId: actorUserId, text: mapDungeonFailureReason(result.reason) }));
  }

  logger.info('Dungeon diária iniciada via botão', { actorUserId, pokemonId: payload.pokemonId, difficulty: payload.difficulty });
  return updateMessage(client, body, buildDungeonSuccessMessage(actorUserId, result));
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
}

module.exports = {
  registerDungeonActions,
  handleDungeonCommand,
  handleDungeonSelectPokemonAction,
  handleDungeonSelectModeAction,
  handleDungeonStartFarmAction,
  handleDungeonStartDailyAction,
};
