const { EmbedBuilder } = require('discord.js');

function renderDiscordProfileSummary({ username, profile }) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`Perfil de ${username}`)
        .setDescription(
          `💰 Gold: **${profile.gold}**\n🎯 Total capturado: **${profile.totalCaptured}**\n📘 Pokédex descoberta: **${profile.uniqueCount}**`,
        )
        .setColor(0x3498db),
    ],
  };
}

function renderDiscordCaptureResult({ result }) {
  if (!result.ok) {
    const map = {
      cooldown: `⏳ Você ainda está em cooldown. Tente novamente em ${result.remainingText}.`,
      no_species: 'A Pokédex global está vazia no banco.',
      user_not_started: 'Você ainda não começou. Use `/profile` para iniciar automaticamente.',
    };

    return map[result.reason] || 'Não consegui capturar agora 😵';
  }

  const species = result.species || {};
  const embed = new EmbedBuilder()
    .setTitle(`Você capturou ${species.name || 'Pokémon'}! ${result.shiny ? '✨' : ''}`)
    .setDescription(`Raridade: **${species.rarity}**\nNível: **${result.captured.level}**\nRecompensa: **+${result.goldReward} gold**`)
    .setColor(0x2ecc71);

  if (species.sprite_url) {
    embed.setThumbnail(species.sprite_url);
  }

  return { embeds: [embed] };
}

module.exports = {
  renderDiscordProfileSummary,
  renderDiscordCaptureResult,
};
