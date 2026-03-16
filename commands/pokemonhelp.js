module.exports = {
  name: "pokemonhelp",
  async execute({ say }) {
    await say({
      text: "Comandos do sistema Pokémon",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "📗 *POKÉMON COMMANDS*\n\n" +
              "📖 *Perfil e progresso*\n" +
              "`!poke start` → inicia seu perfil Pokémon\n" +
              "`!profile` → mostra seu perfil Pokémon\n" +
              "`!balance` → mostra seu gold atual\n\n" +
              "⚡ *Captura e Pokédex*\n" +
              "`!capture` → captura um Pokémon (cooldown: 10 min)\n" +
              "`!pokedex` → abre sua Pokédex\n" +
              "`!pokedex` com botões → navega pelos Pokémons capturados\n\n" +
              "🤝 *Trade*\n" +
              "`!trade @usuario` → inicia um trade\n" +
              "`!trade add pokemon <id>` → adiciona um Pokémon à oferta\n" +
              "`!trade add gold <valor>` → adiciona/define gold na oferta\n" +
              "`!trade remove pokemon <id>` → remove um Pokémon da oferta\n" +
              "`!trade remove gold` → remove (zera) sua oferta de gold\n" +
              "`!trade view` → mostra o estado atual da troca\n" +
              "`!trade accept` → aceita a troca (somente alvo)\n" +
              "`!trade decline` → recusa/cancela a troca",
          },
        },
      ],
    });
  },
};
