const { createLogger } = require("../utils/logger");
const { getUserItems } = require('../services/inventoryService');
const { PROFILE_OPEN_BAG_ACTION_ID } = require('../adapters/slack/renderers/sharedPokemonRenderer');
const { buildMochilaPayload } = require('../commands/pokemon/mochila');
const { POKEID_OPEN_STATS_ACTION_ID } = require('../commands/pokemon/pokeid');
const {
  TSHINY_CONFIRM_ACTION_ID,
  TSHINY_CANCEL_ACTION_ID,
  buildTshinyResultMessage,
} = require('../commands/pokemon/tshiny');
const { MRSKILL_TOGGLE_ACTION_ID, buildMrSkillBlocks } = require('../commands/mrskill');
const { getOwnedPokemonById } = require('../services/pokemonLookupService');
const { getMrSkillSetup, saveMrSkillSelection } = require('../services/pokemonMagicService');
const { FUSION_BUY_ACTION_ID, craftFusionItem, buildFusionHud } = require('../services/fusionService');
const {
  upgradePokemonExtraStat,
  transferShiny,
  parseActionValue,
  EXTRA_STAT_CONFIG,
  EXTRA_STAT_UPGRADE_GOLD_COST,
  EXTRA_STAT_UPGRADE_ESSENCE_COST,
} = require('../services/pokemonEnhancementService');
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
  sellAllPokemonBatch,
} = require("../services/slackPokemonActionService");

