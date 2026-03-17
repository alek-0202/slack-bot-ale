const { randomItem } = require("../utils/helpers");

const COFFE_CONFIRM_ACTION_ID = "coffe_confirm_presence";

const COFFE_PHRASES = [
  "Hora de recarregar as energias ☕",
  "A reunião mais importante do dia chegou",
  "Bora pro café antes que a produtividade suma",
  "Um café agora cairia lendariamente bem",
];

const COFFE_POKEMONS = [
  {
    name: "Pikachu",
    imageUrl:
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
  },
  {
    name: "Eevee",
    imageUrl:
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png",
  },
  {
    name: "Snorlax",
    imageUrl:
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/143.png",
  },
  {
    name: "Jigglypuff",
    imageUrl:
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/39.png",
  },
  {
    name: "Mew",
    imageUrl:
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/151.png",
  },
  {
    name: "Bulbasaur",
    imageUrl:
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png",
  },
];

function formatCurrentTime() {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function buildCoffeCardMessage({ channelId, actorUserId, cardId }) {
  const now = formatCurrentTime();
  const pokemon = randomItem(COFFE_POKEMONS) || { name: "Pikachu", imageUrl: null };
  const phrase = randomItem(COFFE_PHRASES) || "Hora do coffe ☕";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Its coffe time",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "*☕ Carta do Coffe Break*\n" +
          `*Horário:* ${now}\n` +
          "*Local:* de sempre\n\n" +
          `_${phrase}_`,
      },
      accessory: pokemon.imageUrl
        ? {
            type: "image",
            image_url: pokemon.imageUrl,
            alt_text: `Pokémon destaque: ${pokemon.name}`,
          }
        : undefined,
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Pokémon destaque: *${pokemon.name}*`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: COFFE_CONFIRM_ACTION_ID,
          text: {
            type: "plain_text",
            text: "☕ Quero café",
            emoji: true,
          },
          style: "primary",
          value: JSON.stringify({ cardId, channelId, actorUserId }),
        },
      ],
    },
  ];

  return {
    text: `Its coffe time | Horário: ${now} | Local: de sempre | Pokémon: ${pokemon.name}`,
    blocks,
    metadata: {
      now,
      phrase,
      pokemon,
    },
  };
}

function parseCoffeActionValue(value) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!parsed.cardId || !parsed.channelId) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

module.exports = {
  COFFE_CONFIRM_ACTION_ID,
  COFFE_PHRASES,
  COFFE_POKEMONS,
  buildCoffeCardMessage,
  parseCoffeActionValue,
};
