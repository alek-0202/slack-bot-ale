const { magicPlaceholder } = require("../services/battleService");

module.exports = {
  name: "magia",
  async execute(context) {
    return magicPlaceholder(context);
  },
};
