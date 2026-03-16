function parsePositiveInt(raw) {
  const value = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

module.exports = {
  parsePositiveInt,
};
