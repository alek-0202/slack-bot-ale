const axios = require("axios");
const { splitLongText, sanitizeSlackUserPrompt } = require("../utils/helpers");

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3";
const IA_COOLDOWN_MS = 8000;
const IA_MAX_CONTEXT_MESSAGES = 12;

const iaMemory = new Map();
const iaModes = new Map();

const IA_MODE_PROMPTS = {
  normal: `
Você é um bot de Slack divertido, inteligente e útil.
Responda sempre em português do Brasil.
Mantenha respostas claras, naturais e com personalidade leve.
Quando possível, seja breve.
`.trim(),
  zoeiro: `
Você é um bot de Slack 4fun entre amigos.
Responda em português do Brasil.
Tom: engraçado, leve, rápido, criativo e debochado de forma amigável.
Nunca pese a mão.
Sem ofensa pesada, sem humilhação real, sem discurso tóxico.
`.trim(),
  coach: `
Você responde como um coach exagerado e engraçado.
Português do Brasil.
Tom motivacional, dramático, energético e divertido.
Seja criativo, mas relativamente curto.
`.trim(),
  roast: `
Você faz zoeiras leves entre amigos.
Português do Brasil.
Faça brincadeiras criativas, mas sem humilhação pesada, sem ódio, sem atacar aparência, deficiência, etnia, religião, orientação sexual ou traços sensíveis.
O roast deve soar claramente como brincadeira leve.
`.trim(),
  rpg: `
Você responde como um narrador épico de RPG.
Português do Brasil.
Transforme situações comuns em eventos lendários, com humor e dramaticidade.
`.trim(),
  dev: `
Você é um assistente técnico direto e útil.
Português do Brasil.
Explique com clareza, objetividade e exemplos curtos.
Priorize passos práticos.
`.trim(),
};

function getIaChannelKey(channel) {
  return `ia:${channel}`;
}

function getIaMode(channel) {
  return iaModes.get(getIaChannelKey(channel)) || "normal";
}

function setIaMode(channel, mode) {
  iaModes.set(getIaChannelKey(channel), mode);
}

function resetIaMemory(channel) {
  iaMemory.delete(getIaChannelKey(channel));
}

function getIaHistory(channel) {
  return iaMemory.get(getIaChannelKey(channel)) || [];
}

function saveIaHistory(channel, history) {
  iaMemory.set(getIaChannelKey(channel), history.slice(-IA_MAX_CONTEXT_MESSAGES));
}

function addIaTurn(channel, role, text) {
  const history = getIaHistory(channel);
  history.push({ role, text });
  saveIaHistory(channel, history);
}

function buildIaSystemPrompt(channel) {
  const mode = getIaMode(channel);
  const baseModePrompt = IA_MODE_PROMPTS[mode] || IA_MODE_PROMPTS.normal;

  return `
${baseModePrompt}

Regras adicionais:
- Se a resposta puder ser curta, prefira curta.
- Use formatação leve compatível com Slack.
- Não invente fatos específicos se não souber.
- Se for zoeira, mantenha sempre tom amistoso.
- Se o pedido for perigoso, ilegal ou claramente inadequado, recuse de forma breve.
`.trim();
}

async function generateIaResponse(channel, userText) {
  const history = getIaHistory(channel);

  const messages = [
    {
      role: "system",
      content: buildIaSystemPrompt(channel),
    },
    ...history.map((msg) => ({
      role: msg.role,
      content: msg.text,
    })),
    {
      role: "user",
      content: userText,
    },
  ];

  const response = await axios.post(
    `${OLLAMA_HOST}/api/chat`,
    {
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      keep_alive: "10m",
    },
    {
      timeout: 120000,
    },
  );

  return response.data?.message?.content?.trim() || "";
}

function getIaSubcommandInfo(rawArgs = "") {
  const args = rawArgs.trim();

  if (!args) return { type: "empty" };
  if (args.toLowerCase() === "help") return { type: "help" };
  if (args.toLowerCase() === "reset") return { type: "reset" };

  const modeMatch = args.match(/^mode\s+(\w+)$/i);
  if (modeMatch) return { type: "mode", mode: modeMatch[1].toLowerCase() };

  const roastMatch = args.match(/^roast\s+(.+)$/i);
  if (roastMatch) {
    return {
      type: "prompt",
      forceMode: "roast",
      prompt: `Faça uma zoeira leve e criativa sobre: ${roastMatch[1].trim()}`,
    };
  }

  const rpgMatch = args.match(/^rpg\s+(.+)$/i);
  if (rpgMatch) return { type: "prompt", forceMode: "rpg", prompt: rpgMatch[1].trim() };

  const coachMatch = args.match(/^coach\s+(.+)$/i);
  if (coachMatch) {
    return { type: "prompt", forceMode: "coach", prompt: coachMatch[1].trim() };
  }

  return { type: "prompt", prompt: args };
}

