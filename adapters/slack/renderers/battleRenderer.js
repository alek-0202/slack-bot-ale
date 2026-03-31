const { buildBattleViewModel } = require("../../../application/battle/renderers/battlePresenter");
const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");
const { getAvailableElementalSkills } = require("../../../application/battle/domain/elementalRules");
const { canUseSkillAction } = require("../../../application/battle/domain/skillActionValidator");
const { sanitizeResolvedAction } = require("../../../application/battle/domain/resolvedAction");
const { describeEffectGameplayImpact, normalizeEffectKey } = require("../../../application/battle/domain/effectDetailsRegistry");
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
    absorbedDamage: 0,
    elementalTag: null,
    dodged: false,
    critDamageBonus: 0,
    healingReceived: [],
    buffs: [],
    debuffs: [],
    potionEvents: [],
    currentHp: Number(player?.battleHp?.current || 0),
    maxHp: Number(player?.battleHp?.max || 0),
    currentShield: Number(player?.elementalState?.effects
      ?.filter((effect) => Number(effect?.remainingRounds ?? 1) > 0 && effect?.shieldCurrentHp != null)
      ?.reduce((total, effect) => total + Math.max(0, Number(effect.shieldCurrentHp || 0)), 0) || 0),
    buffDetails: [],
    debuffDetails: [],
  };
}

