const { EmbedBuilder } = require('discord.js');
const { buildPokemonTypesLabel } = require('../../../services/pokemonTypeService');

function renderDiscordSpeciesCatalogEntry({ entry, index, total }) {
  if (!entry || !total) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle('Catálogo global')
          .setDescription('Não encontrei espécies cadastradas no catálogo global.')
          .setColor(0x95a5a6),
      ],
    };
  }

  const fromText = entry.evolves_from ? `#${entry.evolves_from}` : '-';
  const toText = entry.evolves_to ? `#${entry.evolves_to}` : '-';
  const positionText = `${index + 1}/${total}`;

  const embed = new EmbedBuilder()
    .setTitle(`${entry.name || 'Pokémon'} (#${entry.id || '?'})`)
    .setDescription(
      [
        `⭐ Raridade: **${entry.rarity || 'desconhecida'}**`,
        `🧬 Estágio evolutivo: **${entry.evolution_stage || 1}**`,
        `🔁 Evolui de: **${fromText}** | Para: **${toText}**`,
        buildPokemonTypesLabel(entry.element_types) ? `🧪 ${buildPokemonTypesLabel(entry.element_types)}` : null,
        `💰 Valor base: **${entry.base_value || 0}** gold`,
        `📊 Base: ⚔️ **${entry.base_attack || 0}** | 🛡️ **${entry.base_defense || 0}** | ❤️ **${entry.base_hp || 0}** | 💨 **${entry.base_speed || 0}**`,
        `🗺️ Geração: **${entry.generation || '-'}**`,
        `📍 Posição: **${positionText}**`,
      ].filter(Boolean).join('\n'),
    )
    .setColor(0x9b59b6);

  if (entry.sprite_url) {
    embed.setThumbnail(entry.sprite_url);
  }

  return { embeds: [embed] };
}

function renderDiscordElementsReference(entries) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('Elementos disponíveis')
        .setDescription(entries.map((entry) => `• **${entry.name}** → fraquezas: ${entry.weaknesses.join(', ')}`).join('\n'))
        .setColor(0x1abc9c),
    ],
  };
}

module.exports = {
  renderDiscordSpeciesCatalogEntry,
  renderDiscordElementsReference,
};
