const { POKEDEX_FILTER_RARITY_ACTION_ID } = require("../../handlers/pokedexActions");

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythical"];

module.exports = {
  name: "prarity",
  async execute({ event, say }) {
    await say({
      text: "Filtro por raridade",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: "Escolha uma raridade para abrir o `!pa` filtrado:" } },
        {
          type: "actions",
          elements: RARITIES.map((rarity) => ({
            type: "button",
            action_id: POKEDEX_FILTER_RARITY_ACTION_ID,
            text: { type: "plain_text", text: rarity.slice(0, 1).toUpperCase() + rarity.slice(1), emoji: true },
            value: JSON.stringify({ ownerSlackUserId: event.user, mode: "pa", rarity }),
          })),
        },
      ],
    });
  },
};
