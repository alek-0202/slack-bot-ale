const {
  getShinyTransferPreview,
} = require('../../services/pokemonEnhancementService');

const TSHINY_CONFIRM_ACTION_ID = 'tshiny_transfer_confirm';
const TSHINY_CANCEL_ACTION_ID = 'tshiny_transfer_cancel';

function formatGold(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function buildTshinyResultMessage({ sourcePokemonId, targetPokemonId, result }) {
  const costGold = Number(result?.costGold ?? result?.cost_gold ?? 0);
  if (!result?.ok) {
    const map = {
      same_pokemon: 'Origem e destino precisam ser Pokémons diferentes.',
      pokemon_not_owned: 'Origem e destino precisam ser seus Pokémons.',
      source_not_shiny: 'O Pokémon de origem precisa ser shiny.',
      target_already_shiny: 'O Pokémon de destino já é shiny.',
      target_invalid_rarity: 'Target inválido: apenas Pokémon de raridade épico para baixo podem receber transferência de shiny.',
      target_lower_rarity: 'Target inválido: não é permitido transferir shiny para raridade inferior à origem.',
      insufficient_gold: `Gold insuficiente para transferir shiny. Custo: *${formatGold(costGold)}* gold.`,
    };
    return map[result.reason] || 'Não consegui transferir o shiny agora 😵';
  }
  return (
    `✨ Transferência concluída!\n` +
    `• Origem #${sourcePokemonId}: não shiny\n` +
    `• Destino #${targetPokemonId}: shiny normal\n` +
    `💸 Custo: *${formatGold(costGold)}* gold`
  );
}

module.exports = {
  name: 'tshiny',
  async execute({ event, say, args }) {
    const [sourceRaw, targetRaw] = String(args || '').trim().split(/\s+/);
    const sourcePokemonId = Number.parseInt(sourceRaw, 10);
    const targetPokemonId = Number.parseInt(targetRaw, 10);

    if (!Number.isInteger(sourcePokemonId) || !Number.isInteger(targetPokemonId) || sourcePokemonId <= 0 || targetPokemonId <= 0) {
      await say('Use `!tshiny <pokemon id origem> <pokemon id destino>`.');
      return;
    }

    if (sourcePokemonId === targetPokemonId) {
      await say('Origem e destino precisam ser Pokémons diferentes.');
      return;
    }

    const preview = await getShinyTransferPreview({
      slackUserId: event.user,
      sourcePokemonId,
      targetPokemonId,
    });
    if (!preview.ok) {
      await say(buildTshinyResultMessage({ sourcePokemonId, targetPokemonId, result: preview }));
      return;
    }

    await say({
      text: `Confirma transferência shiny de #${sourcePokemonId} para #${targetPokemonId}?`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `⚠️ *Confirmar transferência de shiny*\n` +
              `• Origem: *${preview.sourceName}* (#${sourcePokemonId})\n` +
              `• Destino: *${preview.targetName}* (#${targetPokemonId})\n` +
              `• Custo: *${formatGold(preview.costGold)}* gold\n` +
              `• Seu saldo: *${Number(preview.currentGold || 0).toLocaleString('pt-BR')}* gold\n\n` +
              `❗ Esta ação é *irreversível*.\n` +
              `✨ Shiny *prime* da origem será convertido em shiny *normal* no destino.`,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Somente <@${event.user}> pode confirmar esta transferência.` },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              action_id: TSHINY_CONFIRM_ACTION_ID,
              style: 'danger',
              text: { type: 'plain_text', text: 'Confirmar transferência', emoji: true },
              value: JSON.stringify({ slackUserId: event.user, sourcePokemonId, targetPokemonId }),
            },
            {
              type: 'button',
              action_id: TSHINY_CANCEL_ACTION_ID,
              text: { type: 'plain_text', text: 'Cancelar', emoji: true },
              value: JSON.stringify({ slackUserId: event.user, sourcePokemonId, targetPokemonId }),
            },
          ],
        },
      ],
    });
  },
};

module.exports.TSHINY_CONFIRM_ACTION_ID = TSHINY_CONFIRM_ACTION_ID;
module.exports.TSHINY_CANCEL_ACTION_ID = TSHINY_CANCEL_ACTION_ID;
module.exports.buildTshinyResultMessage = buildTshinyResultMessage;
