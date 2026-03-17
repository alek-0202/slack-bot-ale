const { extractMentionedUser } = require("../utils/helpers");
const { parsePositiveInt } = require("../utils/number");
const { createLogger } = require("../utils/logger");
const { getUserPokemonById } = require("./pokemonService");
const store = require("./battleStateStore");
const {
  calculateBattleHp,
  decideStartingPlayer,
  resolveAttackTurn,
  resolvePotionTurn,
} = require("./battleEngineService");
const {
  renderBattleInvite,
  renderSelectionPrompt,
  renderBattleState,
  renderBattleFinished,
} = require("./battleRenderService");

const logger = createLogger("battle-service");

function createPlayerState(userId) {
  return {
    userId,
    selectedPokemon: null,
    stats: null,
    battleHp: null,
    potionsUsed: 0,
    magicCooldown: 0,
  };
}

function createBattle({ channelId, challengerId, challengedId }) {
  return {
    channelId,
    challengerId,
    challengedId,
    status: "pending",
    inviteStatus: "pending",
    selectionStatus: "waiting_challenger",
    currentTurnUserId: null,
    round: 0,
    startedAt: null,
    finishedAt: null,
    players: {
      [challengerId]: createPlayerState(challengerId),
      [challengedId]: createPlayerState(challengedId),
    },
  };
}

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
  if (existingInChannel && ["pending", "selecting", "active"].includes(existingInChannel.status)) {
    await say("⚠️ Já existe uma batalha em andamento ou pendente neste canal.");
    return;
  }

  if (store.isUserInActiveBattle(event.user) || store.isUserInActiveBattle(challengedId)) {
    await say("⚠️ Um dos jogadores já está em batalha ativa. Finalize a batalha atual primeiro.");
    return;
  }

  const battle = createBattle({
    channelId: event.channel,
    challengerId: event.user,
    challengedId,
  });

  store.setBattle(event.channel, battle);
  logger.info("Desafio de batalha criado", {
    channel: event.channel,
    challengerId: event.user,
    challengedId,
  });

  const invite = renderBattleInvite({
    challengerId: event.user,
    challengedId,
    channelId: event.channel,
  });

  await say(invite);
}

async function decideInvite({ channelId, actorUserId, decision, say }) {
  const battle = store.getBattle(channelId);
  if (!battle || battle.status !== "pending") {
    await say("Não encontrei um convite de batalha pendente neste canal.");
    return;
  }

  if (actorUserId !== battle.challengedId) {
    await say(`Apenas <@${battle.challengedId}> pode responder este convite.`);
    return;
  }

  if (decision === "decline") {
    battle.status = "declined";
    battle.inviteStatus = "declined";
    store.setBattle(channelId, battle);
    logger.info("Desafio recusado", { channelId, actorUserId });
    await say(`❌ <@${battle.challengedId}> recusou o duelo de <@${battle.challengerId}>.`);
    return;
  }

  battle.status = "selecting";
  battle.inviteStatus = "accepted";
  battle.selectionStatus = "waiting_challenger";
  store.setBattle(channelId, battle);
  logger.info("Desafio aceito", { channelId, actorUserId });

  await say(renderSelectionPrompt({
    challengerId: battle.challengerId,
    challengedId: battle.challengedId,
  }));
}

