const { listUserCodex, buildCodexSlackMessage } = require('../services/legendaryCodexService');

module.exports = {
  name: 'codex',
  async execute({ event, say }) {
    const entries = await listUserCodex(event.user);
    await say(buildCodexSlackMessage(entries));
  },
};
