const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const {
  buildEvolvePreview,
  buildUpgradeBatchPreview,
  buildSellPreviewCard,
  upgradePokemonToLevel,
  evolvePokemon,
  sellPokemon,
} = require("../../../services/slackPokemonActionService");
const { resetPokemonUpgrades } = require("../../../services/resetPokemonService");
const { createLogger } = require("../../../utils/logger");
const { toPlatformUserId, fromPlatformId } = require("../../../core/platformIdentity");

const logger = createLogger("discord-pokemon-actions");

function buildActionCustomId({ action, ownerUserId, pokemonId, targetLevel }) {
  return [action, ownerUserId, pokemonId, targetLevel || ""].join("|");
}

function parseActionCustomId(customId) {
  const [action, ownerUserId, pokemonIdRaw, targetLevelRaw] = String(customId || "").split("|");
  const pokemonId = Number.parseInt(pokemonIdRaw, 10);
  const targetLevel = targetLevelRaw ? Number.parseInt(targetLevelRaw, 10) : null;

  return {
    action,
    ownerUserId,
    pokemonId: Number.isInteger(pokemonId) ? pokemonId : null,
    targetLevel: Number.isInteger(targetLevel) ? targetLevel : null,
  };
}

function buildConfirmRow({ confirmAction, cancelAction, ownerUserId, pokemonId, targetLevel, danger = false }) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildActionCustomId({ action: confirmAction, ownerUserId, pokemonId, targetLevel }))
      .setLabel("Confirmar")
      .setStyle(danger ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(buildActionCustomId({ action: cancelAction, ownerUserId, pokemonId, targetLevel }))
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildUnauthorizedPayload(ownerUserId) {
  return {
    content: `Somente <@${fromPlatformId(ownerUserId)}> pode confirmar esta ação.`,
    ephemeral: true,
  };
}

function buildEvolvePreviewPayload({ ownerUserId, preview }) {
  const currentName = preview.pokemon?.pokemon_species?.name || "Pokémon";
  const nextName = preview.nextSpecies?.name || "Pokémon";

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("Confirmar evolução")
        .setDescription(
          [
            `**Pokémon atual:** ${currentName} (#${preview.pokemon.id})`,
            `**Próxima evolução:** ${nextName}`,
            `**Custo:** ${preview.cost} gold`,
            preview.canAfford
              ? `**Gold atual:** ${preview.currentGold}`
              : `⚠️ **Gold atual:** ${preview.currentGold} (insuficiente)`,
          ].join("\n"),
        )
        .setThumbnail(preview.nextSpecies?.sprite_url || preview.pokemon?.pokemon_species?.sprite_url || null)
        .setColor(0x9b59b6),
    ],
    components: [
      buildConfirmRow({
        confirmAction: "poke-evolve-confirm",
        cancelAction: "poke-evolve-cancel",
        ownerUserId,
        pokemonId: preview.pokemon.id,
      }),
    ],
  };
}

function buildUpgradePreviewPayload({ ownerUserId, preview }) {
  const pokemonName = preview.pokemon?.pokemon_species?.name || "Pokémon";

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("Confirmar upgrade em lote")
        .setDescription(
          [
            `**Pokémon:** ${pokemonName} (#${preview.pokemon.id})`,
            `**Nível atual:** ${preview.currentLevel}`,
            `**Nível alvo:** ${preview.targetLevel}`,
            `**Níveis a subir:** ${preview.levelsToGain}`,
            `**Custo total:** ${preview.totalCost} gold`,
            preview.canAfford
              ? `**Gold atual:** ${preview.currentGold}`
              : `⚠️ **Gold atual:** ${preview.currentGold} (insuficiente)`,
          ].join("\n"),
        )
        .setThumbnail(preview.pokemon?.pokemon_species?.sprite_url || null)
        .setColor(0x3498db),
    ],
    components: [
      buildConfirmRow({
        confirmAction: "poke-up-confirm",
        cancelAction: "poke-up-cancel",
        ownerUserId,
        pokemonId: preview.pokemon.id,
        targetLevel: preview.targetLevel,
      }),
    ],
  };
}

function buildSellPreviewPayload({ ownerUserId, preview }) {
  const pokemonName = preview.pokemon?.pokemon_species?.name || "Pokémon";

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("Confirmar venda")
        .setDescription(
          [
            `**Pokémon:** ${pokemonName} (#${preview.pokemon.id})`,
            `**Nível:** ${preview.pokemon.level}`,
            `**Valor da venda:** ${preview.priceBreakdown?.finalPrice || 0} gold`,
            `**Retorno dos upgrades:** ${preview.priceBreakdown?.upgradeReturn || 0} gold`,
          ].join("\n"),
        )
        .setThumbnail(preview.pokemon?.pokemon_species?.sprite_url || null)
        .setColor(0xe74c3c),
    ],
    components: [
      buildConfirmRow({
        confirmAction: "poke-sell-confirm",
        cancelAction: "poke-sell-cancel",
        ownerUserId,
        pokemonId: preview.pokemon.id,
        danger: true,
      }),
    ],
  };
}