function formatCombatantSummaryLines(summary) {
  return [
    `• Ação: ${summary.actionLabel ? `*${summary.actorName}* usou ${summary.actionLabel}` : "—"}`,
    `• DOT/Contínuo: ${summary.continuousEffects.length ? summary.continuousEffects.join(", ") : "—"}`,
    `• Dano status: ${summary.statusDamage.length ? summary.statusDamage.map((entry) => `${entry.label} ${entry.value}`).join(", ") : "—"}`,
    `• Dano: ${summary.directDamage || 0}${summary.absorbedDamage ? ` (barreira absorveu ${summary.absorbedDamage})` : ""}${summary.critDamageBonus ? ` (+crit ${summary.critDamageBonus})` : ""}${summary.dodged ? " (esquivado)" : ""}${summary.elementalTag ? ` (${summary.elementalTag})` : ""}`,
    `• Cura recebida: ${summary.healingReceived.length ? summary.healingReceived.map((entry) => `${entry.label} ${entry.value}`).join(", ") : "—"}`,
    `• Vida: ${summary.currentHp}/${summary.maxHp}${summary.currentShield > 0 ? ` | Barreira: ${summary.currentShield}` : ""}`,
    `• Buffs: ${summary.buffs.length ? summary.buffs.join(" | ") : "—"}`,
    `• Debuffs: ${summary.debuffs.length ? summary.debuffs.join(" | ") : "—"}`,
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

function formatBattleLogForSlack({ battle, lines, title, rawMode = false }) {
  if (rawMode) {
    return [`*${title}*`, ...lines.map((line) => `• ${typeof line === "string" ? line : JSON.stringify(line)}`)].join("\n");
  }

  const laneIds = resolveBattleLogLanes(battle);
  const summaries = {
    player: buildCombatantSummary({ battle, userId: laneIds.playerId, ownerLabel: "user" }),
    enemy: buildCombatantSummary({ battle, userId: laneIds.enemyId, ownerLabel: "enemy" }),
  };
  const hasStructuredSummaries = lines.some((entry) => entry && typeof entry === "object" && entry.kind === "action_summary");

  const extras = [];
  for (const rawEntry of lines) {
    const normalized = normalizeLogEntry(rawEntry);
    if (!normalized) continue;
    if (normalized.kind !== 'action_summary') {
      if (!hasStructuredSummaries) {
        const textLane = classifyTextLane(normalized.text, laneIds);
        applyTextMetricsToSummary(summaries[textLane], normalized.text);
      }
      extras.push(compactCombatLogLine(normalized.text));
      continue;
    }
    const lane = classifySummaryLane(normalized, laneIds);
    const summary = summaries[lane];
    summary.actionLabel = `${normalized.skillIcon || "✨"} ${normalized.skillName || normalized.actionName || "Ação"}`;
    summary.directDamage = Number(normalized.finalDamage || 0);
    summary.absorbedDamage = Number(normalized.shieldAbsorbedDamage || 0);
    summary.dodged = Boolean(normalized.didDodge || normalized.wasDodged || normalized.dodged);
    const elementalOutcome = normalized.elementalOutcome || normalized.elementalRelation;
    summary.elementalTag = elementalOutcome === "advantage"
      ? "vantagem elemental"
      : elementalOutcome === "disadvantage"
        ? "resistido"
        : null;
    if (Number(normalized.statusDamage || 0) > 0) {
      summary.statusDamage = [{ label: 'Status', value: Number(normalized.statusDamage || 0) }];
    } else {
      summary.statusDamage = [];
    }
    if (normalized.critical || normalized.isCrit) {
      summary.critDamageBonus = Math.max(0, Number(normalized.critBonusDamage || 0));
    } else {
      summary.critDamageBonus = 0;
    }
    if (Number(normalized.healingDone || 0) > 0) {
      summary.healingReceived = [{ label: 'Cura', value: Number(normalized.healingDone || 0) }];
    } else {
      summary.healingReceived = [];
    }
    summary.currentHp = Number(normalized.actorCurrentHp || summary.currentHp || 0);
    summary.maxHp = Number(normalized.actorMaxHp || summary.maxHp || 0);
    summary.currentShield = Number(normalized.actorCurrentShield || summary.currentShield || 0);
    summary.buffs = Array.isArray(normalized.activeBuffs) ? normalized.activeBuffs : [];
    summary.debuffs = Array.isArray(normalized.activeDebuffs) ? normalized.activeDebuffs : [];
    summary.buffDetails = Array.isArray(normalized.activeBuffDetails) ? normalized.activeBuffDetails : [];
    summary.debuffDetails = Array.isArray(normalized.activeDebuffDetails) ? normalized.activeDebuffDetails : [];
    for (const effect of (Array.isArray(normalized.appliedEffects) ? normalized.appliedEffects : [])) {
      if (effect && !summary.continuousEffects.includes(effect)) summary.continuousEffects.push(effect);
    }
    if (normalized.blockedReason) {
      extras.push(`Falha: ${summary.actorName} bloqueado (${normalized.blockedReason})`);
    }
    for (const note of (Array.isArray(normalized.extraNotes) ? normalized.extraNotes : [])) {
      extras.push(compactCombatLogLine(note));
    }
  }

  if (!summaries.player.actionLabel && extras.length) summaries.player.actionLabel = "📜 Eventos da rodada";
  if (!summaries.enemy.actionLabel && extras.length) summaries.enemy.actionLabel = "📜 Eventos da rodada";

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
    "",
    ...formatDetailsSection(battle, laneIds),
    extras.length ? "" : null,
    extras.length ? '*Eventos:*' : null,
    ...extras.slice(-6).map((line) => `• ${line}`),
  ].filter(Boolean).join("\n");
}

function formatDetailsSection(battle, laneIds) {
  const details = collectBattleActiveEffectDetails(battle, laneIds);
  if (!details.length) return [];
  const lines = ["*Details*"];
  for (const item of details.slice(0, 8)) {
    lines.push(`• ${item.name} -> ${item.description}`);
  }
  return lines;
}

function collectBattleActiveEffectDetails(battle = {}, laneIds = {}) {
  const playerIds = [laneIds?.playerId, laneIds?.enemyId].filter(Boolean);
  const unique = new Map();

  for (const userId of playerIds) {
    const player = battle?.players?.[userId] || {};
    const effectEntries = (player?.elementalState?.effects || [])
      .filter((effect) => Number(effect?.remainingRounds ?? 1) > 0)
      .map((effect) => ({
        id: effect?.id || null,
        key: normalizeEffectKey(effect),
        name: effect?.name || effect?.id || "Efeito",
        description: describeEffectGameplayImpact(effect),
      }));
    const statusEntries = (player?.elementalState?.statuses || [])
      .filter((status) => Number(status?.remainingRounds ?? status?.durationTurnsRemaining ?? 1) > 0 && Number(status?.stacks || 1) > 0)
      .map((status) => ({
        id: status?.id || null,
        key: normalizeEffectKey(status),
        name: status?.name || status?.id || "Status",
        description: describeEffectGameplayImpact(status),
      }));

    for (const entry of [...effectEntries, ...statusEntries]) {
      const uniqueKey = entry.key || entry.id || entry.name;
      if (!uniqueKey || unique.has(uniqueKey)) continue;
      unique.set(uniqueKey, entry);
    }
  }

  return [...unique.values()];
}

function normalizeLogEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === 'object' && entry.kind === 'action_summary') {
    const normalized = { ...entry };
    if (entry.resolvedAction) {
      const resolved = sanitizeResolvedAction(entry.resolvedAction);
      if (resolved) {
        normalized.baseDamage = resolved.baseDamage;
        normalized.finalDamage = resolved.finalDamage;
        normalized.statusDamage = resolved.statusDamage;
        normalized.healingDone = resolved.healingDone;
        normalized.shieldAbsorbedDamage = resolved.shieldAbsorbedDamage;
        normalized.elementalMultiplier = resolved.elementalMultiplier;
        normalized.elementalModifier = resolved.elementalModifier;
        normalized.elementalOutcome = resolved.elementalOutcome;
        normalized.elementalRelation = resolved.elementalRelation;
        normalized.didDodge = resolved.didDodge;
        normalized.wasDodged = resolved.wasDodged;
        normalized.dodged = resolved.dodged;
        normalized.isCrit = resolved.isCrit;
        normalized.critical = resolved.isCrit;
        normalized.critBonusDamage = resolved.critBonusDamage;
        normalized.appliedEffects = resolved.appliedEffects;
        normalized.activeBuffs = resolved.activeBuffs;
        normalized.activeDebuffs = resolved.activeDebuffs;
        normalized.activeBuffDetails = resolved.activeBuffDetails;
        normalized.activeDebuffDetails = resolved.activeDebuffDetails;
        normalized.actorCurrentHp = resolved.actorCurrentHp;
        normalized.actorMaxHp = resolved.actorMaxHp;
        normalized.actorCurrentShield = resolved.actorCurrentShield;
        normalized.blockedReason = resolved.blockedReason;
        normalized.extraNotes = resolved.extraNotes;
      }
    }
    return normalized;
  }
  if (typeof entry === 'string') return { kind: 'text', text: entry.trim() };
  if (typeof entry === 'object') return { kind: 'text', text: String(entry.message || entry.text || entry.summary || JSON.stringify(entry)).trim() };
  return { kind: 'text', text: String(entry).trim() };
}

