const { buildBattleViewModel } = require("../../../application/battle/renderers/battlePresenter");
const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");
const { getAvailableElementalSkills } = require("../../../application/battle/domain/elementalRules");
const { canUseSkillAction } = require("../../../application/battle/domain/skillActionValidator");
const { getLevelBorderStyle } = require("./pokemonVisualTier");

const BATTLE_ACCEPT_ACTION_ID = "battle_accept_invite";
const BATTLE_DECLINE_ACTION_ID = "battle_decline_invite";
const BATTLE_TURN_ACTION_ID = "battle_turn_action";
const BATTLE_MAGIC_ACTION_ID = "battle_magic_action";
const BATTLE_SWITCH_ACTION_ID = "battle_switch_action";
const MAGIC_REGISTER_REMOVE_ACTION_ID = "magic_register_remove_element";
const BATTLE_ACTION_BUTTONS = {
  attack: { label: "Ataque", emoji: "⚔️", style: "primary" },
  magic: { label: "Magia", emoji: "✨" },
  potion: { label: "Poção", emoji: "🧪" },
  switch: { label: "Trocar", emoji: "🔁" },
};

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
        text: {
          type: "mrkdwn",
          text: renderPokemonBlock(challenger),
        },
        ...(buildPokemonAccessory(challenger) ? { accessory: buildPokemonAccessory(challenger) } : {}),
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: renderPokemonBlock(challenged),
        },
        ...(buildPokemonAccessory(challenged) ? { accessory: buildPokemonAccessory(challenged) } : {}),
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
  const formatted = formatBattleLogForSlack({
    battle,
    lines,
    title: options.logTitle || "📜 RESUMO DA RODADA",
    rawMode: Boolean(options.debugRawLog || battle?.metadata?.debugRawLog),
  });

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: formatted.slice(0, 2900),
    },
  };
}

function formatBattleLogForSlack({ battle, lines, title, rawMode = false }) {
  if (rawMode) {
    return [`*${title}*`, ...lines.map((line) => `• ${typeof line === "string" ? line : JSON.stringify(line)}`)].join("\n");
  }
  const laneIds = resolveBattleLogLanes(battle);
  const summaries = {
    player: buildCombatantSummary({ battle, userId: laneIds.playerId, ownerLabel: "user" }),
    enemy: buildCombatantSummary({ battle, userId: laneIds.enemyId, ownerLabel: "enemy" }),
  };

  for (const rawEntry of lines) {
    const normalized = normalizeLogEntry(rawEntry, battle);
    if (!normalized) continue;
    const lane = classifyLogLane(normalized, laneIds);
    if (normalized.kind === "action_summary") {
      summaries[lane].actionLabel = `${normalized.skillIcon || "✨"} ${normalized.skillName || "Ação"}`;
      summaries[lane].directDamage = Math.max(0, Number(summaries[lane].directDamage || 0) + Number(normalized.finalDamage || 0));
      if (Number(normalized.statusDamage || 0) > 0) {
        summaries[lane].statusDamage.push({ label: "Status", value: Number(normalized.statusDamage || 0) });
      }
      if (normalized.critical || normalized.isCrit) {
        const critBonus = normalized.extraDamage != null
          ? Number(normalized.extraDamage || 0)
          : Math.max(0, Number(normalized.finalDamage || 0) - Number(normalized.baseDamage || 0));
        summaries[lane].critDamageBonus = Math.max(0, Number(summaries[lane].critDamageBonus || 0) + critBonus);
      }
      if (Number(normalized.healingDone || 0) > 0) {
        summaries[lane].healingReceived.push({ label: "Cura", value: Number(normalized.healingDone || 0) });
      }
      if (Array.isArray(normalized.appliedEffects)) {
        for (const effectName of normalized.appliedEffects) {
          if (!effectName) continue;
          if (!summaries[lane].continuousEffects.includes(effectName)) summaries[lane].continuousEffects.push(effectName);
        }
      }
      const healingFromModifiers = (normalized.modifiers || []).find((value) => /cura\s+\d+/i.test(String(value || "")));
      if (healingFromModifiers) {
        const value = Number(String(healingFromModifiers).match(/\d+/)?.[0] || 0);
        if (value > 0) summaries[lane].healingReceived.push({ label: "Poção/Skill", value });
      }
      continue;
    }
    const text = String(normalized.text || "");
    applyTextEntryToSummary({ summary: summaries[lane], text });
  }

  const nextTurnName = getNextTurnLabel(battle);
  const playerLabel = laneIds.playerName || "Jogador";
  const enemyLabel = laneIds.enemyName || "Inimigo";
  return [
    `*${title}*`,
    "──────────────",
    `*Rodada:* ${battle?.round || 1}`,
    `*Próximo turno:* ${nextTurnName}`,
    "",
    `*[${playerLabel}]*`,
    ...formatCombatantSummaryLines(summaries.player),
    "",
    `*[${enemyLabel}]*`,
    ...formatCombatantSummaryLines(summaries.enemy),
  ].join("\n");
}

