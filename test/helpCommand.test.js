const test = require("node:test");
const assert = require("node:assert/strict");

const helpCommand = require("../commands/help");
const pokemonHelpCommand = require("../commands/pokemonhelp");

async function runCommand(command, args = "") {
  const calls = [];
  await command.execute({ args, say: async (payload) => calls.push(payload) });
  return calls[0];
}

test("!help padrão mostra apenas comandos gerais e aponta categorias", async () => {
  const payload = await runCommand(helpCommand);
  const text = payload.blocks[0].text.text;

  assert.match(text, /!help pokemon/);
  assert.match(text, /!help battle/);
  assert.match(text, /!help dungeon/);
  assert.doesNotMatch(text, /!bpick/);
  assert.doesNotMatch(text, /!capture/);
});

test("!help pokemon concentra comandos Pokémon e magicregister", async () => {
  const payload = await runCommand(helpCommand, "pokemon");
  const text = payload.blocks[0].text.text;

  assert.match(text, /!upgrade <pokemon_id>/);
  assert.match(text, /!up <pokemon_id> <nível>/);
  assert.match(text, /!evolve <pokemon_id>/);
  assert.match(text, /!pokeid <id>/);
  assert.match(text, /!c/);
  assert.match(text, /!tshiny <id_origem> <id_destino>/);
  assert.match(text, /Essência Pokémon/);
  assert.match(text, /Botão Stats/);
  assert.match(text, /!pokeplayer @player <nomepokemon>/);
  assert.match(text, /!magicregister <pokeid>/);
  assert.match(text, /!healstation/);
  assert.match(text, /!healpoke add <id>/);
  assert.match(text, /!healpoke remove <id>/);
  assert.match(text, /!upstation/);
  assert.match(text, /!help dungeon/);
  assert.doesNotMatch(text, /!ataque/);
});

test("!help battle concentra comandos de batalha sem defesa", async () => {
  const payload = await runCommand(helpCommand, "battle");
  const text = payload.blocks[0].text.text;

  assert.match(text, /!ataque/);
  assert.doesNotMatch(text, /!defesa/);
  assert.match(text, /!magia/);
  assert.match(text, /!surrender/);
  assert.match(text, /!pocao/);
  assert.match(text, /!bpick ID/);
});

test("!pokemonhelp mantém compatibilidade e mostra categoria Pokémon", async () => {
  const payload = await runCommand(pokemonHelpCommand);
  const text = payload.blocks[0].text.text;

  assert.match(text, /!magicregister <pokeid>/);
  assert.match(text, /!upgrade <pokemon_id>/);
  assert.match(text, /!pokeplayer @player <nomepokemon>/);
});


test("!help dungeon mostra fluxo, regras e observações", async () => {
  const payload = await runCommand(helpCommand, "dungeon");
  const text = payload.blocks[0].text.text;

  assert.match(text, /Como usar/);
  assert.match(text, /Farm — regras e recompensas/);
  assert.match(text, /Diária — regras e recompensas/);
  assert.match(text, /heal station/);
  assert.match(text, /inimigo pode usar magia/);
});
