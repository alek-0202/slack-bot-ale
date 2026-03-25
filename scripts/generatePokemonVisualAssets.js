const path = require("path");
const fs = require("fs/promises");
const { createCanvas } = require("@napi-rs/canvas");

const ROOT = path.resolve(__dirname, "..");
const FRAME_DIR = path.join(ROOT, "assets", "frames", "tier");
const SHINY_DIR = path.join(ROOT, "assets", "effects", "shiny");
const LEVEL50_DIR = path.join(ROOT, "assets", "effects", "level50");
const SIZE = 256;

const FRAMES = [
  ["cinza", "#D1D5DB"],
  ["azul", "#1E3A8A"],
  ["roxo", "#7B1FA2"],
  ["vermelho", "#C62828"],
  ["dourado", "#D4AF37"],
];

async function writePng(targetPath, painter) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  painter(ctx);
  await fs.writeFile(targetPath, canvas.toBuffer("image/png"));
}

async function generateFrames() {
  await fs.mkdir(FRAME_DIR, { recursive: true });

  await Promise.all(FRAMES.map(async ([name, color]) => {
    await writePng(path.join(FRAME_DIR, `${name}.png`), (ctx) => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = color;
      ctx.lineWidth = 11;
      ctx.strokeRect(7, 7, SIZE - 14, SIZE - 14);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 4;
      ctx.strokeRect(15, 15, SIZE - 30, SIZE - 30);
    });
  }));
}

async function generateEffects() {
  await fs.mkdir(SHINY_DIR, { recursive: true });
  await fs.mkdir(LEVEL50_DIR, { recursive: true });

  await writePng(path.join(SHINY_DIR, "aura.png"), (ctx) => {
    const center = SIZE / 2;
    const gradient = ctx.createRadialGradient(center, center, 32, center, center, 112);
    gradient.addColorStop(0, "rgba(255,255,230,0.65)");
    gradient.addColorStop(0.60, "rgba(255,225,120,0.35)");
    gradient.addColorStop(1, "rgba(255,225,120,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE, SIZE);
  });

  await writePng(path.join(LEVEL50_DIR, "aura.png"), (ctx) => {
    const center = SIZE / 2;
    const gradient = ctx.createRadialGradient(center, center, 28, center, center, 112);
    gradient.addColorStop(0, "rgba(190,120,255,0.33)");
    gradient.addColorStop(0.65, "rgba(150,72,235,0.25)");
    gradient.addColorStop(1, "rgba(120,60,200,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.strokeStyle = "rgba(165,102,255,0.42)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(center, center, 97, 0, Math.PI * 2);
    ctx.stroke();
  });
}

(async () => {
  await generateFrames();
  await generateEffects();
  console.log("Assets visuais do card gerados com sucesso.");
})();
