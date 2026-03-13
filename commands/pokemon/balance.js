const { getUser } = require("../../services/userService");

module.exports = {
  name: "balance",
  async execute({ event, say }) {
    try {
      const user = await getUser(event.user);
      if (!user) {
        await say("Você ainda não começou. Use `!poke start`.");
        return;
      }

      await say(`💰 <@${event.user}>, seu saldo atual é *${user.gold}* gold.`);
    } catch (error) {
      console.error("Erro no !balance:", error.message || error);
      await say("Não consegui ler seu saldo 😵");
    }
  },
};
