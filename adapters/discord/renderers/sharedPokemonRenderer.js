const { EmbedBuilder } = require('discord.js');
const { buildPokemonTypesLabel } = require('../../../services/pokemonTypeService');

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
    .setDescription(`Raridade: **${species.rarity}**\n${buildPokemonTypesLabel(species.element_types) ? `${buildPokemonTypesLabel(species.element_types)}\n` : ''}Nível: **${result.captured.level}**\nRecompensa: **+${result.goldReward} gold**`)
    .setColor(0x2ecc71);

  if (species.sprite_url) {
    embed.setThumbnail(species.sprite_url);
  }

  return { embeds: [embed] };
}


function renderDiscordUpgradeResult({ result, maxLevel, getNextUpgradeCost }) {
  if (!result.ok) {
    const map = {
      user_not_started: 'Você ainda não começou. Use `/profile`.',
      pokemon_not_owned: 'Você só pode melhorar Pokémons que pertencem a você.',
      max_level: `Esse Pokémon já está no nível máximo (${maxLevel}).`,
      species_stats_missing: 'Os stats base da espécie ainda não estão prontos. Execute a migration/backfill.',
    };

    if (result.reason === 'insufficient_gold') {
      return `Gold insuficiente. Custo: ${result.cost}. Seu gold: ${result.currentGold}.`;
    }

    return map[result.reason] || 'Não consegui melhorar esse Pokémon 😵';
  }

  const speciesName = result.pokemon.pokemon_species?.name || 'Pokémon';
  const nextUpgradeCost = result.newLevel >= maxLevel ? 'MAX' : `${getNextUpgradeCost(result.newLevel)} gold`;

  return `🛠️ **${speciesName}** (#${result.pokemon.id}) subiu ${result.previousLevel} → ${result.newLevel}. Próximo custo: ${nextUpgradeCost}.`;
}

module.exports = {
  renderDiscordProfileSummary,
  renderDiscordCaptureResult,
  renderDiscordUpgradeResult,
};
