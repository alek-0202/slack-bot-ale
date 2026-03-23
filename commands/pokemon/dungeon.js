const { getDungeonFarmList, getFarmReward, startFarmDungeon, startDailyDungeon } = require('../../services/dungeonService');
const { handleDungeonCommand } = require('../../handlers/dungeonActions');

function buildMenu() {
  const farmLines = getDungeonFarmList().map((level) => {
    const reward = getFarmReward(level);
    return `• Farm Lv ${level} → ${reward.gold} gold / ${reward.accountXp} XP / ${reward.ancientBookQty} Livro Ancião`;
  });
  return [
    '🏰 *Dungeon*',
    '',
    '*Fluxo interativo*',
    '1. `!dungeon`',
    '2. Escolha o Pokémon nos botões',
    '3. Escolha Farm ou Diária',
    '4. Escolha a sala/dificuldade e a dungeon começa automaticamente',
    '',
    '*Compatibilidade legada*',
    '• `!dungeon farm <nível> <pokemon_id>`',
    '• `!dungeon daily normal|hard <pokemon_id>`',
    '',
    '*Farm disponíveis*',
    ...farmLines,
    '',
    '*Diária*',
    '• Normal → 3000 gold / 500 XP + 1 Pokémon aleatório',
    '• Hard → 5000 gold / 1500 XP + 1 Pokémon aleatório',
  ].join('\n');
}

module.exports = {
  name: 'dungeon',
  async execute({ event, say, args }) {
    const parts = String(args || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      await handleDungeonCommand({ event, say });
      return;
    }

    if (parts[0] === 'farm') {
      const level = Number(parts[1]);
      const pokemonId = Number(parts[2]);
      const result = await startFarmDungeon({ slackUserId: event.user, level, pokemonId });
      if (!result.ok) {
        await say(`❌ Não foi possível iniciar a dungeon farm. Motivo: *${result.reason}*.`);
        return;
      }
      const text = [
        `🏆 <@${event.user}> concluiu a *Dungeon Farm Lv ${result.level}*!`,
        `💰 Gold: +${result.rewards.goldReward}`,
        `✨ XP da conta: +${result.rewards.xpResult.grantedXp}`,
        `📚 Livro Ancião: +${result.rewards.items[0]?.quantity || getFarmReward(result.level).ancientBookQty}`,
        result.rewards.xpResult.leveledUp ? `🆙 Level up! Agora você está no nível *${result.rewards.xpResult.current.level}*.` : null,
      ].filter(Boolean).join('\n');
      await say(text);
      return;
    }

    if (parts[0] === 'daily') {
      const mode = parts[1];
      const pokemonId = Number(parts[2]);
      const result = await startDailyDungeon({ slackUserId: event.user, mode, pokemonId });
      if (!result.ok) {
        await say(`❌ Não foi possível concluir a daily dungeon. Motivo: *${result.reason}*.`);
        return;
      }
      const speciesName = result.capturedSpecies?.name || 'Pokémon';
      const text = [
        `🏆 <@${event.user}> venceu a *Dungeon Diária ${result.mode === 'hard' ? 'Difícil' : 'Normal'}*!`,
        `💰 Gold: +${result.rewards.goldReward}`,
        `✨ XP da conta: +${result.rewards.xpResult.grantedXp}`,
        `🎁 Pokémon recebido: *${speciesName}*`,
        result.rewards.xpResult.leveledUp ? `🆙 Level up! Agora você está no nível *${result.rewards.xpResult.current.level}*.` : null,
      ].filter(Boolean).join('\n');
      await say(text);
      return;
    }

    await say(buildMenu());
  },
};
