const { capturePokemon } = require("../../services/captureService");

module.exports = {
  name: "capture",
  async execute({ event, say }) {
    try {
      const result = await capturePokemon(event.user);

      if (!result.ok) {
        if (result.reason === "cooldown") {
          await say(
            `⏳ <@${event.user}>, você ainda está em cooldown. Tente de novo em *${result.remainingText}*.`,
          );
          return;
        }

        if (result.reason === "no_species") {
          await say(
            "A Pokédex global está vazia. Rode o importador para popular `pokemon_species`.",
          );
          return;
        }

        await say("Não consegui capturar agora 😵");
        return;
      }

      const shinyTag = result.shiny ? "✨ SHINY!" : "";
      const text =
        `🎉 <@${event.user}> capturou *${result.species.name}* ${shinyTag}\n` +
        `⭐ Raridade: *${result.species.rarity}* | Lv ${result.captured.level}\n` +
        `🆔 ID da captura: *${result.captured.id}*\n` +
        `💰 Recompensa: +${result.goldReward} gold`;

      const message = {
        text,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text,
            },
            ...(result.species.sprite_url
              ? {
                  accessory: {
                    type: "image",
                    image_url: result.species.sprite_url,
                    alt_text: result.species.name,
                  },
                }
              : {}),
          },
        ],
      };

      await say(message);
    } catch (error) {
      console.error("Erro no !capture:", error.message || error);
      await say("Deu ruim na captura 😵‍💫");
    }
  },
};
