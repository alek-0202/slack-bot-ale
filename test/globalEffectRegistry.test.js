const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENABLE_ELEMENTAL_SKILLS = '1';

const {
  GLOBAL_EFFECT_IDS,
  applyGlobalEffect,
  applyExecuteStacks,
  getExecuteStatus,
  getExecuteThresholdPct,
  tryExecuteTarget,
} = require('../application/battle/domain/globalEffectRegistry');
const { evaluateActionStartModifiers, applyBeforeDamageHooks } = require('../application/battle/domain/elementalEngine');

function makePlayer() {
  return {
    battleHp: { current: 1000, max: 1000 },
    elementalState: { effects: [], statuses: [] },
    selectedPokemon: { elementTypes: ['ice'] },
  };
}

test('Exaustão usa multiplicador global de energia', () => {
  const target = makePlayer();
  const effect = applyGlobalEffect(target, GLOBAL_EFFECT_IDS.EXHAUSTION, { remainingRounds: 2 });
  assert.equal(effect.energyRegenMultiplier, 0.65);
});

test('Congelamento bloqueia 1 turno jogável e amplifica dano de gelo em 15%', () => {
  const battle = {
    players: {
      A: makePlayer(),
      B: makePlayer(),
    },
  };

  applyGlobalEffect(battle.players.B, GLOBAL_EFFECT_IDS.FREEZE, { durationTurnsRemaining: 1 });

  const hook = applyBeforeDamageHooks({
    battle,
    attackerId: 'A',
    defenderId: 'B',
    damage: 100,
    isMagic: true,
    attackElement: 'ice',
  });
  assert.equal(hook.finalDamage, 115);

  const blocked = evaluateActionStartModifiers({ battle, actorId: 'B', actionType: 'attack' });
  assert.equal(blocked.cancelTurn, true);

  const freeze = battle.players.B.elementalState.effects.find((entry) => entry.id === GLOBAL_EFFECT_IDS.FREEZE);
  assert.equal(freeze.durationTurnsRemaining, 0);
});

test('Resfriamento reduz iniciativa em 15%', () => {
  const target = makePlayer();
  const effect = applyGlobalEffect(target, GLOBAL_EFFECT_IDS.CHILL, {});
  assert.equal(effect.speedMultiplier, 0.85);
});

test('Execute é opt-in e limiar base começa em 0%', () => {
  const target = makePlayer();
  assert.equal(getExecuteStatus(target), null);
  assert.equal(getExecuteThresholdPct(target), 0);
  assert.equal(tryExecuteTarget(target), false);
});

test('Execute cresce por stacks e respeita teto absoluto de 15%', () => {
  const target = makePlayer();
  applyExecuteStacks(target, { stacks: 3, baseThresholdPct: 0, stackThresholdPct: 0.02 });
  assert.equal(getExecuteThresholdPct(target), 0.06);
  applyExecuteStacks(target, { stacks: 20, baseThresholdPct: 0, stackThresholdPct: 0.02 });
  assert.equal(getExecuteThresholdPct(target), 0.15);
  target.battleHp.current = 150;
  assert.equal(tryExecuteTarget(target), true);
});

test('Stun bloqueia 2 turnos jogáveis sem alterar iniciativa', () => {
  const battle = {
    players: {
      A: makePlayer(),
      B: makePlayer(),
    },
  };
  const stun = applyGlobalEffect(battle.players.B, GLOBAL_EFFECT_IDS.STUN, { durationTurnsRemaining: 2 });
  assert.equal(stun.speedMultiplier, undefined);

  const first = evaluateActionStartModifiers({ battle, actorId: 'B', actionType: 'attack' });
  const second = evaluateActionStartModifiers({ battle, actorId: 'B', actionType: 'attack' });

  assert.equal(first.cancelTurn, true);
  assert.equal(second.cancelTurn, true);
  assert.equal(stun.durationTurnsRemaining, 0);
});
