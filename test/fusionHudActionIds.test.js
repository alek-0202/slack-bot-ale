const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFusionHud, FUSION_BUY_ACTION_ID } = require('../services/fusionService');

test('buildFusionHud creates unique action_id for every fusion buy button', () => {
  const hud = buildFusionHud({
    slackUserId: 'U123',
    resources: { gold: '1234', epicFragments: 15, prismaticFragments: 7 },
  });
  const actionIds = hud.blocks
    .filter((block) => block.type === 'actions')
    .flatMap((block) => block.elements || [])
    .map((element) => element.action_id);

  assert.ok(actionIds.length > 0);
  assert.equal(new Set(actionIds).size, actionIds.length);
  for (const actionId of actionIds) {
    assert.match(actionId, new RegExp(`^${FUSION_BUY_ACTION_ID}__.+__\\d+$`));
  }

  const summaryBlock = hud.blocks.find((block) => block.type === 'section');
  assert.match(summaryBlock?.text?.text || '', /Gold: \*1234\*/);
  assert.match(summaryBlock?.text?.text || '', /Fragmentos épicos: \*15\*/);
  assert.match(summaryBlock?.text?.text || '', /Fragmentos prismáticos: \*7\*/);
});
