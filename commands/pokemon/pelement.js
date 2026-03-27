const { POKEDEX_FILTER_ELEMENT_ACTION_ID } = require("../../handlers/pokedexActions");
const { TYPE_LABELS } = require("../../services/pokemonTypeService");

module.exports = {
  name: "pelement",
  async execute({ event, say }) {
    const elements = Object.keys(TYPE_LABELS);
    const rows = [];
    for (let i = 0; i < elements.length; i += 5) {
      rows.push({
        type: "actions",
        elements: elements.slice(i, i + 5).map((element) => ({
          type: "button",
          action_id: POKEDEX_FILTER_ELEMENT_ACTION_ID,
          text: { type: "plain_text", text: TYPE_LABELS[element], emoji: true },
          value: JSON.stringify({ ownerSlackUserId: event.user, mode: "pa", element }),
        })),
      });
    }

    await say({
      text: "Filtro por elemento",
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: "Escolha um elemento para abrir o `!pa` filtrado:" } },
        ...rows,
      ],
    });
  },
};
