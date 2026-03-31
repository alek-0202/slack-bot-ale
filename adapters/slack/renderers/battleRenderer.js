const { buildBattleViewModel } = require("../../../application/battle/renderers/battlePresenter");
const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");
const { getAvailableElementalSkills, getSkillCooldownRemaining } = require("../../../application/battle/domain/elementalRules");
const { canUseSkillAction } = require("../../../application/battle/domain/skillActionValidator");

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
      if (normalized.critical && normalized.extraDamage != null) {
        summaries[lane].critDamageBonus = Math.max(0, Number(summaries[lane].critDamageBonus || 0) + Number(normalized.extraDamage || 0));
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
  const playerStatus = formatStatusCategories(battle?.players?.[laneIds.playerId]);
  const enemyStatus = formatStatusCategories(battle?.players?.[laneIds.enemyId]);

  return [
    `*${title}*`,
    "──────────────",
    `*Rodada:* ${battle?.round || 1}`,
    `*Próximo turno:* ${nextTurnName}`,
    "",
    `*[${playerLabel}]*`,
    ...formatCombatantSummaryLines(summaries.player, playerStatus),
    "",
    `*[${enemyLabel}]*`,
    ...formatCombatantSummaryLines(summaries.enemy, enemyStatus),
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
      modifiers: [outcome.healAmount ? `cura ${outcome.healAmount}` : null].filter(Boolean),
    };
  }
  return {
    kind: "action_summary",
    actorUserId: entry.actorUserId,
    actorName: entry.actorName || null,
    skillName: actionType === "attack" ? "Ataque Básico" : magicName,
    skillIcon: actionType === "attack" ? "⚔️" : "✨",
    finalDamage: Number(outcome.finalDamage || 0),
    critical: Boolean(outcome.isCritical),
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

function formatStatusCategories(playerState) {
  if (!playerState) return [];
  const statuses = playerState.elementalState?.statuses || [];
  const effects = playerState.elementalState?.effects || [];
  const buffs = [];
  const debuffs = [];
  const control = [];
  const dot = [];
  const marks = [];
  const decorate = (name) => withStatusEmoji(name);

  for (const effect of effects) {
    const stacks = effect?.stacks != null ? ` x${effect.stacks}` : "";
    const rounds = effect?.remainingRounds != null ? ` (${effect.remainingRounds}r)` : "";
    const label = `${decorate(effect.name || effect.id || "Efeito")}${stacks}${rounds}`;
    if (effect.forcedSkipAction || effect.forcedAction || effect.controlLight) control.push(label);
    else if (effect.id?.includes("mark")) marks.push(label);
    else if (effect.outgoingDamageMultiplier || effect.shieldCurrentHp != null || effect.damageBoostPct) buffs.push(label);
    else if (effect.incomingDamageTakenMultiplier || effect.partialFailureChance || effect.speedMultiplier) debuffs.push(label);
  }

  for (const status of statuses) {
    const stacks = status?.stacks != null ? ` x${status.stacks}` : "";
    const rounds = status?.remainingRounds != null ? ` (${status.remainingRounds}r)` : "";
    const label = `${decorate(status.name || status.id || "Status")}${stacks}${rounds}`;
    if (status.damagePerStack > 0) dot.push(label);
    if (/mark|marca/i.test(status.name || status.id || "")) marks.push(label);
    if (/congel|stun|freeze|control|choque/i.test(status.name || status.id || "")) control.push(label);
    else if (/burn|poison|veneno|dot/i.test(status.name || status.id || "")) debuffs.push(label);
    else buffs.push(label);
  }
  const line = (title, values) => (values.length ? [`• ${title}: ${values.join(", ")}`] : []);
  return [
    ...line("Buffs", buffs),
    ...line("Debuffs", debuffs),
    ...line("Controle", control),
    ...line("Efeitos contínuos", dot),
    ...line("Marcas/Stacks", marks),
  ];
}

function withStatusEmoji(name) {
  const value = String(name || "");
  if (/burn|fogo|ardent|ígne|infernal/i.test(value)) return `🔥 ${value}`;
  if (/gelo|gelid|nevasca|congel/i.test(value)) return `❄️ ${value}`;
  if (/choque|eletro|sobrecarga|raio/i.test(value)) return `⚡ ${value}`;
  if (/barreira|armadura|defesa|shield|postura/i.test(value)) return `🛡️ ${value}`;
  if (/maldi|sombr|ghost|assombr/i.test(value)) return `👻 ${value}`;
  if (/raiz|floresta|espinho|grass/i.test(value)) return `🌿 ${value}`;
  if (/mark|marca/i.test(value)) return `🎯 ${value}`;
  return value;
}

function formatActionSummary(entry) {
  const actor = entry.actorName || "Ator";
  const skill = entry.skillName ? `${entry.skillIcon || "✨"} ${entry.skillName}` : "Ataque básico";
  const damageTypes = (entry.damageTypes || []).length ? ` | Tipos: ${(entry.damageTypes || []).join(", ")}` : "";
  const parts = [
    `Ação: *${actor}* usou *${skill}*${damageTypes}`,
    `Base: ${entry.baseDamage ?? 0}`,
    `Mods: ${(entry.modifiers || []).length ? entry.modifiers.join(" · ") : "—"}`,
  ];
  if (entry.extraDamage != null) parts.push(`Extra skill: ${entry.extraDamage}`);
  if (entry.mitigation != null) parts.push(`Mitigação: ${entry.mitigation}`);
  parts.push(`Crítico: ${entry.critical ? "sim" : "não"}`);
  parts.push(`Final: ${entry.finalDamage ?? 0}`);
  return parts.join(" | ");
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
  const hasElementalReady = elementalSkills.some((entry) => getSkillCooldownRemaining(currentPlayer, entry.id) <= 0);
  const magicOnCooldown = (currentPlayer?.magicCooldown?.blockedOwnTurnsRemaining || 0) > 0 && !hasElementalReady;
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
        label: magicOnCooldown ? `${buildActionLabel("magic")} (${currentPlayer.magicCooldown.blockedOwnTurnsRemaining})` : buildActionLabel("magic"),
        action: "magic",
        disabled: magicOnCooldown || !canUseAnySkill,
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
          return {
            type: "button",
            action_id: magicActionIdBuilder(magic.slot),
            text: { type: "plain_text", text: `${magic.icon || "✨"} ${magic.name}${magic.cooldownRemaining > 0 ? ` (${magic.cooldownRemaining})` : ""}`.slice(0, 75) },
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
  formatBattleLogForSlack,
  renderMagicOptions,
  renderSwitchOptions,
  renderMagicRegisterElementPrompt,
  renderBattleFinished,
};
