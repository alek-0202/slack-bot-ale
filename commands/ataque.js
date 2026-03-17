const { attack } = require("../services/battleService");

module.exports = {
  name: "ataque",
  async execute(context) {
    return attack(context);
  },
};
