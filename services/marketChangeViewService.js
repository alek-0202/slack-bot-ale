const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");

const MARKET_CHANGE_CONFIRM_ACTION_ID = "market_change_confirm";
const MARKET_CHANGE_DISCORD_BUTTON_ID = "market-change-confirm";

function createMarketChangeActionValue({ channelId }) {
  return JSON.stringify({ channelId });
}

function parseMarketChangeActionValue(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return { channelId: parsed.channelId || null };
  } catch {
    return { channelId: null };
  }
}

function summarizeConfirmations(request) {
  const current = Number(request?.confirmation_count) || 0;
  const required = Number(request?.required_confirmations) || 3;
  return `${current}/${required} confirmações`;
}

function buildMarketChangeSlackMessage({ result }) {
  const request = result.request || {};
  const progress = summarizeConfirmations(request);

  if (result.status === "already_used_today") {
    return { text: "A troca manual diária do market já foi utilizada hoje.", blocks: [] };
  }

  const suffix =
    result.status === "completed"
      ? "3/3 confirmações — market atualizado."
      : `${progress}${result.status === "created" ? " — aguardando confirmações." : ""}`;

  const text =
    "🔄 *Troca manual do market diário*\n" +
    "São necessárias 3 confirmações de usuários diferentes para atualizar a loja.\n" +
    `📊 Progresso: *${suffix}*`;

  return {
    text,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text },
      },
      ...(result.status === "completed" && result.market?.length
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: result.market
                  .map((item) => {
                    const species = item.pokemon_species || {};
                    return `*${item.slot}.* ${species.name || "Pokémon"} | ${species.rarity || "common"} | 💰 ${item.price}`;
                  })
                  .join("\n"),
              },
            },
          ]
        : [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  action_id: MARKET_CHANGE_CONFIRM_ACTION_ID,
                  text: { type: "plain_text", text: "Confirmar troca" },
                  style: "primary",
                  value: createMarketChangeActionValue({ channelId: request.channel_id }),
                },
              ],
            },
          ]),
    ],
  };
}

function buildMarketChangeDiscordPayload({ result }) {
  const request = result.request || {};
  const progress = summarizeConfirmations(request);

  if (result.status === "already_used_today") {
    return { content: "A troca manual diária do market já foi utilizada hoje." };
  }

  const embed = new EmbedBuilder()
    .setTitle("🔄 Troca manual do market diário")
    .setDescription(
      "São necessárias 3 confirmações de usuários diferentes para atualizar a loja.\n" +
        `Progresso: **${result.status === "completed" ? "3/3 confirmações — market atualizado" : progress}**`,
    )
    .setColor(result.status === "completed" ? 0x2ecc71 : 0xf1c40f);

  if (result.status === "completed" && result.market?.length) {
    embed.addFields({
      name: "Nova loja",
      value: result.market
        .map((item) => {
          const species = item.pokemon_species || {};
          return `**${item.slot}.** ${species.name || "Pokémon"} | ${species.rarity || "common"} | 💰 ${item.price}`;
        })
        .join("\n"),
    });
  }

  const components =
    result.status === "completed"
      ? []
      : [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`${MARKET_CHANGE_DISCORD_BUTTON_ID}|${request.channel_id || ""}`)
              .setLabel("Confirmar troca")
              .setStyle(ButtonStyle.Primary),
          ),
        ];

  return { embeds: [embed], components };
}

module.exports = {
  MARKET_CHANGE_CONFIRM_ACTION_ID,
  MARKET_CHANGE_DISCORD_BUTTON_ID,
  createMarketChangeActionValue,
  parseMarketChangeActionValue,
  buildMarketChangeSlackMessage,
  buildMarketChangeDiscordPayload,
};
