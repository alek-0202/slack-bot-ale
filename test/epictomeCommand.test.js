const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEpicTomeChoiceMessage,
  EPICTOME_CHOOSE_KEEP_ACTION_ID,
  EPICTOME_CHOOSE_OPTION1_ACTION_ID,
  EPICTOME_CHOOSE_OPTION2_ACTION_ID,
} = require('../commands/pokemon/epictome');

test('buildEpicTomeChoiceMessage usa action_id único para cada botão', () => {
  const message = buildEpicTomeChoiceMessage({
    slackUserId: 'U123',
    pokemon: { id: 77, pokemon_species: { name: 'Jirachi' } },
    roll: {
      currentAffix: { type: 'crit_chance', value: 5, label: 'Crit +5%' },
      options: [
        { type: 'attack_percent', value: 10, label: 'ATK +10%' },
        { type: 'hp_flat', value: 30, label: 'HP +30' },
      ],
    },
  });

  const actionBlock = message.blocks.find((block) => block.type === 'actions');
  const actionIds = (actionBlock?.elements || []).map((item) => item.action_id);

  assert.deepEqual(actionIds, [
    EPICTOME_CHOOSE_KEEP_ACTION_ID,
    EPICTOME_CHOOSE_OPTION1_ACTION_ID,
    EPICTOME_CHOOSE_OPTION2_ACTION_ID,
  ]);
  assert.equal(new Set(actionIds).size, actionIds.length);
});