function buildCombatantSummary({ battle, userId, ownerLabel }) {
  const player = battle?.players?.[userId];
  return {
    actorId: userId,
    actorName: player?.selectedPokemon?.name || "Pokémon",
    ownerLabel,
    actionLabel: null,
    statusDamage: [],
    continuousEffects: [],
    directDamage: 0,
    critDamageBonus: 0,
    extraHitDamage: [],
    healingReceived: [],
    potionEvents: [],
    currentHp: Number(player?.battleHp?.current || 0),
    maxHp: Number(player?.battleHp?.max || 0),
    buffs: [],
    debuffs: [],
  };
}

function formatCombatantSummaryLines(summary, statusLines = []) {
  return [
    `• Ação: ${summary.actionLabel ? `*${summary.actorName}* usou ${summary.actionLabel}` : "—"}`,
    `• DOT/Contínuo: ${summary.continuousEffects.length ? summary.continuousEffects.join(", ") : "—"}`,
    `• Dano status: ${summary.statusDamage.length ? summary.statusDamage.map((entry) => `${entry.label} ${entry.value}`).join(", ") : "—"}`,
    `• Dano: ${summary.directDamage || 0}${summary.critDamageBonus ? ` (+crit ${summary.critDamageBonus})` : ""}`,
    `• Cura recebida: ${summary.healingReceived.length ? summary.healingReceived.map((entry) => `${entry.label} ${entry.value}`).join(", ") : "—"}`,
    `• Poções: ${summary.potionEvents.length ? summary.potionEvents.join(", ") : "—"}`,
    `• Vida: ${summary.currentHp}/${summary.maxHp}`,
    ...statusLines,
  ];
}

function resolveBattleLogLanes(battle) {
  const playerId = battle?.metadata?.slackUserId || battle?.challengerId;
  const knownIds = [battle?.challengerId, battle?.challengedId].filter(Boolean);
  const enemyId = knownIds.find((id) => id !== playerId) || battle?.challengedId || battle?.challengerId;
  return {
    playerId,
    enemyId,
    playerName: battle?.players?.[playerId]?.selectedPokemon?.name || "Jogador",
    enemyName: battle?.players?.[enemyId]?.selectedPokemon?.name || "Inimigo",
  };
}

function normalizeLogEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === "string") return { kind: "text", text: entry.trim() };
  if (typeof entry === "object") {
    if (entry.kind === "action_summary") return entry;
    if (entry.outcome && entry.actionType) {
      return normalizeOutcomeEntry(entry);
    }
    return { kind: "text", text: String(entry.message || entry.text || entry.summary || JSON.stringify(entry)).trim() };
  }
  return { kind: "text", text: String(entry).trim() };
}

