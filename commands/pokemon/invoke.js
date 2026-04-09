const { invokeMythicalPokemon } = require('../../services/invokeService');

module.exports = {
  name: 'invoke',
  async execute({ event, say }) {
    const result = await invokeMythicalPokemon({ slackUserId: event.user });
    if (!result.ok) {
      if (result.reason === 'missing_ticket') {
        await say('❌ Você não possui *Ticket Pokémon Mítico* na mochila.');
        return;
      }
      if (result.reason === 'mythical_catalog_empty') {
        await say('❌ Não existem espécies míticas cadastradas no catálogo.');
        return;
      }
      await say('❌ Não consegui concluir sua invocação mítica agora.');
      return;
    }

    const shinyLine = result.shiny ? `\n✨ *Shiny (${result.shinyType || 'normal'})*` : '';
    await say(
      `🌀 <@${event.user}> usou 1 Ticket Pokémon Mítico e invocou *${result.species.name}*!\n` +
      `🆔 ID da coleção: *${result.captured.id}*\n` +
      `🏅 Raridade: *${result.species.rarity}*${shinyLine}`,
    );
  },
};
