const test = require("node:test");
const assert = require("node:assert/strict");

const helpCommand = require("../commands/help");
const pokemonHelpCommand = require("../commands/pokemonhelp");

async function runCommand(command) {
  const calls = [];
  await command.execute({ say: async (payload) => calls.push(payload) });
  return calls[0];
}

test("!help lista comandos novos e comandos relevantes existentes", async () => {
  const payload = await runCommand(helpCommand);
  const text = payload.blocks[0].text.text;

  assert.match(text, /!up <pokemon_id> <nível>/);
  assert.match(text, /!pokeid <id>/);
  assert.match(text, /!pokeplayer @player <nomepokemon>/);
  assert.match(text, /!evolve <pokemon_id>/);
  assert.match(text, /!coffe/);
  assert.match(text, /!bhelp/);
  assert.match(text, /!sb/);
});

test("!pokemonhelp mantém consistência com os comandos de progressão e consulta", async () => {
  const payload = await runCommand(pokemonHelpCommand);
  const text = payload.blocks[0].text.text;

  assert.match(text, /!upgrade <pokemon_id>/);
  assert.match(text, /!up <pokemon_id> <nível>/);
  assert.match(text, /!evolve <pokemon_id>/);
  assert.match(text, /!pokeid <id>/);
  assert.match(text, /!pokeplayer @player <nomepokemon>/);
});
