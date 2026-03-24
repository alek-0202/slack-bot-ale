const path = require("path");
const fs = require("fs/promises");
const axios = require("axios");
const { createLogger } = require("../../../utils/logger");
const { getLevelBorderStyle } = require("./pokemonVisualTier");

const logger = createLogger("renderer:pokemon-layered-sprite");

const CANVAS_SIZE = 256;
const SPRITE_SIZE = 164;
const SPRITE_X = Math.floor((CANVAS_SIZE - SPRITE_SIZE) / 2);
const SPRITE_Y = Math.floor((CANVAS_SIZE - SPRITE_SIZE) / 2);

const TIER_BY_HEX = Object.freeze({
  "#D1D5DB": "cinza",
  "#1E3A8A": "azul",
  "#7B1FA2": "roxo",
  "#C62828": "vermelho",
  "#D4AF37": "dourado",
});

const FRAME_COLORS = Object.freeze({
  cinza: "#D1D5DB",
  azul: "#1E3A8A",
  roxo: "#7B1FA2",
  vermelho: "#C62828",
  dourado: "#D4AF37",
});

const ASSETS_ROOT = path.resolve(process.cwd(), "assets");
const FRAME_ASSET_ROOT = path.join(ASSETS_ROOT, "frames", "tier");
const EFFECTS_ASSET_ROOT = path.join(ASSETS_ROOT, "effects");

function resolveVisualTier(level = 1) {
  const border = getLevelBorderStyle(level);
  return {
    key: TIER_BY_HEX[border.hex] || "cinza",
    border,
  };
}

function loadCanvasRuntime() {
  try {
    return require("@napi-rs/canvas");
  } catch (error) {
    logger.warn("@napi-rs/canvas indisponível, render avançado desabilitado", {
      code: error.code,
      message: error.message,
    });
    return null;
  }
}

async function fetchImageBuffer(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 12000,
  });
  return Buffer.from(response.data);
}

async function loadOptionalAsset(assetPath, metadata, loadImage) {
  try {
    await fs.access(assetPath);
    const image = await loadImage(assetPath);
    metadata.loadedAssets.push(assetPath);
    return image;
  } catch (error) {
    metadata.missingAssets.push(assetPath);
    logger.warn("Asset visual ausente, usando fallback", {
      assetPath,
      code: error.code,
    });
    return null;
  }
}

function applyBaseLayer(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_SIZE);
  gradient.addColorStop(0, "rgba(17, 24, 39, 0.22)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function applyShinyAura(ctx) {
  const center = CANVAS_SIZE / 2;
  const gradient = ctx.createRadialGradient(center, center, 36, center, center, 108);
  gradient.addColorStop(0, "rgba(255,255,220,0.60)");
  gradient.addColorStop(0.55, "rgba(255,230,128,0.30)");
  gradient.addColorStop(1, "rgba(255,230,128,0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.restore();
}

function applyLevel50Aura(ctx) {
  const center = CANVAS_SIZE / 2;
  const gradient = ctx.createRadialGradient(center, center, 28, center, center, 112);
  gradient.addColorStop(0, "rgba(180,90,255,0.35)");
  gradient.addColorStop(0.65, "rgba(144,55,220,0.24)");
  gradient.addColorStop(1, "rgba(116,42,168,0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(162, 89, 255, 0.36)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(center, center, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function applyFallbackFrame(ctx, tierKey) {
  const color = FRAME_COLORS[tierKey] || FRAME_COLORS.cinza;
  ctx.save();
  ctx.strokeStyle = `${color}`;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, CANVAS_SIZE - 16, CANVAS_SIZE - 16);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.strokeRect(14, 14, CANVAS_SIZE - 28, CANVAS_SIZE - 28);
  ctx.restore();
}

async function renderLayeredPokemonSprite({ species = {}, level = 1, shiny = false }) {
  const metadata = {
    level,
    shiny: Boolean(shiny),
    loadedAssets: [],
    missingAssets: [],
    usedFallbackFrame: false,
    tier: null,
  };

  if (!species?.sprite_url) {
    logger.warn("Render visual pulado por ausência de sprite_url", {
      speciesName: species?.name,
      level,
    });
    return {
      ok: false,
      reason: "missing_sprite_url",
      metadata,
      imageUrl: null,
    };
  }

  const canvasRuntime = loadCanvasRuntime();
  if (!canvasRuntime) {
    return {
      ok: false,
      reason: "canvas_runtime_unavailable",
      metadata,
      imageUrl: species.sprite_url,
    };
  }

  const { createCanvas, loadImage } = canvasRuntime;

  try {
    const { key: tierKey, border } = resolveVisualTier(level);
    metadata.tier = tierKey;

    logger.info("Iniciando render em camadas do card/pokemon", {
      speciesName: species?.name,
      level,
      tier: tierKey,
      shiny: Boolean(shiny),
      level50: Number(level) === 50,
    });

    const [spriteBuffer, frameAsset, shinyOverlay, level50Overlay] = await Promise.all([
      fetchImageBuffer(species.sprite_url),
      loadOptionalAsset(path.join(FRAME_ASSET_ROOT, `${tierKey}.png`), metadata, loadImage),
      shiny ? loadOptionalAsset(path.join(EFFECTS_ASSET_ROOT, "shiny", "aura.png"), metadata, loadImage) : Promise.resolve(null),
      Number(level) === 50 ? loadOptionalAsset(path.join(EFFECTS_ASSET_ROOT, "level50", "aura.png"), metadata, loadImage) : Promise.resolve(null),
    ]);

    const spriteImage = await loadImage(spriteBuffer);

    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext("2d");

    applyBaseLayer(ctx);

    if (shinyOverlay) {
      ctx.drawImage(shinyOverlay, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    } else if (shiny) {
      applyShinyAura(ctx);
    }

    if (Number(level) === 50 && !level50Overlay) {
      applyLevel50Aura(ctx);
    }

    ctx.drawImage(spriteImage, SPRITE_X, SPRITE_Y, SPRITE_SIZE, SPRITE_SIZE);

    if (Number(level) === 50 && level50Overlay) {
      ctx.drawImage(level50Overlay, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    if (frameAsset) {
      ctx.drawImage(frameAsset, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    } else {
      metadata.usedFallbackFrame = true;
      applyFallbackFrame(ctx, tierKey);
    }

    const pngBuffer = canvas.toBuffer("image/png");
    const imageUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;

    logger.info("Render em camadas finalizado", {
      speciesName: species?.name,
      level,
      tier: tierKey,
      shiny: Boolean(shiny),
      level50: Number(level) === 50,
      loadedAssets: metadata.loadedAssets.length,
      missingAssets: metadata.missingAssets.length,
      fallbackFrame: metadata.usedFallbackFrame,
      borderLabel: border.label,
    });

    return {
      ok: true,
      metadata,
      imageUrl,
    };
  } catch (error) {
    logger.error("Falha no render em camadas do card/pokemon", {
      speciesName: species?.name,
      level,
      shiny,
      metadata,
      error,
    });

    return {
      ok: false,
      reason: "render_error",
      metadata,
      imageUrl: species.sprite_url,
    };
  }
}

module.exports = {
  resolveVisualTier,
  renderLayeredPokemonSprite,
};
