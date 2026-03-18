const { extractMentionedUser } = require("../../utils/helpers");
const {
  getPendingTradeForUserInChannel,
  createTrade,
  getTradeDetails,
  addPokemonToTrade,
  removePokemonFromTrade,
  setGoldOffer,
  declineOrCancelTrade,
  acceptTrade,
  formatTradeStateMessage,
} = require("../../services/tradeService");

function parsePositiveIntegerLike(value) {
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  return normalized;
}

function usage() {
  return (
    "Uso:\n" +
    "• `!trade @usuario` inicia trade\n" +
    "• `!trade add pokemon <id>` adiciona Pokémon\n" +
    "• `!trade add gold <valor>` define gold ofertado\n" +
    "• `!trade remove pokemon <id>` remove Pokémon\n" +
    "• `!trade remove gold` zera gold ofertado\n" +
    "• `!trade view` mostra estado\n" +
    "• `!trade accept` aceita (somente alvo)\n" +
    "• `!trade decline` recusa/cancela"
  );
}

module.exports = {
  name: "trade",
  async execute({ event, args, say }) {
    try {
      const trimmedArgs = (args || "").trim();
      const parts = trimmedArgs.split(/\s+/).filter(Boolean);

      if (!trimmedArgs) {
        await say(usage());
        return;
      }

      const mentionedUserId = extractMentionedUser(trimmedArgs);
      const firstToken = (parts[0] || "").toLowerCase();

      if (mentionedUserId && !["add", "remove", "view", "accept", "decline"].includes(firstToken)) {
        const creation = await createTrade({
          channelId: event.channel,
          initiatorUserId: event.user,
          targetUserId: mentionedUserId,
        });

        if (!creation.ok) {
          if (creation.reason === "initiator_not_started") {
            await say("Você ainda não começou. Use `!poke start`.");
            return;
          }

          if (creation.reason === "target_not_started") {
            await say("O usuário alvo ainda não começou. Peça para usar `!poke start`.");
            return;
          }

          if (creation.reason === "existing_pending_trade") {
            await say("Já existe trade pendente neste canal envolvendo um dos usuários.");
            return;
          }

          if (creation.reason === "self_trade") {
            await say("Você não pode abrir trade com você mesmo.");
            return;
          }

          await say("Não consegui iniciar o trade agora 😵");
          return;
        }

        const details = await getTradeDetails(creation.trade.id);
        await say(
          `✅ Trade iniciado por <@${event.user}> com <@${mentionedUserId}>.\n` +
            "Use `!trade add ...`, `!trade view`, `!trade accept` ou `!trade decline`.\n\n" +
            formatTradeStateMessage(details),
        );
        return;
      }

      const currentTrade = await getPendingTradeForUserInChannel(event.channel, event.user);

      if (!currentTrade) {
        await say("Você não tem trade pendente neste canal. Use `!trade @usuario`.");
        return;
      }

      if (firstToken === "view") {
        const details = await getTradeDetails(currentTrade.id);
        await say(formatTradeStateMessage(details));
        return;
      }

      if (firstToken === "accept") {
        const accepted = await acceptTrade({ trade: currentTrade, actorUserId: event.user });

        if (!accepted.ok) {
          const map = {
            only_target_can_accept: "Somente o usuário alvo pode aceitar este trade.",
            trade_not_pending: "Este trade não está mais pendente.",
            insufficient_gold_on_accept:
              "Falha ao concluir: algum usuário não tem gold suficiente no momento da aceitação.",
            pokemon_ownership_changed:
              "Falha ao concluir: algum Pokémon da oferta não pertence mais ao dono original.",
          };

          await say(map[accepted.reason] || "Não consegui aceitar o trade agora 😵");
          return;
        }

        const details = await getTradeDetails(currentTrade.id);
        await say(`🎉 Trade concluído com sucesso!\n\n${formatTradeStateMessage(details)}`);
        return;
      }

      if (firstToken === "decline") {
        const declined = await declineOrCancelTrade({ trade: currentTrade, actorUserId: event.user });
        if (!declined.ok) {
          await say("Não consegui encerrar este trade 😵");
          return;
        }

        await say(
          declined.status === "declined"
            ? `❌ <@${event.user}> recusou o trade #${currentTrade.id}.`
            : `🛑 <@${event.user}> cancelou o trade #${currentTrade.id}.`,
        );
        return;
      }

      if (firstToken === "add" || firstToken === "remove") {
        const action = firstToken;
        const itemType = (parts[1] || "").toLowerCase();
        const value = parts[2];

        if (itemType === "pokemon") {
          const parsedPokemonId = parsePositiveIntegerLike(value);
          if (parsedPokemonId === null) {
            await say("Informe um ID válido. Ex.: `!trade add pokemon 123`.");
            return;
          }

          const pokemonId = Number(parsedPokemonId);
          if (!Number.isSafeInteger(pokemonId) || pokemonId <= 0) {
            await say("Informe um ID válido. Ex.: `!trade add pokemon 123`.");
            return;
          }

          if (action === "add") {
            const result = await addPokemonToTrade({
              trade: currentTrade,
              actorUserId: event.user,
              pokemonId,
            });

            if (!result.ok) {
              const map = {
                trade_not_pending: "Este trade não está mais pendente.",
                pokemon_not_owned: "Você só pode oferecer Pokémon que realmente possui.",
                pokemon_in_other_pending_trade:
                  "Esse Pokémon já está envolvido em outro trade pendente.",
                pokemon_already_added: "Esse Pokémon já está na sua oferta deste trade.",
              };
              await say(map[result.reason] || "Não consegui adicionar esse Pokémon 😵");
              return;
            }

            await say(`✅ Pokémon #${pokemonId} adicionado à sua oferta.`);
            return;
          }

          const result = await removePokemonFromTrade({
            trade: currentTrade,
            actorUserId: event.user,
            pokemonId,
          });

          if (!result.ok) {
            const map = {
              trade_not_pending: "Este trade não está mais pendente.",
              pokemon_not_in_offer: "Esse Pokémon não está na sua oferta deste trade.",
            };
            await say(map[result.reason] || "Não consegui remover esse Pokémon 😵");
            return;
          }

          await say(`✅ Pokémon #${pokemonId} removido da sua oferta.`);
          return;
        }

        if (itemType === "gold") {
          if (action === "remove") {
            const removed = await setGoldOffer({ trade: currentTrade, actorUserId: event.user, amount: 0 });
            if (!removed.ok) {
              await say("Não consegui atualizar sua oferta de gold 😵");
              return;
            }

            await say("✅ Sua oferta de gold foi zerada.");
            return;
          }

          const amount = parsePositiveIntegerLike(value);
          if (amount === null) {
            await say("Informe um valor inteiro válido. Ex.: `!trade add gold 50`.");
            return;
          }

          const updated = await setGoldOffer({ trade: currentTrade, actorUserId: event.user, amount });
          if (!updated.ok) {
            const map = {
              invalid_gold_amount: "Valor de gold inválido.",
              insufficient_gold: "Você não pode oferecer mais gold do que possui.",
              trade_not_pending: "Este trade não está mais pendente.",
            };
            await say(map[updated.reason] || "Não consegui atualizar sua oferta de gold 😵");
            return;
          }

          await say(`✅ Sua oferta de gold agora é *${amount}*.`);
          return;
        }
      }

      await say(usage());
    } catch (error) {
      console.error("Erro no !trade:", error.message || error);
      await say("Não consegui processar o trade agora 😵");
    }
  },
};
