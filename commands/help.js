module.exports = {
  name: "help",
  async execute({ say }) {
    await say({
      text: "Lista de comandos",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "*Comandos disponíveis:*\n" +
              "`!gif termo` → manda um GIF aleatório\n" +
              "`!gif` → manda um GIF aleatório genérico\n" +
              "`!ia pergunta` → pergunta para a IA\n" +
              "`!ia help` → mostra os modos da IA\n" +
              "`!caraoucoroa @usuario cara|coroa` → desafia alguém para um cara ou coroa\n" +
              "`!aceitar` → aceita o desafio pendente\n" +
              "`!recusar` → recusa o desafio pendente\n" +
              "`!poke start` → inicia seu perfil na Pokédex\n" +
              "`!capture` → captura um Pokémon (cooldown: 10 min)\n" +
              "`!profile` → mostra seu perfil Pokémon\n" +
              "`!pokedex` → mostra quantos Pokémon diferentes você descobriu\n" +
              "`!balance` → mostra seu gold atual\n" +
              "`!ping` → testa se o bot está vivo\n" +
              "`!help` → mostra esta lista",
          },
        },
      ],
    });
  },
};
