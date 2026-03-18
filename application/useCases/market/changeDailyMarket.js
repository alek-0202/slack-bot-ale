const { createLogger } = require("../../../utils/logger");
const {
  ensureManualMarketChangeRequest,
  confirmManualMarketChange,
  getManualMarketChangeStatus,
} = require("../../../services/marketService");

const logger = createLogger("market-change-use-case");

async function requestDailyMarketChange({ userId, channelId, platform }) {
  const result = await ensureManualMarketChangeRequest({ initiatedBy: userId, channelId, platform });

  logger.info("Solicitação de market change processada", {
    userId,
    channelId,
    platform,
    status: result.status,
    confirmations: result.request?.confirmation_count || 0,
  });

  return result;
}

async function confirmDailyMarketChange({ userId, channelId }) {
  const result = await confirmManualMarketChange({ userId, channelId });

  logger.info("Confirmação de market change processada", {
    userId,
    channelId,
    status: result.status,
    confirmations: result.request?.confirmation_count || 0,
  });

  return result;
}

async function getDailyMarketChangeStatus({ channelId }) {
  return getManualMarketChangeStatus({ channelId });
}

module.exports = {
  requestDailyMarketChange,
  confirmDailyMarketChange,
  getDailyMarketChangeStatus,
};
