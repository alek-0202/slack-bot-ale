const test = require('node:test');
const assert = require('node:assert/strict');

const { interpolateRange, rollLegendaryPassive, PASSIVE_DEFINITIONS, renderLegendaryPassiveDescription } = require('../services/legendaryPassiveRegistry');

test('interpolateRange respeita ranges ascendentes e descendentes', () => {
  assert.equal(interpolateRange([10, 20], 0, { integer: true }), 10);
  assert.equal(interpolateRange([10, 20], 1, { integer: true }), 20);
  assert.equal(interpolateRange([6, 3], 0, { integer: true }), 6);
  assert.equal(interpolateRange([6, 3], 1, { integer: true }), 3);
});

test('rollLegendaryPassive usa eficiência única para todos parâmetros', () => {
  const randomSeq = [0, 0.5];
  const result = rollLegendaryPassive({ random: () => randomSeq.shift() });
  const def = PASSIVE_DEFINITIONS[result.passiveId];
  assert.ok(def);
  for (const [key, range] of Object.entries(def.ranges)) {
    const expected = interpolateRange(range, result.efficiency, { integer: key.toLowerCase().includes('turn') || key.toLowerCase().includes('stack') || key.toLowerCase().includes('cooldown') || key.toLowerCase().includes('damage') });
    assert.equal(result.values[key], expected);
  }
});

test('renderLegendaryPassiveDescription renderiza valores reais', () => {
  const text = renderLegendaryPassiveDescription('eco_arcano', { chancePct: 22, echoDamagePct: 61 });
  assert.match(text, /22/);
  assert.match(text, /61/);
});


test('renderLegendaryPassiveDescription mostra range crescente e decrescente sem inverter', () => {
  const text = renderLegendaryPassiveDescription('marca_juizo', { requiredStacks: 5, explosionPctTargetMaxHp: 15 });
  assert.match(text, /5 \(7 - 3\)/);
  assert.match(text, /15% \(12% - 18%\)/);
});
