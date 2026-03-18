const { createLogger } = require("../utils/logger");
const {
  EVOLVE_CONFIRM_ACTION_ID,
  EVOLVE_CANCEL_ACTION_ID,
  UP_CONFIRM_ACTION_ID,
  UP_CANCEL_ACTION_ID,
  parsePokemonActionValue,
  buildUnauthorizedActionMessage,
  evolvePokemon,
  upgradePokemonToLevel,
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
        newSpeciesName: result.newSpeciesName,
      });
    } catch (error) {
      logger.error("Falha ao confirmar evolução", { actorUserId, pokemonId: payload.pokemonId, error });
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
        targetLevel: payload.targetLevel,
      });
    } catch (error) {
      logger.error("Falha ao confirmar !up", { actorUserId, pokemonId: payload?.pokemonId, targetLevel: payload?.targetLevel, error });
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
}

module.exports = {
  registerPokemonActions,
};
