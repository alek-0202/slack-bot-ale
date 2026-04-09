const {
  MARKET_CHANGE_CONFIRM_ACTION_ID,
  parseMarketChangeActionValue,
  buildMarketChangeSlackMessage,
} = require("../services/marketChangeViewService");
const { confirmDailyMarketChange } = require("../application/useCases/market/changeDailyMarket");
const {
  ITEM_MARKET_SCOPE,
  ITEM_MARKET_ACTION_ADD_PREFIX,
  ITEM_MARKET_ACTION_BUY,
  ITEM_MARKET_ACTION_CANCEL,
  addItemToMarketCart,
  checkoutItemMarketCart,
  cancelItemMarketCart,
  getItemMarketCartMessage,
} = require("../services/itemMarketService");
const {
  GLOBAL_MARKET_SCOPE,
  GLOBAL_MARKET_ACTION_ADD_PREFIX,
  GLOBAL_MARKET_ACTION_BUY,
  GLOBAL_MARKET_ACTION_CANCEL,
  addToGlobalCart,
  checkoutGlobalCart,
  cancelGlobalCart,
  getGlobalCartMessage,
} = require("../services/globalMarketService");
const { getMarketSession, setMarketSessionCart } = require("../services/marketSessionService");
const { sendEphemeral } = require("../utils/slackResponse");

const ITEM_MARKET_ACTION_PATTERN = new RegExp(`^${ITEM_MARKET_ACTION_ADD_PREFIX}_.+`);
const GLOBAL_MARKET_ACTION_PATTERN = new RegExp(`^${GLOBAL_MARKET_ACTION_ADD_PREFIX}_.+`);

async function updateCartMessage({ client, scope, slackUserId, channelId }) {
  const session = getMarketSession({ scope, userId: slackUserId, channelId });
  if (!session?.cartMessageTs) return;

  if (scope === ITEM_MARKET_SCOPE) {
    const { cartMessage, cart } = getItemMarketCartMessage({ slackUserId, channelId });
    setMarketSessionCart({ scope, userId: slackUserId, channelId, cart });
    await client.chat.update({ channel: channelId, ts: session.cartMessageTs, text: cartMessage.text, blocks: cartMessage.blocks });
    return;
  }

  if (scope === GLOBAL_MARKET_SCOPE) {
    const { cartMessage, cart } = await getGlobalCartMessage({ slackUserId, channelId });
    setMarketSessionCart({ scope, userId: slackUserId, channelId, cart });
    await client.chat.update({ channel: channelId, ts: session.cartMessageTs, text: cartMessage.text, blocks: cartMessage.blocks });
  }
}