function normalizeOutcomeEntry(entry) {
  const outcome = entry.outcome || {};
  const actionType = String(entry.actionType || outcome.type || "").toLowerCase();
  const magicName = outcome.magicEntry?.name || "Magia";
  if (actionType === "potion") {
    return {
      kind: "action_summary",
      actorUserId: entry.actorUserId,
      actorName: entry.actorName || null,
      skillName: "Poção",
      skillIcon: "🧪",
      finalDamage: 0,
      modifiers: [
        outcome.healAmount ? `cura ${outcome.healAmount}` : null,
        outcome.remainingPotions != null ? `poções restantes ${outcome.remainingPotions}` : null,
      ].filter(Boolean),
    };
  }
  return {
    kind: "action_summary",
    actorUserId: entry.actorUserId,
    actorName: entry.actorName || null,
    skillName: actionType === "attack" ? "Ataque Básico" : magicName,
    skillIcon: actionType === "attack" ? "⚔️" : "✨",
    baseDamage: Number(outcome.resolvedAction?.baseDamage ?? outcome.normalDamage ?? 0),
    finalDamage: Number(outcome.finalDamage || 0),
    healingDone: Number(outcome.resolvedAction?.healingDone || 0),
    appliedEffects: Array.isArray(outcome.resolvedAction?.appliedEffects) ? outcome.resolvedAction.appliedEffects : [],
    critical: Boolean(outcome.resolvedAction?.isCrit ?? outcome.isCritical),
    extraDamage: outcome.extraDamage || 0,
  };
}

function applyTextEntryToSummary({ summary, text }) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return;

  const actionLine = cleaned.match(/(?:atacou|usou\s+\*?([^*]+)\*?|executou)\s/i);
  if (!summary.actionLabel && actionLine) {
    if (actionLine[1]) summary.actionLabel = `✨ ${actionLine[1]}`;
    else if (/atacou/i.test(cleaned)) summary.actionLabel = "⚔️ Ataque";
  }

  const damage = Number(cleaned.match(/causou\s+\*?(\d+)\*?\s+de dano/i)?.[1] || cleaned.match(/com\s+(\d+)\.?$/i)?.[1] || 0);
  if (damage > 0 && /(causou|atingiu|atacou|splash)/i.test(cleaned)) {
    summary.directDamage = Math.max(0, Number(summary.directDamage || 0) + damage);
  }

  const statusLabel = extractStatusLabel(cleaned);
  if (statusLabel) {
    const statusValue = Number(cleaned.match(/causou\s+\*?(\d+)\*?/i)?.[1] || cleaned.match(/por\s+(\d+)\.?$/i)?.[1] || 0);
    if (statusValue > 0) summary.statusDamage.push({ label: statusLabel, value: statusValue });
    if (!summary.continuousEffects.includes(statusLabel)) summary.continuousEffects.push(statusLabel);
  }

  const healAmount = Number(cleaned.match(/(?:curou|recuperou)\s+\*?(\d+)\*?/i)?.[1] || 0);
  if (healAmount > 0) {
    summary.healingReceived.push({ label: "Cura", value: healAmount });
    if (!summary.actionLabel && /poç[aã]o/i.test(cleaned)) summary.actionLabel = "🧪 Poção";
  }
  const remainingPotions = Number(cleaned.match(/poç(?:õ|o)es?\s+restantes:?\s+\*?(\d+)\*?/i)?.[1] || 0);
  if (/poç[aã]o/i.test(cleaned) && remainingPotions >= 0) {
    summary.potionEvents.push(`curou ${healAmount || 0} | restantes ${remainingPotions}`);
  }
}

function extractStatusLabel(text) {
  if (/burn/i.test(text)) return "Burn";
  if (/nevasca|g[eé]lid|congel/i.test(text)) return "Gelo";
  if (/ra[ií]z|dot|cont[ií]nu/i.test(text)) return "DOT";
  if (/maldi|sombr|choque|veneno/i.test(text)) return "Status";
  return null;
}

