module.exports = {
  name: "dhelp",
  async execute({ say }) {
    await say({
      text: "Ajuda do comando !daily",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "🪙 *COMANDO !DAILY*\n\n" +
              "`!daily` pode ser usado *1 vez por dia* (virou o dia, pode usar de novo).\n" +
              "Exemplo: usou 23:59, às 00:00 já pode usar novamente.\n\n" +
              "*Chances de recompensa:*\n" +
              "• *5000 a 10000 gold* → 0,001%\n" +
              "• *2000 a 5000 gold* → 0,05%\n" +
              "• *1000 a 2000 gold* → 0,3%\n" +
              "• *700 a 1000 gold* → 5%\n" +
              "• *500 a 700 gold* → 18%\n" +
              "• *150 a 500 gold* → restante\n\n" +
              "*Recompensas fixas adicionais:*\n" +
              "• *Pokebola (!c):* +1 a +3\n" +
              "• *Livro Ancião:* +5\n" +
              "• *Essência Pokémon:* +1000",
          },
        },
      ],
    });
  },
};
