const { createLogger } = require('../utils/logger');
const { buildUnauthorizedActionMessage, parsePokemonActionValue } = require('../services/slackPokemonActionService');
const {
  getHealingStationView,
  getHealingEligibilityList,
  addPokemonToHealingStation,
  removePokemonFromHealingStation,
} = require('../services/healingStationService');
const {
  HEALSTATION_ADD_ACTION_ID,
  HEALSTATION_REMOVE_ACTION_ID,
  HEALSTATION_PICK_ADD_ACTION_ID,
  HEALSTATION_PICK_REMOVE_ACTION_ID,
  HEALSTATION_CANCEL_ACTION_ID,
  renderHealingStation,
  renderHealingSelection,
} = require('../adapters/slack/renderers/healingStationRenderer');

const logger = createLogger('handler:healing-station-actions');

function buildSimpleMessage(text) {
  return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
}

function mapReason(reason) {
  return {
    pokemon_not_owned: 'Pokémon não encontrado ou não pertence a você.',
    station_full: 'Sua estação já está com os 5 slots ocupados.',
    already_in_station: 'Esse Pokémon já está na estação.',
    already_full_hp: 'Esse Pokémon já está com HP cheio.',
    pokemon_in_active_battle: 'Esse Pokémon está em batalha ativa e não pode entrar na estação.',
    not_in_station: 'Esse Pokémon não está na estação.',
  }[reason] || 'Não consegui concluir essa ação agora 😵';
}

function registerHealingStationActions(app) {
  app.action(HEALSTATION_ADD_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const payload = parsePokemonActionValue(action?.value);
    const actorUserId = body.user?.id;
    if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));
    const eligible = await getHealingEligibilityList(actorUserId);
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, ...renderHealingSelection({ mode: 'add', slackUserId: actorUserId, pokemons: eligible }) });
  });

  app.action(HEALSTATION_REMOVE_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const payload = parsePokemonActionValue(action?.value);
    const actorUserId = body.user?.id;
    if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));
    const view = await getHealingStationView(actorUserId);
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, ...renderHealingSelection({ mode: 'remove', slackUserId: actorUserId, pokemons: view.slots }) });
  });

  app.action(HEALSTATION_PICK_ADD_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const payload = parsePokemonActionValue(action?.value);
    const actorUserId = body.user?.id;
    if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));
    const result = await addPokemonToHealingStation({ slackUserId: actorUserId, pokemonId: payload.pokemonId });
    if (!result.ok) return respond({ response_type: 'ephemeral', text: mapReason(result.reason) });
    const view = await getHealingStationView(actorUserId);
    logger.info('Interação de botão adicionou Pokémon na estação', { actorUserId, pokemonId: payload.pokemonId });
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, ...renderHealingStation(view, actorUserId) });
  });

  app.action(HEALSTATION_PICK_REMOVE_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const payload = parsePokemonActionValue(action?.value);
    const actorUserId = body.user?.id;
    if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));
    const result = await removePokemonFromHealingStation({ slackUserId: actorUserId, pokemonId: payload.pokemonId });
    if (!result.ok) return respond({ response_type: 'ephemeral', text: mapReason(result.reason) });
    const view = await getHealingStationView(actorUserId);
    logger.info('Interação de botão removeu Pokémon da estação', { actorUserId, pokemonId: payload.pokemonId });
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, ...renderHealingStation(view, actorUserId) });
  });

  app.action(HEALSTATION_CANCEL_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const payload = parsePokemonActionValue(action?.value);
    const actorUserId = body.user?.id;
    if (actorUserId !== payload?.slackUserId) return respond(buildUnauthorizedActionMessage(payload?.slackUserId));
    const view = await getHealingStationView(actorUserId);
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, ...renderHealingStation(view, actorUserId) });
  });
}

module.exports = { registerHealingStationActions };
