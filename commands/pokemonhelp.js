const helpCommand = require("./help");

module.exports = {
  name: "pokemonhelp",
  async execute({ say }) {
    return helpCommand.execute({ args: "pokemon", say });
  },
};
