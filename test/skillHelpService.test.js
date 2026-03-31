const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSkillHelpBlocks } = require("../services/skillHelpService");

test("buildSkillHelpBlocks retorna blocos legíveis por elemento", () => {
  const blocks = buildSkillHelpBlocks();
  assert.ok(Array.isArray(blocks));
  assert.ok(blocks.length >= 1);
  const text = blocks.map((block) => block.text?.text || "").join("\n");
  assert.match(text, /SKILL HELP/);
  assert.match(text, /Elemento:/);
  assert.match(text, /Cooldown:/);
});
