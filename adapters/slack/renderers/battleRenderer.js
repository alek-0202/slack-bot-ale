const { buildBattleViewModel } = require("../../../application/battle/renderers/battlePresenter");
const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");
const { getAvailableElementalSkills, getSkillCooldownRemaining } = require("../../../application/battle/domain/elementalRules");

const BATTLE_ACCEPT_ACTION_ID = "battle_accept_invite";
const BATTLE_DECLINE_ACTION_ID = "battle_decline_invite";
const BATTLE_TURN_ACTION_ID = "battle_turn_action";
const BATTLE_MAGIC_ACTION_ID = "battle_magic_action";
const BATTLE_SWITCH_ACTION_ID = "battle_switch_action";
const MAGIC_REGISTER_REMOVE_ACTION_ID = "magic_register_remove_element";

function buildBattleTurnActionId(action) {
  return `${BATTLE_TURN_ACTION_ID}_${action}`;
}

function buildBattleMagicActionId(slot) {
  return `${BATTLE_MAGIC_ACTION_ID}_${slot}`;
}

function buildBattleSwitchActionId(selection = "select") {
  return `${BATTLE_SWITCH_ACTION_ID}_${selection}`;
}

function buildMagicRegisterRemoveActionId(element) {
  return `${MAGIC_REGISTER_REMOVE_ACTION_ID}_${String(element || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown"}`;
}

function renderBattleInvite({ challengerId, challengedId, channelId }) {
  return {
    text:
      `⚔️ <@${challengerId}> desafiou <@${challengedId}> para um duelo PvP!\n` +
      "Use os botões abaixo para aceitar ou recusar.\n" +
      "Após aceitar, cada jogador deve escolher até 3 Pokémon com `!bpick ID [ID2] [ID3]`.",
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
    ].filter(Boolean),
  };
}

function renderSelectionPrompt({ challengerId, challengedId }) {
  return (
    `✅ <@${challengedId}> aceitou o desafio de <@${challengerId}>!\n` +
    "Agora escolham até 3 Pokémon da sua coleção com `!bpick ID [ID2] [ID3]`.\n" +
    `Ordem de escolha: <@${challengerId}> primeiro, depois <@${challengedId}>.`
  );
}

function renderBattleState(battle, options = {}) {
  const view = buildBattleViewModel(battle);
  const [challenger, challenged] = view.players;
  const title = options.title || "⚔️ *Batalha Pokémon PvP*";
  const stateTextPrefix = options.stateTextPrefix || "⚔️ Batalha em andamento";
  const shouldShowActions = options.shouldShowActions
    ? options.shouldShowActions({ battle, view })
    : battle.status === "active";
  const waitingText = options.waitingTextBuilder
    ? options.waitingTextBuilder({ battle, view })
    : null;
  const logBlock = buildBattleLogBlock(battle, options);

  return {
    text:
      `${stateTextPrefix}\n` +
      `${renderPokemonLine(challenger)}\n` +
      `${renderPokemonLine(challenged)}\n` +
      `🎯 Turno: <@${view.currentTurnUserId}> | Rodada: ${view.round}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: title,
        },
      },
      options.battleContextText ? {
        type: "section",
        text: {
          type: "mrkdwn",
          text: options.battleContextText,
        },
      } : null,
      view.pvpEconomy?.entryFee > 0 || view.pvpEconomy?.winnerPrize > 0 ? {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `💸 Entrada: *${view.pvpEconomy.entryFee} gold/jogador* | 🏆 Recompensa: *${view.pvpEconomy.winnerPrize} gold*`,
          },
        ],
      } : null,
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
      logBlock,
      !shouldShowActions && waitingText ? {
        type: "context",
        elements: [{ type: "mrkdwn", text: waitingText }],
      } : null,
      shouldShowActions ? buildBattleActionBlock(battle, options) : null,
    ].filter(Boolean),
  };
}

function buildBattleLogBlock(battle, options = {}) {
  const lines = Array.isArray(options.logLinesBuilder ? options.logLinesBuilder(battle) : battle?.metadata?.turnLog)
    ? (options.logLinesBuilder ? options.logLinesBuilder(battle) : battle?.metadata?.turnLog)
    : [];

  if (!lines.length) return null;

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*📜 Log de combate*\n${lines.map((line) => `• ${line}`).join("\n")}`.slice(0, 2900),
    },
  };
}

