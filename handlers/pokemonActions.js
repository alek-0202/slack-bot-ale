const { createLogger } = require("../utils/logger");
const { getUserItems } = require('../services/inventoryService');
const { PROFILE_OPEN_BAG_ACTION_ID } = require('../adapters/slack/renderers/sharedPokemonRenderer');
const { buildMochilaPayload } = require('../commands/pokemon/mochila');
const {
  EVOLVE_CONFIRM_ACTION_ID,
  EVOLVE_CANCEL_ACTION_ID,
  UP_CONFIRM_ACTION_ID,
  UP_CANCEL_ACTION_ID,
  SELL_CONFIRM_ACTION_ID,
  SELL_CANCEL_ACTION_ID,
  APPLY_ITEM_ACTION_ID,
  parsePokemonActionValue,
  buildUnauthorizedActionMessage,
  buildApplyItemViewMessage,
  applyBookItemToPokemon,
  evolvePokemon,
  upgradePokemonToLevel,
  sellPokemon,
  sellPokemonBatch,
} = require("../services/slackPokemonActionService");

const logger = createLogger("handler:pokemon-actions");

function buildUpdatedMessage(text) {
  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      },
    ],
  };
}

function registerPokemonActions(app) {
  app.action(EVOLVE_CONFIRM_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parsePokemonActionValue(action?.value);

    logger.info("Clique de confirmação de evolução recebido", {
      actorUserId,
      ownerSlackUserId: payload?.slackUserId,
      pokemonId: payload?.pokemonId,
    });

    if (!payload?.slackUserId || !payload?.pokemonId) {
      await respond({ response_type: "ephemeral", text: "Não consegui validar essa confirmação de evolução 😵" });
      return;
    }

    if (actorUserId !== payload.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload.slackUserId));
      return;
    }

    try {
      const result = await evolvePokemon({ slackUserId: actorUserId, pokemonId: payload.pokemonId });
      if (!result.ok) {
        const map = {
          user_not_started: "Você ainda não começou. Use `!poke start`.",
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          pokemon_in_healing_station: "Esse Pokémon está na estação de cura e não pode evoluir agora.",
          no_evolution_available: "Esse Pokémon não possui evolução disponível no momento.",
          insufficient_gold: `Gold insuficiente para evoluir. Custo: *${result.cost}* | Seu gold: *${result.currentGold}*.`,
          species_stats_missing: "Os dados da próxima evolução ainda estão incompletos. Tente novamente depois.",
        };
        await respond({ response_type: "ephemeral", text: map[result.reason] || "Não consegui evoluir esse Pokémon agora 😵" });
        return;
      }

      const updated = buildUpdatedMessage(
        `✨ *Pokémon evoluído!*\n\n🆔 ID: *${result.pokemonId}*\n${result.previousSpeciesName} → ${result.newSpeciesName}\n💸 Custo: *${result.cost}* gold\n💰 Gold restante: *${result.remainingGold}*`,
      );

      await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });

      logger.info("Evolução confirmada com sucesso", {
        actorUserId,
        pokemonId: payload.pokemonId,
        currentSpecies: result.previousSpeciesName,
        nextSpecies: result.newSpeciesName,
        success: true,
      });
    } catch (error) {
      logger.error("Falha ao confirmar evolução", {
        actorUserId,
        pokemonId: payload.pokemonId,
        currentSpecies: payload?.currentSpeciesName || null,
        nextSpecies: payload?.nextSpeciesName || null,
        success: false,
        error,
      });
      await respond({ response_type: "ephemeral", text: "Não consegui evoluir agora 😵‍💫" });
    }
  });

  app.action(EVOLVE_CANCEL_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parsePokemonActionValue(action?.value);

    if (actorUserId !== payload?.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload?.slackUserId));
      return;
    }

    const updated = buildUpdatedMessage(`🛑 Evolução cancelada por <@${actorUserId}> para o Pokémon ID *${payload.pokemonId}*.`);
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });
  });

  app.action(UP_CONFIRM_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parsePokemonActionValue(action?.value);

    logger.info("Clique de confirmação de !up recebido", {
      actorUserId,
      ownerSlackUserId: payload?.slackUserId,
      pokemonId: payload?.pokemonId,
      targetLevel: payload?.targetLevel,
    });

    if (!payload?.slackUserId || !payload?.pokemonId || !payload?.targetLevel) {
      await respond({ response_type: "ephemeral", text: "Não consegui validar essa confirmação de upgrade 😵" });
      return;
    }

    if (actorUserId !== payload.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload.slackUserId));
      return;
    }

    try {
      const result = await upgradePokemonToLevel({
        slackUserId: actorUserId,
        pokemonId: payload.pokemonId,
        targetLevel: payload.targetLevel,
      });

      if (!result.ok) {
        const map = {
          user_not_started: "Você ainda não começou. Use `!poke start`.",
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          pokemon_in_healing_station: "Esse Pokémon está na estação de cura e não pode receber upgrade agora.",
          invalid_target_level: "O nível alvo informado é inválido.",
          target_must_be_higher: "O nível alvo precisa ser maior que o nível atual.",
          target_above_max_level: `O nível alvo ultrapassa o limite máximo do sistema.`,
          insufficient_gold: `Gold insuficiente para subir até o nível alvo. Custo total: *${result.cost}* | Seu gold: *${result.currentGold}*.`,
          max_level_reached: "Esse Pokémon já chegou no nível máximo.",
        };
        await respond({ response_type: "ephemeral", text: map[result.reason] || "Não consegui aplicar esse upgrade em lote agora 😵" });
        return;
      }

      const pokemonName = result.pokemon?.pokemon_species?.name || "Pokémon";
      const updated = buildUpdatedMessage(
        `🚀 *Upgrade concluído!*\n\n*${pokemonName}* (#${payload.pokemonId})\nNível: *${result.previousLevel}* → *${result.newLevel}*\nNíveis ganhos: *${result.levelsGained}*\n💸 Custo total: *${result.totalCost}* gold\n💰 Gold restante: *${result.remainingGold}*`,
      );
      await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });

      logger.info("Upgrade em lote confirmado com sucesso", {
        actorUserId,
        pokemonId: payload.pokemonId,
        currentLevel: result.previousLevel,
        targetLevel: result.newLevel,
        totalCost: result.totalCost,
        remainingGold: result.remainingGold,
        success: true,
      });
    } catch (error) {
      logger.error("Falha ao confirmar !up", {
        actorUserId,
        pokemonId: payload?.pokemonId,
        currentLevel: payload?.currentLevel || null,
        targetLevel: payload?.targetLevel,
        totalCost: payload?.totalCost || null,
        success: false,
        error,
      });
      await respond({ response_type: "ephemeral", text: "Não consegui aplicar esse upgrade agora 😵" });
    }
  });

  app.action(UP_CANCEL_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parsePokemonActionValue(action?.value);

    if (actorUserId !== payload?.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload?.slackUserId));
      return;
    }

    const updated = buildUpdatedMessage(
      `🛑 Upgrade cancelado por <@${actorUserId}> para o Pokémon ID *${payload.pokemonId}* até o nível *${payload.targetLevel}*.`,
    );
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });
  });


  app.action(APPLY_ITEM_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parsePokemonActionValue(action?.value);

    logger.info("Clique de aplicação de Livro do Ancião recebido", {
      actorUserId,
      ownerSlackUserId: payload?.slackUserId,
      pokemonId: payload?.pokemonId,
      statKey: payload?.statKey,
    });

    if (!payload?.slackUserId || !payload?.pokemonId || !payload?.statKey) {
      await respond({ response_type: "ephemeral", text: "Não consegui validar essa aplicação de item 😵" });
      return;
    }

    if (actorUserId !== payload.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload.slackUserId));
      return;
    }

    try {
      const result = await applyBookItemToPokemon({
        slackUserId: actorUserId,
        pokemonId: payload.pokemonId,
        statKey: payload.statKey,
      });

      if (!result.ok) {
        const map = {
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          invalid_stat: "Atributo inválido para este item.",
          stat_maxed: "Esse atributo já atingiu o limite de +30 com Livro do Ancião.",
          insufficient_item: "Você não possui 5 Livros do Ancião na mochila.",
          pokemon_in_healing_station: "Esse Pokémon está na estação de cura e não pode receber Livro do Ancião agora.",
        };
        await respond({ response_type: "ephemeral", text: map[result.reason] || "Não consegui aplicar o Livro do Ancião agora 😵" });
        return;
      }

      const updatedPreview = {
        pokemon: result.pokemon,
        booksQty: result.remainingBooks,
      };
      const feedbackText = `✅ *Aplicado com sucesso!* ${payload.statKey.toUpperCase()} agora está em *+${result.statBonus}/30* com Livro do Ancião.`;
      const updatedMessage = buildApplyItemViewMessage({
        slackUserId: actorUserId,
        preview: updatedPreview,
        feedbackText,
      });

      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: updatedMessage.text,
        blocks: updatedMessage.blocks,
      });

      logger.info("Aplicação de Livro do Ancião concluída", {
        actorUserId,
        pokemonId: payload.pokemonId,
        statKey: payload.statKey,
        consumedBooks: result.consumedBooks,
        remainingBooks: result.remainingBooks,
        statBonus: result.statBonus,
      });
    } catch (error) {
      logger.error("Falha ao aplicar Livro do Ancião", {
        actorUserId,
        pokemonId: payload?.pokemonId,
        statKey: payload?.statKey,
        error,
      });
      await respond({ response_type: "ephemeral", text: "Não consegui aplicar o Livro do Ancião agora 😵" });
    }
  });

  app.action(SELL_CONFIRM_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parsePokemonActionValue(action?.value);

    logger.info("Clique de confirmação de venda recebido", {
      actorUserId,
      ownerSlackUserId: payload?.slackUserId,
      pokemonIds: payload?.pokemonIds || (payload?.pokemonId ? [payload.pokemonId] : null),
    });

    const pokemonIds = Array.isArray(payload?.pokemonIds) ? payload.pokemonIds : (payload?.pokemonId ? [payload.pokemonId] : []);

    if (!payload?.slackUserId || !pokemonIds.length) {
      await respond({ response_type: "ephemeral", text: "Não consegui validar essa confirmação de venda 😵" });
      return;
    }

    if (actorUserId !== payload.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload.slackUserId));
      return;
    }

    try {
      const result = pokemonIds.length > 1
        ? await sellPokemonBatch({ slackUserId: actorUserId, pokemonIds })
        : await sellPokemon({ slackUserId: actorUserId, pokemonId: pokemonIds[0] });
      if (!result.ok) {
        const map = {
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          pokemon_locked_in_trade: "Um dos Pokémons está preso em um trade pendente e não pode ser vendido agora.",
          sale_price_changed: "O valor da venda mudou desde a confirmação. Abra o !sell novamente para revisar o total atualizado.",
        };
        await respond({ response_type: "ephemeral", text: map[result.reason] || "Não consegui vender esse Pokémon agora 😵" });
        return;
      }

      const pokemonSummary = (result.pokemons || [result.pokemon])
        .map((pokemon, index) => `• *${pokemon?.pokemon_species?.name || "Pokémon"}* (#${pokemon.id})${result.items?.[index] ? ` — *${result.items[index].priceBreakdown?.finalPrice || "0"}* gold` : ""}`)
        .join("\n");
      const updated = buildUpdatedMessage(
        `💸 *Venda concluída!*

${pokemonSummary}

💰 Valor recebido: *${result.goldReceived}* gold
💳 Gold atual: *${result.currentGold}*`,
      );
      await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });

      logger.info("Venda confirmada com sucesso", { actorUserId, pokemonIds, sellValue: result.goldReceived });
    } catch (error) {
      logger.error("Falha ao confirmar venda", { actorUserId, pokemonIds, error });
      await respond({ response_type: "ephemeral", text: "Não consegui vender esse Pokémon agora 😵‍💫" });
    }
  });

  app.action(SELL_CANCEL_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parsePokemonActionValue(action?.value);

    if (actorUserId !== payload?.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload?.slackUserId));
      return;
    }

    const pokemonIds = Array.isArray(payload?.pokemonIds) ? payload.pokemonIds : (payload?.pokemonId ? [payload.pokemonId] : []);
    const updated = buildUpdatedMessage(`🛑 Venda cancelada por <@${actorUserId}> para o(s) Pokémon(s) ID *${pokemonIds.join(", ")}*.`);
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });
  });

  app.action(PROFILE_OPEN_BAG_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    let payload = null;
    try {
      payload = JSON.parse(action?.value || '{}');
    } catch (error) {
      payload = {};
    }

    if (payload?.slackUserId && actorUserId !== payload.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload.slackUserId));
      return;
    }

    const items = await getUserItems(actorUserId);
    if (!items.length) {
      await respond({ response_type: 'ephemeral', text: '🎒 Sua mochila está vazia no momento.' });
      return;
    }

    const updated = buildMochilaPayload(actorUserId, items);
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });
  });

}

module.exports = {
  registerPokemonActions,
};
