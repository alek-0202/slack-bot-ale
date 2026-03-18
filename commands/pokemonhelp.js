const { listSharedCommandsByCategory } = require("../application/shared/commandCatalog");

function linesFrom(names, commands) {
  return names.map((name) => `${commands[name].slackUsage} → ${commands[name].summary.toLowerCase()}`);
}

module.exports = {
  name: "pokemonhelp",
  async execute({ say }) {
    const sharedPokemonCommands = Object.fromEntries(
      listSharedCommandsByCategory("pokemon").map((command) => [command.name, command]),
    );

    const text = [
      "📗 *POKÉMON COMMANDS*",
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

    await say({
      text: "Comandos do sistema Pokémon",
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
