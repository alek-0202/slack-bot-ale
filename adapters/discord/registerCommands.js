require("dotenv").config();
const { REST, Routes } = require("discord.js");
const { discordCommandDefinitions } = require("./commands/definitions");

async function register() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    throw new Error("Defina DISCORD_BOT_TOKEN e DISCORD_CLIENT_ID para registrar comandos.");
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const body = discordCommandDefinitions.map((cmd) => cmd.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`✅ Slash commands registrados no guild ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log("✅ Slash commands globais registrados.");
}

register().catch((error) => {
  console.error("Erro ao registrar slash commands:", error);
  process.exit(1);
});