async function pickPokemon({ event, args, say }) {
  const battle = store.getBattle(event.channel);
  if (!battle) {
    await say("Não existe batalha ativa neste canal. Use `!b @player`.");
    return;
  }

  if (battle.status !== "selecting") {
    await say("A seleção de Pokémon não está ativa agora.");
    return;
  }

  if (![battle.challengerId, battle.challengedId].includes(event.user)) {
    await say("Você não participa desta batalha.");
    return;
  }

  const shouldPickNow = battle.selectionStatus === "waiting_challenger"
    ? battle.challengerId
    : battle.challengedId;

  if (event.user !== shouldPickNow) {
    await say(`Aguardando escolha de <@${shouldPickNow}>.`);
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

  const playerState = battle.players[event.user];
  playerState.selectedPokemon = {
    id: pokemon.id,
    speciesId: pokemon.species_id,
    name: pokemon.pokemon_species?.name || `Pokémon #${pokemon.species_id}`,
    level: pokemon.level,
    spriteUrl: pokemon.pokemon_species?.sprite_url || null,
    baseHp: Number(pokemon.hp) || 1,
  };
  playerState.stats = {
    attack: Number(pokemon.attack) || 1,
    defense: Number(pokemon.defense) || 0,
    hp: Number(pokemon.hp) || 1,
  };
  const hpMax = calculateBattleHp(playerState.stats.hp);
  playerState.battleHp = {
    base: playerState.stats.hp,
    max: hpMax,
    current: hpMax,
  };

  logger.info("Pokémon selecionado para batalha", {
    channel: event.channel,
    userId: event.user,
    pokemonId,
  });

  if (battle.selectionStatus === "waiting_challenger") {
    battle.selectionStatus = "waiting_challenged";
    store.setBattle(event.channel, battle);
    await say(
      `✅ <@${event.user}> escolheu *${playerState.selectedPokemon.name}* (ID ${pokemonId}).\n` +
      `Agora <@${battle.challengedId}> deve escolher com \`!bpick ID\`.`,
    );
    return;
  }

  const { result, starter } = decideStartingPlayer(battle.challengerId, battle.challengedId);
  battle.currentTurnUserId = starter;
  battle.round = 1;
  battle.status = "active";
  battle.startedAt = new Date().toISOString();
  store.setBattle(event.channel, battle);

  logger.info("Coin flip da batalha", {
    channel: event.channel,
    result,
    starter,
    challengerId: battle.challengerId,
    challengedId: battle.challengedId,
  });

  const card = renderBattleState(battle);
  await say(
    `🪙 Cara ou Coroa para primeiro turno: resultado *${result.toUpperCase()}*.\n` +
    `👤 <@${battle.challengerId}> = cara | <@${battle.challengedId}> = coroa.\n` +
    `🎯 Primeiro turno: <@${starter}>`,
  );
  await say(card);
}

async function validateActionContext({ event, say }) {
  const battle = store.getBattle(event.channel);
  if (!battle) {
    await say("Não existe batalha neste canal.");
    return null;
  }

  if (battle.status !== "active") {
    await say("A batalha não está ativa neste momento.");
    return null;
  }

  if (![battle.challengerId, battle.challengedId].includes(event.user)) {
    await say("Você não participa dessa batalha.");
    return null;
  }

  if (event.user !== battle.currentTurnUserId) {
    await say(`Não é seu turno. Agora é a vez de <@${battle.currentTurnUserId}>.`);
    return null;
  }

  return battle;
}

function getOpponentId(battle, actorId) {
  return actorId === battle.challengerId ? battle.challengedId : battle.challengerId;
}

function finishBattleIfNeeded({ battle, say }) {
  const challengerState = battle.players[battle.challengerId];
  const challengedState = battle.players[battle.challengedId];

  if (challengerState.battleHp.current > 0 && challengedState.battleHp.current > 0) {
    return false;
  }

  const winnerId = challengerState.battleHp.current > 0 ? battle.challengerId : battle.challengedId;
  const loserId = winnerId === battle.challengerId ? battle.challengedId : battle.challengerId;

  battle.status = "finished";
  battle.finishedAt = new Date().toISOString();
  store.setBattle(battle.channelId, battle);

  logger.info("Batalha encerrada", { channelId: battle.channelId, winnerId, loserId });
  say(renderBattleFinished({ winnerId, loserId }));
  return true;
}

function passTurn(battle) {
  battle.currentTurnUserId = getOpponentId(battle, battle.currentTurnUserId);
  battle.round += 1;
  store.setBattle(battle.channelId, battle);
}

async function attack({ event, say }) {
  const battle = await validateActionContext({ event, say });
  if (!battle) return;

  const attacker = battle.players[event.user];
  const defenderId = getOpponentId(battle, event.user);
  const defender = battle.players[defenderId];

  const result = resolveAttackTurn({ attacker, defender });
  logger.info("Ação de ataque", {
    channelId: battle.channelId,
    attackerId: event.user,
    defenderId,
    damage: result.finalDamage,
    critical: result.isCritical,
    d6: result.d6Roll,
    d20: result.d20Roll,
  });

  await say(
    `⚔️ <@${event.user}> atacou <@${defenderId}>!\n` +
    `🎲 d6: ${result.d6Roll} | d20: ${result.d20Roll}\n` +
    `${result.isCritical ? "💥 CRÍTICO!\n" : ""}` +
    `Dano final: *${result.finalDamage}*\n` +
    `HP restante de <@${defenderId}>: *${result.defenderRemainingHp}/${defender.battleHp.max}*`,
  );

  if (finishBattleIfNeeded({ battle, say })) return;

  passTurn(battle);
  await say(renderBattleState(battle));
}

async function usePotion({ event, say }) {
  const battle = await validateActionContext({ event, say });
  if (!battle) return;

  const player = battle.players[event.user];
  const result = resolvePotionTurn(player);

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
  });

  await say(
    `🧪 <@${event.user}> usou poção e curou *${result.healAmount}* HP.\n` +
    `HP atual: *${result.currentHp}/${player.battleHp.max}*\n` +
    `Poções restantes: *${result.remainingPotions}*`,
  );

  passTurn(battle);
  await say(renderBattleState(battle));
}

async function magicPlaceholder({ event, say }) {
  const battle = store.getBattle(event.channel);
  if (!battle || battle.status !== "active") {
    await say("✨ O sistema de magia ainda está em desenvolvimento e será liberado em breve.");
    return;
  }

  if (![battle.challengerId, battle.challengedId].includes(event.user)) {
    await say("Você não participa dessa batalha.");
    return;
  }

  if (event.user !== battle.currentTurnUserId) {
    await say(`Não é seu turno. Agora é a vez de <@${battle.currentTurnUserId}>.`);
    return;
  }

  await say("✨ O sistema de magia ainda está em desenvolvimento e será liberado em breve.");
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
    "• Comandos durante a batalha: `!ataque`, `!pocao`, `!magia`\n" +
    "• `!magia` ainda está em desenvolvimento\n" +
    "• Apenas o jogador do turno pode agir"
  );
}

module.exports = {
  startChallenge,
  decideInvite,
  pickPokemon,
  attack,
  usePotion,
  magicPlaceholder,
  buildBattleHelp,
};
