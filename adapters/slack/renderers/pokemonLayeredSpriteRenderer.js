const path = require("path");
const fs = require("fs/promises");
const axios = require("axios");
const { createLogger } = require("../../../utils/logger");
const { getLevelBorderStyle } = require("./pokemonVisualTier");
const { getPokemonVisualTheme } = require("./pokemonRarityVisualTheme");

const logger = createLogger("renderer:pokemon-layered-sprite");

const CANVAS_SIZE = 256;
const SPRITE_SIZE = 164;
const SPRITE_X = Math.floor((CANVAS_SIZE - SPRITE_SIZE) / 2);
const SPRITE_Y = Math.floor((CANVAS_SIZE - SPRITE_SIZE) / 2);
const ASSET_RENDER_ENABLED = String(process.env.POKEMON_VISUAL_USE_ASSETS || "false").toLowerCase() === "true";

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
    logger.warn("Asset visual ausente, usando fallback programático", {
      assetPath,
      code: error.code,
    });
    return null;
  }
}

function hexToRgba(hex, alpha) {
  if (typeof hex !== "string") return `rgba(17, 24, 39, ${alpha})`;
  const normalized = hex.replace("#", "");
  const valid = normalized.length === 6 ? normalized : "111827";
  const r = parseInt(valid.slice(0, 2), 16);
  const g = parseInt(valid.slice(2, 4), 16);
  const b = parseInt(valid.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyBaseLayer(ctx, theme) {
  const gradient = ctx.createRadialGradient(CANVAS_SIZE / 2, CANVAS_SIZE * 0.42, 18, CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE * 0.74);
  gradient.addColorStop(0, hexToRgba(theme.backgroundCenter, 0.96));
  gradient.addColorStop(1, hexToRgba(theme.backgroundEdge, 1));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function applyShinyAura(ctx) {
  const center = CANVAS_SIZE / 2;
  const gradient = ctx.createRadialGradient(center, center, 36, center, center, 108);
  gradient.addColorStop(0, "rgba(255,255,220,0.66)");
  gradient.addColorStop(0.55, "rgba(255,230,128,0.35)");
  gradient.addColorStop(1, "rgba(255,230,128,0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.restore();
}

function applyGeneratedFrame(ctx, tierKey, theme) {
  const color = theme?.frameOuter || FRAME_COLORS[tierKey] || FRAME_COLORS.cinza;
  const center = CANVAS_SIZE / 2;

  const outer = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  outer.addColorStop(0, `${color}F0`);
  outer.addColorStop(1, `${color}AA`);

  ctx.save();
  ctx.strokeStyle = outer;
  ctx.shadowColor = `${color}AA`;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, CANVAS_SIZE - 16, CANVAS_SIZE - 16);

  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.50)";
  ctx.strokeRect(16, 16, CANVAS_SIZE - 32, CANVAS_SIZE - 32);

  const vignette = ctx.createRadialGradient(center, center, 68, center, center, 132);
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(1, `${color}33`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.restore();
}

async function renderLayeredPokemonSprite({ species = {}, level = 1, shiny = false, commandName = "unknown" }) {
  const metadata = {
    commandName,
    level,
    shiny: Boolean(shiny),
    loadedAssets: [],
    missingAssets: [],
    usedGeneratedFrame: false,
    tier: null,
    outputType: "none",
    assetMode: ASSET_RENDER_ENABLED ? "asset_based" : "generated",
  };

  if (!species?.sprite_url) {
    logger.warn("Render visual pulado por ausência de sprite_url", {
      commandName,
      speciesName: species?.name,
      level,
    });
    return {
      ok: false,
      reason: "missing_sprite_url",
      metadata,
      imageBuffer: null,
      imageMimeType: null,
      fallbackImageUrl: null,
    };
  }

  const canvasRuntime = loadCanvasRuntime();
  if (!canvasRuntime) {
    return {
      ok: false,
      reason: "canvas_runtime_unavailable",
      metadata,
      imageBuffer: null,
      imageMimeType: null,
      fallbackImageUrl: species.sprite_url,
    };
  }

  const { createCanvas, loadImage } = canvasRuntime;

  try {
    const { key: tierKey, border } = resolveVisualTier(level);
    const theme = getPokemonVisualTheme({ rarity: species?.rarity, shiny });
    metadata.tier = tierKey;

    logger.info("Iniciando render em camadas do card/pokemon", {
      commandName,
      speciesName: species?.name,
      level,
      tier: tierKey,
      shiny: Boolean(shiny),
      assetMode: metadata.assetMode,
    });

    const spriteBuffer = await fetchImageBuffer(species.sprite_url);
    const spriteImage = await loadImage(spriteBuffer);

    let frameAsset = null;
    let shinyOverlay = null;
    if (ASSET_RENDER_ENABLED) {
      [frameAsset, shinyOverlay] = await Promise.all([
        loadOptionalAsset(path.join(FRAME_ASSET_ROOT, `${tierKey}.png`), metadata, loadImage),
        shiny ? loadOptionalAsset(path.join(EFFECTS_ASSET_ROOT, "shiny", "aura.png"), metadata, loadImage) : Promise.resolve(null),
      ]);
    }

    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext("2d");

    applyBaseLayer(ctx, theme);

    if (shinyOverlay) {
      ctx.drawImage(shinyOverlay, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    } else if (shiny) {
      applyShinyAura(ctx);
    }

    ctx.drawImage(spriteImage, SPRITE_X, SPRITE_Y, SPRITE_SIZE, SPRITE_SIZE);

    if (frameAsset) {
      ctx.drawImage(frameAsset, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    } else {
      metadata.usedGeneratedFrame = true;
      applyGeneratedFrame(ctx, tierKey, theme);
    }

    const pngBuffer = canvas.toBuffer("image/png");
    metadata.outputType = "buffer";

    logger.info("Render em camadas finalizado", {
      commandName,
      speciesName: species?.name,
      level,
      tier: tierKey,
      shiny: Boolean(shiny),
      loadedAssets: metadata.loadedAssets.length,
      missingAssets: metadata.missingAssets.length,
      generatedFrame: metadata.usedGeneratedFrame,
      borderLabel: border.label,
      outputType: metadata.outputType,
    });

    return {
      ok: true,
      metadata,
      imageBuffer: pngBuffer,
      imageMimeType: "image/png",
      fallbackImageUrl: species.sprite_url,
    };
  } catch (error) {
    logger.error("Falha no render em camadas do card/pokemon", {
      commandName,
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
      imageBuffer: null,
      imageMimeType: null,
      fallbackImageUrl: species.sprite_url,
    };
  }
}

module.exports = {
  resolveVisualTier,
  renderLayeredPokemonSprite,
};
