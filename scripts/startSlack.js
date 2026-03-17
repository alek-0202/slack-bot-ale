require("dotenv").config();
const { createLogger } = require("../utils/logger");

const logger = createLogger("bootstrap:slack");
logger.info("Iniciando serviço slack-bot");

require("../index");
