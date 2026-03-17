const { startChallenge } = require("../services/battleService");

module.exports = {
  name: "b",
  async execute(context) {
    return startChallenge(context);
  },
};
