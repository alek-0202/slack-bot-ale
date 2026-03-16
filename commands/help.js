module.exports = {
  name: "help",
  async execute({ say }) {
    await say({
      text: "Help do bot",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "📘 *HELP DO BOT*\n\n" +
              "*Comandos gerais*\n" +
              "`!help` → mostra este menu\n" +
              "`!ping` → testa se o bot está vivo\n" +
              "`!gif termo` → manda um GIF aleatório\n" +
              "`!gif` → manda um GIF aleatório genérico\n" +
              "`!ia pergunta` → pergunta para a IA\n" +
              "`!ia help` → mostra os modos da IA\n" +
              "`!caraoucoroa @usuario cara|coroa` → desafia alguém\n" +
              "`!aceitar` → aceita o desafio pendente\n" +
              "`!recusar` → recusa o desafio pendente\n\n" +
              "*Sistema Pokémon*\n" +
              "`!pokemonhelp` → mostra comandos de Pokédex, coleção, upgrades, venda e mercado",
          },
        },
      ],
    });
  },
};
