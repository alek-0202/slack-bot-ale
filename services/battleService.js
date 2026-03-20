const { extractMentionedUser } = require("../utils/helpers");
const { parsePositiveInt } = require("../utils/number");
const { createLogger } = require("../utils/logger");
const { getUserPokemonById } = require("./pokemonService");
const { getPokemonMagicLoadout } = require("./pokemonMagicService");
const { assertPokemonAvailableForAction, persistBattleHp } = require("./healingStationService");
const store = require("./battleStateStore");
const {
  createBattle,
  isBattleOpen,
  acceptInvite,
  declineInvite,
  getExpectedPickerId,
  assignSelectedPokemon,
  advanceSelectionState,
  startBattle,
} = require("../application/battle/domain/battleState");
const {
  BATTLE_ACTION,
  validateInviteDecision,
  validateSelection,
  validateTurnAction,
} = require("../application/battle/domain/actionResolver");
const { resolveBattleTurn } = require("../application/battle/domain/turnResolver");
const {
  renderBattleInvite,
  renderSelectionPrompt,
  renderBattleState,
  renderBattleFinished,
  renderMagicOptions,
} = require("./battleRenderService");

const logger = createLogger("battle-service");

async function startChallenge({ event, args, say }) {
  const challengedId = extractMentionedUser(args || "");

  if (!challengedId) {
    await say("Use `!b @player` para desafiar alguém.");
    return;
  }

  if (challengedId === event.user) {
    await say("❌ Você não pode desafiar a si mesmo.");
    return;
  }

  const existingInChannel = store.getBattle(event.channel);
  if (isBattleOpen(existingInChannel)) {
    await say("⚠️ Já existe uma batalha em andamento ou pendente neste canal.");
    return;
  }

  if (store.isUserInActiveBattle(event.user) || store.isUserInActiveBattle(challengedId)) {
    await say("⚠️ Um dos jogadores já está em batalha ativa. Finalize a batalha atual primeiro.");
    return;
  }

  const battle = createBattle({
    battleId: event.channel,
    channelId: event.channel,
    challengerId: event.user,
    challengedId,
    platform: "slack",
  });

  store.setBattle(event.channel, battle);
  logger.info("Desafio de batalha criado", {
    channel: event.channel,
    challengerId: event.user,
    challengedId,
  });

  await say(renderBattleInvite({
    challengerId: event.user,
    challengedId,
    channelId: event.channel,
  }));
}

async function decideInvite({ channelId, actorUserId, decision, say }) {
  const battle = store.getBattle(channelId);
  const validation = validateInviteDecision({ battle, actorUserId });

  if (!validation.ok) {
    if (validation.reason === "battle_not_pending") {
      await say("Não encontrei um convite de batalha pendente neste canal.");
      return;
    }

    await say(`Apenas <@${battle.challengedId}> pode responder este convite.`);
    return;
  }

  if (decision === "decline") {
    declineInvite(battle);
    store.setBattle(channelId, battle);
    logger.info("Desafio recusado", { channelId, actorUserId });
    await say(`❌ <@${battle.challengedId}> recusou o duelo de <@${battle.challengerId}>.`);
    return;
  }

  acceptInvite(battle);
  store.setBattle(channelId, battle);
  logger.info("Desafio aceito", { channelId, actorUserId });

  await say(renderSelectionPrompt({
    challengerId: battle.challengerId,
    challengedId: battle.challengedId,
  }));
}

