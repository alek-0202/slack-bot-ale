require("dotenv").config();
const { createLogger } = require("../utils/logger");

const logger = createLogger("bootstrap:discord");
logger.info("Iniciando serviço discord-bot");

require("../adapters/discord/index");