function buildBattleActionBlock(battle, options = {}) {
  if (battle.status !== "active") return null;
  const currentPlayer = battle.players[battle.currentTurnUserId];
  const elementalSkills = getAvailableElementalSkills(currentPlayer || {});
  const hasElementalReady = elementalSkills.some((entry) => getSkillCooldownRemaining(currentPlayer, entry.id) <= 0);
  const magicOnCooldown = (currentPlayer?.magicCooldown?.blockedOwnTurnsRemaining || 0) > 0 && !hasElementalReady;
  const aliveReserves = (currentPlayer?.team || [])
    .filter((member, index) => index !== Number(currentPlayer.activeTeamIndex || 0))
    .filter((member) => Number(member?.battleHp?.current || 0) > 0);

  return {
    type: "actions",
    elements: [
      buildTurnButton({ battle, label: "⚔️ Ataque", action: "attack", style: "primary", actionIdBuilder: options.turnActionIdBuilder }),
      buildTurnButton({
        battle,
        label: magicOnCooldown
          ? `✨ Magia (${currentPlayer.magicCooldown.blockedOwnTurnsRemaining})`
          : "✨ Magia",
        action: "magic",
        disabled: magicOnCooldown,
        actionIdBuilder: options.turnActionIdBuilder,
      }),
      buildTurnButton({ battle, label: "🧪 Poção", action: "potion", actionIdBuilder: options.turnActionIdBuilder }),
      aliveReserves.length
        ? buildTurnButton({ battle, label: "🔁 Trocar", action: "switch", actionIdBuilder: options.turnActionIdBuilder })
        : null,
    ].filter(Boolean),
  };
}

function buildTurnButton({ battle, label, action, style, disabled = false, actionIdBuilder = buildBattleTurnActionId }) {
  const button = {
    type: "button",
    action_id: actionIdBuilder(action),
    text: { type: "plain_text", text: label },
    value: JSON.stringify({ channelId: battle.channelId, action }),
  };

  if (style) button.style = style;
  if (disabled) button.style = undefined;
  if (disabled) button.text = { type: "plain_text", text: label.slice(0, 75) };
  if (disabled) button.value = JSON.stringify({ channelId: battle.channelId, action, unavailable: true });
  if (disabled) button.confirm = {
    title: { type: "plain_text", text: "Magia em cooldown" },
    text: { type: "mrkdwn", text: "A magia ainda está em cooldown nas próximas rodadas do mesmo jogador." },
    confirm: { type: "plain_text", text: "Ok" },
    deny: { type: "plain_text", text: "Fechar" },
  };
  return button;
}

function renderMagicOptions({ battle, actorUserId, magicSlots = [], options = {} }) {
  const entries = Array.isArray(magicSlots) ? magicSlots : [];
  if (!entries.length) {
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

  const magicActionIdBuilder = options.magicActionIdBuilder || buildBattleMagicActionId;

  return {
    text: "Escolha uma magia",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: options.title || `✨ *Escolha a magia de <@${actorUserId}>*`,
        },
      },
      options.battleContextText ? {
        type: "section",
        text: {
          type: "mrkdwn",
          text: options.battleContextText,
        },
      } : null,
      {
        type: "actions",
        elements: entries.map((magic) => ({
          type: "button",
          action_id: magicActionIdBuilder(magic.slot),
          text: { type: "plain_text", text: `${magic.icon || "✨"} ${magic.name}${magic.cooldownRemaining > 0 ? ` (${magic.cooldownRemaining})` : ""}`.slice(0, 75) },
          value: JSON.stringify({ channelId: battle.channelId, magicSlot: magic.slot }),
        })),
      },
    ].filter(Boolean),
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
          action_id: buildMagicRegisterRemoveActionId(element),
          text: { type: "plain_text", text: `Remover ${element}` },
          value: JSON.stringify({ pokemonId: pokemon.id, removeElement: element }),
        })),
      },
    ].filter(Boolean),
  };
}

