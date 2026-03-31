const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BATTLE_TURN_ACTION_ID,
  BATTLE_MAGIC_ACTION_ID,
  MAGIC_REGISTER_REMOVE_ACTION_ID,
  renderBattleState,
  formatBattleLogForSlack,
  renderMagicOptions,
  renderMagicRegisterElementPrompt,
} = require("../adapters/slack/renderers/battleRenderer");

test("renderBattleState gera action_ids únicos para ataque, magia e poção", () => {
  const payload = renderBattleState(createBattleStub());
  const actionBlock = payload.blocks.find((block) => block.type === "actions");

  assert.ok(actionBlock);
  assert.equal(actionBlock.elements.length, 3);
  const actionIds = actionBlock.elements.map((element) => element.action_id);

  assert.deepEqual(actionIds, [
    `${BATTLE_TURN_ACTION_ID}_attack`,
    `${BATTLE_TURN_ACTION_ID}_magic`,
    `${BATTLE_TURN_ACTION_ID}_potion`,
  ]);
  assert.equal(new Set(actionIds).size, actionIds.length);
});

test("renderBattleState inclui botão de troca quando há reservas vivas", () => {
  const payload = renderBattleState(createBattleStub({ withReserves: true }));
  const actionBlock = payload.blocks.find((block) => block.type === "actions");
  const actionIds = actionBlock.elements.map((element) => element.action_id);

  assert.equal(actionIds.includes(`${BATTLE_TURN_ACTION_ID}_switch`), true);
  assert.equal(new Set(actionIds).size, actionIds.length);
});

test("renderMagicOptions gera um action_id único por slot de magia", () => {
  const payload = renderMagicOptions({
    battle: { channelId: "C1" },
    actorUserId: "U1",
    magicSlots: [
      { slot: 1, name: "Raio", icon: "⚡" },
      { slot: 2, name: "Choque", icon: "✨" },
    ],
  });

  const actionBlock = payload.blocks.find((block) => block.type === "actions");
  const actionIds = actionBlock.elements.map((element) => element.action_id);

  assert.deepEqual(actionIds, [`${BATTLE_MAGIC_ACTION_ID}_1`, `${BATTLE_MAGIC_ACTION_ID}_2`]);
  assert.equal(new Set(actionIds).size, actionIds.length);
});

test("renderMagicRegisterElementPrompt gera action_id único por elemento removível", () => {
  const payload = renderMagicRegisterElementPrompt({
    pokemon: { id: 25, pokemon_species: { name: "Pikachu" } },
    elements: ["Electric", "Fairy", "Water"],
    maxSlots: 3,
  });

  const actionBlock = payload.blocks.find((block) => block.type === "actions");
  const actionIds = actionBlock.elements.map((element) => element.action_id);

  assert.deepEqual(actionIds, [
    `${MAGIC_REGISTER_REMOVE_ACTION_ID}_electric`,
    `${MAGIC_REGISTER_REMOVE_ACTION_ID}_fairy`,
    `${MAGIC_REGISTER_REMOVE_ACTION_ID}_water`,
  ]);
  assert.equal(new Set(actionIds).size, actionIds.length);
});

test("formatBattleLogForSlack mantém perspectiva correta por lado e round no topo", () => {
  const battle = createBattleStub();
  battle.metadata = {
    slackUserId: "U1",
    turnLog: [
      { kind: "action_summary", actorUserId: "U1", actorName: "Pikachu", skillName: "Ataque Básico", skillIcon: "⚔️", damageTypes: ["físico"], baseDamage: 50, modifiers: [], finalDamage: 50, critical: false, actorCurrentHp: 120, actorMaxHp: 150, activeBuffs: ["Ritmo: +10% dano"], activeDebuffs: [] },
      { kind: "action_summary", actorUserId: "U2", actorName: "Charmander", skillName: "Garras Ardentes", skillIcon: "🔥", damageTypes: ["físico", "elemental"], baseDamage: 40, modifiers: ["+30%"], extraDamage: 12, finalDamage: 52, critical: false, actorCurrentHp: 98, actorMaxHp: 150, activeBuffs: [], activeDebuffs: ["Lentidão: -25% velocidade"] },
      "🔥 Burn causou 10 em <@U1>.",
    ],
  };

  const text = formatBattleLogForSlack({ battle, lines: battle.metadata.turnLog, title: "LOG" });
  assert.match(text, /\*Rodada:\* 1/);
  assert.match(text, /\*\[Pikachu\]\*[\s\S]*Ação: \*Pikachu\* usou/);
  assert.match(text, /\*\[Charmander\]\*[\s\S]*Ação: \*Charmander\* usou/);
  assert.match(text, /DOT\/Contínuo/);
  assert.match(text, /Buffs: Ritmo: \+10% dano/);
  assert.match(text, /Debuffs: Lentidão: -25% velocidade/);
});