function registerMarketActions(app) {
  app.action(MARKET_CHANGE_CONFIRM_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();

    try {
      const payload = parseMarketChangeActionValue(action.value);
      const actorUserId = body.user?.id;

      const result = await confirmDailyMarketChange({
        userId: actorUserId,
        channelId: payload.channelId || body.channel?.id,
      });

      if (result.status === "already_confirmed") {
        await sendEphemeral(respond, {
          text: "Você já confirmou essa troca manual de market.",
        });
        return;
      }

      if (result.status === "already_used_today") {
        await sendEphemeral(respond, {
          text: "A troca manual do market de hoje já foi utilizada.",
        });
        return;
      }

      if (result.status === "no_active_request") {
        await sendEphemeral(respond, {
          text: "Não existe pedido ativo de troca manual do market neste canal.",
        });
        return;
      }

      const message = buildMarketChangeSlackMessage({ result });
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: message.text,
        blocks: message.blocks,
      });
    } catch (error) {
      console.error("Erro na confirmação do market change:", error.message || error);
      if (respond) {
        await sendEphemeral(respond, {
          text: "Não consegui registrar essa confirmação do market 😵",
        });
      }
    }
  });

  app.action(ITEM_MARKET_ACTION_PATTERN, async ({ ack, body, action, respond, client }) => {
    await ack();
    let payload = {};
    try { payload = JSON.parse(action?.value || "{}"); } catch (_error) { payload = {}; }
    const qty = Math.max(1, Number(payload.quantity) || 1);
    const result = addItemToMarketCart({
      slackUserId: body.user?.id,
      channelId: body.channel?.id,
      itemKey: payload.itemKey,
      quantity: qty,
    });
    if (!result.ok) {
      await sendEphemeral(respond, { text: "Item inválido para carrinho." });
      return;
    }
    await updateCartMessage({ client, scope: ITEM_MARKET_SCOPE, slackUserId: body.user?.id, channelId: body.channel?.id });
    await sendEphemeral(respond, { text: `✅ ${result.item.displayName} x${qty} adicionado ao carrinho.` });
  });

  app.action(ITEM_MARKET_ACTION_BUY, async ({ ack, body, client, respond }) => {
    await ack();
    const checkout = await checkoutItemMarketCart({ slackUserId: body.user?.id, channelId: body.channel?.id });
    if (!checkout.ok) {
      const map = {
        empty_cart: "Seu carrinho está vazio.",
        insufficient_gold: "Gold insuficiente para finalizar a compra.",
        insufficient_essence: "Essência insuficiente para finalizar a compra.",
      };
      await sendEphemeral(respond, { text: map[checkout.reason] || "Não foi possível finalizar a compra." });
      return;
    }
    await updateCartMessage({ client, scope: ITEM_MARKET_SCOPE, slackUserId: body.user?.id, channelId: body.channel?.id });
    await sendEphemeral(respond, { text: "✅ Compra do carrinho concluída no !mi." });
  });

  app.action(ITEM_MARKET_ACTION_CANCEL, async ({ ack, body, client, respond }) => {
    await ack();
    cancelItemMarketCart({ slackUserId: body.user?.id, channelId: body.channel?.id });
    await updateCartMessage({ client, scope: ITEM_MARKET_SCOPE, slackUserId: body.user?.id, channelId: body.channel?.id });
    await sendEphemeral(respond, { text: "🧹 Carrinho limpo." });
  });

  app.action(GLOBAL_MARKET_ACTION_PATTERN, async ({ ack, body, action, respond, client }) => {
    await ack();
    let payload = {};
    try { payload = JSON.parse(action?.value || "{}"); } catch (_error) { payload = {}; }
    const listingId = Number(payload.listingId);
    const qty = Math.max(1, Number(payload.quantity) || 1);
    addToGlobalCart({ slackUserId: body.user?.id, channelId: body.channel?.id, listingId, quantity: qty });
    await updateCartMessage({ client, scope: GLOBAL_MARKET_SCOPE, slackUserId: body.user?.id, channelId: body.channel?.id });
    await sendEphemeral(respond, { text: `✅ Anúncio #${listingId} x${qty} adicionado ao carrinho.` });
  });

  app.action(GLOBAL_MARKET_ACTION_BUY, async ({ ack, body, client, respond }) => {
    await ack();
    const result = await checkoutGlobalCart({ slackUserId: body.user?.id, channelId: body.channel?.id });
    if (!result.ok) {
      await sendEphemeral(respond, { text: "❌ Não foi possível concluir a compra no !mg." });
      return;
    }
    await updateCartMessage({ client, scope: GLOBAL_MARKET_SCOPE, slackUserId: body.user?.id, channelId: body.channel?.id });
    await sendEphemeral(respond, { text: "✅ Compra do !mg concluída." });
  });

  app.action(GLOBAL_MARKET_ACTION_CANCEL, async ({ ack, body, client, respond }) => {
    await ack();
    cancelGlobalCart({ slackUserId: body.user?.id, channelId: body.channel?.id });
    await updateCartMessage({ client, scope: GLOBAL_MARKET_SCOPE, slackUserId: body.user?.id, channelId: body.channel?.id });
    await sendEphemeral(respond, { text: "🧹 Carrinho global limpo." });
  });
}

module.exports = {
  registerMarketActions,
};
