const { getAvailableMagicActions, getSkillCooldownRemaining } = require("../../../application/battle/domain/elementalRules");
const {
  renderBattleState,
  renderMagicOptions,
} = require('./battleRenderer');

const DUNGEON_SELECT_POKEMON_ACTION_ID = 'dungeon_select_pokemon';
const DUNGEON_SELECT_MODE_ACTION_ID = 'dungeon_select_mode';
const DUNGEON_START_FARM_ACTION_ID = 'dungeon_start_farm';
const DUNGEON_START_DAILY_ACTION_ID = 'dungeon_start_daily';
const DUNGEON_BATTLE_TURN_ACTION_ID = 'dungeon_battle_turn_action';
const DUNGEON_BATTLE_MAGIC_ACTION_ID = 'dungeon_battle_magic_action';
const DUNGEON_BATTLE_MAGIC_CANCEL_ACTION_ID = 'dungeon_battle_magic_cancel';
const DUNGEON_REWARD_EMOJI = {
  gold: '💰',
  xp: '✨',
  essence: '🧬',
  item: '📚',
  pokemon: '🎁',
};

function buildIndexedActionId(baseActionId, suffix) {
  return `${baseActionId}_${suffix}`;
}

function buildActionValue(payload) {
  return JSON.stringify(payload);
}

function buildRows(elements, perRow = 5) {
  const rows = [];
  for (let index = 0; index < elements.length; index += perRow) {
    rows.push({ type: 'actions', elements: elements.slice(index, index + perRow) });
  }
  return rows;
}

function buildPokemonLabel(pokemon) {
  const speciesName = pokemon.pokemon_species?.name || pokemon.speciesName || 'Pokémon';
  const level = Number(pokemon.level) || 1;
  const hp = Number(pokemon.current_hp) || 0;
  const maxHp = Number(pokemon.hp) || 0;
  const shiny = pokemon.shiny ? '✨ ' : '';
  return `${shiny}#${pokemon.id} ${speciesName} Lv${level} HP ${hp}/${maxHp}`.slice(0, 75);
}

function buildDungeonTurnActionId(action) {
  return `${DUNGEON_BATTLE_TURN_ACTION_ID}_${action}`;
}

function buildDungeonMagicActionId(slot) {
  return `${DUNGEON_BATTLE_MAGIC_ACTION_ID}_${slot}`;
}

function buildDungeonBattleContextText(battle) {
  const metadata = battle.metadata || {};
  const modeLabel = metadata.dungeonType === 'daily'
    ? `Diária ${metadata.dailyMode === 'hard' ? 'Difícil' : 'Normal'}`
    : `Farm Lv ${metadata.dungeonLevel}`;
  const enemy = battle.players[battle.challengedId]?.selectedPokemon;
  return `🏰 *Dungeon ${modeLabel}*\n👾 Inimigo: *${enemy?.name || 'Inimigo'}* (Lv ${enemy?.level || 1})\n🎯 Você joga com os mesmos turnos, magias e cooldowns do PvP.`;
}

function renderDungeonPokemonSelection({ slackUserId, pokemons = [] }) {
  const text = pokemons.length
    ? 'Escolha primeiro o Pokémon que vai entrar na dungeon.'
    : 'Você não tem Pokémon elegível para dungeon agora.';

  const buttons = pokemons.slice(0, 25).map((pokemon) => ({
    type: 'button',
    text: { type: 'plain_text', text: buildPokemonLabel(pokemon), emoji: true },
    action_id: buildIndexedActionId(DUNGEON_SELECT_POKEMON_ACTION_ID, pokemon.id),
    value: buildActionValue({ slackUserId, pokemonId: pokemon.id }),
  }));

  return {
    text: `Dungeon de ${slackUserId}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏰 Dungeon', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Treinador:* <@${slackUserId}>\n${text}` } },
      ...(buttons.length ? buildRows(buttons) : []),
      ...(!buttons.length ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: 'Verifique se seu Pokémon não está na heal station, com HP zerado ou em outra batalha.' }] }] : []),
    ],
  };
}