async function pickPokemon({ event, args, say }) {
  const battle = store.getBattle(event.channel);
  const validation = validateSelection({ battle, actorUserId: event.user });

  if (!validation.ok) {
    if (validation.reason === "battle_not_found") {
      await say("Não existe batalha ativa neste canal. Use `!b @player`.");
      return;
    }

    if (validation.reason === "selection_not_active") {
      await say("A seleção de Pokémon não está ativa agora.");
      return;
    }

    if (validation.reason === "actor_not_in_battle") {
      await say("Você não participa desta batalha.");
      return;
    }

    await say(`Aguardando escolha de <@${validation.expectedUserId}>.`);
    return;
  }

  const pokemonId = parsePositiveInt(args);
  if (!pokemonId) {
    await say("Use `!bpick ID` com um ID válido da sua pokédex.");
    return;
  }

  const pokemon = await getUserPokemonById(event.user, pokemonId);
  if (!pokemon) {
    await say("Pokémon inválido ou que não pertence a você.");
    return;
  }

  const availability = await assertPokemonAvailableForAction({ slackUserId: event.user, pokemonId, action: "battle" });
  if (!availability.ok) {
    await say("Esse Pokémon está na estação de cura e não pode batalhar agora.");
    return;
  }

  if (Number(pokemon.current_hp) <= 0) {
    await say("Esse Pokémon está sem HP e precisa passar pela estação de cura.");
    return;
  }

  const loadout = await getPokemonMagicLoadout(pokemonId);
  pokemon.magicSlots = Array.isArray(loadout?.spells) ? loadout.spells : [];
  assignSelectedPokemon(battle, event.user, pokemon);

  logger.info("Pokémon selecionado para batalha", {
    channel: event.channel,
    userId: event.user,
    pokemonId,
    magicSlots: pokemon.magicSlots.length,
  });

  const expectedPickerId = getExpectedPickerId(battle);
  advanceSelectionState(battle);
  store.setBattle(event.channel, battle);

  if (expectedPickerId === battle.challengerId) {
    await say(
      `✅ <@${event.user}> escolheu *${battle.players[event.user].selectedPokemon.name}* (ID ${pokemonId}).\n` +
      `Agora <@${battle.challengedId}> deve escolher com \`!bpick ID\`.`,
    );
    return;
  }

  const { result, starter } = finalizeSelectionAndStartBattle(battle, event.channel);

  logger.info("Coin flip da batalha", {
    channel: event.channel,
    result,
    starter,
    challengerId: battle.challengerId,
    challengedId: battle.challengedId,
  });

  await say(
    `🪙 Cara ou Coroa para primeiro turno: resultado *${result.toUpperCase()}*.\n` +
    `👤 <@${battle.challengerId}> = cara | <@${battle.challengedId}> = coroa.\n` +
    `🎯 Primeiro turno: <@${starter}>`,
  );
  await say(renderBattleState(battle));
}

function finalizeSelectionAndStartBattle(battle, channelId) {
  const { coinflip: result, starter } = startBattle(battle);
  store.setBattle(channelId, battle);
  return { result, starter };
}

async function persistBattleResultHp(battle) {
  for (const [userId, player] of Object.entries(battle.players || {})) {
    if (!player?.selectedPokemon?.id || !player?.battleHp) continue;
    await persistBattleHp({
      slackUserId: userId,
      pokemonId: player.selectedPokemon.id,
      hpStat: player.stats?.hp,
      battleHpCurrent: player.battleHp.current,
      battleHpMax: player.battleHp.max,
    });
  }
}

async function validateActionContext({ event, say, actionType }) {
  const battle = store.getBattle(event.channel);
  const validation = validateTurnAction({
    battle,
    actorUserId: event.user,
    actionType,
  });

  if (!validation.ok) {
    if (validation.reason === "battle_not_found") {
      await say("Não existe batalha neste canal.");
      return null;
    }

    if (validation.reason === "battle_not_active") {
      await say("A batalha não está ativa neste momento.");
      return null;
    }

    if (validation.reason === "actor_not_in_battle") {
      await say("Você não participa dessa batalha.");
      return null;
    }

    if (validation.reason === "not_actor_turn") {
      await say(`Não é seu turno. Agora é a vez de <@${validation.currentTurnUserId}>.`);
      return null;
    }

    await say("Ação de batalha inválida para o estado atual.");
    return null;
  }

  return battle;
}

