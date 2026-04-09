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
const dailyCommand = require("./commands/daily");
const dhelpCommand = require("./commands/dhelp");
const attCommand = require("./commands/att");
const coffeCommand = require("./commands/coffe");
const pokeCommand = require("./commands/pokemon/poke");
const captureCommand = require("./commands/pokemon/capture");
const captureItemCommand = require("./commands/pokemon/c");
const profileCommand = require("./commands/pokemon/profile");
const dungeonCommand = require("./commands/pokemon/dungeon");
const mochilaCommand = require("./commands/pokemon/mochila");
const pokedexCommand = require("./commands/pokemon/pokedex");
const pokeallCommand = require("./commands/pokemon/pokeall");
const pokenameCommand = require("./commands/pokemon/pokename");
const poketagCommand = require("./commands/pokemon/poketag");
const elementsCommand = require("./commands/pokemon/elements");
const balanceCommand = require("./commands/pokemon/balance");
const paCommand = require("./commands/pokemon/pa");
const prarityCommand = require("./commands/pokemon/prarity");
const pelementCommand = require("./commands/pokemon/pelement");
const battleonCommand = require("./commands/pokemon/battleon");
const battleoffCommand = require("./commands/pokemon/battleoff");
const favpokeCommand = require("./commands/pokemon/favpoke");
const upgradeCommand = require("./commands/pokemon/upgrade");
const marketCommand = require("./commands/pokemon/market");
const miCommand = require("./commands/pokemon/mi");
const mgCommand = require("./commands/pokemon/mg");
const mCommand = require("./commands/pokemon/m");
const mgmlCommand = require("./commands/pokemon/mgml");
const reCommand = require("./commands/pokemon/re");
const fusaoCommand = require("./commands/pokemon/fusao");
const tradeCommand = require("./commands/pokemon/trade");
const rerollCommand = require("./commands/pokemon/reroll");
const transformCommand = require("./commands/pokemon/transform");
const transformPrimeCommand = require("./commands/pokemon/transformprime");
const sellCommand = require("./commands/pokemon/sell");
const sellAllCommand = require("./commands/pokemon/sellall");
const evolveCommand = require("./commands/pokemon/evolve");
const upCommand = require("./commands/pokemon/up");
const pokeidCommand = require("./commands/pokemon/pokeid");
const tshinyCommand = require("./commands/pokemon/tshiny");
const applyitemCommand = require("./commands/pokemon/applyitem");
const pokeplayerCommand = require("./commands/pokemon/pokeplayer");
const resetpokeidCommand = require("./commands/pokemon/resetpokeid");
const healstationCommand = require("./commands/pokemon/healstation");
const healpokeCommand = require("./commands/pokemon/healpoke");
const upstationCommand = require("./commands/pokemon/upstation");
const sbCommand = require("./commands/sb");
const bCommand = require("./commands/b");
const bpickCommand = require("./commands/bpick");
const ataqueCommand = require("./commands/ataque");
const pocaoCommand = require("./commands/pocao");
const magiaCommand = require("./commands/magia");
const mrskillCommand = require("./commands/mrskill");
const surrenderCommand = require("./commands/surrender");
const magicregisterCommand = require("./commands/magicregister");
const bhelpCommand = require("./commands/bhelp");
const skillhelpCommand = require("./commands/skillhelp");
const closeBattlesCommand = require("./commands/closebattles");
const giveGoldCommand = require("./commands/givegold");
const giveEnergyCommand = require("./commands/giveenergy");
const giveCCommand = require("./commands/givec");
const giveBookCommand = require("./commands/givebook");
const giveBagCommand = require("./commands/givebag");
const giveFragmentCommand = require("./commands/givefragment");
const openBagCommand = require("./commands/openbag");
const codexCommand = require("./commands/codex");
const useTomoCommand = require("./commands/usetomo");
const applycodexCommand = require("./commands/pokemon/applycodex");
const { registerPokedexActions } = require("./handlers/pokedexActions");
const { registerCoffeActions } = require("./handlers/coffeActions");
const { registerBattleActions } = require("./handlers/battleActions");
const { registerMarketActions } = require("./handlers/marketActions");
const { registerPokemonActions } = require("./handlers/pokemonActions");
const { registerHealingStationActions } = require("./handlers/healingStationActions");
const { registerDungeonActions } = require("./handlers/dungeonActions");
const { registerAdminBattleActions } = require("./handlers/adminBattleActions");


const logger = createLogger("slack-bot");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

registerPokedexActions(app);
registerCoffeActions(app);
registerBattleActions(app);
registerMarketActions(app);
registerPokemonActions(app);
registerHealingStationActions(app);
registerDungeonActions(app);
registerAdminBattleActions(app);

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
  dailyCommand,
  dhelpCommand,
  attCommand,
  coffeCommand,
  pokeCommand,
  captureCommand,
  captureItemCommand,
  profileCommand,
  dungeonCommand,
  mochilaCommand,
  pokedexCommand,
  pokeallCommand,
  pokenameCommand,
  poketagCommand,
  elementsCommand,
  balanceCommand,
  paCommand,
  prarityCommand,
  pelementCommand,
  battleonCommand,
  battleoffCommand,
  favpokeCommand,
  upgradeCommand,
  marketCommand,
  miCommand,
  mgCommand,
  mCommand,
  mgmlCommand,
  reCommand,
  fusaoCommand,
  tradeCommand,
  rerollCommand,
  transformCommand,
  transformPrimeCommand,
  sellCommand,
  sellAllCommand,
  evolveCommand,
  upCommand,
  pokeidCommand,
  tshinyCommand,
  applyitemCommand,
  pokeplayerCommand,
  resetpokeidCommand,
  healstationCommand,
  healpokeCommand,
  upstationCommand,
  sbCommand,
  bCommand,
  bpickCommand,
  ataqueCommand,
  pocaoCommand,
  magiaCommand,
  mrskillCommand,
  surrenderCommand,
  magicregisterCommand,
  bhelpCommand,
  skillhelpCommand,
  closeBattlesCommand,
  giveGoldCommand,
  giveEnergyCommand,
  giveCCommand,
  giveBookCommand,
  giveBagCommand,
  giveFragmentCommand,
  openBagCommand,
  codexCommand,
  useTomoCommand,
  applycodexCommand,
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
