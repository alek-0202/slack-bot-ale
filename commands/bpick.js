const { pickPokemon } = require("../services/battleService");

module.exports = {
  name: "bpick",
  async execute(context) {
    return pickPokemon(context);
  },
};
