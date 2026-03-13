const COMMAND_PREFIX = "!";

function extractCommand(text = "") {
  if (!text.startsWith(COMMAND_PREFIX)) return null;

  const withoutPrefix = text.slice(COMMAND_PREFIX.length).trim();
  if (!withoutPrefix) return null;

  const parts = withoutPrefix.split(/\s+/);
  const command = parts.shift()?.toLowerCase();
  const args = parts.join(" ").trim();

  return {
    command,
    args,
  };
}

function randomItem(list = []) {
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function extractMentionedUser(text = "") {
  const match = text.match(/<@([A-Z0-9]+)>/i);
  return match ? match[1] : null;
}

function extractCoinflipChoice(text = "") {
  const match = text.toLowerCase().match(/\b(cara|coroa)\b/);
  return match ? match[1] : null;
}

function randomCoinflip() {
  return Math.random() < 0.5 ? "cara" : "coroa";
}

function splitLongText(text, maxLen = 2800) {
  if (!text || text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let slice = remaining.slice(0, maxLen);

    const lastBreak = Math.max(
      slice.lastIndexOf("\n\n"),
      slice.lastIndexOf("\n"),
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? "),
    );

    if (lastBreak > 300) {
      slice = slice.slice(0, lastBreak + 1);
    }

    chunks.push(slice.trim());
    remaining = remaining.slice(slice.length).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function sanitizeSlackUserPrompt(text = "") {
  return text
    .replace(/<@[A-Z0-9]+>/gi, "@usuario")
    .replace(/<#([A-Z0-9]+)\|?([^>]+)?>/gi, "#canal")
    .trim();
}

module.exports = {
  COMMAND_PREFIX,
  extractCommand,
  randomItem,
  extractMentionedUser,
  extractCoinflipChoice,
  randomCoinflip,
  splitLongText,
  sanitizeSlackUserPrompt,
};
