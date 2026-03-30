const { formatHealingRate } = require('../../../services/healingStationService');
const HEALSTATION_ADD_ACTION_ID = 'healstation_add';
const HEALSTATION_REMOVE_ACTION_ID = 'healstation_remove';
const HEALSTATION_PICK_ADD_ACTION_ID = 'healstation_pick_add';
const HEALSTATION_PICK_REMOVE_ACTION_ID = 'healstation_pick_remove';
const HEALSTATION_CANCEL_ACTION_ID = 'healstation_cancel';
const UPSTATION_CONFIRM_ACTION_ID = 'upstation_confirm';
const UPSTATION_CANCEL_ACTION_ID = 'upstation_cancel';

function actionValue(payload) {
  return JSON.stringify(payload);
}

function buildRows(elements, perRow = 5) {
  const rows = [];
  for (let index = 0; index < elements.length; index += perRow) {
    rows.push({ type: 'actions', elements: elements.slice(index, index + perRow) });
  }
  return rows;
}

function renderHealingStation(view, slackUserId) {
  const slotsText = view.slots.length
    ? view.slots.map((slot) => `• *${slot.speciesName}* (#${slot.pokemonId}) — ❤️ ${slot.currentHp}/${slot.hpMax} (${slot.percent}%)`).join('\n')
    : '_Nenhum Pokémon em cura no momento._';

  return {
    text: `Estação de cura de ${slackUserId}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🩺 Estação de cura', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Treinador:* <@${slackUserId}>\n*Nível:* ${view.station.level}/10\n*Regen:* +${formatHealingRate(view.ratePerMinute)} HP/min por slot\n*Slots:* ${view.slots.length}/${view.maxSlots}` } },
      { type: 'section', text: { type: 'mrkdwn', text: slotsText } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Adicionar', emoji: true }, action_id: HEALSTATION_ADD_ACTION_ID, value: actionValue({ slackUserId }), style: 'primary' },
        { type: 'button', text: { type: 'plain_text', text: 'Remover', emoji: true }, action_id: HEALSTATION_REMOVE_ACTION_ID, value: actionValue({ slackUserId }) },
      ] },
    ],
  };
}

function renderHealingSelection({ mode, slackUserId, pokemons = [] }) {
  const title = mode === 'add' ? '➕ Adicionar à cura' : '➖ Remover da cura';
  const actionId = mode === 'add' ? HEALSTATION_PICK_ADD_ACTION_ID : HEALSTATION_PICK_REMOVE_ACTION_ID;
  const emptyText = mode === 'add' ? 'Nenhum Pokémon elegível para cura agora.' : 'Nenhum Pokémon na estação agora.';
  const elements = pokemons.slice(0, 25).map((pokemon) => ({
    type: 'button',
    text: { type: 'plain_text', text: `#${pokemon.id || pokemon.pokemonId} ${pokemon.pokemon_species?.name || pokemon.speciesName || 'Pokémon'}`.slice(0, 75), emoji: true },
    action_id: actionId,
    value: actionValue({ slackUserId, pokemonId: pokemon.id || pokemon.pokemonId }),
  }));

  return {
    text: title,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: elements.length ? 'Escolha um Pokémon:' : emptyText } },
      ...(elements.length ? buildRows(elements) : []),
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Cancelar', emoji: true }, action_id: HEALSTATION_CANCEL_ACTION_ID, value: actionValue({ slackUserId }) }] },
    ],
  };
}

function renderHealingStationUpgradePreview({ slackUserId, preview }) {
  return {
    text: `Confirmação de upgrade da estação de ${slackUserId}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '⬆️ Confirmar upgrade da estação', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Treinador:* <@${slackUserId}>\n` +
            `*Nível atual:* ${preview.currentLevel}\n` +
            `*Próximo nível:* ${preview.nextLevel}\n` +
            `*Custo:* ${preview.cost} gold\n` +
            `*Regen:* ${formatHealingRate(preview.currentRatePerMinute)} → ${formatHealingRate(preview.nextRatePerMinute)} HP/min por slot\n` +
            `${preview.canAfford ? `*Gold atual:* ${preview.currentGold}` : `⚠️ *Gold atual:* ${preview.currentGold} (insuficiente)`}`,
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Somente <@${slackUserId}> pode confirmar este upgrade.` }],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Confirmar', emoji: true },
            action_id: UPSTATION_CONFIRM_ACTION_ID,
            style: 'primary',
            value: actionValue({ slackUserId, currentLevel: preview.currentLevel, nextLevel: preview.nextLevel, cost: preview.cost }),
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Cancelar', emoji: true },
            action_id: UPSTATION_CANCEL_ACTION_ID,
            value: actionValue({ slackUserId, currentLevel: preview.currentLevel, nextLevel: preview.nextLevel }),
          },
        ],
      },
    ],
  };
}

module.exports = {
  HEALSTATION_ADD_ACTION_ID,
  HEALSTATION_REMOVE_ACTION_ID,
  HEALSTATION_PICK_ADD_ACTION_ID,
  HEALSTATION_PICK_REMOVE_ACTION_ID,
  HEALSTATION_CANCEL_ACTION_ID,
  UPSTATION_CONFIRM_ACTION_ID,
  UPSTATION_CANCEL_ACTION_ID,
  renderHealingStation,
  renderHealingSelection,
  renderHealingStationUpgradePreview,
};
