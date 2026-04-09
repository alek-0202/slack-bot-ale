const { createLogger } = require("../utils/logger");
const { decideInvite, attack, showPotionOptions, showMagicOptions, castMagic, showSwitchOptions, switchPokemon, usePotion } = require("../services/battleService");
const { upsertPokemonMagicLoadout, getPendingMagicSelection, clearPendingMagicSelection, storePendingMagicSelection, buildMagicSummary, MAX_MAGIC_SLOTS } = require("../services/pokemonMagicService");
const {
  BATTLE_ACCEPT_ACTION_ID,
  BATTLE_DECLINE_ACTION_ID,
  BATTLE_TURN_ACTION_ID,
  BATTLE_MAGIC_ACTION_ID,
  BATTLE_SWITCH_ACTION_ID,
  MAGIC_REGISTER_REMOVE_ACTION_ID,
  renderMagicRegisterElementPrompt,
} = require("../services/battleRenderService");
const { sendEphemeral } = require("../utils/slackResponse");

const BATTLE_TURN_ACTION_PATTERN = new RegExp(`^${BATTLE_TURN_ACTION_ID}_.+$`);
const BATTLE_MAGIC_ACTION_PATTERN = new RegExp(`^${BATTLE_MAGIC_ACTION_ID}_.+$`);
const BATTLE_SWITCH_ACTION_PATTERN = new RegExp(`^${BATTLE_SWITCH_ACTION_ID}_.+$`);
const MAGIC_REGISTER_REMOVE_ACTION_PATTERN = new RegExp(`^${MAGIC_REGISTER_REMOVE_ACTION_ID}_.+$`);

const logger = createLogger("battle-actions");

function parseValue(value) {
  try {
    return JSON.parse(value || "{}");
  } catch (_error) {
    return {};
  }
}

function buildSayAdapter({ say, respond }) {
  return async (payload) => {
    if (say) {
      await say(payload);
      return;
    }
    if (respond) {
      await sendEphemeral(respond, payload);
    }
  };
}

function registerBattleActions(app) {
  const inviteHandler = async ({ ack, action, body, say, respond }) => {
    await ack();

    const payload = parseValue(action?.value);
    const channelId = payload.channelId || body.channel?.id;

    if (!channelId) {
      logger.warn("Ação de batalha sem channelId", { actionId: action?.action_id });
      if (respond) {
        await sendEphemeral(respond, { text: "Não consegui identificar o canal desse desafio." });
      }
      return;
    }

    const decision = action.action_id === BATTLE_ACCEPT_ACTION_ID ? "accept" : "decline";
    await decideInvite({ channelId, actorUserId: body.user?.id, decision, say: buildSayAdapter({ say, respond }) });
  };

  const turnActionHandler = async ({ ack, action, body, say, respond }) => {
    await ack();
    const payload = parseValue(action?.value);
    const channelId = payload.channelId || body.channel?.id;
    const event = { channel: channelId, user: body.user?.id };
    const reply = buildSayAdapter({ say, respond });
    const actionName = String(payload.action || payload.actionType || '').toLowerCase();

    if (actionName === "attack") return attack({ event, say: reply });
    if (actionName === "potion") {
      if (payload.potionType) return usePotion({ event, say: reply, potionType: payload.potionType });
      return showPotionOptions({ event, say: reply });
    }
    if (actionName === "magic") return showMagicOptions({ event, say: reply });
    if (actionName === "switch") return showSwitchOptions({ event, say: reply });
    await reply("Ação de batalha inválida.");
  };

  const magicActionHandler = async ({ ack, action, body, say, respond }) => {
    await ack();
    const payload = parseValue(action?.value);
    const channelId = payload.channelId || body.channel?.id;
    const event = { channel: channelId, user: body.user?.id };
    return castMagic({ event, say: buildSayAdapter({ say, respond }), magicSlot: payload.magicSlot });
  };

  const magicRegisterHandler = async ({ ack, action, body, say, respond }) => {
    await ack();
    const payload = parseValue(action?.value);
    const pokemonId = Number(payload.pokemonId);
    const slackUserId = body.user?.id;
    const pending = getPendingMagicSelection({ slackUserId, pokemonId });
    const reply = buildSayAdapter({ say, respond });

    if (!pending) {
      await reply("Esse fluxo de seleção de elementos expirou. Rode `!magicregister <pokeid>` novamente.");
      return;
    }

    const nextElements = pending.allElements.filter((element) => element !== payload.removeElement);

    if (nextElements.length > MAX_MAGIC_SLOTS) {
      clearPendingMagicSelection({ slackUserId, pokemonId });
      storePendingMagicSelection({ slackUserId, pokemonId, allElements: nextElements });
      await reply(renderMagicRegisterElementPrompt({
        pokemon: { id: pokemonId, pokemon_species: { name: `Pokémon #${pokemonId}` } },
        elements: nextElements,
        maxSlots: MAX_MAGIC_SLOTS,
      }));
      return;
    }

    const result = await upsertPokemonMagicLoadout({
      slackUserId,
      pokemonId,
      selectedElements: nextElements,
    });

    if (!result.ok) {
      await reply("Não consegui concluir o registro das magias agora.");
      return;
    }

    await reply(
      `✨ Magias registradas para *${result.pokemon.pokemon_species?.name || `Pokémon #${pokemonId}`}* (ID ${pokemonId}).\n` +
      `${buildMagicSummary(result.spells)}`,
    );
  };

  const switchActionHandler = async ({ ack, action, body, say, respond }) => {
    await ack();
    const payload = parseValue(action?.value);
    const channelId = payload.channelId || body.channel?.id;
    const event = { channel: channelId, user: body.user?.id };
    return switchPokemon({ event, say: buildSayAdapter({ say, respond }), pokemonId: payload.pokemonId });
  };

  app.action(BATTLE_ACCEPT_ACTION_ID, inviteHandler);
  app.action(BATTLE_DECLINE_ACTION_ID, inviteHandler);
  app.action(BATTLE_TURN_ACTION_PATTERN, turnActionHandler);
  app.action(BATTLE_MAGIC_ACTION_PATTERN, magicActionHandler);
  app.action(BATTLE_SWITCH_ACTION_PATTERN, switchActionHandler);
  app.action(MAGIC_REGISTER_REMOVE_ACTION_PATTERN, magicRegisterHandler);
}

module.exports = {
  registerBattleActions,
};
