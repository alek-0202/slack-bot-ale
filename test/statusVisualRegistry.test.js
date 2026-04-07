const test = require('node:test');
const assert = require('node:assert/strict');

const { renderStatusBadge, resolveStatusVisual } = require('../adapters/slack/renderers/statusVisualRegistry');

test('resolveStatusVisual aplica categoria e placeholder para status desconhecido', () => {
  const visual = resolveStatusVisual({ id: 'custom_future_status', name: 'Future Status', isDebuff: false });
  assert.equal(visual.category, 'buff');
  assert.equal(visual.badge, '🟩');
  assert.equal(visual.placeholder, true);
  assert.match(visual.iconPath, /assets\/status-icons\/custom_future_status\.png/);
});

test('renderStatusBadge renderiza categoria debuff com rounds e stacks', () => {
  const badge = renderStatusBadge({
    effect: { id: 'burn', name: 'Burn', isDebuff: true },
    stacks: 2,
    remainingRounds: 3,
  });

  assert.equal(badge.text, '🟥🔥(x2·3r)');
  assert.equal(badge.metadata.category, 'debuff');
  assert.equal(badge.metadata.name, 'Burn');
});

test('renderStatusBadge prepara metadados para tooltip/hover future-friendly', () => {
  const badge = renderStatusBadge({
    effect: { id: 'psychic_barrier', name: 'Barreira Psíquica', description: 'absorve dano' },
    stacks: 1,
    remainingRounds: 2,
  });

  assert.equal(badge.metadata.category, 'buff');
  assert.equal(typeof badge.metadata.tooltip, 'string');
  assert.equal(typeof badge.metadata.description, 'string');
});
