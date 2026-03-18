const { EmbedBuilder } = require("discord.js");
const { getUser } = require("../../services/userService");
const { getProfileSummary } = require("../../application/useCases/pokemon/getProfileSummary");
const { captureForUser } = require("../../application/useCases/pokemon/captureForUser");
const { upgradePokemonForUser } = require("../../application/useCases/pokemon/upgradePokemonForUser");
const { getPokedexView } = require("../../services/pokedexViewService");
const { getUpgradeCost, MAX_LEVEL } = require("../../services/upgradeService");
const { ensureDailyMarket, buyMarketSlot, getMarketDateKey } = require("../../services/marketService");
const { buildPokemonTypesLabel } = require("../../services/pokemonTypeService");
const {
  getPendingTradeForUserInChannel,
  createTrade,
  getTradeDetails,
  addPokemonToTrade,
  removePokemonFromTrade,
  setGoldOffer,
  declineOrCancelTrade,
  acceptTrade,
} = require("../../services/tradeService");
const { toPlatformUserId, toPlatformChannelId, fromPlatformId } = require("../../core/platformIdentity");
const { buildPokedexDiscordPayload } = require("./handlers/pokedexNavigation");
const { requestDailyMarketChange } = require("../../application/useCases/market/changeDailyMarket");
const { buildMarketChangeDiscordPayload } = require("../../services/marketChangeViewService");
const {
  renderDiscordProfileSummary,
  renderDiscordCaptureResult,
  renderDiscordUpgradeResult,
} = require("./renderers/sharedPokemonRenderer");

function platformCtx(interaction) {
  const userId = toPlatformUserId("discord", interaction.user.id);
  const channelId = toPlatformChannelId("discord", interaction.channelId || "dm");
  return { userId, channelId };
}

function tradeEmbed(details) {
  const initiatorItems = details.items.filter((item) => item.owner_user_id === details.initiator_user_id);
  const targetItems = details.items.filter((item) => item.owner_user_id === details.target_user_id);
  const mapItems = (items) =>
    items.length
      ? items
          .map((item) => {
            const species = item.user_pokemons?.pokemon_species;
            return `• #${item.user_pokemon_id} ${item.user_pokemons?.shiny ? "✨ " : ""}${species?.name || "Pokémon"} (Lv ${item.user_pokemons?.level || 1})`;
          })
          .join("\n")
      : "• Nenhum Pokémon";

  return new EmbedBuilder()
    .setTitle(`Trade #${details.id} (${details.status})`)
    .addFields(
      {
        name: `Iniciador (<@${fromPlatformId(details.initiator_user_id)}>) | Gold: ${details.initiator_gold_offer}`,
        value: mapItems(initiatorItems),
      },
      {
        name: `Alvo (<@${fromPlatformId(details.target_user_id)}>) | Gold: ${details.target_gold_offer}`,
        value: mapItems(targetItems),
      },
    )
    .setColor(0xf1c40f);
}