test("formatBattleLogForSlack usa critBonusDamage e resolvedAction como fonte única do bloco individual", () => {
  const battle = createBattleStub();
  const text = formatBattleLogForSlack({
    battle,
    title: "LOG",
    lines: [{
      kind: "action_summary",
      actorUserId: "U1",
      resolvedAction: {
        actorId: "U1",
        actorName: "Pikachu",
        actionType: "attack",
        actionName: "Ataque Básico",
        didHit: true,
        isCrit: true,
        baseDamage: 30,
        finalDamage: 48,
        critBonusDamage: 18,
        statusDamage: 5,
        healingDone: 0,
        activeBuffs: ["Foco: +15% chance crítica"],
        activeDebuffs: [],
        actorCurrentHp: 111,
        actorMaxHp: 150,
      },
    }],
  });

  assert.match(text, /Dano: 48 \(\+crit 18\)/);
  assert.match(text, /Dano status: Status 5/);
  assert.match(text, /Vida: 111\/150/);
  assert.match(text, /Buffs: Foco: \+15% chance crítica/);
});

test("formatBattleLogForSlack exibe absorção de barreira e duração restante de efeitos", () => {
  const battle = createBattleStub();
  const text = formatBattleLogForSlack({
    battle,
    title: "LOG",
    lines: [{
      kind: "action_summary",
      actorUserId: "U1",
      resolvedAction: {
        actorId: "U1",
        actorName: "Pikachu",
        actionType: "attack",
        actionName: "Ataque Básico",
        didHit: true,
        isCrit: false,
        dodged: false,
        baseDamage: 40,
        finalDamage: 0,
        shieldAbsorbedDamage: 40,
        elementalRelation: "advantage",
        critBonusDamage: 0,
        statusDamage: 0,
        healingDone: 0,
        activeBuffs: ["Controle Mental [2]", "Barreira Psíquica [1]"],
        activeDebuffs: ["Burn [3]"],
        actorCurrentHp: 120,
        actorMaxHp: 150,
      },
    }],
  });

  assert.match(text, /Dano: 0 \(barreira absorveu 40\) \(vantagem elemental\)/);
  assert.match(text, /Buffs: Controle Mental \[2\] \| Barreira Psíquica \[1\]/);
  assert.match(text, /Debuffs: Burn \[3\]/);
});

test("formatBattleLogForSlack usa fallback textual quando não há action_summary", () => {
  const battle = createBattleStub();
  battle.metadata = {
    slackUserId: "U1",
    turnLog: [
      "⚔️ <@U1> atacou <@U2> e causou *35* de dano.",
      "🔥 Burn causou 9 em <@U2>.",
      "🧪 <@U1> usou poção e recuperou *18* HP.",
    ],
  };

  const text = formatBattleLogForSlack({ battle, lines: battle.metadata.turnLog, title: "LOG" });
  assert.doesNotMatch(text, /Ação: —/);
  assert.match(text, /Dano: 35/);
  assert.match(text, /Cura recebida: Cura 18/);
  assert.match(text, /DOT\/Contínuo: Burn/);
});

function createBattleStub({ withReserves = false } = {}) {
  return {
    channelId: "C-battle",
    status: "active",
    round: 1,
    currentTurnUserId: "U1",
    challengerId: "U1",
    challengedId: "U2",
    players: {
      U1: createPlayerStub({ userId: "U1", pokemonId: 25, name: "Pikachu", types: ["electric"], withReserves }),
      U2: createPlayerStub({ userId: "U2", pokemonId: 4, name: "Charmander", types: ["fire"] }),
    },
  };
}

function createPlayerStub({ userId, pokemonId, name, types, withReserves = false }) {
  return {
    userId,
    selectedPokemon: {
      id: pokemonId,
      speciesId: pokemonId,
      name,
      level: 12,
      spriteUrl: null,
      elementTypes: types,
    },
    battleHp: { current: 120, max: 150 },
    stats: { attack: 40, defense: 25, speed: 18 },
    potionsUsed: 1,
    magicSlots: [{ slot: 1, name: `${name} Spell`, icon: "✦", element: types[0] }],
    team: withReserves
      ? [
        { id: pokemonId, name, battleHp: { current: 120, max: 150 } },
        { id: pokemonId + 100, name: `${name} B`, battleHp: { current: 95, max: 130 } },
      ]
      : [{ id: pokemonId, name, battleHp: { current: 120, max: 150 } }],
    activeTeamIndex: 0,
    initiativeGauge: 50,
    initiativeThreshold: 100,
  };
}
