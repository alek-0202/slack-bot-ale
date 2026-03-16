require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { handleDiscordCommand } = require("./commandHandler");
const { handlePokedexNavigation } = require("./handlers/pokedexNavigation");
const { startHealthcheckServer } = require("../../utils/healthcheck");

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  throw new Error("DISCORD_BOT_TOKEN não definido.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

process.on("unhandledRejection", (error) => {
  console.error("Erro não tratado (unhandledRejection) no bot Discord:", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Exceção não capturada (uncaughtException) no bot Discord:", error);
  process.exit(1);
});

startHealthcheckServer("discord-bot");

client.once("ready", () => {
  console.log(`🤖 Discord bot online como ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    const handledButton = await handlePokedexNavigation(interaction);
    if (handledButton) return;

    if (!interaction.isChatInputCommand()) return;
    await handleDiscordCommand(interaction);
  } catch (error) {
    console.error("Erro no interactionCreate:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "Erro ao processar comando 😵", ephemeral: true });
      return;
    }
    await interaction.reply({ content: "Erro ao processar comando 😵", ephemeral: true });
  }
});

client.login(token).catch((error) => {
  console.error("Erro ao autenticar bot Discord:", error);
  process.exit(1);
});
