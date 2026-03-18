const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { getPokedexView } = require("../../../services/pokedexViewService");
const { toPlatformUserId } = require("../../../core/platformIdentity");
const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");

function buildPokedexDiscordPayload({ userId, view, mode }) {
  if (!view.entry || !view.total) {
    return {
      embeds: [
        new EmbedBuilder()
          .setTitle("Pokédex vazia")
          .setDescription("Você ainda não tem Pokémon. Use `/capture` para começar.")
          .setColor(0x5865f2),
      ],
      components: [],
    };
  }

  const species = view.entry.pokemon_species || {};
  const shinyTag = view.entry.shiny ? "✨ Shiny\n" : "";
  const attrs =
    mode === "pa"
      ? `\n**Atributos**\nATK: **${view.entry.attack || 0}** | DEF: **${view.entry.defense || 0}**\nHP: **${view.entry.hp || 0}** | SPD: **${view.entry.speed || 0}**`
      : "";

  const embed = new EmbedBuilder()
    .setTitle(`${species.name || "Pokémon"} (#${species.id || "?"})`)
    .setDescription(
      `${shinyTag}Raridade: **${species.rarity || "desconhecida"}**\n${buildPokemonTypesLabel(species.element_types) ? `${buildPokemonTypesLabel(species.element_types)}\n` : ""}Origem: **${view.entry.source || "capture"}**\nCaptura ID: **${view.entry.id}**\nNível: **${view.entry.level || 1}**${attrs}`,
    )
    .setFooter({ text: `Posição ${view.index + 1}/${view.total}` })
    .setColor(mode === "pa" ? 0x57f287 : 0x5865f2);

  if (species.sprite_url) {
    embed.setThumbnail(species.sprite_url);
  }

  const base = `${mode}|${userId}|`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${base}${Math.max(view.index - 1, 0)}`)
      .setLabel("Anterior")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${base}${Math.min(view.index + 1, Math.max(view.total - 1, 0))}`)
      .setLabel("Próximo")
      .setStyle(ButtonStyle.Primary),
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

async function handlePokedexNavigation(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("pokedex|") && !interaction.customId.startsWith("pa|")) return false;

  const [mode, ownerUserId, rawIndex] = interaction.customId.split("|");
  if (interaction.user.id !== ownerUserId) {
    await interaction.reply({ content: "Somente quem abriu a Pokédex pode navegar nela.", ephemeral: true });
    return true;
  }

  const platformUserId = toPlatformUserId("discord", ownerUserId);
  const view = await getPokedexView(platformUserId, Number(rawIndex) || 0);
  const payload = buildPokedexDiscordPayload({ userId: ownerUserId, view, mode });

  await interaction.update(payload);
  return true;
}

module.exports = {
  handlePokedexNavigation,
  buildPokedexDiscordPayload,
};
