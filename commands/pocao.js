const { usePotion } = require("../services/battleService");

module.exports = {
  name: "pocao",
  async execute(context) {
    return usePotion(context);
  },
};
