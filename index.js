require("dotenv").config();
const { App } = require("@slack/bolt");

const { extractCommand, randomItem } = require("./utils/helpers");
const { isOnCooldown, clearExpiredCooldowns } = require("./utils/cooldown");
const { startHealthcheckServer } = require("./utils/healthcheck");
const { createLogger } = require("./utils/logger");
const { sendCriticalAlert } = require("./utils/criticalAlert");

const gifCommand = require("./commands/gif");
const iaCommand = require("./commands/ia");
const pingCommand = require("./commands/ping");
const helpCommand = require("./commands/help");
const pokemonHelpCommand = require("./commands/pokemonhelp");
const caraOuCoroaCommand = require("./commands/caraoucoroa");
const pokeCommand = require("./commands/pokemon/poke");
const captureCommand = require("./commands/pokemon/capture");
const profileCommand = require("./commands/pokemon/profile");
const pokedexCommand = require("./commands/pokemon/pokedex");
const balanceCommand = require("./commands/pokemon/balance");
const paCommand = require("./commands/pokemon/pa");
const upgradeCommand = require("./commands/pokemon/upgrade");
const marketCommand = require("./commands/pokemon/market");
const tradeCommand = require("./commands/pokemon/trade");
const sellCommand = require("./commands/pokemon/sell");
const { registerPokedexActions } = require("./handlers/pokedexActions");


const logger = createLogger("slack-bot");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

registerPokedexActions(app);

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
  pokemonHelpCommand,
  caraOuCoroaCommand,
  pokeCommand,
  captureCommand,
  profileCommand,
  pokedexCommand,
  balanceCommand,
  paCommand,
  upgradeCommand,
  marketCommand,
  tradeCommand,
  sellCommand,
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
    logger.debug("Evento app_mention recebido", { text: event.text, user: event.user });
    const answer = randomItem(mentionReplies);
    await say(`<@${event.user}> ${answer}`);
  } catch (error) {
    logger.error("Erro em app_mention", { error });
  }
});

app.event("message", async ({ event, say }) => {
  try {
    logger.debug("Evento message recebido", {
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
    logger.error("Erro em message event", { error });
  }
});

process.on("unhandledRejection", async (error) => {
  logger.error("Erro não tratado (unhandledRejection) no bot Slack", { error });
  await sendCriticalAlert({
    source: "slack-bot",
    message: "Unhandled rejection no processo do Slack bot",
    error,
  });
  process.exit(1);
});

process.on("uncaughtException", async (error) => {
  logger.error("Exceção não capturada (uncaughtException) no bot Slack", { error });
  await sendCriticalAlert({
    source: "slack-bot",
    message: "Uncaught exception no processo do Slack bot",
    error,
  });
  process.exit(1);
});

startHealthcheckServer("slack-bot");

(async () => {
  try {
    await app.start();
    logger.info("Slack bot online");
  } catch (error) {
    logger.error("Erro ao iniciar o bot Slack", { error });
    await sendCriticalAlert({
      source: "slack-bot",
      message: "Falha crítica no startup do Slack bot",
      error,
    });
    process.exit(1);
  }
})();
