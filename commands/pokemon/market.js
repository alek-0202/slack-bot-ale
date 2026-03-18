const { parsePositiveInt } = require("../../utils/number");
const { ensureDailyMarket, buyMarketSlot, getMarketDateKey } = require("../../services/marketService");
const { buildPokemonTypesLabel } = require("../../services/pokemonTypeService");
const { requestDailyMarketChange } = require("../../application/useCases/market/changeDailyMarket");
const { buildMarketChangeSlackMessage } = require("../../services/marketChangeViewService");

function buildMarketMessage(market, marketDate) {
  if (!market.length) {
    return "🛒 Mercado indisponível agora. Nenhum Pokémon foi configurado para hoje.";
  }

  const rows = market
    .map((item) => {
      const species = item.pokemon_species || {};
      return `*${item.slot}.* ${species.name || "Pokémon"} | ${species.rarity || "common"}${buildPokemonTypesLabel(species.element_types) ? ` | ${buildPokemonTypesLabel(species.element_types)}` : ""} | 💰 ${item.price}`;
    })
    .join("\n");

  return (
    `🛒 *Mercado Diário (${marketDate})*\n` +
    `${rows}\n\n` +
    "Para comprar: `!market buy <slot>` (ex.: `!market buy 2`)"
  );
}

module.exports = {
  name: "market",
  async execute({ event, args, say }) {
    try {
      const parts = (args || "").trim().split(/\s+/).filter(Boolean);
      const marketDate = getMarketDateKey();

      if (!parts.length) {
        const market = await ensureDailyMarket(marketDate);

        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: buildMarketMessage(market, marketDate),
            },
          },
        ];

        market.forEach((item) => {
          const species = item.pokemon_species || {};
          if (species.sprite_url) {
            blocks.push({
              type: "image",
              image_url: species.sprite_url,
              alt_text: species.name || "Pokemon",
              title: {
                type: "plain_text",
                text: `Slot ${item.slot} - ${species.name} (${species.rarity}) - ${item.price} gold`,
              },
            });
          }
        });

        await say({
          text: buildMarketMessage(market, marketDate),
          blocks,
        });
        return;
      }

      if (parts[0].toLowerCase() === "change") {
        const result = await requestDailyMarketChange({
          userId: event.user,
          channelId: event.channel,
          platform: "slack",
        });
        await say(buildMarketChangeSlackMessage({ result }));
        return;
      }

      if (parts[0].toLowerCase() !== "buy") {
        await say("Use `!market`, `!market buy <slot>` ou `!market change`.");
        return;
      }

      const slot = parsePositiveInt(parts[1]);
      if (!slot) {
        await say("Informe um slot válido. Ex.: `!market buy 1`.");
        return;
      }

      const result = await buyMarketSlot({ slackUserId: event.user, slot, marketDate });

      if (!result.ok) {
        const map = {
          user_not_started: "Você ainda não começou. Use `!poke start`.",
          invalid_slot: "Slot inválido. Use `!market` para ver os slots de hoje.",
          already_bought_slot: "Você já comprou esse slot hoje.",
          insufficient_gold: `Gold insuficiente para esse slot.`,
        };

        await say(
          result.reason === "insufficient_gold"
            ? `${map[result.reason]} Preço: *${result.price}* | Seu gold: *${result.currentGold}*.`
            : map[result.reason] || "Não consegui finalizar a compra agora 😵",
        );
        return;
      }

      await say(
        `✅ Compra concluída!\n` +
          `🧾 Slot: *${result.slot}* (${result.marketDate})\n` +
          `🎁 Pokémon: *${result.species.name}* (${result.species.rarity})${buildPokemonTypesLabel(result.species.element_types) ? `\n🧪 ${buildPokemonTypesLabel(result.species.element_types)}` : ""}\n` +
          `💸 Preço: *${result.price}* gold\n` +
          `💰 Gold restante: *${result.remainingGold}*\n` +
          `🆔 Novo Pokémon ID: *${result.captured.id}*`,
      );
    } catch (error) {
      console.error("Erro no !market:", error.message || error);
      await say("Não consegui abrir ou processar o mercado agora 😵");
    }
  },
};