function classifyLogLane(entry, laneIds) {
  if (entry?.kind === "action_summary") {
    if (entry.actorUserId === laneIds.enemyId) return "enemy";
    return "player";
  }
  const line = String(entry?.text || entry || "");
  const subject = line.match(/^.*?<@([^>]+)>/);
  if (subject?.[1] === laneIds.enemyId) return "enemy";
  if (subject?.[1] === laneIds.playerId) return "player";
  const mentions = [...line.matchAll(/<@([^>]+)>/g)].map((match) => match[1]);
  if (mentions.includes(laneIds.playerId) && !mentions.includes(laneIds.enemyId)) return "player";
  if (mentions.includes(laneIds.enemyId) && !mentions.includes(laneIds.playerId)) return "enemy";
  if (/👾|🤖|inimig/i.test(line)) return "enemy";
  return "player";
}

function compactCombatLogLine(line) {
  const cleaned = String(line).replace(/\s+/g, " ").trim();
  const skillMatch = cleaned.match(/(🔥|❄️|🌨️|⚡|🌩️|🧲|💧|🌊|🌀|🌿|🌱|🧠|💫|🛡️|👻|🕯️|🌑|🥊|💥)\s*([^:.\n]+)(?::|\.)?/);
  if (skillMatch) {
    const icon = skillMatch[1];
    const skillName = skillMatch[2].replace(/\*+/g, "").trim();
    return `Skill: ${icon} *${skillName}*${cleaned.includes("stack") ? " (stacks)" : ""}`;
  }
  if (/crític/i.test(cleaned)) return `Crítico: ${cleaned}`;
  if (/esquiv|desvi|dodg/i.test(cleaned)) return `Esquiva: ${cleaned}`;
  if (/burn|gélido|congel|choque|maldi|marca|raiz|debuff|buff|barreira|sobrecarga|ritmo|postura/i.test(cleaned)) {
    return `Status: ${cleaned}`;
  }
  if (/falh|cooldown|inválid|limite/i.test(cleaned)) return `Falha: ${cleaned}`;
  if (/causou|dano|atingiu|atacou|usou/i.test(cleaned)) return `Ação: ${cleaned}`;
  return `Extra: ${cleaned}`;
}

function isDotLine(line) {
  return /burn|rodada|nevasca|raízes|sufocantes|dreno|contínu|dot|sangramento|veneno/i.test(String(line || ""));
}

function getNextTurnLabel(battle) {
  const player = battle?.players?.[battle?.currentTurnUserId];
  if (player?.selectedPokemon?.name) return player.selectedPokemon.name.toLowerCase();
  if (battle?.currentTurnUserId) return `<@${battle.currentTurnUserId}>`;
  return "—";
}

function buildBattleActionBlock(battle, options = {}) {
  if (battle.status !== "active") return null;
  const currentPlayer = battle.players[battle.currentTurnUserId];
  const elementalSkills = getAvailableElementalSkills(currentPlayer || {});
  const sampleSkill = (currentPlayer?.magicSlots?.[0] && { ...currentPlayer.magicSlots[0], kind: "regular" }) || elementalSkills[0] || null;
  const canUseAnySkill = sampleSkill
    ? canUseSkillAction(battle, currentPlayer, sampleSkill, { actorUserId: battle.currentTurnUserId }).ok
    : false;
  const aliveReserves = (currentPlayer?.team || [])
    .filter((member, index) => index !== Number(currentPlayer.activeTeamIndex || 0))
    .filter((member) => Number(member?.battleHp?.current || 0) > 0);

  return {
    type: "actions",
    elements: [
      buildTurnButton({ battle, action: "attack", actionIdBuilder: options.turnActionIdBuilder }),
      buildTurnButton({
        battle,
        label: buildActionLabel("magic"),
        action: "magic",
        disabled: !canUseAnySkill,
        actionIdBuilder: options.turnActionIdBuilder,
      }),
      buildTurnButton({ battle, action: "potion", actionIdBuilder: options.turnActionIdBuilder }),
      aliveReserves.length
        ? buildTurnButton({ battle, action: "switch", actionIdBuilder: options.turnActionIdBuilder })
        : null,
    ].filter(Boolean),
  };
}

