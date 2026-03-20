const { parsePositiveInt } = require("../../utils/number");
const { createLogger } = require("../../utils/logger");
const {
  buildUpgradeBatchPreview,
  buildUpgradeBatchPreviewMessage,
} = require("../../services/slackPokemonActionService");

const logger = createLogger("command:up");

module.exports = {
  name: "up",
  async execute({ event, args, say }) {
    try {
      const parts = String(args || "").trim().split(/\s+/).filter(Boolean);
      if (parts.length !== 2) {
        await say("Use `!up <pokemon_id> <nivel_alvo>`. Ex.: `!up 25 10`.");
        return;
      }

      const pokemonId = parsePositiveInt(parts[0]);
      const targetLevel = parsePositiveInt(parts[1]);
      if (!pokemonId || !targetLevel) {
        await say("Use `!up <pokemon_id> <nivel_alvo>` com valores válidos. Ex.: `!up 25 10`.");
        return;
      }

      const preview = await buildUpgradeBatchPreview({ slackUserId: event.user, pokemonId, targetLevel });

      logger.info("Resultado do preview de !up", {
        slackUserId: event.user,
        pokemonId,
        targetLevel,
        ok: preview.ok,
        reason: preview.reason || null,
        totalCost: preview.totalCost || null,
      });

      if (!preview.ok) {
        const map = {
          user_not_started: "Você ainda não começou. Use `!poke start`.",
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          pokemon_in_healing_station: "Esse Pokémon está na estação de cura e não pode receber upgrade agora.",
          invalid_target_level: "O nível alvo informado é inválido.",
          target_must_be_higher: `O nível alvo precisa ser maior que o nível atual (*${preview.currentLevel}*).`,
          target_above_max_level: `O nível alvo ultrapassa o máximo permitido (*${preview.maxLevel}*).`,
        };
        await say(map[preview.reason] || "Não consegui preparar esse upgrade agora 😵");
        return;
      }

      if (!preview.canAfford) {
        await say(
          `💸 Você precisa de *${preview.totalCost}* gold para subir *${preview.pokemon.pokemon_species?.name || "esse Pokémon"}* até o nível *${preview.targetLevel}*, mas possui *${preview.currentGold}* gold.`,
        );
        return;
      }

      await say(buildUpgradeBatchPreviewMessage({ slackUserId: event.user, preview }));
    } catch (error) {
      logger.error("Erro no !up", { slackUserId: event.user, args, error });
      await say("Não consegui preparar esse upgrade em lote agora 😵");
    }
  },
};