function classifyTextLane(text, laneIds) {
  const line = String(text || '');
  const subject = line.match(/^.*?<@([^>]+)>/);
  if (subject?.[1] === laneIds.enemyId) return 'enemy';
  if (subject?.[1] === laneIds.playerId) return 'player';
  return 'player';
}

function applyTextMetricsToSummary(summary, text) {
  const line = String(text || '');
  const damage = Number(line.match(/causou\s+\*?(\d+)\*?\s+de dano/i)?.[1] || line.match(/com\s+(\d+)\.?$/i)?.[1] || 0);
  if (damage > 0) summary.directDamage += damage;

  const heal = Number(line.match(/(?:curou|recuperou)\s+\*?(\d+)\*?/i)?.[1] || 0);
  if (heal > 0) summary.healingReceived.push({ label: 'Cura', value: heal });

  const statusDamage = Number(line.match(/burn\s+causou\s+(\d+)/i)?.[1] || 0);
  if (statusDamage > 0) {
    summary.statusDamage.push({ label: 'Burn', value: statusDamage });
    if (!summary.continuousEffects.includes('Burn')) summary.continuousEffects.push('Burn');
  }
}

function classifySummaryLane(entry, laneIds) {
  if (entry.actorUserId === laneIds.enemyId || entry.actorId === laneIds.enemyId) return 'enemy';
  return 'player';
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
    `❤️ ${player.hpCurrent}/${player.hpMax}${Number(player?.shieldCurrent || 0) > 0 ? ` | 🛡️ ${Number(player.shieldCurrent || 0)}` : ""}\n` +
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
  const shieldLabel = Number(player?.shieldCurrent || 0) > 0 ? ` • Shield ${Number(player.shieldCurrent || 0)}` : "";
  return `• <@${player.userId}> — ${player.selectedPokemonName} Nv.${player.level}${starsLabel}${typesLabel ? ` | ${typesLabel}` : ""} | HP ${player.hpCurrent}/${player.hpMax}${shieldLabel} | SPD ${player.speed}`;
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
