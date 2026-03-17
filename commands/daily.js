const { claimDaily } = require("../services/dailyService");

module.exports = {
  name: "daily",
  async execute({ event, say }) {
    try {
      const result = await claimDaily(event.user);

      if (!result.ok && result.reason === "already_claimed_today") {
        await say(
          `⏳ <@${event.user}>, você já resgatou seu *!daily* hoje. Volte depois da virada do dia.`,
        );
        return;
      }

      if (!result.ok) {
        await say("Não consegui processar seu *!daily* agora 😵");
        return;
      }

      await say(
        `🎁 <@${event.user}>, seu *!daily* caiu e você ganhou *${result.goldReward}* gold!`,
      );
    } catch (error) {
      console.error("Erro no !daily:", error.message || error);
      await say("Deu ruim no seu *!daily* 😵‍💫");
    }
  },
};
