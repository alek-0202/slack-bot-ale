const { defendPlaceholder } = require("../services/battleService");

module.exports = {
  name: "defesa",
  async execute(context) {
    return defendPlaceholder(context);
  },
};
