const { showMagicOptions } = require("../services/battleService");

module.exports = {
  name: "magia",
  async execute(context) {
    return showMagicOptions(context);
  },
};
