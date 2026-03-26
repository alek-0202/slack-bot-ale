const { transferShiny } = require('../../services/pokemonEnhancementService');

module.exports = {
  name: 'tshiny',
  async execute({ event, say, args }) {
    const [sourceRaw, targetRaw] = String(args || '').trim().split(/\s+/);
    const sourcePokemonId = Number.parseInt(sourceRaw, 10);
    const targetPokemonId = Number.parseInt(targetRaw, 10);

    if (!Number.isInteger(sourcePokemonId) || !Number.isInteger(targetPokemonId) || sourcePokemonId <= 0 || targetPokemonId <= 0) {
      await say('Use `!tshiny <pokemon id origem> <pokemon id destino>`.');
      return;
    }

    if (sourcePokemonId === targetPokemonId) {
      await say('Origem e destino precisam ser Pokémons diferentes.');
      return;
    }

    const result = await transferShiny({
      slackUserId: event.user,
      sourcePokemonId,
      targetPokemonId,
    });

    if (!result.ok) {
      const map = {
        pokemon_not_owned: 'Origem e destino precisam ser seus Pokémons.',
        source_not_shiny: 'O Pokémon de origem precisa ser shiny.',
        target_already_shiny: 'O Pokémon de destino já é shiny.',
      };
      await say(map[result.reason] || 'Não consegui transferir o shiny agora 😵');
      return;
    }

    await say(`✨ Transferência concluída!\n• Origem #${sourcePokemonId}: não shiny\n• Destino #${targetPokemonId}: shiny normal`);
  },
};
