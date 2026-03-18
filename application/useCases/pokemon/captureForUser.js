const { capturePokemon } = require('../../../services/captureService');

async function captureForUser({ userId }) {
  return capturePokemon(userId);
}

module.exports = {
  captureForUser,
};