async function attack({ event, say }) {
  const battle = await validateActionContext({ event, say, actionType: BATTLE_ACTION.ATTACK });
  if (!battle) return;

  const resolution = resolveBattleTurn({
    battle,
    actorUserId: event.user,
    actionType: BATTLE_ACTION.ATTACK,
  });
  const result = resolution.outcome;

  logger.info("Ação de ataque", {
    channelId: battle.channelId,
    attackerId: event.user,
    defenderId: result.defenderId,
    damage: result.finalDamage,
    critical: result.isCritical,
    d6: result.d6Roll,
    d20: result.d20Roll,
    speedContext: result.turnFlow || null,
  });

  store.setBattle(battle.channelId, battle);

  if (resolution.finished) {
    await persistBattleResultHp(battle);
  }

  await say(
    `⚔️ <@${event.user}> atacou <@${result.defenderId}>!\n` +
    `🎲 d6: ${result.d6Roll} | d20: ${result.d20Roll}\n` +
    `${result.isCritical ? "💥 CRÍTICO!\n" : ""}` +
    `Dano final: *${result.finalDamage}*\n` +
    `HP restante de <@${result.defenderId}>: *${result.defenderRemainingHp}/${battle.players[result.defenderId].battleHp.max}*`,
  );

  if (resolution.finished) {
    logger.info("Batalha encerrada", {
      channelId: battle.channelId,
      winnerId: resolution.finalized.winnerId,
      loserId: resolution.finalized.loserId,
    });
    await say(renderBattleFinished(resolution.finalized));
    return;
  }

  await say(renderBattleState(battle));
}

async function usePotion({ event, say }) {
  const battle = await validateActionContext({ event, say, actionType: BATTLE_ACTION.POTION });
  if (!battle) return;

  const resolution = resolveBattleTurn({
    battle,
    actorUserId: event.user,
    actionType: BATTLE_ACTION.POTION,
  });
  const result = resolution.outcome;

  if (!result.ok) {
    if (result.reason === "limit") {
      await say("❌ Você já usou o máximo de 5 poções nesta batalha.");
      return;
    }

    if (result.reason === "full_hp") {
      await say("💚 Seu Pokémon já está com HP cheio.");
      return;
    }
  }

  logger.info("Uso de poção", {
    channelId: battle.channelId,
    userId: event.user,
    healAmount: result.healAmount,
    remainingPotions: result.remainingPotions,
    speedContext: result.turnFlow || null,
  });

  store.setBattle(battle.channelId, battle);

  await say(
    `🧪 <@${event.user}> usou poção e curou *${result.healAmount}* HP.\n` +
    `HP atual: *${result.currentHp}/${battle.players[event.user].battleHp.max}*\n` +
    `Poções restantes: *${result.remainingPotions}*`,
  );

  await say(renderBattleState(battle));
}

async function showMagicOptions({ event, say }) {
  const battle = await validateActionContext({ event, say, actionType: BATTLE_ACTION.MAGIC });
  if (!battle) return;

  const player = battle.players[event.user];
  if (!player.magicSlots?.length) {
    await say("✨ Seu Pokémon atual não possui magias registradas. Use `!magicregister <pokeid>` antes da batalha.");
    return;
  }

  if ((player.magicCooldown?.blockedOwnTurnsRemaining || 0) > 0) {
    logger.info("Tentativa de abrir magia durante cooldown", {
      playerId: event.user,
      battleId: battle.id,
      channelId: battle.channelId,
      blockedOwnTurnsRemaining: player.magicCooldown.blockedOwnTurnsRemaining,
      lastMagicName: player.magicCooldown?.lastMagicName || null,
    });
    await say(
      `⏳ Sua magia está em cooldown por mais *${player.magicCooldown.blockedOwnTurnsRemaining}* rodada(s) sua(s).`,
    );
    return;
  }

  await say(renderMagicOptions({ battle, actorUserId: event.user, magicSlots: player.magicSlots }));
}

