const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCodexSlackMessage } = require('../services/legendaryCodexService');
const {
  onDamageTaken,
  onOutgoingDamage,
  onTurnStart,
} = require('../application/battle/domain/legendaryPassiveEngine');
const { formatBattleLogForSlack } = require('../adapters/slack/renderers/battleRenderer');

function createBattleWithPassive(passiveId, values = {}) {
  return {
    round: 3,
    challengerId: 'U1',
    challengedId: 'U2',
    currentTurnUserId: 'U1',
    metadata: { slackUserId: 'U1' },
    players: {
      U1: {
        selectedPokemon: { name: 'Dialga', legendaryPassive: { passiveId, values } },
        battleHp: { current: 120, max: 150 },
        stats: { attack: 80, magic: 90, defense: 70 },
        skillEnergy: 100,
        skillEnergyMax: 300,
        elementalState: { effects: [], statuses: [] },
        legendaryRuntime: {},
      },
      U2: {
        selectedPokemon: { name: 'Palkia', legendaryPassive: null },
        battleHp: { current: 120, max: 150 },
        stats: { attack: 70, magic: 75, defense: 65 },
        elementalState: { effects: [], statuses: [] },
        legendaryRuntime: {},
      },
    },
  };
}

test('buildCodexSlackMessage adiciona marcador emoji em cada passiva', () => {
  const message = buildCodexSlackMessage([
    { passiveName: 'Ruptura de Realidade', passiveCode: 'D7BD80', efficiency: 0.94, description: 'Penetração adicional.' },
    { passiveName: 'Regência Absoluta', passiveCode: '4CFEE7', efficiency: 0.88, description: 'Buffs progressivos.' },
  ]);

  assert.match(message, /🔹 \*Ruptura de Realidade\* \[D7BD80\]/);
  assert.match(message, /🔹 \*Regência Absoluta\* \[4CFEE7\]/);
});

test('blindagem reativa registra ativação, escudo e cooldown com marcador de passiva lendária', () => {
  const battle = createBattleWithPassive('blindagem_reativa', { absorbPct: 50, durationTurns: 1, cooldownTurns: 5 });
  const logs = onDamageTaken({ battle, attackerId: 'U2', defenderId: 'U1', damage: 60, logs: [] });

  const rendered = formatBattleLogForSlack({ battle, lines: logs, title: 'LOG' });
  assert.match(rendered, /Passiva Lendária: Gerou escudo de 30 por 1 turno\(s\)\./);
  assert.match(rendered, /Passiva Lendária: Blindagem Reativa em cooldown por 5 turno\(s\)\./);
});

test('colapso elemental e sangue adaptativo exibem stacks com marcador de passiva lendária', () => {
  const battleAtk = createBattleWithPassive('colapso_elemental', { maxExecuteStacks: 7 });
  const out = onOutgoingDamage({
    battle: battleAtk,
    attackerId: 'U1',
    defenderId: 'U2',
    damage: 45,
    isMagic: true,
    isSuperEffective: true,
    logs: [],
  });
  assert.match(JSON.stringify(out.logs), /EXECUTE \+1/);
  assert.match(JSON.stringify(out.logs), /Passiva Lendária:/);

  const battleDef = createBattleWithPassive('sangue_adaptativo', { maxStacks: 3, resistPerStackPct: 8 });
  const takenLogs = onDamageTaken({
    battle: battleDef,
    attackerId: 'U2',
    defenderId: 'U1',
    damage: 20,
    attackElement: 'fire',
    logs: [],
  });
  assert.match(JSON.stringify(takenLogs), /Resistência ao elemento fire aumentada/);
  assert.match(JSON.stringify(takenLogs), /\[stack 1\]/);
});

test('último suspiro mostra cooldown restante no início do turno', () => {
  const battle = createBattleWithPassive('ultimo_suspiro', { cooldownRounds: 3, eggHpPct: 20 });
  battle.players.U1.legendaryRuntime.eggActive = true;
  battle.players.U1.legendaryRuntime.ultimoSuspiroCd = 3;
  battle.players.U1.battleHp.current = 1;

  const logs = onTurnStart({ battle, actorId: 'U1', logs: [] });
  assert.match(JSON.stringify(logs), /cooldown: 2 rodada\(s\)/);
  assert.match(JSON.stringify(logs), /Ovo regenerou/);
});
