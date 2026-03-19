const { listSharedCommandsByCategory } = require("../application/shared/commandCatalog");
const { buildBattleHelp } = require("../services/battleService");

function linesFrom(names, commands) {
  return names.map((name) => {
    const command = commands[name];
    return `${command.slackUsage} → ${command.summary.toLowerCase()}`;
  });
}

function buildGeneralHelp() {
  return [
    "📘 *HELP DO BOT*",
    "",
    "Use `!help pokemon` para sistema Pokémon e `!help battle` para batalha.",
    "",
    "*Gerais*",
    "`!help` → mostra esta página geral",
    "`!help pokemon` → mostra a categoria Pokémon",
    "`!help battle` → mostra a categoria de batalha",
    "`!ping` → testa se o bot está vivo",
    "`!gif <termo>` → manda um GIF aleatório",
    "`!ia <pergunta>` → pergunta para a IA",
    "`!ia help` → mostra os modos da IA",
    "`!caraoucoroa @usuario cara|coroa` → desafia alguém",
    "`!aceitar` / `!recusar` → responde ao desafio de cara ou coroa",
    "`!daily` → resgata recompensa diária de gold",
    "`!dhelp` → explica como funciona o !daily",
    "`!coffe` → envia um card interativo de coffe break",
  ].join("\n");
}

function buildPokemonHelp() {
  const sharedPokemonCommands = Object.fromEntries(
    listSharedCommandsByCategory("pokemon").map((command) => [command.name, command]),
  );

  return [
    "📗 *HELP — POKÉMON*",
    "",
    "💡 Compatibilidade: `!pokemonhelp` continua funcionando como atalho para esta categoria.",
    "",
    "📖 *Perfil e progresso*",
    "`!poke start` → inicia seu perfil Pokémon",
    "`!balance` → mostra seu gold atual",
    "`!daily` → resgata recompensa diária (1x por dia)",
    "`!dhelp` → explica o !daily e mostra as chances",
    ...linesFrom(["profile"], sharedPokemonCommands),
    "",
    "⚡ *Captura, coleção e consulta*",
    ...linesFrom(["capture", "pokedex", "pa"], sharedPokemonCommands),
    "`!pokeall` → abre o catálogo global de espécies",
    ...linesFrom(["pokename", "poketag", "pokeid", "pokeplayer", "elements"], sharedPokemonCommands),
    "",
    "⬆️ *Progressão*",
    ...linesFrom(["upgrade", "up", "evolve"], sharedPokemonCommands),
    "`!sell <pokemon_id>` → abre confirmação para vender um Pokémon da sua coleção",
    "`!resetpokeid <pokemon_id>` → reseta upgrades e devolve o gold investido",
    ...linesFrom(["market"], sharedPokemonCommands),
    "`!magicregister <pokeid>` → registra ou atualiza as magias do Pokémon",
    "",
    "🤝 *Trade*",
    "`!trade @usuario` → inicia um trade",
    "`!trade add pokemon <id>` → adiciona um Pokémon à oferta",
    "`!trade add gold <valor>` → adiciona/define gold na oferta",
    "`!trade remove pokemon <id>` → remove um Pokémon da oferta",
    "`!trade remove gold` → remove (zera) sua oferta de gold",
    "`!trade view` → mostra o estado atual da troca",
    "`!trade accept` → aceita a troca (somente alvo)",
    "`!trade decline` → recusa/cancela a troca",
  ].join("\n");
}

function buildBattleCategoryHelp() {
  return [
    "⚔️ *HELP — BATALHA*",
    "",
    buildBattleHelp(),
  ].join("\n");
}

function resolveHelpCategory(args) {
  const normalized = String(args || "").trim().toLowerCase();
  if (!normalized) return "general";
  if (["pokemon", "poke", "pokémon"].includes(normalized)) return "pokemon";
  if (["battle", "batalha", "pvp"].includes(normalized)) return "battle";
  return "unknown";
}

module.exports = {
  name: "help",
  async execute({ args, say }) {
    const category = resolveHelpCategory(args);

    let text;
    if (category === "pokemon") {
      text = buildPokemonHelp();
    } else if (category === "battle") {
      text = buildBattleCategoryHelp();
    } else if (category === "general") {
      text = buildGeneralHelp();
    } else {
      text = [
        "❓ Categoria de help não reconhecida.",
        "Use `!help`, `!help pokemon` ou `!help battle`.",
      ].join("\n");
    }

    await say({
      text: "Help do bot",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text,
          },
        },
      ],
    });
  },
};
