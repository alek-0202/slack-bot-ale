const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getSpeciesView } = require("../../../services/speciesCatalogViewService");
const { renderDiscordSpeciesCatalogEntry } = require("../renderers/speciesCatalogRenderer");
const { toPlatformUserId } = require("../../../core/platformIdentity");

function parseSpeciesNavigationCustomId(customId) {
  const [prefix, ownerUserId, indexRaw, speciesIdsRaw = "all"] = String(customId || "").split("|");

  if (prefix !== "species") {
    return null;
  }

  const index = Number.parseInt(indexRaw, 10);
  const speciesIds = speciesIdsRaw === "all"
    ? null
    : speciesIdsRaw
        .split(",")
        .map((entry) => Number.parseInt(entry, 10))
        .filter((entry) => Number.isInteger(entry) && entry > 0);

  return {
    ownerUserId,
    index: Number.isInteger(index) ? index : 0,
    speciesIds,
  };
}

function buildSpeciesNavigationCustomId({ ownerUserId, index, speciesIds }) {
  return `species|${ownerUserId}|${index}|${speciesIds?.length ? speciesIds.join(",") : "all"}`;
}

function buildSpeciesCatalogDiscordPayload({ ownerUserId, view }) {
  const payload = renderDiscordSpeciesCatalogEntry(view);

  if (!view?.entry || !view?.total) {
    return payload;
  }

  payload.components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          buildSpeciesNavigationCustomId({
            ownerUserId,
            index: Math.max(0, view.index - 1),
            speciesIds: view.speciesIds,
          }),
        )
        .setLabel("Anterior")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(
          buildSpeciesNavigationCustomId({
            ownerUserId,
            index: Math.min(view.total - 1, view.index + 1),
            speciesIds: view.speciesIds,
          }),
        )
        .setLabel("Próximo")
        .setStyle(ButtonStyle.Primary),
    ),
  ];

  return payload;
}

async function handleSpeciesCatalogNavigation(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("species|")) return false;

  const parsed = parseSpeciesNavigationCustomId(interaction.customId);
  const actorUserId = toPlatformUserId("discord", interaction.user.id);

  if (!parsed?.ownerUserId || parsed.ownerUserId !== actorUserId) {
    await interaction.reply({
      content: "Você só pode navegar no catálogo global que você abriu.",
      ephemeral: true,
    });
    return true;
  }

  const view = await getSpeciesView(parsed.index, parsed.speciesIds);
  await interaction.update(buildSpeciesCatalogDiscordPayload({ ownerUserId: parsed.ownerUserId, view }));
  return true;
}

module.exports = {
  buildSpeciesCatalogDiscordPayload,
  handleSpeciesCatalogNavigation,
};
