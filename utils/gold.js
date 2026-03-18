const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function isSafeIntegerNumber(value) {
  return typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value);
}

function toGoldBigInt(value, fallback = 0n) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return fallback;
    return BigInt(normalized);
  }
  if (isSafeIntegerNumber(value)) return BigInt(value);
  throw new TypeError(`Valor de gold inválido: ${value}`);
}

function toDatabaseGold(value) {
  return toGoldBigInt(value).toString();
}

function formatGold(value) {
  return toGoldBigInt(value).toString();
}

function addGold(...values) {
  return values.reduce((total, current) => total + toGoldBigInt(current), 0n);
}

function subtractGold(current, cost) {
  const result = toGoldBigInt(current) - toGoldBigInt(cost);
  return result;
}

function isGoldGte(left, right) {
  return toGoldBigInt(left) >= toGoldBigInt(right);
}

function assertNonNegativeGold(value, label = 'gold') {
  const normalized = toGoldBigInt(value);
  if (normalized < 0n) {
    throw new RangeError(`${label} não pode ser negativo`);
  }
  return normalized;
}

function toSafeNumber(value) {
  const normalized = toGoldBigInt(value);
  if (normalized > MAX_SAFE_BIGINT || normalized < -MAX_SAFE_BIGINT) {
    throw new RangeError('Valor fora do intervalo seguro de Number');
  }
  return Number(normalized);
}

module.exports = {
  toGoldBigInt,
  toDatabaseGold,
  formatGold,
  addGold,
  subtractGold,
  isGoldGte,
  assertNonNegativeGold,
  toSafeNumber,
};
