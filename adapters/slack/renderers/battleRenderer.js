const { buildBattleViewModel } = require("../../../application/battle/renderers/battlePresenter");
const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");

const BATTLE_ACCEPT_ACTION_ID = "battle_accept_invite";
const BATTLE_DECLINE_ACTION_ID = "battle_decline_invite";
const BATTLE_TURN_ACTION_ID = "battle_turn_action";
const BATTLE_MAGIC_ACTION_ID = "battle_magic_action";
const MAGIC_REGISTER_REMOVE_ACTION_ID = "magic_register_remove_element";

function renderBattleInvite({ challengerId, challengedId, channelId }) {
  return {
    text:
      `⚔️ <@${challengerId}> desafiou <@${challengedId}> para um duelo PvP!\n` +
      "Use os botões abaixo para aceitar ou recusar.\n" +
      "Após aceitar, cada jogador deve escolher seu Pokémon com `!bpick ID`.",
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
      buildBattleActionBlock(battle),
    ].filter(Boolean),
  };
}

function buildBattleActionBlock(battle) {
  if (battle.status !== "active") return null;

  return {
    type: "actions",
    elements: [
      buildTurnButton({ battle, label: "⚔️ Ataque", action: "attack", style: "primary" }),
      buildTurnButton({ battle, label: "🛡️ Defesa", action: "defense" }),
      buildTurnButton({ battle, label: "✨ Magia", action: "magic" }),
      buildTurnButton({ battle, label: "🧪 Poção", action: "potion" }),
    ],
  };
}

function buildTurnButton({ battle, label, action, style }) {
  const button = {
    type: "button",
    action_id: BATTLE_TURN_ACTION_ID,
    text: { type: "plain_text", text: label },
    value: JSON.stringify({ channelId: battle.channelId, action }),
  };

  if (style) button.style = style;
  return button;
}

function renderMagicOptions({ battle, actorUserId, magicSlots = [] }) {
  if (!magicSlots.length) {
    return {
      text: "Seu Pokémon não possui magias registradas.",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "✨ Este Pokémon não possui magias registradas. Use `!magicregister <pokeid>` fora da batalha.",
          },
        },
      ],
    };
  }

  return {
    text: "Escolha uma magia",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✨ *Escolha a magia de <@${actorUserId}>*`,
        },
      },
      {
        type: "actions",
        elements: magicSlots.map((magic) => ({
          type: "button",
          action_id: BATTLE_MAGIC_ACTION_ID,
          text: { type: "plain_text", text: `${magic.slot}: ${magic.name} ${magic.icon}`.slice(0, 75) },
          value: JSON.stringify({ channelId: battle.channelId, magicSlot: magic.slot }),
        })),
      },
    ],
  };
}

function renderMagicRegisterElementPrompt({ pokemon, elements, maxSlots }) {
  return {
    text: "Escolha quais elementos manter",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `✨ *${pokemon.pokemon_species?.name || `Pokémon #${pokemon.id}`}* possui ${elements.length} elementos.\n` +
            `Para registrar magias, remova elementos excedentes até ficar com *${maxSlots}* opções.`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Elementos atuais: ${elements.join(", ")}` },
        ],
      },
      {
        type: "actions",
        elements: elements.map((element) => ({
          type: "button",
          action_id: MAGIC_REGISTER_REMOVE_ACTION_ID,
          text: { type: "plain_text", text: `Remover ${element}` },
          value: JSON.stringify({ pokemonId: pokemon.id, removeElement: element }),
        })),
      },
    ],
  };
}

function renderPokemonBlock(player) {
  const magicText = Array.isArray(player.magicSlots) && player.magicSlots.length
    ? player.magicSlots.map((magic) => `${magic.slot}. ${magic.name} ${magic.icon}`).join("\n")
    : "Nenhuma registrada";

  return (
    `*<@${player.userId}>*\n` +
    `*${player.selectedPokemonName}* (Nv. ${player.level})${player.starText !== "-" ? ` | ${player.starText}` : ""}\n` +
    `${buildPokemonTypesLabel(player.selectedPokemonTypes) ? `🧪 ${buildPokemonTypesLabel(player.selectedPokemonTypes)}\n` : ""}` +
    `❤️ ${player.hpCurrent}/${player.hpMax}\n` +
    `⚔️ ATK ${player.attack} | 🛡️ DEF ${player.defense}\n` +
    `💨 SPD ${player.speed} | ⚡ Iniciativa ${player.initiativeGauge}/${player.initiativeThreshold}\n` +
    `🧪 Poções: ${player.potionsRemaining}\n` +
    `✨ Magias:\n${magicText}`
  );
}

function renderPokemonLine(player) {
  const typesLabel = buildPokemonTypesLabel(player.selectedPokemonTypes);
  const starsLabel = player.starText !== "-" ? ` | ${player.starText}` : "";
  return `• <@${player.userId}> — ${player.selectedPokemonName} Nv.${player.level}${starsLabel}${typesLabel ? ` | ${typesLabel}` : ""} | HP ${player.hpCurrent}/${player.hpMax} | SPD ${player.speed}`;
}

function renderBattleFinished({ winnerId, loserId }) {
  return `🏁 Batalha encerrada!\n🏆 Vencedor: <@${winnerId}>\n💀 Derrotado: <@${loserId}>`;
}

module.exports = {
  BATTLE_ACCEPT_ACTION_ID,
  BATTLE_DECLINE_ACTION_ID,
  BATTLE_TURN_ACTION_ID,
  BATTLE_MAGIC_ACTION_ID,
  MAGIC_REGISTER_REMOVE_ACTION_ID,
  renderBattleInvite,
  renderSelectionPrompt,
  renderBattleState,
  renderMagicOptions,
  renderMagicRegisterElementPrompt,
  renderBattleFinished,
};
