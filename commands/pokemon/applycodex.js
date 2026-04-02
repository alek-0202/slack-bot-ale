const { parsePositiveInt } = require('../../utils/number');
const { applyCodexToPokemon } = require('../../services/legendaryCodexService');

module.exports = {
  name: 'applycodex',
  async execute({ event, args, say }) {
    const [rawId, rawCode] = String(args || '').trim().split(/\s+/).filter(Boolean);
    const pokemonId = parsePositiveInt(rawId);
    if (!pokemonId || !rawCode) {
      await say('Use `!applycodex <id_pokemon> <codigo_passiva>`');
      return;
    }

    const result = await applyCodexToPokemon({ slackUserId: event.user, pokemonId, passiveCode: rawCode });
    if (!result.ok) {
      const map = {
        pokemon_not_found: 'Pokémon não encontrado ou não pertence a você.',
        pokemon_not_legendary: '❌ Apenas Pokémon lendário pode receber passiva do códex.',
        codex_not_found: '❌ Código de passiva não encontrado no seu códex.',
        insufficient_gold: '❌ Gold insuficiente (custo: 50.000).',
        insufficient_essence: '❌ Essência Pokémon insuficiente (custo: 20.000).',
      };
      await say(map[result.reason] || '❌ Não foi possível aplicar o códex agora.');
      return;
    }

    await say(
      `✅ Passiva *${result.codex.passiveName}* [${result.codex.passiveCode}] aplicada em *${result.pokemon?.pokemon_species?.name || `Pokémon #${pokemonId}`}*.\n` +
      `💰 Custo: 50.000 gold\n🧪 Custo: 20.000 essência Pokémon\n` +
      `${result.codex.description}`,
    );
  },
};
