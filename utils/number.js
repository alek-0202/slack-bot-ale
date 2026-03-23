function parsePositiveInt(raw) {
  const value = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function parsePositiveIntList(raw) {
  const seen = new Set();
  const values = [];

  for (const chunk of String(raw || "").split(",")) {
    const value = parsePositiveInt(chunk);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }

  return values;
}

module.exports = {
  parsePositiveInt,
  parsePositiveIntList,
};