function renderDungeonModeSelection({ slackUserId, pokemon }) {
  const speciesName = pokemon.pokemon_species?.name || 'Pokémon';
  return {
    text: `Modo de dungeon para #${pokemon.id}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏰 Dungeon — escolher modo', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Treinador:* <@${slackUserId}>\n*Pokémon:* *${speciesName}* (#${pokemon.id}) • Lv ${pokemon.level} • ❤️ ${pokemon.current_hp}/${pokemon.hp}` } },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Farm', emoji: true }, action_id: buildIndexedActionId(DUNGEON_SELECT_MODE_ACTION_ID, 'farm'), style: 'primary', value: buildActionValue({ slackUserId, pokemonId: pokemon.id, mode: 'farm' }) },
          { type: 'button', text: { type: 'plain_text', text: 'Diária (manutenção)', emoji: true }, action_id: buildIndexedActionId(DUNGEON_SELECT_MODE_ACTION_ID, 'daily'), value: buildActionValue({ slackUserId, pokemonId: pokemon.id, mode: 'daily' }) },
        ],
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'ℹ️ Dungeon diária em manutenção temporária.' }] },
    ],
  };
}

function renderDungeonFarmSelection({ slackUserId, pokemon, farmLevels = [] }) {
  const buttons = farmLevels.map((level) => ({
    type: 'button',
    text: { type: 'plain_text', text: `Nível ${level}`, emoji: true },
    action_id: buildIndexedActionId(DUNGEON_START_FARM_ACTION_ID, level),
    value: buildActionValue({ slackUserId, pokemonId: pokemon.id, level }),
  }));

  return {
    text: `Farm dungeon para #${pokemon.id}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏰 Dungeon Farm — escolher sala', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Pokémon selecionado:* *${pokemon.pokemon_species?.name || 'Pokémon'}* (#${pokemon.id})\nEscolha a sala da Farm.` } },
      ...buildRows(buttons),
    ],
  };
}

function renderDungeonDailySelection({ slackUserId, pokemon }) {
  return {
    text: `Daily dungeon para #${pokemon.id}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏰 Dungeon Diária — escolher dificuldade', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Pokémon selecionado:* *${pokemon.pokemon_species?.name || 'Pokémon'}* (#${pokemon.id})\nEscolha a dificuldade da diária.` } },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Normal', emoji: true }, action_id: buildIndexedActionId(DUNGEON_START_DAILY_ACTION_ID, 'normal'), style: 'primary', value: buildActionValue({ slackUserId, pokemonId: pokemon.id, difficulty: 'normal' }) },
          { type: 'button', text: { type: 'plain_text', text: 'Difícil', emoji: true }, action_id: buildIndexedActionId(DUNGEON_START_DAILY_ACTION_ID, 'hard'), value: buildActionValue({ slackUserId, pokemonId: pokemon.id, difficulty: 'hard' }) },
        ],
      },
    ],
  };
}

