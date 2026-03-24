const test = require("node:test");
const assert = require("node:assert/strict");

const {
  APPLY_ITEM_ACTION_ID,
  buildApplyItemActionId,
  buildApplyItemViewMessage,
} = require("../services/slackPokemonActionService");
const { BOOK_STAT_CONFIG } = require("../services/ancientBookService");

test("buildApplyItemActionId gera action_id único por atributo", () => {
  const statKeys = Object.keys(BOOK_STAT_CONFIG);
  const actionIds = statKeys.map((key) => buildApplyItemActionId(key));

  assert.equal(new Set(actionIds).size, actionIds.length);
  assert.ok(actionIds.every((id) => id.startsWith(`${APPLY_ITEM_ACTION_ID}_`)));
});

test("buildApplyItemViewMessage usa action_ids únicos nos botões de applyitem", () => {
  const payload = buildApplyItemViewMessage({
    slackUserId: "U1",
    preview: {
      booksQty: 10,
      pokemon: {
        id: 25,
        level: 30,
        pokemon_species: { name: "Pikachu", sprite_url: null },
      },
    },
  });

  const actionBlock = payload.blocks.find((block) => block.type === "actions");
  const actionIds = actionBlock.elements.map((element) => element.action_id);

  assert.equal(actionIds.length, Object.keys(BOOK_STAT_CONFIG).length);
  assert.equal(new Set(actionIds).size, actionIds.length);
  assert.ok(actionIds.every((id) => id.startsWith(`${APPLY_ITEM_ACTION_ID}_`)));
});
