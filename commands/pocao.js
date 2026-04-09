const { usePotion, showPotionOptions } = require("../services/battleService");

module.exports = {
  name: "pocao",
  async execute({ args, ...context }) {
    const potionType = String(args || "").trim();
    if (!potionType) return showPotionOptions(context);
    return usePotion({ ...context, potionType });
  },
};
