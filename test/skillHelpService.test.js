const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSkillHelpBlocks } = require("../services/skillHelpService");

test("buildSkillHelpBlocks retorna o conteúdo customizado do !skillhelp", () => {
  const blocks = buildSkillHelpBlocks();
  assert.ok(Array.isArray(blocks));
  assert.ok(blocks.length >= 1);

  const text = blocks.map((block) => block.text?.text || "").join("\n");
  assert.match(text, /!skillhelp — Magias Características/);
  assert.match(text, /🔥 \*FOGO\*/);
  assert.match(text, /👻 \*Possessão\*/);
});