async function replyLongText(say, text) {
  const parts = splitLongText(text);
  for (const part of parts) {
    await say(part);
  }
}

module.exports = {
  name: "ia",
  cooldownMs: IA_COOLDOWN_MS,
  async execute({ event, args, say }) {
    if (!OLLAMA_HOST || !OLLAMA_MODEL) {
      await say("Falta configurar `OLLAMA_HOST` ou `OLLAMA_MODEL` no `.env` 🤖");
      return;
    }

    try {
      const parsedIa = getIaSubcommandInfo(args || "");

      if (parsedIa.type === "empty") {
        await say(
          "*Uso do `!ia`:*\n" +
            "`!ia sua pergunta`\n" +
            "`!ia help`\n" +
            "`!ia reset`\n" +
            "`!ia mode normal`\n" +
            "`!ia mode zoeiro`\n" +
            "`!ia mode coach`\n" +
            "`!ia mode roast`\n" +
            "`!ia mode rpg`\n" +
            "`!ia mode dev`\n" +
            "`!ia roast ale`\n" +
            "`!ia coach preciso de ânimo pra segunda`\n" +
            "`!ia rpg o grupo atrasou 1 hora pro churrasco`",
        );
        return;
      }

      if (parsedIa.type === "help") {
        await say(
          "*Comandos de IA disponíveis:*\n" +
            "• `!ia pergunta` → pergunta normal\n" +
            "• `!ia reset` → limpa a memória da IA neste canal\n" +
            "• `!ia mode normal|zoeiro|coach|roast|rpg|dev` → troca o estilo\n" +
            "• `!ia roast nome` → zoeira leve\n" +
            "• `!ia coach tema` → resposta motivacional engraçada\n" +
            "• `!ia rpg situação` → narração épica\n\n" +
            `*Modo atual:* \`${getIaMode(event.channel)}\``,
        );
        return;
      }

      if (parsedIa.type === "reset") {
        resetIaMemory(event.channel);
        await say("Memória da IA neste canal foi limpa 🧠✨");
        return;
      }

      if (parsedIa.type === "mode") {
        const availableModes = Object.keys(IA_MODE_PROMPTS);

        if (!availableModes.includes(parsedIa.mode)) {
          await say(
            `Modo inválido. Use um destes: ${availableModes.map((m) => `\`${m}\``).join(", ")}`,
          );
          return;
        }

        setIaMode(event.channel, parsedIa.mode);
        await say(`Modo da IA alterado para \`${parsedIa.mode}\` 😎`);
        return;
      }

      let prompt = sanitizeSlackUserPrompt(parsedIa.prompt || "");
      const originalMode = getIaMode(event.channel);

      if (!prompt) {
        await say("Escreve algo depois de `!ia` 😅");
        return;
      }

      if (parsedIa.forceMode) {
        setIaMode(event.channel, parsedIa.forceMode);
      }

      const userLabel = `Usuário perguntou: ${prompt}`;
      addIaTurn(event.channel, "user", userLabel);

      const answer = await generateIaResponse(event.channel, userLabel);

      if (!answer) {
        if (parsedIa.forceMode) {
          setIaMode(event.channel, originalMode);
        }

        await say("A IA voltou sem resposta dessa vez 😵");
        return;
      }

      addIaTurn(event.channel, "assistant", answer);

      if (parsedIa.forceMode) {
        setIaMode(event.channel, originalMode);
      }

      await replyLongText(say, `🤖 ${answer}`);
    } catch (error) {
      console.error("Erro no comando !ia:", error?.response?.data || error.message || error);

      if (String(error?.message || "").includes("ECONNREFUSED")) {
        await say("Não consegui falar com o Ollama local. Vê se ele está aberto no PC 👀");
        return;
      }

      await say("Deu ruim ao chamar a IA local 😵‍💫");
    }
  },
};
