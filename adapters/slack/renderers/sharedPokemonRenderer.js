function renderSlackProfileSummary({ slackUserId, profile }) {
  return (
    `📋 Perfil de <@${slackUserId}>\n` +
    `💰 Gold: *${profile.gold}*\n` +
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
    `⭐ Raridade: *${result.species.rarity}* | Lv ${result.captured.level}\n` +
    `🆔 ID da captura: *${result.captured.id}*\n` +
    `💰 Recompensa: +${result.goldReward} gold`;

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

module.exports = {
  renderSlackProfileSummary,
  renderSlackCaptureResult,
};