async function castMagic({ event, say, magicSlot }) {
  const battle = await validateActionContext({ event, say, actionType: BATTLE_ACTION.MAGIC });
  if (!battle) return;

  const resolution = resolveBattleTurn({
    battle,
    actorUserId: event.user,
    actionType: BATTLE_ACTION.MAGIC,
    actionPayload: { magicSlot },
  });
  const result = resolution.outcome;

  if (!result.ok && result.reason === "magic_not_found") {
    await say("✨ Não encontrei essa magia no loadout do Pokémon atual.");
    return;
  }

  if (!result.ok && result.reason === "magic_on_cooldown") {
    logger.info("Tentativa de magia bloqueada por cooldown", {
      playerId: event.user,
      battleId: battle.id,
      channelId: battle.channelId,
      blockedOwnTurnsRemaining: result.blockedOwnTurnsRemaining,
      magicName: result.magicName,
    });
    await say(
      `⏳ Você ainda não pode usar magia. Faltam *${result.blockedOwnTurnsRemaining}* rodada(s) sua(s) antes de liberar novamente.`,
    );
    return;
  }

  logger.info("Ação de magia", {
    pokemonId: battle.players[event.user]?.selectedPokemon?.id,
    battleId: battle.id,
    channelId: battle.channelId,
    actorUserId: event.user,
    magicName: result.magicEntry?.name,
    magicElement: result.magicEntry?.element,
    targetUserId: result.defenderId,
    cooldownApplied: battle.players[event.user]?.magicCooldown?.blockedOwnTurnsRemaining || 0,
    baseStatUsed: result.baseStatUsed,
    magicStat: result.magicStat,
    attackStat: result.attackStat,
    d12Roll: result.primaryRollValue,
    d6Roll: result.bonusRollValue,
    attackBonusBase: result.attackBonusBase,
    critical: result.isCritical,
    elementalRelation: result.elemental?.relation,
    advantageAgainst: result.elemental?.advantageAgainst,
    disadvantagedAgainst: result.elemental?.disadvantagedAgainst,
    finalDamage: result.finalDamage,
    energyConsumed: result.energyConsumed,
    speedContext: result.turnFlow || null,
  });

  store.setBattle(battle.channelId, battle);

  if (resolution.finished) {
    await persistBattleResultHp(battle);
  }

  const relationMessage = result.elemental?.hasAdvantage
    ? `🌟 Vantagem elemental contra: ${result.elemental.advantageAgainst.join(", ")}\n`
    : result.elemental?.hasDisadvantage
      ? `⚠️ Desvantagem elemental contra: ${result.elemental.disadvantagedAgainst.join(", ")}\n`
      : "";

  await say(
    `✨ <@${event.user}> lançou *${result.magicEntry.name}* ${result.magicEntry.icon} em <@${result.defenderId}>!\n` +
    `🎲 d12: ${result.primaryRollValue} | d6 bônus: ${result.bonusRollValue}\n` +
    `🧠 Base: *${result.baseStatUsed.toUpperCase()}* (${result.magicStat}) | bônus ataque 15%: *${result.attackBonusBase}*\n` +
    `${result.isCritical ? "💥 CRÍTICO MÁGICO GARANTIDO!\n" : ""}` +
    relationMessage +
    `Multiplicador: *x${result.multiplier}* | Energia consumida: *${result.energyConsumed}*\n` +
    `Dano final: *${result.finalDamage}*\n` +
    `HP restante de <@${result.defenderId}>: *${result.defenderRemainingHp}/${battle.players[result.defenderId].battleHp.max}*`,
  );

  if (resolution.finished) {
    await say(renderBattleFinished(resolution.finalized));
    return;
  }

  await say(renderBattleState(battle));
}

async function defendPlaceholder({ event, say }) {
  const battle = await validateActionContext({ event, say, actionType: BATTLE_ACTION.DEFENSE });
  if (!battle) return;
  await say("🛡️ A mecânica de defesa ainda está em desenvolvimento e será liberada em breve.");
}

function buildBattleHelp() {
  return (
    "📘 *Battle Help*\n" +
    "• Desafio: `!b @player`\n" +
    "• O desafiado aceita/recusa no botão do convite\n" +
    "• Após aceitar, escolha seu Pokémon com `!bpick ID` (ID da sua Pokédex)\n" +
    "• Primeiro turno é definido por cara ou coroa:\n" +
    "  - Player 1 (desafiante): *cara*\n" +
    "  - Player 2 (desafiado): *coroa*\n" +
    "• Ações principais no turno: `!ataque`, `!defesa`, `!magia`, `!pocao`\n" +
    "• `!magia` abre as magias registradas do Pokémon atual\n" +
    "• Apenas o jogador do turno pode agir\n" +
    "• Botões da batalha seguem as mesmas regras dos comandos textuais"
  );
}

module.exports = {
  startChallenge,
  decideInvite,
  pickPokemon,
  attack,
  usePotion,
  showMagicOptions,
  castMagic,
  defendPlaceholder,
  buildBattleHelp,
};
