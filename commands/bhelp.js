const { buildBattleHelp } = require("../services/battleService");

module.exports = {
  name: "bhelp",
  async execute({ say }) {
    await say(buildBattleHelp());
  },
};
