const { grantFragment } = require('../services/adminGrantService');
const { ensureAdminOrReply } = require('./adminGrantUtils');
const { extractMentionedUser } = require('../utils/helpers');

const FRAGMENT_BY_RARITY = Object.freeze({
  comum: 'common_fragment',
  epic: 'epic_fragment',
  legendary: 'legendary_fragment',
  mythical: 'mythical_fragment',
  prismatic: 'prismatic_fragment',
});

module.exports = {
  name: 'givefragment',
  async execute({ event, args, say }) {
    if (!(await ensureAdminOrReply(event, say))) return;

    const targetUserId = extractMentionedUser(args);
    const sanitized = String(args || '').replace(/<@[A-Z0-9]+>/i, ' ').trim();
    const [rawQuantity, rawRarity] = sanitized.split(/\s+/).filter(Boolean);
    const quantity = Number(rawQuantity);
    const rarity = String(rawRarity || '').toLowerCase();

    if (!targetUserId) {
      await say('Uso: `!givefragment @user <quantidade> <comum|epic|legendary|mythical|prismatic>`.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      await say('Quantidade inválida. Ex.: `!givefragment @user 10 comum`.');
      return;
    }
    const itemKey = FRAGMENT_BY_RARITY[rarity];
    if (!itemKey) {
      await say('Raridade inválida. Use: comum, epic, legendary, mythical ou prismatic.');
      return;
    }

    await grantFragment(targetUserId, itemKey, quantity);
    await say(`✅ Fragmentos adicionados: <@${targetUserId}> recebeu *${quantity}* de *${itemKey}*.`);
  },
};
