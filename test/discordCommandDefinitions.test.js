const test = require("node:test");
const assert = require("node:assert/strict");

const { discordCommandDefinitions } = require("../adapters/discord/commands/definitions");

test("slash commands do Discord cobrem a camada Pokémon auditada no Slack", () => {
  const names = discordCommandDefinitions.map((definition) => definition.name);

  [
    "balance",
    "daily",
    "dhelp",
    "capture",
    "pokedex",
    "pokeall",
    "pokename",
    "poketag",
    "pokeid",
    "pokeplayer",
    "elements",
    "pa",
    "upgrade",
    "up",
    "evolve",
    "sell",
    "resetpokeid",
    "market",
    "trade",
  ].forEach((commandName) => {
    assert.ok(names.includes(commandName), `esperava encontrar /${commandName}`);
  });
});
