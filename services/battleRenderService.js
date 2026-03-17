const { MAX_POTIONS_PER_BATTLE } = require("./battleEngineService");

const BATTLE_ACCEPT_ACTION_ID = "battle_accept_invite";
const BATTLE_DECLINE_ACTION_ID = "battle_decline_invite";

function renderBattleInvite({ challengerId, challengedId, channelId }) {
  return {
    text:
      `⚔️ <@${challengerId}> desafiou <@${challengedId}> para um duelo PvP!\n` +
      `Use os botões abaixo para aceitar ou recusar.` +
      `\nApós aceitar, cada jogador deve escolher seu Pokémon com \`!bpick ID\`.`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `⚔️ *Duelo PvP*\n<@${challengerId}> desafiou <@${challengedId}>.` +
            `\n<@${challengedId}>, você aceita o duelo?`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: BATTLE_ACCEPT_ACTION_ID,
            text: { type: "plain_text", text: "Aceitar" },
            style: "primary",
            value: JSON.stringify({ channelId, decision: "accept" }),
          },
          {
            type: "button",
            action_id: BATTLE_DECLINE_ACTION_ID,
            text: { type: "plain_text", text: "Recusar" },
            style: "danger",
            value: JSON.stringify({ channelId, decision: "decline" }),
          },
        ],
      },
    ],
  };
}

function renderSelectionPrompt({ challengerId, challengedId }) {
  return (
    `✅ <@${challengedId}> aceitou o desafio de <@${challengerId}>!\n` +
    "Agora escolham os Pokémon da sua coleção com `!bpick ID`.\n" +
    `Ordem de escolha: <@${challengerId}> primeiro, depois <@${challengedId}>.`
  );
}

function renderBattleState(battle) {
  const p1 = battle.players[battle.challengerId];
  const p2 = battle.players[battle.challengedId];

  return {
    text:
      "⚔️ Batalha em andamento\n" +
      `${renderPokemonLine(battle.challengerId, p1)}\n` +
      `${renderPokemonLine(battle.challengedId, p2)}\n` +
      `🎯 Turno: <@${battle.currentTurnUserId}> | Rodada: ${battle.round}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "⚔️ *Batalha Pokémon PvP*",
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: renderPokemonBlock(battle.challengerId, p1),
          },
          {
            type: "mrkdwn",
            text: renderPokemonBlock(battle.challengedId, p2),
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🎯 Turno atual: <@${battle.currentTurnUserId}> | 🔁 Rodada ${battle.round}`,
          },
        ],
      },
    ],
  };
}

function renderPokemonBlock(userId, playerState) {
  const poke = playerState.selectedPokemon;
  const hp = playerState.battleHp;

  return (
    `*<@${userId}>*\n` +
    `*${poke.name}* (Nv. ${poke.level})\n` +
    `❤️ ${hp.current}/${hp.max}\n` +
    `⚔️ ATK ${playerState.stats.attack} | 🛡️ DEF ${playerState.stats.defense}\n` +
    `🧪 Poções: ${MAX_POTIONS_PER_BATTLE - playerState.potionsUsed}/${MAX_POTIONS_PER_BATTLE}`
  );
}

function renderPokemonLine(userId, playerState) {
  const poke = playerState.selectedPokemon;
  return `• <@${userId}> — ${poke.name} Nv.${poke.level} | HP ${playerState.battleHp.current}/${playerState.battleHp.max}`;
}

function renderBattleFinished({ winnerId, loserId }) {
  return `🏁 Batalha encerrada!\n🏆 Vencedor: <@${winnerId}>\n💀 Derrotado: <@${loserId}>`;
}

module.exports = {
  BATTLE_ACCEPT_ACTION_ID,
  BATTLE_DECLINE_ACTION_ID,
  renderBattleInvite,
  renderSelectionPrompt,
  renderBattleState,
  renderBattleFinished,
};
