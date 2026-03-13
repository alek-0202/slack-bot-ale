const {
  extractMentionedUser,
  extractCoinflipChoice,
  randomCoinflip,
} = require("../utils/helpers");

const coinflipChallenges = new Map();

function getChallengeKey(channel) {
  return `coinflip:${channel}`;
}

function getPendingChallenge(channel) {
  return coinflipChallenges.get(getChallengeKey(channel)) || null;
}

function setPendingChallenge(channel, challenge) {
  coinflipChallenges.set(getChallengeKey(channel), challenge);
}

function clearPendingChallenge(channel) {
  coinflipChallenges.delete(getChallengeKey(channel));
}

async function handleCaraOuCoroa({ event, args, say }) {
  const challengedUserId = extractMentionedUser(args || "");
  const challengerChoice = extractCoinflipChoice(args || "");

  if (!challengedUserId || !challengerChoice) {
    await say(
      "Use assim: `!caraoucoroa @usuario cara` ou `!caraoucoroa @usuario coroa`",
    );
    return;
  }

  if (challengedUserId === event.user) {
    await say("Tu não pode desafiar a si mesmo, maluco 😂");
    return;
  }

  const existingChallenge = getPendingChallenge(event.channel);
  if (existingChallenge) {
    await say("Já existe um desafio pendente neste canal. Resolve ele antes 😵");
    return;
  }

  const challengedChoice = challengerChoice === "cara" ? "coroa" : "cara";

  setPendingChallenge(event.channel, {
    challengerId: event.user,
    challengedId: challengedUserId,
    challengerChoice,
    challengedChoice,
    createdAt: Date.now(),
  });

  await say(
    `🪙 <@${event.user}> desafiou <@${challengedUserId}> para um *Cara ou Coroa*!\n` +
      `🎯 <@${event.user}> escolheu *${challengerChoice.toUpperCase()}*\n` +
      `🎯 <@${challengedUserId}> ficou com *${challengedChoice.toUpperCase()}*\n\n` +
      "Se quiser aceitar, use `!aceitar`\n" +
      "Se quiser recusar, use `!recusar`",
  );
}

async function handleAceitar({ event, say }) {
  const challenge = getPendingChallenge(event.channel);

  if (!challenge) {
    await say("Não tem nenhum desafio pendente neste canal 🤔");
    return;
  }

  if (event.user !== challenge.challengedId) {
    await say(`Só <@${challenge.challengedId}> pode aceitar esse desafio 😎`);
    return;
  }

  const result = randomCoinflip();

  const winner =
    result === challenge.challengerChoice
      ? challenge.challengerId
      : challenge.challengedId;

  clearPendingChallenge(event.channel);

  await say(
    "🪙 *Cara ou Coroa iniciado!*\n" +
      `Resultado da moeda: *${result.toUpperCase()}*\n\n` +
      `⚔️ <@${challenge.challengerId}> escolheu *${challenge.challengerChoice.toUpperCase()}*\n` +
      `🛡️ <@${challenge.challengedId}> ficou com *${challenge.challengedChoice.toUpperCase()}*\n\n` +
      `🏆 Vencedor: <@${winner}>`,
  );
}

async function handleRecusar({ event, say }) {
  const challenge = getPendingChallenge(event.channel);

  if (!challenge) {
    await say("Não tem nenhum desafio pendente neste canal 🤔");
    return;
  }

  if (event.user !== challenge.challengedId) {
    await say(`Só <@${challenge.challengedId}> pode recusar esse desafio 😎`);
    return;
  }

  clearPendingChallenge(event.channel);
  await say(
    `❌ <@${challenge.challengedId}> recusou o desafio de <@${challenge.challengerId}>`,
  );
}

module.exports = {
  name: "caraoucoroa",
  aliases: ["aceitar", "recusar"],
  async execute(context) {
    const { command } = context;

    if (command === "aceitar") return handleAceitar(context);
    if (command === "recusar") return handleRecusar(context);

    return handleCaraOuCoroa(context);
  },
};