const logger = createLogger("handler:pokemon-actions");
const APPLY_ITEM_ACTION_PATTERN = new RegExp(`^${APPLY_ITEM_ACTION_ID}(?:_.+)?$`);
const POKEID_BACK_ACTION_ID = "pokeid_back_main";
const POKEID_UPGRADE_ACTION_IDS = [
  "pokeid_upgrade_extra_crit",
  "pokeid_upgrade_extra_dodge",
  "pokeid_upgrade_extra_elemental",
];
const POKEID_UPGRADE_ACTION_PATTERN = /^pokeid_upgrade_extra_(crit|dodge|elemental)$/;

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function buildPokeidStatsBlocks({ pokemon }) {
  const critLevel = Number(pokemon.crit_level || 0);
  const dodgeLevel = Number(pokemon.dodge_level || 0);
  const elementalLevel = Number(pokemon.elemental_level || 0);
  const mk = (label, level, perPoint, cap) => `• *${label}:* Lv ${level}/10 — ${pct(level * perPoint)} / ${pct(cap)}`;
  return [
    { type: 'header', text: { type: 'plain_text', text: '📊 Stats extras', emoji: true } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*Pokémon:* ${pokemon.pokemon_species?.name || 'Pokémon'} (#${pokemon.id})\n` +
          `${mk('Chance crítica', critLevel, 4, 40)}\n` +
          `${mk('Esquiva', dodgeLevel, 1.8, 18)}\n` +
          `${mk('Efeito elemental', elementalLevel, 3, 30)}\n\n` +
          `💸 Upgrade por ponto: *${EXTRA_STAT_UPGRADE_GOLD_COST.toLocaleString('pt-BR')}* gold + *${EXTRA_STAT_UPGRADE_ESSENCE_COST}* essência`,
      },
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', action_id: POKEID_UPGRADE_ACTION_IDS[0], text: { type: 'plain_text', text: '+ Crit' }, style: 'primary', value: JSON.stringify({ pokemonId: pokemon.id, statKey: 'crit', ownerSlackUserId: pokemon.slack_user_id }) },
        { type: 'button', action_id: POKEID_UPGRADE_ACTION_IDS[1], text: { type: 'plain_text', text: '+ Esquiva' }, value: JSON.stringify({ pokemonId: pokemon.id, statKey: 'dodge', ownerSlackUserId: pokemon.slack_user_id }) },
        { type: 'button', action_id: POKEID_UPGRADE_ACTION_IDS[2], text: { type: 'plain_text', text: '+ Elemental' }, value: JSON.stringify({ pokemonId: pokemon.id, statKey: 'elemental', ownerSlackUserId: pokemon.slack_user_id }) },
      ],
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', action_id: POKEID_BACK_ACTION_ID, text: { type: 'plain_text', text: 'Voltar' }, value: JSON.stringify({ pokemonId: pokemon.id, ownerSlackUserId: pokemon.slack_user_id }) },
      ],
    },
  ];
}


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


  app.action(APPLY_ITEM_ACTION_PATTERN, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parsePokemonActionValue(action?.value);

    logger.info("Clique de aplicação de Livro do Ancião recebido", {
      actorUserId,
      ownerSlackUserId: payload?.slackUserId,
      pokemonId: payload?.pokemonId,
      statKey: payload?.statKey,
      actionId: action?.action_id,
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
    const isSellAll = Boolean(payload?.sellAll);

    if (!payload?.slackUserId || (!pokemonIds.length && !isSellAll)) {
      await respond({ response_type: "ephemeral", text: "Não consegui validar essa confirmação de venda 😵" });
      return;
    }

    if (actorUserId !== payload.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload.slackUserId));
      return;
    }

    try {
      const result = isSellAll
        ? await sellAllPokemonBatch({ slackUserId: actorUserId })
        : pokemonIds.length > 1
        ? await sellPokemonBatch({ slackUserId: actorUserId, pokemonIds })
        : await sellPokemon({ slackUserId: actorUserId, pokemonId: pokemonIds[0] });
      if (!result.ok) {
        const map = {
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          favorite_pokemon_blocked: "Não é possível vender Pokémon favorito. Remova o favorito antes de confirmar a venda.",
          pokemon_locked_in_trade: "Um dos Pokémons está preso em um trade pendente e não pode ser vendido agora.",
          no_sellable_pokemon: "Não há Pokémons elegíveis para vender agora no !sellall.",
          sale_price_changed: "O valor da venda mudou desde a confirmação. Abra o !sell novamente para revisar o total atualizado.",
        };
        await respond({ response_type: "ephemeral", text: map[result.reason] || "Não consegui vender esse Pokémon agora 😵" });
        return;
      }

      const pokemonSummary = result.sellAll
        ? `*Resumo da venda em massa*\n• Vendidos: *${result.soldCount || 0}*\n• Ignorados/bloqueados: *${result.ignoredCount || 0}* (favoritos: ${result.favoriteIgnoredCount || 0}, bloqueados: ${result.blockedCount || 0})`
        : (result.pokemons || [result.pokemon])
          .map((pokemon, index) => `• ${pokemon?.shiny ? "✨ " : ""}*${pokemon?.pokemon_species?.name || "Pokémon"}* (#${pokemon.id})${result.items?.[index] ? ` — *${result.items[index].priceBreakdown?.finalPrice || "0"}* gold` : ""}`)
          .join("\n");
      const epicFragments = Number(result.fragmentBonus?.epicFragment || 0);
      const prismFragments = Number(result.fragmentBonus?.prismaticFragment || 0);
      const fragmentBonusLine = epicFragments > 0 || prismFragments > 0
        ? `\n🧩 Bônus de fragmentos: *+${epicFragments} épico* | *+${prismFragments} prismático*`
        : "";
      const updated = buildUpdatedMessage(
        `💸 *Venda concluída!*

${pokemonSummary}

💰 Valor recebido: *${result.goldReceived}* gold
🧪 Essência recebida: *${result.essenceReceived || "0"}*
${fragmentBonusLine}
💳 Gold atual: *${result.currentGold}*
🎒 Essência total: *${result.currentEssence || "0"}*`,
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


  app.action(POKEID_OPEN_STATS_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parseActionValue(action?.value);
    if (!payload?.pokemonId) {
      await respond({ response_type: 'ephemeral', text: 'Não consegui abrir os stats.' });
      return;
    }
    const pokemon = await getOwnedPokemonById(payload.pokemonId);
    if (!pokemon || pokemon.slack_user_id !== actorUserId) {
      await respond({ response_type: 'ephemeral', text: 'Você só pode abrir stats dos seus Pokémons.' });
      return;
    }

    const updated = {
      text: `Stats extras do Pokémon #${pokemon.id}`,
      blocks: buildPokeidStatsBlocks({ pokemon }),
    };
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });
  });

  app.action(POKEID_UPGRADE_ACTION_PATTERN, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parseActionValue(action?.value);
    if (!payload?.pokemonId || !payload?.statKey || !EXTRA_STAT_CONFIG[payload.statKey]) {
      await respond({ response_type: 'ephemeral', text: 'Upgrade inválido.' });
      return;
    }

    const result = await upgradePokemonExtraStat({ slackUserId: actorUserId, pokemonId: payload.pokemonId, statKey: payload.statKey });
    if (!result.ok) {
      const map = {
        pokemon_not_owned: 'Pokémon não encontrado ou não pertence a você.',
        invalid_stat: 'Atributo inválido.',
        stat_maxed: 'Esse atributo já está no nível máximo.',
        insufficient_gold: 'Gold insuficiente para o upgrade.',
        insufficient_essence: 'Essência insuficiente para o upgrade.',
      };
      await respond({ response_type: 'ephemeral', text: map[result.reason] || 'Não consegui aplicar o upgrade.' });
      return;
    }

    const pokemon = await getOwnedPokemonById(payload.pokemonId);
    const updated = {
      text: `Stats extras do Pokémon #${payload.pokemonId}`,
      blocks: buildPokeidStatsBlocks({ pokemon }),
    };
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });
  });

  app.action(POKEID_BACK_ACTION_ID, async ({ ack, respond }) => {
    await ack();
    await respond({ response_type: 'ephemeral', text: 'Use `!pokeid <id>` para voltar ao HUD principal.' });
  });

  app.action(TSHINY_CONFIRM_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parseActionValue(action?.value);
    if (!payload?.slackUserId || !payload?.sourcePokemonId || !payload?.targetPokemonId) {
      await respond({ response_type: 'ephemeral', text: 'Não consegui validar essa confirmação de transferência shiny.' });
      return;
    }

    if (actorUserId !== payload.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload.slackUserId));
      return;
    }

    const result = await transferShiny({
      slackUserId: actorUserId,
      sourcePokemonId: payload.sourcePokemonId,
      targetPokemonId: payload.targetPokemonId,
    });

    const updated = buildUpdatedMessage(buildTshinyResultMessage({
      sourcePokemonId: payload.sourcePokemonId,
      targetPokemonId: payload.targetPokemonId,
      result,
    }));
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });
  });

  app.action(TSHINY_CANCEL_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parseActionValue(action?.value);
    if (payload?.slackUserId && actorUserId !== payload.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload.slackUserId));
      return;
    }

    const updated = buildUpdatedMessage(`🛑 Transferência shiny cancelada por <@${actorUserId}>.`);
    await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: updated.text, blocks: updated.blocks });
  });

  app.action(MRSKILL_TOGGLE_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parsePokemonActionValue(action?.value);

    if (actorUserId !== payload?.slackUserId) {
      await respond(buildUnauthorizedActionMessage(payload?.slackUserId));
      return;
    }

    const setup = await getMrSkillSetup({ slackUserId: actorUserId, pokemonId: payload?.pokemonId });
    if (!setup.ok) {
      await respond({ response_type: 'ephemeral', text: 'Não consegui atualizar esse HUD de skills agora 😵' });
      return;
    }

    const targetSkillId = String(payload?.skillId || '');
    const selected = setup.selectedSkillIds.map((id) => String(id));
    const nextSelection = selected.includes(targetSkillId)
      ? selected.filter((id) => id !== targetSkillId)
      : [...selected, targetSkillId].slice(-2);

    const result = await saveMrSkillSelection({
      slackUserId: actorUserId,
      pokemonId: setup.pokemon.id,
      selectedSkillIds: nextSelection,
    });
    if (!result.ok) {
      await respond({ response_type: 'ephemeral', text: 'Não consegui aplicar essa troca de skills agora 😵' });
      return;
    }

    const refreshed = await getMrSkillSetup({ slackUserId: actorUserId, pokemonId: setup.pokemon.id });
    if (!refreshed.ok) {
      await respond({ response_type: 'ephemeral', text: 'As skills foram salvas, mas não consegui recarregar o HUD.' });
      return;
    }

    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      ...buildMrSkillBlocks({ slackUserId: actorUserId, setup: refreshed }),
    });
  });

  app.action(new RegExp(`^${FUSION_BUY_ACTION_ID}__`), async ({ ack, body, action, client, respond }) => {
    await ack();
    const actorUserId = body.user?.id;
    const payload = parseActionValue(action?.value);
    if (!payload?.ownerSlackUserId || actorUserId !== payload.ownerSlackUserId) {
      await respond({ response_type: 'ephemeral', text: 'Somente quem abriu o HUD de fusão pode usar esses botões.' });
      return;
    }

    try {
      const result = await craftFusionItem({
        slackUserId: actorUserId,
        itemKey: payload.itemKey,
        quantity: payload.quantity,
      });

      if (!result.ok) {
        if (result.reason === 'insufficient_materials') {
          await respond({
            response_type: 'ephemeral',
            text: `Fragmentos insuficientes para craftar ${result.item?.itemName || 'este item'} x${payload.quantity}.`,
          });
          return;
        }
        await respond({ response_type: 'ephemeral', text: 'Não consegui concluir essa fusão agora.' });
        return;
      }

      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        ...buildFusionHud({ slackUserId: actorUserId }),
      });
      await respond({
        response_type: 'ephemeral',
        text: `✅ Fusão concluída: ${result.item.itemName} x${result.quantity} adicionada à mochila.`,
      });
    } catch (error) {
      logger.error('Falha ao processar compra de fusão', { actorUserId, payload, error });
      await respond({ response_type: 'ephemeral', text: 'Erro ao processar fusão 😵' });
    }
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
