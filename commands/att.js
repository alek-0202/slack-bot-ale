const { buildUpdateMessage } = require('../utils/updateNotes');

module.exports = {
  name: 'att',
  async execute({ say }) {
    await say(buildUpdateMessage());
  },
};
