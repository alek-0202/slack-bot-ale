const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");
const { formatPokemonStars } = require("../../../services/pokemonProgressionService");

const PROFILE_OPEN_BAG_ACTION_ID = 'profile_open_bag';

function renderSlackProfileSummary({ slackUserId, profile }) {
  const text = (
    `📋 Perfil de <@${slackUserId}>\n` +
    `💰 Gold: *${profile.gold}*\n` +
    `🧭 Nível da conta: *${profile.accountLevel || 1}*\n` +
    `✨ XP: *${profile.accountXp || 0} / ${profile.accountXpToNextLevel || 100}* ${profile.accountXpBar || ''}\n` +
    `⚡ Energia: *${profile.energyCurrent || 0} / ${profile.energyMax || 5}* (próxima em ${profile.energyNextIn || 'cheia'})\n` +
    `🧿 Pokebola (!c): *${profile.pokeballCQty || 0}*\n` +
    `🕒 Cooldown !capture: *${profile.captureCooldownText || 'pronto'}*\n` +
    `🎯 Total capturado: *${profile.totalCaptured}*\n` +
    `📘 Pokédex descoberta: *${profile.uniqueCount}*`
  );

  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text } },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: PROFILE_OPEN_BAG_ACTION_ID,
            text: { type: 'plain_text', text: '🎒 Mochila' },
            value: JSON.stringify({ slackUserId }),
          },
        ],
      },
    ],
  };
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

  const shinyTag = result.shiny ? `✨ SHINY${result.captured?.shiny_type ? ` (${result.captured.shiny_type})` : ''}!` : '';
  const statLines = [
    ['ATK', 'base_attack', 'attack_iv'],
    ['DEF', 'base_defense', 'defense_iv'],
    ['MAG', 'base_magic', 'magic_iv'],
    ['HP', 'base_hp', 'hp_iv'],
    ['SPD', 'base_speed', 'speed_iv'],
  ]
    .map(([label, baseKey, ivKey]) => {
      const baseValue = Number(result.species?.[baseKey]);
      const ivValue = Number(result.captured?.[ivKey] || 0);
      if (!Number.isFinite(baseValue)) return null;
      const sign = ivValue >= 0 ? '+' : '';
      return `• ${label}: ${baseValue} (${sign}${ivValue})`;
    })
    .filter(Boolean);
  const text =
    `🎉 <@${slackUserId}> capturou *${result.species.name}* ${shinyTag}\n` +
    `⭐ Raridade: *${result.species.rarity}* | Lv ${result.captured.level}${buildPokemonTypesLabel(result.species.element_types) ? `\n🧪 ${buildPokemonTypesLabel(result.species.element_types)}` : ""}\n` +
    `🆔 ID da captura: *${result.captured.id}*\n` +
    `${statLines.length ? `📊 Base + IV\n${statLines.join('\n')}\n` : ''}` +
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
  PROFILE_OPEN_BAG_ACTION_ID,
  renderSlackProfileSummary,
  renderSlackCaptureResult,
  renderSlackUpgradeResult,
};