async function handlePokemonActionInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("poke-")) return false;

  const { action, ownerUserId, pokemonId, targetLevel } = parseActionCustomId(interaction.customId);
  const actorUserId = toPlatformUserId("discord", interaction.user.id);

  logger.info("Interação Pokémon recebida no Discord", {
    action,
    actorUserId,
    ownerUserId,
    pokemonId,
    targetLevel,
    guildId: interaction.guildId || null,
    channelId: interaction.channelId || null,
  });

  if (!ownerUserId || !pokemonId) {
    await interaction.reply({ content: "Não consegui validar essa ação Pokémon 😵", ephemeral: true });
    return true;
  }

  if (actorUserId !== ownerUserId) {
    await interaction.reply(buildUnauthorizedPayload(ownerUserId));
    return true;
  }

  if (action.endsWith("-cancel")) {
    await interaction.update({
      content: "🛑 Ação cancelada.",
      embeds: [],
      components: [],
    });
    return true;
  }

  if (action === "poke-evolve-confirm") {
    const result = await evolvePokemon({ slackUserId: actorUserId, pokemonId });
    if (!result.ok) {
      const map = {
        user_not_started: "Você ainda não começou. Use `/profile`.",
        pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
        no_evolution_available: "Esse Pokémon não possui evolução disponível no momento.",
        insufficient_gold: `Gold insuficiente para evoluir. Custo: ${result.cost} | Seu gold: ${result.currentGold}.`,
        species_stats_missing: "Os dados da próxima evolução ainda estão incompletos.",
      };
      await interaction.reply({ content: map[result.reason] || "Não consegui evoluir esse Pokémon agora 😵", ephemeral: true });
      return true;
    }

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Pokémon evoluído!")
          .setDescription(
            [
              `**ID:** #${result.pokemonId}`,
              `${result.previousSpeciesName} → ${result.newSpeciesName}`,
              `**Custo:** ${result.cost} gold`,
              `**Gold restante:** ${result.remainingGold}`,
            ].join("\n"),
          )
          .setColor(0x8e44ad),
      ],
      components: [],
    });
    return true;
  }

  if (action === "poke-up-confirm") {
    const result = await upgradePokemonToLevel({ slackUserId: actorUserId, pokemonId, targetLevel });
    if (!result.ok) {
      const map = {
        user_not_started: "Você ainda não começou. Use `/profile`.",
        pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
        invalid_target_level: "O nível alvo informado é inválido.",
        target_must_be_higher: "O nível alvo precisa ser maior que o nível atual.",
        target_above_max_level: "O nível alvo ultrapassa o limite máximo do sistema.",
        insufficient_gold: `Gold insuficiente para subir até o nível alvo. Custo total: ${result.cost} | Seu gold: ${result.currentGold}.`,
        max_level_reached: "Esse Pokémon já chegou no nível máximo.",
      };
      await interaction.reply({ content: map[result.reason] || "Não consegui aplicar esse upgrade agora 😵", ephemeral: true });
      return true;
    }

    const pokemonName = result.pokemon?.pokemon_species?.name || "Pokémon";
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Upgrade concluído!")
          .setDescription(
            [
              `**${pokemonName}** (#${pokemonId})`,
              `**Nível:** ${result.previousLevel} → ${result.newLevel}`,
              `**Níveis ganhos:** ${result.levelsGained}`,
              `**Custo total:** ${result.totalCost} gold`,
              `**Gold restante:** ${result.remainingGold}`,
            ].join("\n"),
          )
          .setColor(0x2980b9),
      ],
      components: [],
    });
    return true;
  }

  if (action === "poke-sell-confirm") {
    const result = await sellPokemon({ slackUserId: actorUserId, pokemonId });
    if (!result.ok) {
      const map = {
        pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
        pokemon_locked_in_trade: "Esse Pokémon está preso em um trade pendente e não pode ser vendido agora.",
      };
      await interaction.reply({ content: map[result.reason] || "Não consegui vender esse Pokémon agora 😵", ephemeral: true });
      return true;
    }

    const pokemonName = result.pokemon?.pokemon_species?.name || "Pokémon";
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Pokémon vendido!")
          .setDescription(
            [
              `**${pokemonName}** (#${pokemonId})`,
              `**Nível:** ${result.pokemon.level}`,
              `**Valor recebido:** ${result.goldReceived} gold`,
              `**Gold atual:** ${result.currentGold}`,
            ].join("\n"),
          )
          .setColor(0xc0392b),
      ],
      components: [],
    });
    return true;
  }

  if (action === "poke-reset-confirm") {
    const result = await resetPokemonUpgrades({ slackUserId: actorUserId, pokemonId });
    if (!result.ok) {
      const map = {
        pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
        already_level_one: "Esse Pokémon já está no nível 1.",
        species_stats_missing: "Os stats base da espécie estão incompletos para resetar agora.",
      };
      await interaction.reply({ content: map[result.reason] || "Não consegui resetar esse Pokémon agora 😵", ephemeral: true });
      return true;
    }

    const pokemonName = result.pokemon?.pokemon_species?.name || "Pokémon";
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Pokémon resetado!")
          .setDescription(
            [
              `**${pokemonName}** (#${pokemonId})`,
              `**Nível:** ${result.previousLevel} → ${result.newLevel}`,
              `**Gold devolvido:** ${result.refundedGold}`,
              `**Gold atual:** ${result.remainingGold}`,
            ].join("\n"),
          )
          .setColor(0xf39c12),
      ],
      components: [],
    });
    return true;
  }

  return false;
}

module.exports = {
  buildEvolvePreviewPayload,
  buildUpgradePreviewPayload,
  buildSellPreviewPayload,
  handlePokemonActionInteraction,
  buildConfirmRow,
  buildActionCustomId,
  buildEvolvePreview,
  buildUpgradeBatchPreview,
  buildSellPreviewCard,
};
