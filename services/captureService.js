const { pickByRarity } = require("../pokemon/rarity");
const { getSupabaseClient } = require("../database/supabase");
const { getUser, createUserIfMissing } = require("./userService");
const { getAllSpecies, insertUserPokemon } = require("./pokemonService");
const { calculatePokemonStats, SHINY_TYPE, rollPokemonIvOffsets } = require("./pokemonStatsService");
const { getGoldValueByRarityAndLevel } = require("./economyService");
const { createLogger } = require("../utils/logger");
const { addGold, assertNonNegativeGold, formatGold, toDatabaseGold, toGoldBigInt } = require("../utils/gold");
const { CAPTURE_ACCOUNT_XP, grantAccountXp } = require('./accountProgressionService');

const CAPTURE_COOLDOWN_MS = 60 * 60 * 1000;
const SHINY_CHANCE = 0.02;
const logger = createLogger("capture-service");

function getCooldownRemainingMs(lastCaptureAt) {
  if (!lastCaptureAt) return 0;

  const nextTime = new Date(lastCaptureAt).getTime() + CAPTURE_COOLDOWN_MS;
  return Math.max(0, nextTime - Date.now());
}

function formatRemaining(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

async function capturePokemon(slackUserId, context = {}) {
  const supabase = getSupabaseClient();
  const safeContext = {
    channelId: context.channelId || null,
    platform: context.platform || null,
    rawText: context.rawText || null,
    source: context.source || 'capture',
    bypassCooldown: Boolean(context.bypassCooldown),
    skipCooldownWrite: Boolean(context.skipCooldownWrite),
  };

  logger.info("Iniciando fluxo de captura", {
    slackUserId: slackUserId || null,
    ...safeContext,
  });

  if (!slackUserId) {
    logger.warn("Captura abortada por ausência de usuário", safeContext);
    return {
      ok: false,
      reason: "invalid_user",
    };
  }

  try {
    let user = await getUser(slackUserId);

    if (!user) {
      logger.info("Usuário sem perfil encontrado; criando registro automaticamente", {
        slackUserId,
        ...safeContext,
      });
      user = await createUserIfMissing(slackUserId);
    }

    logger.info("Contexto do usuário carregado para captura", {
      slackUserId,
      channelId: safeContext.channelId,
      currentGold: formatGold(user.gold || 0),
      lastCaptureAt: user.last_capture_at || null,
    });

    const remainingMs = getCooldownRemainingMs(user.last_capture_at);
    if (!safeContext.bypassCooldown && remainingMs > 0) {
      logger.info("Captura bloqueada por cooldown", {
        slackUserId,
        channelId: safeContext.channelId,
        remainingMs,
      });
      return {
        ok: false,
        reason: "cooldown",
        remainingMs,
        remainingText: formatRemaining(remainingMs),
      };
    }

    const speciesList = await getAllSpecies();
    logger.info("Catálogo consultado para captura", {
      slackUserId,
      channelId: safeContext.channelId,
      speciesAvailable: speciesList.length,
    });

    if (!speciesList.length) {
      logger.warn("Captura abortada porque não há espécies disponíveis", {
        slackUserId,
        channelId: safeContext.channelId,
      });
      return {
        ok: false,
        reason: "no_species",
      };
    }

    const selected = pickByRarity(speciesList);
    const shiny = Math.random() < SHINY_CHANCE;
    const shinyType = shiny ? SHINY_TYPE.PRIME : null;
    const level = 1;
    const ivOffsets = rollPokemonIvOffsets({ shiny, shinyType, rarity: selected.rarity });
    const goldReward = toGoldBigInt(getGoldValueByRarityAndLevel({ rarity: selected.rarity, level }));
    const nowIso = new Date().toISOString();
    const stats = calculatePokemonStats({ species: selected, level, ivOffsets, shiny, shinyType });

    logger.info("Pokémon alvo da captura definido", {
      slackUserId,
      channelId: safeContext.channelId,
      speciesId: selected.id,
      speciesName: selected.name,
      rarity: selected.rarity,
      level,
      shiny,
      shinyType,
      ivOffsets,
      stats,
      goldReward: formatGold(goldReward),
    });

    const captured = await insertUserPokemon({
      slackUserId,
      speciesId: selected.id,
      level,
      shiny,
      shinyType,
      ivOffsets,
      stats,
      source: safeContext.source,
    });

    logger.info("Pokémon persistido em user_pokemons", {
      slackUserId,
      channelId: safeContext.channelId,
      captureId: captured.id,
      speciesId: captured.species_id,
    });

    const previousGold = toGoldBigInt(user.gold);
    const nextGold = assertNonNegativeGold(addGold(previousGold, goldReward));
    const updatePayload = { gold: toDatabaseGold(nextGold) };
    if (!safeContext.skipCooldownWrite) {
      updatePayload.last_capture_at = nowIso;
    }
    const { error: updateUserError } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("slack_user_id", slackUserId);
    if (updateUserError) throw updateUserError;

    logger.info("Usuário atualizado após captura", {
      slackUserId,
      channelId: safeContext.channelId,
      goldBefore: formatGold(previousGold),
      goldDelta: formatGold(goldReward),
      goldAfter: formatGold(nextGold),
      lastCaptureAt: safeContext.skipCooldownWrite ? user.last_capture_at || null : nowIso,
      cooldownWriteSkipped: safeContext.skipCooldownWrite,
    });

    const { error: trxError } = await supabase.from("transactions").insert({
      slack_user_id: slackUserId,
      type: "capture_reward",
      amount: toDatabaseGold(goldReward),
    });
    if (trxError) throw trxError;

    logger.info("Transação de recompensa registrada", {
      slackUserId,
      channelId: safeContext.channelId,
      amount: formatGold(goldReward),
      type: "capture_reward",
    });

    const accountXpReward = CAPTURE_ACCOUNT_XP[selected.rarity] || 0;
    let accountXpResult = null;
    try {
      accountXpResult = await grantAccountXp(slackUserId, accountXpReward, 'capture_reward');
    } catch (xpError) {
      logger.warn('Falha ao conceder XP de conta na captura; seguindo sem bloquear recompensa principal', {
        slackUserId,
        channelId: safeContext.channelId,
        accountXpReward,
        error: xpError,
      });
    }

    logger.info("Fluxo de captura concluído com sucesso", {
      slackUserId,
      channelId: safeContext.channelId,
      captureId: captured.id,
      speciesId: selected.id,
      speciesName: selected.name,
      goldReward: formatGold(goldReward),
      accountXpReward,
      accountLevel: accountXpResult?.current?.level || null,
    });

    return {
      ok: true,
      captured,
      species: selected,
      shiny,
      goldReward: formatGold(goldReward),
      accountXpReward,
      accountXpResult,
    };
  } catch (error) {
    logger.error("Falha no fluxo de captura", {
      slackUserId,
      ...safeContext,
      error,
    });
    throw error;
  }
}

module.exports = {
  CAPTURE_COOLDOWN_MS,
  SHINY_CHANCE,
  getCooldownRemainingMs,
  formatRemaining,
  capturePokemon,
};
