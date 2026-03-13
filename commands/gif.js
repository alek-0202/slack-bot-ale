const axios = require("axios");

async function fetchGif(term = "funny") {
  if (!process.env.GIPHY_API_KEY) {
    throw new Error("GIPHY_API_KEY não configurada no .env");
  }

  const response = await axios.get("https://api.giphy.com/v1/gifs/random", {
    params: {
      api_key: process.env.GIPHY_API_KEY,
      tag: term,
      rating: "pg-13",
    },
    timeout: 10000,
  });

  const data = response.data?.data;
  if (!data) return null;

  return data.images?.original?.url || data.image_url || data.embed_url || null;
}

module.exports = {
  name: "gif",
  async execute({ args, say }) {
    const term = args || "funny";

    try {
      const gifUrl = await fetchGif(term);

      if (!gifUrl) {
        await say(`Não achei nenhum GIF para *${term}* 😢`);
        return;
      }

      await say({
        text: `🎲 GIF aleatório de ${term}: ${gifUrl}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🎲 *GIF aleatório de:* \`${term}\``,
            },
          },
          {
            type: "image",
            image_url: gifUrl,
            alt_text: term,
          },
        ],
      });
    } catch (error) {
      console.error("Erro ao buscar GIF:", error.response?.data || error.message);
      await say("Deu ruim ao buscar o GIF 😵");
    }
  },
};
