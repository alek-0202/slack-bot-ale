const {
  buildSpeciesMessage,
  getSpeciesView,
} = require('../../services/speciesCatalogViewService');
const { findCatalogSpeciesByTag } = require('../../application/useCases/pokemon/catalogLookup');

module.exports = {
  name: 'poketag',
  async execute({ event, args, say }) {
    try {
      const query = (args || '').trim();

      if (!query) {
        await say('Use `!poketag <tag>`. Ex.: `!poketag #25`.');
        return;
      }

      const result = await findCatalogSpeciesByTag(query);

      if (!result.ok) {
        const map = {
          invalid_tag: `A tag *${query}* é inválida. Use a tag exibida ao lado do nome, por exemplo *#25*.`,
          not_found: `Não encontrei nenhuma espécie no catálogo global com a tag *${query}*.` ,
          ambiguous: `Encontrei múltiplas espécies para a tag *${query}*. Verifique o catálogo ou a modelagem dessa espécie.`,
        };
        await say(map[result.reason] || 'Não consegui consultar essa tag agora 😵');
        return;
      }

      const view = await getSpeciesView(result.index, result.speciesIds);
      const message = buildSpeciesMessage({
        slackUserId: event.user,
        entry: view.entry,
        index: view.index,
        total: view.total,
        speciesIds: view.speciesIds,
      });

      await say(message);
    } catch (error) {
      console.error('Erro no !poketag:', error.message || error);
      await say('Não consegui consultar essa tag agora 😵');
    }
  },
};
