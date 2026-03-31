const { buildSkillHelpBlocks } = require("../services/skillHelpService");

module.exports = {
  name: "skillhelp",
  async execute({ say }) {
    await say({
      text: "Skill help",
      blocks: buildSkillHelpBlocks(),
    });
  },
};
