require("dotenv").config();
const { App } = require("@slack/bolt");

const { extractCommand, randomItem } = require("./utils/helpers");
const { isOnCooldown, clearExpiredCooldowns } = require("./utils/cooldown");

const gifCommand = require("./commands/gif");
const iaCommand = require("./commands/ia");
const pingCommand = require("./commands/ping");
const helpCommand = require("./commands/help");
const caraOuCoroaCommand = require("./commands/caraoucoroa");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const mentionReplies = [
  "Fala comigo não, tô de férias 😴",
  "Chamou o mais brabo do canal? 😎",
  "Não enche meu saco, porra!.",
  "Estou online por obrigação, não por vontade 😂",
  "Diga seu comando, verme!.",
  "Ai que não sei o que que não sei o que lá!",
  "Me mama glub glub",
  "GO DRINKING",
];

const commandRegistry = new Map();

for (const commandModule of [
  gifCommand,
  iaCommand,
  pingCommand,
  helpCommand,
  caraOuCoroaCommand,
]) {
  commandRegistry.set(commandModule.name, commandModule);

  if (commandModule.aliases) {
    for (const alias of commandModule.aliases) {
      commandRegistry.set(alias, commandModule);
    }
  }
}

app.event("app_mention", async ({ event, say }) => {
  try {
    console.log("APP_MENTION:", event.text);
    const answer = randomItem(mentionReplies);
    await say(`<@${event.user}> ${answer}`);
  } catch (error) {
    console.error("Erro em app_mention:", error);
  }
});

app.event("message", async ({ event, say }) => {
  try {
    console.log("MESSAGE_EVENT:", {
      text: event.text,
      user: event.user,
      channel: event.channel,
      subtype: event.subtype,
      channel_type: event.channel_type,
    });

    if (event.subtype || !event.text || !event.user) return;

    const parsed = extractCommand(event.text);
    if (!parsed) return;

    const { command, args } = parsed;
    const commandHandler = commandRegistry.get(command);

    if (!commandHandler) {
      await say(`Não conheço o comando \`${command}\` 🤔`);
      return;
    }

    const cooldownMs = commandHandler.cooldownMs;

    if (
      isOnCooldown({
        user: event.user,
        channel: event.channel,
        command,
        durationMs: cooldownMs,
      })
    ) {
      return;
    }

    clearExpiredCooldowns();

    await commandHandler.execute({
      app,
      event,
      command,
      args,
      say,
    });
  } catch (error) {
    console.error("Erro em message event:", error);
  }
});

(async () => {
  try {
    await app.start();
    console.log("⚡ Bot está rodando!");
  } catch (error) {
    console.error("Erro ao iniciar o bot:", error);
  }
})();
