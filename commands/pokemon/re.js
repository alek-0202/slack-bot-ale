const { removeItem } = require('../../services/inventoryService');
const { resetUserEnergy } = require('../../services/energyService');

module.exports = {
  name: 're',
  async execute({ event, say }) {
    const consume = await removeItem(event.user, 'reset_energy_token', 1);
    if (!consume.ok) {
      await say('❌ Você precisa de 1x Reset Energy (comprado no `!mi`).');
      return;
    }

    const result = await resetUserEnergy(event.user);
    if (!result?.ok) {
      await say('❌ Não consegui resetar energia agora.');
      return;
    }

    await say(`⚡ Energia resetada com sucesso! Atual: *${result.currentEnergy}/${result.maxEnergy}*.`);
  },
};