function renderDungeonError({ slackUserId, text }) {
  return {
    text,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '⚠️ Dungeon indisponível', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Treinador:* <@${slackUserId}>\n${text}` } },
    ],
  };
}

function renderDungeonBattleState(battle) {
  const playerUserId = battle.metadata?.slackUserId || battle.challengerId;
  const payload = renderBattleState(battle, {
    title: '🏰 *Batalha de Dungeon*',
    stateTextPrefix: '🏰 Dungeon em andamento',
    logTitle: '📜 Log da dungeon',
    battleContextText: buildDungeonBattleContextText(battle),
    statusTooltipMode: 'emoji',
    turnActionIdBuilder: buildDungeonTurnActionId,
    shouldShowActions: ({ battle: currentBattle }) => currentBattle.status === 'active' && currentBattle.currentTurnUserId === playerUserId,
    waitingTextBuilder: ({ battle: currentBattle }) => currentBattle.status === 'active' && currentBattle.currentTurnUserId !== playerUserId
      ? '⏳ Turno automático do inimigo em resolução. Os botões voltam quando a vez retornar para você.'
      : null,
  });

  return payload;
}

function renderDungeonMagicOptions({ battle, actorUserId, magicSlots = [] }) {
  const player = battle.players?.[actorUserId] || {};
  const actions = getAvailableMagicActions(player).map((entry) => ({
    ...entry,
    cooldownRemaining: entry.kind === "elemental" ? getSkillCooldownRemaining(player, entry.id) : 0,
  }));
  const payload = renderMagicOptions({
    battle,
    actorUserId,
    magicSlots: actions.length ? actions : magicSlots,
    options: {
      title: '🏰 *Escolha uma magia da dungeon*',
      magicActionIdBuilder: buildDungeonMagicActionId,
      battleContextText: buildDungeonBattleContextText(battle),
    },
  });

  payload.blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: DUNGEON_BATTLE_MAGIC_CANCEL_ACTION_ID,
        text: { type: 'plain_text', text: '⬅️ Voltar' },
        value: buildActionValue({ channelId: battle.channelId }),
      },
    ],
  });

  return payload;
}

function buildRewardLines(result) {
  const lines = [];
  if (result?.rewards?.goldReward) lines.push(`${DUNGEON_REWARD_EMOJI.gold} Gold: +${result.rewards.goldReward}`);
  if (result?.rewards?.xpResult?.grantedXp != null) lines.push(`${DUNGEON_REWARD_EMOJI.xp} XP da conta: +${result.rewards.xpResult.grantedXp}`);
  if (result?.battle?.metadata?.reward?.pokemonEssenceQty) lines.push(`${DUNGEON_REWARD_EMOJI.essence} Essência Pokémon: +${result.battle.metadata.reward.pokemonEssenceQty}`);
  if (result?.rewards?.items?.length) {
    for (const item of result.rewards.items) {
      lines.push(`${DUNGEON_REWARD_EMOJI.item} ${item.itemName || item.item_name || 'Item'}: +${item.quantity || 0}`);
    }
  }
  const speciesName = result?.capturedSpecies?.name || result?.rewards?.captured?.pokemon_species?.name;
  if (speciesName) lines.push(`${DUNGEON_REWARD_EMOJI.pokemon} Pokémon recebido: *${speciesName}*`);
  if (result?.rewards?.xpResult?.leveledUp) {
    const xpResult = result.rewards.xpResult;
    const currentLevel = xpResult.current?.level || xpResult.current_level;
    const rewardParts = [];
    if (Number(xpResult.goldRewardGranted || 0) > 0) rewardParts.push(`💰 +${xpResult.goldRewardGranted} gold`);
    if (Number(xpResult.pokeballCGranted || 0) > 0) rewardParts.push(`🧿 +${xpResult.pokeballCGranted} Pokebola (!c)`);
    lines.push(`🆙 Você subiu para o nível *${currentLevel}*.`);
    if (rewardParts.length) lines.push(`🎁 Recompensas de nível: ${rewardParts.join(' | ')}`);
  }
  return lines;
}

function renderDungeonBattleFinished({ battle, completion }) {
  const playerId = battle.metadata?.slackUserId || battle.challengerId;
  const modeLabel = battle.metadata?.dungeonType === 'daily'
    ? `Dungeon Diária ${battle.metadata?.dailyMode === 'hard' ? 'Difícil' : 'Normal'}`
    : `Dungeon Farm Lv ${battle.metadata?.dungeonLevel}`;

  if (completion?.outcome === 'victory') {
    const lines = [`🏆 <@${playerId}> venceu a *${modeLabel}*!`, ...buildRewardLines(completion)];
    return {
      text: `🏆 <@${playerId}> venceu a dungeon!`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '🏆 Dungeon concluída', emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      ],
    };
  }

  return {
    text: `💀 <@${playerId}> foi derrotado na dungeon.`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '💀 Dungeon encerrada', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `💀 <@${playerId}> foi derrotado na *${modeLabel}*.\nSeu HP persistido já foi salvo.` } },
    ],
  };
}

module.exports = {
  DUNGEON_SELECT_POKEMON_ACTION_ID,
  DUNGEON_SELECT_MODE_ACTION_ID,
  DUNGEON_START_FARM_ACTION_ID,
  DUNGEON_START_DAILY_ACTION_ID,
  DUNGEON_BATTLE_TURN_ACTION_ID,
  DUNGEON_BATTLE_MAGIC_ACTION_ID,
  DUNGEON_BATTLE_MAGIC_CANCEL_ACTION_ID,
  buildActionValue,
  buildIndexedActionId,
  buildDungeonTurnActionId,
  buildDungeonMagicActionId,
  renderDungeonPokemonSelection,
  renderDungeonModeSelection,
  renderDungeonFarmSelection,
  renderDungeonDailySelection,
  renderDungeonError,
  renderDungeonBattleState,
  renderDungeonMagicOptions,
  renderDungeonBattleFinished,
};
