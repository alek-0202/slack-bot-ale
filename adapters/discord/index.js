require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { handleDiscordCommand } = require("./commandHandler");
const { handlePokedexNavigation } = require("./handlers/pokedexNavigation");
const { toPlatformUserId, toPlatformChannelId } = require("../../core/platformIdentity");
const { startHealthcheckServer } = require("../../utils/healthcheck");
const { createLogger } = require("../../utils/logger");
const { sendCriticalAlert } = require("../../utils/criticalAlert");
const { MARKET_CHANGE_DISCORD_BUTTON_ID, buildMarketChangeDiscordPayload } = require("../../services/marketChangeViewService");
const { confirmDailyMarketChange } = require("../../application/useCases/market/changeDailyMarket");

const logger = createLogger("discord-bot");

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  throw new Error("DISCORD_BOT_TOKEN não definido.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

process.on("unhandledRejection", async (error) => {
  logger.error("Erro não tratado (unhandledRejection) no bot Discord", { error });
  await sendCriticalAlert({
    source: "discord-bot",
    message: "Unhandled rejection no processo do Discord bot",
    error,
  });
  process.exit(1);
});

process.on("uncaughtException", async (error) => {
  logger.error("Exceção não capturada (uncaughtException) no bot Discord", { error });
  await sendCriticalAlert({
    source: "discord-bot",
    message: "Uncaught exception no processo do Discord bot",
    error,
  });
  process.exit(1);
});

startHealthcheckServer("discord-bot");

client.once("ready", () => {
  logger.info("Discord bot online", { botTag: client.user.tag });
});

client.on("interactionCreate", async (interaction) => {
  try {
    const handledButton = await handlePokedexNavigation(interaction);
    if (handledButton) return;

    if (interaction.isButton() && interaction.customId.startsWith(`${MARKET_CHANGE_DISCORD_BUTTON_ID}|`)) {
      const [, channelIdFromButton] = interaction.customId.split("|");
      const result = await confirmDailyMarketChange({
        userId: toPlatformUserId("discord", interaction.user.id),
        channelId: channelIdFromButton || toPlatformChannelId("discord", interaction.channelId || "dm"),
      });

      if (result.status === "already_confirmed") {
        await interaction.reply({ content: "Você já confirmou essa troca manual de market.", ephemeral: true });
        return;
      }

      if (result.status === "no_active_request") {
        await interaction.reply({ content: "Não existe pedido ativo de troca manual neste canal.", ephemeral: true });
        return;
      }

      if (result.status === "already_used_today") {
        await interaction.reply({ content: "A troca manual diária do market já foi utilizada hoje.", ephemeral: true });
        return;
      }

      await interaction.update(buildMarketChangeDiscordPayload({ result }));
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    await handleDiscordCommand(interaction);
  } catch (error) {
    logger.error("Erro no interactionCreate", { error });
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "Erro ao processar comando 😵", ephemeral: true });
      return;
    }
    await interaction.reply({ content: "Erro ao processar comando 😵", ephemeral: true });
  }
});

client.login(token).catch(async (error) => {
  logger.error("Erro ao autenticar bot Discord", { error });
  await sendCriticalAlert({
    source: "discord-bot",
    message: "Falha crítica no login do Discord bot",
    error,
  });
  process.exit(1);
});
