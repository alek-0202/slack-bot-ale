const { showMagicOptions } = require("../services/battleService");

module.exports = {
  name: "mrskill",
  aliases: ["mskill"],
  async execute(context) {
    return showMagicOptions(context);
  },
};
