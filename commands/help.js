const { listSharedCommandsByCategory } = require("../application/shared/commandCatalog");

function linesFrom(names, commands) {
  return names.map((name) => {
    const command = commands[name];
    return `${command.slackUsage} → ${command.summary.toLowerCase()}`;
  });
}

module.exports = {
  name: "help",
  async execute({ say }) {
    const sharedCommands = Object.fromEntries(
      listSharedCommandsByCategory("pokemon").map((command) => [command.name, command]),
    );

    const text = [
      "📘 *HELP DO BOT*",
      "",
      "*Gerais*",
      "`!help` → mostra este resumo geral",
      "`!ping` → testa se o bot está vivo",
      "`!gif <termo>` → manda um GIF aleatório",
      "`!ia <pergunta>` → pergunta para a IA",
      "`!ia help` → mostra os modos da IA",
      "`!caraoucoroa @usuario cara|coroa` → desafia alguém",
      "`!aceitar` / `!recusar` → responde ao desafio de cara ou coroa",
      "`!daily` → resgata recompensa diária de gold",
      "`!dhelp` → explica como funciona o !daily",
      "`!coffe` → envia um card interativo de coffe break",
      "",
      "*Pokémon*",
      "`!pokemonhelp` → mostra o help detalhado do sistema Pokémon",
      ...linesFrom(["profile", "capture", "pokedex", "pa", "up", "upgrade", "evolve", "pokeid", "pokeplayer"], sharedCommands),
      "`!balance` → mostra seu gold atual",
      "`!poke start` → inicia sua jornada Pokémon",
      "`!pokeall` → abre o catálogo global de espécies",
      ...linesFrom(["pokename", "poketag", "elements", "market"], sharedCommands),
      "`!sell <pokemon_id>` → abre confirmação para vender um Pokémon da sua coleção",
      "`!resetpokeid <pokemon_id>` → reseta upgrades e devolve o gold investido",
      "`!trade ...` → inicia ou gerencia trades",
      "",
      "*Batalha*",
      "`!b @usuario` → inicia batalha PvP",
      "`!bpick <pokemon_id>` → escolhe o Pokémon da batalha",
      "`!ataque` / `!pocao` / `!magia` → ações durante a batalha",
      "`!bhelp` → mostra ajuda de batalha",
      "`!sb` → status do modo PvE/special battle",
    ].join("\n");

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
