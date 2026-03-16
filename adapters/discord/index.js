require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { handleDiscordCommand } = require("./commandHandler");
const { handlePokedexNavigation } = require("./handlers/pokedexNavigation");

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  throw new Error("DISCORD_BOT_TOKEN não definido.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

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

client.login(token);