function renderPokemonBlock(player) {
  const magicText = Array.isArray(player.magicActions) && player.magicActions.length
    ? player.magicActions.map((magic) => `${magic.icon || "✨"} ${magic.name}${player.elementalCooldowns?.[magic.id] > 0 ? ` [CD ${player.elementalCooldowns[magic.id]}]` : ""}`).join("\n")
    : "Nenhuma registrada";
  const statusText = Array.isArray(player.activeStatuses) && player.activeStatuses.length
    ? player.activeStatuses.map((status) => `${status.name} x${status.stacks} (${status.remainingRounds}r)`).join(", ")
    : "Sem status";
  const effectText = Array.isArray(player.activeEffects) && player.activeEffects.length
    ? player.activeEffects.map((effect) => `${effect.name}${effect.chargesRemaining != null ? ` [${effect.chargesRemaining} carga(s)]` : ""}${effect.remainingRounds != null ? ` (${effect.remainingRounds}r)` : ""}`).join(", ")
    : "Sem efeitos";

  return (
    `*<@${player.userId}>*\n` +
    `*${player.selectedPokemonName}* (Nv. ${player.level})${player.starText !== "-" ? ` | ${player.starText}` : ""}\n` +
    `${buildPokemonTypesLabel(player.selectedPokemonTypes) ? `🧪 ${buildPokemonTypesLabel(player.selectedPokemonTypes)}\n` : ""}` +
    `❤️ ${player.hpCurrent}/${player.hpMax}\n` +
    `⚔️ ATK ${player.attack} | ✨ MAG ${player.magic}\n` +
    `🛡️ DEF ${player.defense}\n` +
    `💨 SPD ${player.speed} | ⚡ Iniciativa ${player.initiativeGauge}/${player.initiativeThreshold}\n` +
    `🧪 Poções: ${player.potionsRemaining}\n` +
    `⏳ Cooldown magia padrão: ${player.magicCooldownRemaining}\n` +
    `🧬 Status: ${statusText}\n` +
    `🛡️ Efeitos: ${effectText}\n` +
    `✨ Magias/Skills:\n${magicText}\n` +
    `🔁 Reservas:\n${renderReserveLines(player)}`
  );
}

function renderReserveLines(player) {
  if (!Array.isArray(player.reserves) || !player.reserves.length) return "_Sem reservas_";
  return player.reserves
    .map((reserve) => `• ${reserve.name} (${reserve.hpCurrent}/${reserve.hpMax})${reserve.isAlive ? "" : " 💀"}`)
    .join("\n");
}

function renderPokemonLine(player) {
  const typesLabel = buildPokemonTypesLabel(player.selectedPokemonTypes);
  const starsLabel = player.starText !== "-" ? ` | ${player.starText}` : "";
  return `• <@${player.userId}> — ${player.selectedPokemonName} Nv.${player.level}${starsLabel}${typesLabel ? ` | ${typesLabel}` : ""} | HP ${player.hpCurrent}/${player.hpMax} | SPD ${player.speed}`;
}

function renderBattleFinished({ winnerId, loserId }) {
  return `🏁 Batalha encerrada!\n🏆 Vencedor: <@${winnerId}>\n💀 Derrotado: <@${loserId}>`;
}

function renderSwitchOptions({ battle, actorUserId, reserves = [] }) {
  if (!reserves.length) {
    return {
      text: "Você não tem reservas vivas para trocar.",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "🔁 Você não possui reservas vivas para trocar agora." },
        },
      ],
    };
  }

  return {
    text: "Escolha um Pokémon para trocar",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🔁 *Escolha a troca de <@${actorUserId}>*`,
        },
      },
      {
        type: "actions",
        elements: reserves.map((reserve) => ({
          type: "button",
          action_id: buildBattleSwitchActionId(`select_${reserve.id}`),
          text: { type: "plain_text", text: `${reserve.name} (${reserve.hpCurrent}/${reserve.hpMax})`.slice(0, 75) },
          value: JSON.stringify({ channelId: battle.channelId, pokemonId: reserve.id }),
        })),
      },
    ],
  };
}

module.exports = {
  BATTLE_ACCEPT_ACTION_ID,
  BATTLE_DECLINE_ACTION_ID,
  BATTLE_TURN_ACTION_ID,
  BATTLE_MAGIC_ACTION_ID,
  BATTLE_SWITCH_ACTION_ID,
  MAGIC_REGISTER_REMOVE_ACTION_ID,
  buildBattleTurnActionId,
  buildBattleMagicActionId,
  buildBattleSwitchActionId,
  buildMagicRegisterRemoveActionId,
  renderBattleInvite,
  renderSelectionPrompt,
  renderBattleState,
  renderMagicOptions,
  renderSwitchOptions,
  renderMagicRegisterElementPrompt,
  renderBattleFinished,
};
