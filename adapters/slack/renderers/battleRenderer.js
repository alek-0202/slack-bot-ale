const { buildBattleViewModel } = require("../../../application/battle/renderers/battlePresenter");
const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");

const BATTLE_ACCEPT_ACTION_ID = "battle_accept_invite";
const BATTLE_DECLINE_ACTION_ID = "battle_decline_invite";

function renderBattleInvite({ challengerId, challengedId, channelId }) {
  return {
    text:
      `⚔️ <@${challengerId}> desafiou <@${challengedId}> para um duelo PvP!\n` +
      "Use os botões abaixo para aceitar ou recusar." +
      "\nApós aceitar, cada jogador deve escolher seu Pokémon com `!bpick ID`.",
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
  const view = buildBattleViewModel(battle);
  const [challenger, challenged] = view.players;

  return {
    text:
      "⚔️ Batalha em andamento\n" +
      `${renderPokemonLine(challenger)}\n` +
      `${renderPokemonLine(challenged)}\n` +
      `🎯 Turno: <@${view.currentTurnUserId}> | Rodada: ${view.round}`,
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
            text: renderPokemonBlock(challenger),
          },
          {
            type: "mrkdwn",
            text: renderPokemonBlock(challenged),
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🎯 Turno atual: <@${view.currentTurnUserId}> | 🔁 Rodada ${view.round}`,
          },
        ],
      },
    ],
  };
}

function renderPokemonBlock(player) {
  return (
    `*<@${player.userId}>*\n` +
    `*${player.selectedPokemonName}* (Nv. ${player.level})\n` +
    `${buildPokemonTypesLabel(player.selectedPokemonTypes) ? `🧪 ${buildPokemonTypesLabel(player.selectedPokemonTypes)}\n` : ""}` +
    `❤️ ${player.hpCurrent}/${player.hpMax}\n` +
    `⚔️ ATK ${player.attack} | 🛡️ DEF ${player.defense}\n` +
    `🧪 Poções: ${player.potionsRemaining}`
  );
}

function renderPokemonLine(player) {
  const typesLabel = buildPokemonTypesLabel(player.selectedPokemonTypes);
  return `• <@${player.userId}> — ${player.selectedPokemonName} Nv.${player.level}${typesLabel ? ` | ${typesLabel}` : ""} | HP ${player.hpCurrent}/${player.hpMax}`;
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
