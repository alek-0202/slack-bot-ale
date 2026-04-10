const test = require('node:test');
const assert = require('node:assert/strict');

const { processOwnerTurnEffects, EFFECT_TIMING } = require('../application/battle/domain/elementalRules');

test('burn elemental recebe vantagem global pelo tipo do dano', () => {
  const playerState = {
    selectedPokemon: { elementTypes: ['grass'] },
    battleHp: { current: 300, max: 300 },
    elementalState: {
      effects: [],
      statuses: [
        {
          id: 'fire_burn',
          name: 'Burn',
          effectType: 'burn',
          element: 'fire',
          damagePerStack: 50,
          stacks: 1,
          activationTiming: EFFECT_TIMING.ON_OWNER_TURN_START,
          durationTurnsRemaining: 2,
        },
      ],
    },
  };

  const logs = processOwnerTurnEffects({
    playerState,
    ownerUserId: 'U1',
    timing: EFFECT_TIMING.ON_OWNER_TURN_START,
  });

  assert.equal(playerState.battleHp.current, 200);
  assert.match(logs[0], /Burn causou 100/);
  assert.match(logs[0], /fire advantage x2/);
});
