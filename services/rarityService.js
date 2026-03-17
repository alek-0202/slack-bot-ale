function classifySpeciesRarity({ isLegendary, isMythical, captureRate, baseHappiness, evolutionStage, isBaby }) {
  if (isMythical) return "mythical";
  if (isLegendary) return "legendary";

  const safeCaptureRate = Number.isFinite(Number(captureRate)) ? Number(captureRate) : 120;
  const safeHappiness = Number.isFinite(Number(baseHappiness)) ? Number(baseHappiness) : 70;
  const stage = Math.max(1, Number(evolutionStage) || 1);

  let score = 0;

  if (safeCaptureRate <= 10) score += 4;
  else if (safeCaptureRate <= 45) score += 3;
  else if (safeCaptureRate <= 90) score += 2;
  else if (safeCaptureRate <= 160) score += 1;

  if (safeHappiness <= 35) score += 1;
  if (stage >= 2) score += 1;
  if (stage >= 3) score += 1;
  if (isBaby) score -= 1;

  if (score <= 1) return "common";
  if (score <= 3) return "uncommon";
  if (score <= 5) return "rare";
  return "epic";
}

module.exports = {
  classifySpeciesRarity,
};
