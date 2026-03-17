require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { handleDiscordCommand } = require("./commandHandler");
const { handlePokedexNavigation } = require("./handlers/pokedexNavigation");
const { startHealthcheckServer } = require("../../utils/healthcheck");
const { createLogger } = require("../../utils/logger");
const { sendCriticalAlert } = require("../../utils/criticalAlert");

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
