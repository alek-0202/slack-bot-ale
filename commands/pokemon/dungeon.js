const { getDungeonFarmList, getFarmReward, startFarmDungeon, startDailyDungeon, mapDungeonFailureReason } = require('../../services/dungeonService');
const { handleDungeonCommand } = require('../../handlers/dungeonActions');
const { renderDungeonBattleState } = require('../../adapters/slack/renderers/dungeonRenderer');

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
    '4. Escolha a sala/dificuldade e a batalha começa de verdade no mesmo fluxo do PvP',
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
        await say(`❌ Não foi possível iniciar a dungeon farm. Motivo: *${mapDungeonFailureReason(result.reason)}*.`);
        return;
      }
      await say(renderDungeonBattleState(result.battle));
      return;
    }

    if (parts[0] === 'daily') {
      const mode = parts[1];
      const pokemonId = Number(parts[2]);
      const result = await startDailyDungeon({ slackUserId: event.user, mode, pokemonId });
      if (!result.ok) {
        await say(`❌ Não foi possível iniciar a daily dungeon. Motivo: *${mapDungeonFailureReason(result.reason)}*.`);
        return;
      }
      await say(renderDungeonBattleState(result.battle));
      return;
    }

    await say(buildMenu());
  },
};
