const { listSharedCommandsByCategory } = require("../application/shared/commandCatalog");

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
      `${sharedPokemonCommands.profile.slackUsage} → ${sharedPokemonCommands.profile.summary.toLowerCase()}`,
      "`!balance` → mostra seu gold atual",
      "`!daily` → resgata recompensa diária (1x por dia)",
      "`!dhelp` → explica o !daily e mostra as chances",
      "",
      "⚡ *Captura e Pokédex*",
      `${sharedPokemonCommands.capture.slackUsage} → ${sharedPokemonCommands.capture.summary.toLowerCase()}`,
      `${sharedPokemonCommands.pokedex.slackUsage} → ${sharedPokemonCommands.pokedex.summary.toLowerCase()}`,
      `${sharedPokemonCommands.pa.slackUsage} → ${sharedPokemonCommands.pa.summary.toLowerCase()}`,
      "`!pokeall` → abre o catálogo global de espécies",
      `${sharedPokemonCommands.pokename.slackUsage} → ${sharedPokemonCommands.pokename.summary.toLowerCase()}`,
      `${sharedPokemonCommands.poketag.slackUsage} → ${sharedPokemonCommands.poketag.summary.toLowerCase()}`,
      `${sharedPokemonCommands.elements.slackUsage} → ${sharedPokemonCommands.elements.summary.toLowerCase()}`,
      `${sharedPokemonCommands.upgrade.slackUsage} → ${sharedPokemonCommands.upgrade.summary.toLowerCase()}`,
      "`!evolve <pokemon_id>` → evolui um Pokémon da sua coleção (quando possível)",
      "`!sell <pokemon_id>` → vende um Pokémon da sua coleção",
      `${sharedPokemonCommands.market.slackUsage} → ${sharedPokemonCommands.market.summary.toLowerCase()}`,
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
