const { parsePositiveInt } = require('../../utils/number');
const { getUserItemQuantity } = require('../../services/inventoryService');
const { createEpicTomeRoll, validateOwnedPokemon } = require('../../services/epicAffixService');
const { formatEpicAffix } = require('../../services/epicAffixRegistry');

const EPICTOME_CHOOSE_ACTION_ID = 'epictome_choose_affix';

function buildChoiceMessage({ slackUserId, pokemon, roll }) {
  const currentLabel = formatEpicAffix(roll.currentAffix);
  const [optionA, optionB] = roll.options;

  const valuePayload = {
    ownerSlackUserId: slackUserId,
    pokemonId: pokemon.id,
    currentAffix: roll.currentAffix,
    options: roll.options,
  };

  return {
    text: 'Escolha do Tomo Épico',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📕 Tomo Épico', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Pokémon:* ${pokemon.pokemon_species?.name || `#${pokemon.id}`} (ID ${pokemon.id})\n` +
            `*Afixo atual:* ${currentLabel}\n\n` +
            '*Escolha um resultado:*\n' +
            `1) Manter atual: *${currentLabel}*\n` +
            `2) Nova opção: *${formatEpicAffix(optionA)}*\n` +
            `3) Nova opção: *${formatEpicAffix(optionB)}*`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: EPICTOME_CHOOSE_ACTION_ID,
            text: { type: 'plain_text', text: 'Manter atual', emoji: true },
            value: JSON.stringify({ ...valuePayload, choice: 'keep' }),
          },
          {
            type: 'button',
            action_id: EPICTOME_CHOOSE_ACTION_ID,
            text: { type: 'plain_text', text: 'Aplicar opção 1', emoji: true },
            style: 'primary',
            value: JSON.stringify({ ...valuePayload, choice: 'option_1' }),
          },
          {
            type: 'button',
            action_id: EPICTOME_CHOOSE_ACTION_ID,
            text: { type: 'plain_text', text: 'Aplicar opção 2', emoji: true },
            style: 'primary',
            value: JSON.stringify({ ...valuePayload, choice: 'option_2' }),
          },
        ],
      },
    ],
  };
}

module.exports = {
  name: 'epictome',
  async execute({ event, args, say }) {
    const pokemonId = parsePositiveInt(args);
    if (!pokemonId) {
      await say('Use `!epictome <pokeid>`.');
      return;
    }

    const ownership = await validateOwnedPokemon({ slackUserId: event.user, pokemonId });
    if (!ownership.ok) {
      await say('❌ Pokémon não encontrado na sua coleção.');
      return;
    }

    const tomeQty = await getUserItemQuantity(event.user, 'epic_tome');
    if (tomeQty < 1) {
      await say('❌ Você não possui *Tomo Épico* na mochila. Compre em `!fusão`.');
      return;
    }

    const roll = createEpicTomeRoll({ pokemon: ownership.pokemon });
    await say(buildChoiceMessage({ slackUserId: event.user, pokemon: ownership.pokemon, roll }));
  },
};

module.exports.EPICTOME_CHOOSE_ACTION_ID = EPICTOME_CHOOSE_ACTION_ID;
module.exports.buildEpicTomeChoiceMessage = buildChoiceMessage;