async function handleDiscordCommand(interaction) {
  const { userId, channelId } = platformCtx(interaction);
  const name = interaction.commandName;

  if (name === "help") {
    await interaction.reply("Use `/pokemonhelp` para comandos Pokémon e `/capture` para começar.");
    return;
  }

  if (name === "pokemonhelp") {
    await interaction.reply(
      "Comandos: /profile, /capture, /pokedex, /pa, /upgrade, /market, /trade.\nSe ainda não iniciou, use `/profile` e confirme o start automático.",
    );
    return;
  }

  if (name === "profile") {
    const result = await getProfileSummary({ userId, createIfMissing: true });
    await interaction.reply(renderDiscordProfileSummary({ username: interaction.user.username, profile: result.profile }));
    return;
  }

  if (name === "capture") {
    const result = await captureForUser({ userId });
    await interaction.reply(renderDiscordCaptureResult({ result }));
    return;
  }

  if (name === "pokedex" || name === "pa") {
    const user = await getUser(userId);
    if (!user) {
      await interaction.reply("Você ainda não começou. Use `/profile` para iniciar automaticamente.");
      return;
    }

    const view = await getPokedexView(userId, 0);
    const payload = buildPokedexDiscordPayload({ userId: interaction.user.id, view, mode: name === "pa" ? "pa" : "pokedex" });
    await interaction.reply(payload);
    return;
  }

  if (name === "upgrade") {
    const pokemonId = interaction.options.getInteger("pokemon_id", true);
    const result = await upgradePokemonForUser({ userId, pokemonId });
    await interaction.reply(
      renderDiscordUpgradeResult({
        result,
        maxLevel: MAX_LEVEL,
        getNextUpgradeCost: getUpgradeCost,
      }),
    );
    return;
  }

  if (name === "market") {
    const sub = interaction.options.getSubcommand(false) || "view";
    const marketDate = getMarketDateKey();

    if (sub === "view") {
      const market = await ensureDailyMarket(marketDate);
      const rows = market
        .map((item) => `**${item.slot}.** ${item.pokemon_species?.name || "Pokémon"} (${item.pokemon_species?.rarity || "common"})${buildPokemonTypesLabel(item.pokemon_species?.element_types) ? ` | ${buildPokemonTypesLabel(item.pokemon_species?.element_types)}` : ""} - 💰 ${item.price}`)
        .join("\n");

      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle(`Mercado diário (${marketDate})`).setDescription(rows || "Sem slots hoje.").setColor(0xe67e22)],
      });
      return;
    }

    if (sub === "change") {
      const result = await requestDailyMarketChange({ userId, channelId, platform: "discord" });
      await interaction.reply(buildMarketChangeDiscordPayload({ result }));
      return;
    }

    const slot = interaction.options.getInteger("slot", true);
    const result = await buyMarketSlot({ slackUserId: userId, slot, marketDate });
    if (!result.ok) {
      const map = {
        user_not_started: "Você ainda não começou. Use `/profile`.",
        invalid_slot: "Slot inválido. Use `/market view`.",
        already_bought_slot: "Você já comprou esse slot hoje.",
      };
      if (result.reason === "insufficient_gold") {
        await interaction.reply(`Gold insuficiente. Preço: ${result.price} | Seu gold: ${result.currentGold}.`);
        return;
      }
      await interaction.reply(map[result.reason] || "Não consegui concluir a compra 😵");
      return;
    }

    await interaction.reply(`✅ Compra concluída: **${result.species.name}** (${result.species.rarity})${buildPokemonTypesLabel(result.species.element_types) ? ` | ${buildPokemonTypesLabel(result.species.element_types)}` : ""} por ${result.price} gold. ID: #${result.captured.id}.`);
    return;
  }

  if (name === "trade") {
    const sub = interaction.options.getSubcommand(true);

    if (sub === "start") {
      const target = interaction.options.getUser("usuario", true);
      const targetId = toPlatformUserId("discord", target.id);
      const creation = await createTrade({ channelId, initiatorUserId: userId, targetUserId: targetId });
      if (!creation.ok) {
        const map = {
          initiator_not_started: "Você ainda não começou. Use `/profile`.",
          target_not_started: "O usuário alvo ainda não começou.",
          existing_pending_trade: "Já existe trade pendente neste canal envolvendo um dos usuários.",
          self_trade: "Você não pode abrir trade com você mesmo.",
        };
        await interaction.reply(map[creation.reason] || "Não consegui iniciar trade 😵");
        return;
      }
      const details = await getTradeDetails(creation.trade.id);
      await interaction.reply({ embeds: [tradeEmbed(details)] });
      return;
    }

    const currentTrade = await getPendingTradeForUserInChannel(channelId, userId);
    if (!currentTrade) {
      await interaction.reply("Você não tem trade pendente neste canal. Use `/trade start`.");
      return;
    }

    if (sub === "view") {
      const details = await getTradeDetails(currentTrade.id);
      await interaction.reply({ embeds: [tradeEmbed(details)] });
      return;
    }

    if (sub === "accept") {
      const accepted = await acceptTrade({ trade: currentTrade, actorUserId: userId });
      if (!accepted.ok) {
        const map = {
          only_target_can_accept: "Somente o usuário alvo pode aceitar este trade.",
          trade_not_pending: "Este trade não está mais pendente.",
          insufficient_gold_on_accept: "Saldo insuficiente de um dos lados no momento da aceitação.",
          pokemon_ownership_changed: "Um ou mais Pokémons não pertencem mais ao dono original.",
        };
        await interaction.reply(map[accepted.reason] || "Não consegui aceitar o trade 😵");
        return;
      }
      const details = await getTradeDetails(currentTrade.id);
      await interaction.reply({ content: "🎉 Trade concluído!", embeds: [tradeEmbed(details)] });
      return;
    }

    if (sub === "decline") {
      const declined = await declineOrCancelTrade({ trade: currentTrade, actorUserId: userId });
      await interaction.reply(
        declined.ok ? (declined.status === "declined" ? "❌ Trade recusado." : "🛑 Trade cancelado.") : "Não consegui encerrar o trade 😵",
      );
      return;
    }

    if (sub === "add-pokemon") {
      const pokemonId = interaction.options.getInteger("pokemon_id", true);
      const result = await addPokemonToTrade({ trade: currentTrade, actorUserId: userId, pokemonId });
      if (!result.ok) {
        const map = {
          trade_not_pending: "Este trade não está mais pendente.",
          pokemon_not_owned: "Você só pode oferecer Pokémon que possui.",
          pokemon_in_other_pending_trade: "Esse Pokémon já está em outro trade pendente.",
          pokemon_already_added: "Esse Pokémon já está na sua oferta.",
        };
        await interaction.reply(map[result.reason] || "Não consegui adicionar Pokémon 😵");
        return;
      }
      await interaction.reply(`✅ Pokémon #${pokemonId} adicionado à oferta.`);
      return;
    }

    if (sub === "remove-pokemon") {
      const pokemonId = interaction.options.getInteger("pokemon_id", true);
      const result = await removePokemonFromTrade({ trade: currentTrade, actorUserId: userId, pokemonId });
      if (!result.ok) {
        await interaction.reply(result.reason === "pokemon_not_in_offer" ? "Esse Pokémon não está na sua oferta." : "Não consegui remover 😵");
        return;
      }
      await interaction.reply(`✅ Pokémon #${pokemonId} removido da oferta.`);
      return;
    }

    if (sub === "add-gold") {
      const amount = interaction.options.getInteger("valor", true);
      const result = await setGoldOffer({ trade: currentTrade, actorUserId: userId, amount });
      if (!result.ok) {
        const map = {
          invalid_gold_amount: "Valor inválido.",
          insufficient_gold: "Você não pode oferecer mais gold do que possui.",
          trade_not_pending: "Trade não está mais pendente.",
        };
        await interaction.reply(map[result.reason] || "Não consegui atualizar oferta de gold 😵");
        return;
      }
      await interaction.reply(`✅ Sua oferta de gold agora é ${amount}.`);
      return;
    }

    if (sub === "remove-gold") {
      const removed = await setGoldOffer({ trade: currentTrade, actorUserId: userId, amount: 0 });
      await interaction.reply(removed.ok ? "✅ Sua oferta de gold foi zerada." : "Não consegui atualizar oferta de gold 😵");
      return;
    }
  }

  await interaction.reply({ content: "Comando não implementado.", ephemeral: true });
}

module.exports = {
  handleDiscordCommand,
};
