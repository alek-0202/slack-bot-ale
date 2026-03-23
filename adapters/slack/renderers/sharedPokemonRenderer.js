const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");
const { formatPokemonStars } = require("../../../services/pokemonProgressionService");

function renderSlackProfileSummary({ slackUserId, profile }) {
  return (
    `📋 Perfil de <@${slackUserId}>\n` +
    `💰 Gold: *${profile.gold}*\n` +
    `🧭 Nível da conta: *${profile.accountLevel || 1}*\n` +
    `✨ XP: *${profile.accountXp || 0} / ${profile.accountXpToNextLevel || 100}* ${profile.accountXpBar || ''}\n` +
    `🎯 Total capturado: *${profile.totalCaptured}*\n` +
    `📘 Pokédex descoberta: *${profile.uniqueCount}*`
  );
}

function renderSlackCaptureResult({ slackUserId, result }) {
  if (!result.ok) {
    if (result.reason === 'cooldown') {
      return {
        text: `⏳ <@${slackUserId}>, você ainda está em cooldown. Tente de novo em *${result.remainingText}*.`,
      };
    }

    if (result.reason === 'no_species') {
      return {
        text: 'A Pokédex global está vazia. Rode o importador para popular `pokemon_species`.',
      };
    }

    if (result.reason === 'user_not_started') {
      return {
        text: 'Você ainda não começou. Use `!poke start`.',
      };
    }

    return {
      text: 'Não consegui capturar agora 😵',
    };
  }

  const shinyTag = result.shiny ? '✨ SHINY!' : '';
  const text =
    `🎉 <@${slackUserId}> capturou *${result.species.name}* ${shinyTag}\n` +
    `⭐ Raridade: *${result.species.rarity}* | Lv ${result.captured.level}${buildPokemonTypesLabel(result.species.element_types) ? `\n🧪 ${buildPokemonTypesLabel(result.species.element_types)}` : ""}\n` +
    `🆔 ID da captura: *${result.captured.id}*\n` +
    `💰 Recompensa: +${result.goldReward} gold\n` +
    `✨ XP da conta: +${result.accountXpReward || 0}`;

  const message = {
    text,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text,
        },
        ...(result.species.sprite_url
          ? {
              accessory: {
                type: 'image',
                image_url: result.species.sprite_url,
                alt_text: result.species.name,
              },
            }
          : {}),
      },
    ],
  };

  return message;
}

function renderSlackUpgradeResult({ result, slackUserId, maxLevel, getNextUpgradeCost }) {
  if (!result.ok) {
    if (result.reason === 'user_not_started') {
      return 'Você ainda não começou. Use `!poke start`.';
    }

    if (result.reason === 'pokemon_not_owned') {
      return 'Você só pode melhorar Pokémons que pertencem a você.';
    }

    if (result.reason === 'pokemon_in_healing_station') {
      return 'Esse Pokémon está na estação de cura e não pode receber upgrade agora.';
    }

    if (result.reason === 'max_level') {
      return `Esse Pokémon já atingiu o nível máximo (${maxLevel}).`;
    }

    if (result.reason === 'species_stats_missing') {
      return 'Os stats base da espécie ainda não estão prontos. Rode a migration/backfill e tente novamente.';
    }

    if (result.reason === 'insufficient_gold') {
      return `Gold insuficiente. Custo para próximo upgrade: *${result.cost}*. Seu saldo atual: *${result.currentGold}*.`;
    }

    return 'Não consegui melhorar esse Pokémon agora 😵';
  }

  const speciesName = result.pokemon.pokemon_species?.name || 'Pokémon';
  const stars = formatPokemonStars(result.newLevel);
  const nextUpgradeCost =
    result.newLevel >= maxLevel ? 'MAX' : `${getNextUpgradeCost(result.newLevel)} gold`;

  return (
    `🛠️ *${speciesName}* (#${result.pokemon.id}) melhorado com sucesso!\n` +
    `📈 Nível: *${result.previousLevel}* → *${result.newLevel}* ${stars !== '-' ? `(${stars})` : ''}\n` +
    `💸 Custo pago: *${result.cost}* gold\n` +
    `💰 Gold restante: *${result.remainingGold}*\n` +
    `🔜 Próximo upgrade: *${nextUpgradeCost}*`
  );
}

module.exports = {
  renderSlackProfileSummary,
  renderSlackCaptureResult,
  renderSlackUpgradeResult,
};
