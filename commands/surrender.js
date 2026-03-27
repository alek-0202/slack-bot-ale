const { surrenderBattle } = require("../services/battleService");

module.exports = {
  name: "surrender",
  async execute(context) {
    return surrenderBattle(context);
  },
};