function buildActionLabel(action) {
  const config = BATTLE_ACTION_BUTTONS[action] || { label: action, emoji: "" };
  return `${config.emoji ? `${config.emoji} ` : ""}${config.label}`.trim();
}

function buildTurnButton({ battle, label, action, style, disabled = false, actionIdBuilder = buildBattleTurnActionId }) {
  const config = BATTLE_ACTION_BUTTONS[action] || {};
  const finalLabel = label || buildActionLabel(action);
  const button = {
    type: "button",
    action_id: actionIdBuilder(action),
    text: { type: "plain_text", text: finalLabel },
    value: JSON.stringify({ channelId: battle.channelId, action }),
  };

  if (style || config.style) button.style = style || config.style;
  if (disabled) button.style = undefined;
  if (disabled) button.text = { type: "plain_text", text: finalLabel.slice(0, 75) };
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
        elements: entries.map((magic) => {
          const validation = canUseSkillAction(
            battle,
            battle?.players?.[actorUserId],
            magic,
            { actorUserId },
          );
          const cooldownRemaining = resolveMagicCooldownRemaining({ magic, actorPlayer: battle?.players?.[actorUserId] });
          return {
            type: "button",
            action_id: magicActionIdBuilder(magic.slot),
            text: {
              type: "plain_text",
              text: `${magic.icon || "✨"} ${magic.name}${cooldownRemaining > 0 ? ` (${cooldownRemaining})` : ""}`.slice(0, 75),
            },
            value: JSON.stringify({ channelId: battle.channelId, magicSlot: magic.slot }),
            ...(validation.ok ? {} : { value: JSON.stringify({ channelId: battle.channelId, magicSlot: magic.slot, unavailable: true }) }),
          };
        }),
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
  return (
    `*<@${player.userId}>*\n` +
    `*${player.selectedPokemonName}* (Nv. ${player.level})${player.starText !== "-" ? ` | ${player.starText}` : ""}\n` +
    `${buildPokemonTypesLabel(player.selectedPokemonTypes) ? `🧪 ${buildPokemonTypesLabel(player.selectedPokemonTypes)}\n` : ""}` +
    `❤️ ${player.hpCurrent}/${player.hpMax}\n` +
    `⚔️ ATK ${player.attack} | ✨ MAG ${player.magic}\n` +
    `🛡️ DEF ${player.defense} | 💨 SPD ${player.speed}\n` +
    `⚡ Iniciativa ${player.initiativeGauge}/${player.initiativeThreshold}` +
    `${renderReserveLines(player)}`
  );
}

function renderReserveLines(player) {
  if (!Array.isArray(player.reserves) || !player.reserves.length) return "";
  const lines = player.reserves.map((reserve) => `• ${reserve.name}: ${reserve.hpCurrent}/${reserve.hpMax}`);
  return `\n🔁 Reservas:\n${lines.join("\n")}`;
}

function buildPokemonAccessory(player) {
  if (!player?.selectedPokemonSpriteUrl) return null;
  const border = getLevelBorderStyle(player.level || 1);
  return {
    type: "image",
    image_url: player.selectedPokemonSpriteUrl,
    alt_text: `${border.emoji} ${player.selectedPokemonName || "Pokémon"} ${border.emoji}`,
  };
}

function resolveMagicCooldownRemaining({ magic, actorPlayer }) {
  if (magic?.kind === "elemental") return Number(magic.cooldownRemaining || 0);
  return Math.max(0, Number(actorPlayer?.magicCooldown?.blockedOwnTurnsRemaining || 0));
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
  formatBattleLogForSlack,
  renderMagicOptions,
  renderSwitchOptions,
  renderMagicRegisterElementPrompt,
  renderBattleFinished,
};
