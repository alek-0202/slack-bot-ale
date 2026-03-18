const { upgradePokemon } = require('../../../services/upgradeService');

async function upgradePokemonForUser({ userId, pokemonId }) {
  return upgradePokemon({ slackUserId: userId, pokemonId });
}

module.exports = {
  upgradePokemonForUser,
};
