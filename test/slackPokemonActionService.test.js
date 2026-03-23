const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateTotalUpgradeCost,
  buildUnauthorizedActionMessage,
  buildSellPreviewMessage,
} = require("../services/slackPokemonActionService");
const { getUpgradeCost } = require("../services/upgradeService");

test("calculateTotalUpgradeCost soma os custos de cada nível intermediário", () => {
  const expected = getUpgradeCost(3) + getUpgradeCost(4) + getUpgradeCost(5);
  assert.equal(calculateTotalUpgradeCost(3, 6), expected);
});

test("buildUnauthorizedActionMessage restringe confirmação ao dono", () => {
  assert.deepEqual(buildUnauthorizedActionMessage("U123"), {
    response_type: "ephemeral",
    text: "Somente <@U123> pode confirmar esta ação.",
  });
});

test("buildSellPreviewMessage renderiza confirmação em lote com total", () => {
  const message = buildSellPreviewMessage({
    slackUserId: "U123",
    preview: {
      totalCount: 2,
      totalSellPrice: "840",
      totalUpgradeReturn: "210",
      pokemonIds: [23, 45],
      items: [
        { pokemon: { id: 23, pokemon_species: { name: "Pikachu" } }, priceBreakdown: { finalPrice: "300" } },
        { pokemon: { id: 45, pokemon_species: { name: "Charmander" } }, priceBreakdown: { finalPrice: "540" } },
      ],
    },
  });

  assert.match(message.text, /2 Pokémons/);
  assert.match(message.blocks[1].text.text, /Pikachu/);
  assert.match(message.blocks[1].text.text, /Charmander/);
  assert.match(message.blocks[1].text.text, /Valor total da venda:\* 840 gold/);
});
