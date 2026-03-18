const { getSharedCommand } = require("../application/shared/commandCatalog");

module.exports = {
  name: "help",
  async execute({ say }) {
    const helpCommand = getSharedCommand("help");
    const pokemonHelpCommand = getSharedCommand("pokemonhelp");

    const text = [
      "📘 *HELP DO BOT*",
      "",
      "*Comandos gerais*",
      `${helpCommand.slackUsage} → ${helpCommand.summary.toLowerCase()}`,
      "`!ping` → testa se o bot está vivo",
      "`!gif termo` → manda um GIF aleatório",
      "`!gif` → manda um GIF aleatório genérico",
      "`!ia pergunta` → pergunta para a IA",
      "`!ia help` → mostra os modos da IA",
      "`!caraoucoroa @usuario cara|coroa` → desafia alguém",
      "`!aceitar` → aceita o desafio pendente",
      "`!recusar` → recusa o desafio pendente",
      "`!daily` → resgata recompensa diária de gold",
      "`!dhelp` → explica como funciona o !daily",
      "`!coffe` → envia um card de convite para o coffe break",
      "",
      "*Sistema Pokémon*",
      `${pokemonHelpCommand.slackUsage} → ${pokemonHelpCommand.summary.toLowerCase()}`,
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
