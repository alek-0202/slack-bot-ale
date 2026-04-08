const test = require('node:test');
const assert = require('node:assert/strict');

const {
  renderStatusBadge,
  resolveStatusVisual,
  resolveStatusIconPath,
  buildStatusTooltip,
} = require('../adapters/slack/renderers/statusVisualRegistry');

test('resolveStatusVisual aplica categoria e usa ícone global da categoria', () => {
  const visual = resolveStatusVisual({ id: 'custom_future_status', name: 'Future Status', isDebuff: false });
  assert.equal(visual.category, 'buff');
  assert.equal(visual.badge, '🟩');
  assert.equal(visual.placeholder, true);
  assert.equal(visual.iconPath, 'assets/status-icons/status_buff.png');
});

test('resolveStatusIconPath mapeia buff/debuff/special para os 3 assets globais', () => {
  assert.equal(resolveStatusIconPath({ category: 'buff' }), 'assets/status-icons/status_buff.png');
  assert.equal(resolveStatusIconPath({ category: 'debuff' }), 'assets/status-icons/status_debuff.png');
  assert.equal(resolveStatusIconPath({ category: 'special' }), 'assets/status-icons/status_special.png');
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
  assert.equal(badge.metadata.iconPath, 'assets/status-icons/status_debuff.png');
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
  assert.match(badge.metadata.tooltip, /Barreira Psíquica/);
  assert.match(badge.metadata.tooltip, /2 rounds/);
});

test('buildStatusTooltip inclui rounds/stacks/cargas por efeito individual', () => {
  const tooltip = buildStatusTooltip(
    { name: 'Raiz', description: 'reduz dano recebido' },
    { stacks: 3, remainingRounds: 2, charges: 1 },
  );
  assert.match(tooltip, /Raiz/);
  assert.match(tooltip, /reduz dano recebido/);
  assert.match(tooltip, /2 rounds/);
  assert.match(tooltip, /3 stacks/);
  assert.match(tooltip, /1 cargas/);
});
