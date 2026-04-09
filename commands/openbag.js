const { openDungeon60RewardBag } = require('../services/dungeonBagService');

function buildOpenBagMessage(slackUserId, result) {
  const reward = result?.rewards?.rewards || {};
  const xp = Number(reward?.xpResult?.grantedXp || 0);
  const gold = reward?.goldReward || '0';
  const books = Number(reward?.rewardSnapshot?.ancientBookQty || 0);
  const pokeballs = Number(reward?.rewardSnapshot?.pokeballCQty || 0);
  const pokemonName = result?.rewards?.capturedSpecies?.name || reward?.captured?.pokemon_species?.name || reward?.captured?.name || 'Pokémon';
  const pokemonId = reward?.captured?.id;

  return (
    `🎒 <@${slackUserId}> abriu 1 *Bag de Suprimentos (Dungeon 60)*!\n` +
    `✨ XP: +${xp}\n` +
    `💰 Gold: +${gold}\n` +
    `📚 Livro Ancião: +${books}\n` +
    `🧿 Pokebola (!c): +${pokeballs}\n` +
    `🐾 Pokémon recebido: *${pokemonName}*${pokemonId ? ` (PokeID: *${pokemonId}*)` : ''}`
  );
}

module.exports = {
  name: 'openbag',
  buildOpenBagMessage,
  async execute({ event, say }) {
    const result = await openDungeon60RewardBag(event.user);
    if (!result.ok) {
      await say(result.reason === 'bag_not_found'
        ? '❌ Você não possui *Bag de Suprimentos (Dungeon 60)* na mochila.'
        : '❌ Não foi possível abrir sua bag agora.');
      return;
    }

    await say(buildOpenBagMessage(event.user, result));
  },
};
