require("dotenv").config();
const { App } = require("@slack/bolt");
const axios = require("axios");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// =========================
// Configurações gerais
// =========================
const COMMAND_PREFIX = "!";
const COMMAND_COOLDOWN_MS = 3000;

// cooldown por canal + usuário + comando
const cooldowns = new Map();
const coinflipChallenges = new Map();

// respostas aleatórias quando mencionarem o bot
const respostasMencao = [
  "Fala comigo não, tô de férias 😴",
  "Chamou o mais brabo do canal? 😎",
  "Não enche meu saco, porra!.",
  "Estou online por obrigação, não por vontade 😂",
  "Diga seu comando, verme!.",
  "Ai que não sei o que que não sei o que lá!",
  "Me mama glub glub",
  "GO DRINKING",
];

// =========================
// Funções utilitárias
// =========================
function getChallengeKey(channel) {
  return `coinflip:${channel}`;
}

function getPendingChallenge(channel) {
  return coinflipChallenges.get(getChallengeKey(channel)) || null;
}

function setPendingChallenge(channel, challenge) {
  coinflipChallenges.set(getChallengeKey(channel), challenge);
}

function clearPendingChallenge(channel) {
  coinflipChallenges.delete(getChallengeKey(channel));
}

function extrairUsuarioMencionado(texto = "") {
  const match = texto.match(/<@([A-Z0-9]+)>/i);
  return match ? match[1] : null;
}

function sortearCaraOuCoroa() {
  return Math.random() < 0.5 ? "cara" : "coroa";
}
function extrairEscolhaCaraOuCoroa(texto = "") {
  const match = texto.toLowerCase().match(/\b(cara|coroa)\b/);
  return match ? match[1] : null;
}

function respostaAleatoria(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

function chaveCooldown({ user, channel, command }) {
  return `${channel}:${user}:${command}`;
}

function estaEmCooldown({
  user,
  channel,
  command,
  durationMs = COMMAND_COOLDOWN_MS,
}) {
  const key = chaveCooldown({ user, channel, command });
  const now = Date.now();
  const expiresAt = cooldowns.get(key);

  if (expiresAt && now < expiresAt) {
    return true;
  }

  cooldowns.set(key, now + durationMs);
  return false;
}

function limparCooldownsAntigos() {
  const now = Date.now();
  for (const [key, expiresAt] of cooldowns.entries()) {
    if (expiresAt <= now) {
      cooldowns.delete(key);
    }
  }
}

async function buscarGif(termo = "funny") {
  if (!process.env.GIPHY_API_KEY) {
    throw new Error("GIPHY_API_KEY não configurada no .env");
  }

  const response = await axios.get("https://api.giphy.com/v1/gifs/random", {
    params: {
      api_key: process.env.GIPHY_API_KEY,
      tag: termo,
      rating: "pg-13",
    },
    timeout: 10000,
  });

  const data = response.data?.data;

  if (!data) {
    return null;
  }

  return data.images?.original?.url || data.image_url || data.embed_url || null;
}

function extrairComando(texto = "") {
  if (!texto.startsWith(COMMAND_PREFIX)) return null;

  const semPrefixo = texto.slice(COMMAND_PREFIX.length).trim();
  if (!semPrefixo) return null;

  const partes = semPrefixo.split(/\s+/);
  const comando = partes.shift()?.toLowerCase();
  const args = partes.join(" ").trim();

  return {
    comando,
    args,
  };
}
// =========================
// IA - Configuração
// =========================
const IA_COOLDOWN_MS = 8000;
const IA_MAX_CONTEXT_MESSAGES = 12; // histórico curto por canal
const SLACK_MESSAGE_LIMIT_SAFE = 2800; // margem segura para resposta

const iaMemory = new Map(); // memória por canal
const iaModes = new Map(); // modo atual por canal

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
  iaMemory.set(
    getIaChannelKey(channel),
    history.slice(-IA_MAX_CONTEXT_MESSAGES),
  );
}

function addIaTurn(channel, role, text) {
  const history = getIaHistory(channel);
  history.push({ role, text });
  saveIaHistory(channel, history);
}

function splitLongText(text, maxLen = SLACK_MESSAGE_LIMIT_SAFE) {
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

function buildIaInput(channel, userText) {
  const history = getIaHistory(channel);

  const input = [
    {
      role: "system",
      content: [{ type: "input_text", text: buildIaSystemPrompt(channel) }],
    },
  ];

  for (const msg of history) {
    input.push({
      role: msg.role,
      content: [{ type: "input_text", text: msg.text }],
    });
  }

  input.push({
    role: "user",
    content: [{ type: "input_text", text: userText }],
  });

  return input;
}

async function gerarRespostaIA(channel, userText) {
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

  const text = response.data?.message?.content?.trim() || "";
  return text;
}

function getIaSubcommandInfo(rawArgs = "") {
  const args = rawArgs.trim();

  if (!args) {
    return { type: "empty" };
  }

  if (args.toLowerCase() === "help") {
    return { type: "help" };
  }

  if (args.toLowerCase() === "reset") {
    return { type: "reset" };
  }

  const modeMatch = args.match(/^mode\s+(\w+)$/i);
  if (modeMatch) {
    return { type: "mode", mode: modeMatch[1].toLowerCase() };
  }

  const roastMatch = args.match(/^roast\s+(.+)$/i);
  if (roastMatch) {
    return {
      type: "prompt",
      forceMode: "roast",
      prompt: `Faça uma zoeira leve e criativa sobre: ${roastMatch[1].trim()}`,
    };
  }

  const rpgMatch = args.match(/^rpg\s+(.+)$/i);
  if (rpgMatch) {
    return {
      type: "prompt",
      forceMode: "rpg",
      prompt: rpgMatch[1].trim(),
    };
  }

  const coachMatch = args.match(/^coach\s+(.+)$/i);
  if (coachMatch) {
    return {
      type: "prompt",
      forceMode: "coach",
      prompt: coachMatch[1].trim(),
    };
  }

  return {
    type: "prompt",
    prompt: args,
  };
}

async function responderTextoLongoNoSlack(say, text) {
  const partes = splitLongText(text);

  for (const parte of partes) {
    await say(parte);
  }
}
// =========================
// Eventos
// =========================
app.event("app_mention", async ({ event, say }) => {
  try {
    console.log("APP_MENTION:", event.text);

    const resposta = respostaAleatoria(respostasMencao);
    await say(`<@${event.user}> ${resposta}`);
  } catch (error) {
    console.error("Erro em app_mention:", error);
  }
});

app.event("message", async ({ event, say }) => {
  try {
    console.log("MESSAGE_EVENT:", {
      text: event.text,
      user: event.user,
      channel: event.channel,
      subtype: event.subtype,
      channel_type: event.channel_type,
    });

    // ignora mensagens do próprio bot e subtipos
    if (event.subtype) return;
    if (!event.text) return;
    if (!event.user) return;

    const parsed = extrairComando(event.text);
    if (!parsed) return;

    const { comando, args } = parsed;

    // cooldown simples
    if (
      comando !== "ia" &&
      estaEmCooldown({
        user: event.user,
        channel: event.channel,
        command: comando,
      })
    ) {
      console.log(`Cooldown ativo para comando: ${comando}`);
      return;
    }

    // limpa cooldowns vencidos ocasionalmente
    limparCooldownsAntigos();

    // =========================
    // !caraoucoroa
    // =========================
    if (comando === "caraoucoroa") {
      const challengedUserId = extrairUsuarioMencionado(args || "");
      const escolhaDesafiante = extrairEscolhaCaraOuCoroa(args || "");

      if (!challengedUserId || !escolhaDesafiante) {
        await say(
          "Use assim: `!caraoucoroa @usuario cara` ou `!caraoucoroa @usuario coroa`",
        );
        return;
      }

      if (challengedUserId === event.user) {
        await say("Tu não pode desafiar a si mesmo, maluco 😂");
        return;
      }

      const existingChallenge = getPendingChallenge(event.channel);

      if (existingChallenge) {
        await say(
          "Já existe um desafio pendente neste canal. Resolve ele antes 😵",
        );
        return;
      }

      const escolhaDesafiado = escolhaDesafiante === "cara" ? "coroa" : "cara";

      setPendingChallenge(event.channel, {
        challengerId: event.user,
        challengedId: challengedUserId,
        challengerChoice: escolhaDesafiante,
        challengedChoice: escolhaDesafiado,
        createdAt: Date.now(),
      });

      await say(
        `🪙 <@${event.user}> desafiou <@${challengedUserId}> para um *Cara ou Coroa*!\n` +
          `🎯 <@${event.user}> escolheu *${escolhaDesafiante.toUpperCase()}*\n` +
          `🎯 <@${challengedUserId}> ficou com *${escolhaDesafiado.toUpperCase()}*\n\n` +
          `Se quiser aceitar, use \`!aceitar\`\n` +
          `Se quiser recusar, use \`!recusar\``,
      );

      return;
    }
    // =========================
    // !aceitar
    // =========================
    if (comando === "aceitar") {
      const challenge = getPendingChallenge(event.channel);

      if (!challenge) {
        await say("Não tem nenhum desafio pendente neste canal 🤔");
        return;
      }

      if (event.user !== challenge.challengedId) {
        await say(
          `Só <@${challenge.challengedId}> pode aceitar esse desafio 😎`,
        );
        return;
      }

      const resultado = sortearCaraOuCoroa();

      const vencedor =
        resultado === challenge.challengerChoice
          ? challenge.challengerId
          : challenge.challengedId;

      clearPendingChallenge(event.channel);

      await say(
        `🪙 *Cara ou Coroa iniciado!*\n` +
          `Resultado da moeda: *${resultado.toUpperCase()}*\n\n` +
          `⚔️ <@${challenge.challengerId}> escolheu *${challenge.challengerChoice.toUpperCase()}*\n` +
          `🛡️ <@${challenge.challengedId}> ficou com *${challenge.challengedChoice.toUpperCase()}*\n\n` +
          `🏆 Vencedor: <@${vencedor}>`,
      );

      return;
    }
    // =========================
    // !recusar
    // =========================
    if (comando === "recusar") {
      const challenge = getPendingChallenge(event.channel);

      if (!challenge) {
        await say("Não tem nenhum desafio pendente neste canal 🤔");
        return;
      }

      if (event.user !== challenge.challengedId) {
        await say(
          `Só <@${challenge.challengedId}> pode recusar esse desafio 😎`,
        );
        return;
      }

      clearPendingChallenge(event.channel);

      await say(
        `❌ <@${challenge.challengedId}> recusou o desafio de <@${challenge.challengerId}>`,
      );

      return;
    }
    // =========================
    // !ia
    // =========================
    if (comando === "ia") {
      if (!OLLAMA_HOST || !OLLAMA_MODEL) {
        await say(
          "Falta configurar `OLLAMA_HOST` ou `OLLAMA_MODEL` no `.env` 🤖",
        );
        return;
      }

      if (
        estaEmCooldown({
          user: event.user,
          channel: event.channel,
          command: "ia",
          durationMs: IA_COOLDOWN_MS,
        })
      ) {
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
        let originalMode = getIaMode(event.channel);

        if (!prompt) {
          await say("Escreve algo depois de `!ia` 😅");
          return;
        }

        if (parsedIa.forceMode) {
          setIaMode(event.channel, parsedIa.forceMode);
        }

        const userLabel = `Usuário perguntou: ${prompt}`;
        addIaTurn(event.channel, "user", userLabel);

        const resposta = await gerarRespostaIA(event.channel, userLabel);

        if (!resposta) {
          if (parsedIa.forceMode) {
            setIaMode(event.channel, originalMode);
          }

          await say("A IA voltou sem resposta dessa vez 😵");
          return;
        }

        addIaTurn(event.channel, "assistant", resposta);

        if (parsedIa.forceMode) {
          setIaMode(event.channel, originalMode);
        }

        await responderTextoLongoNoSlack(say, `🤖 ${resposta}`);
        return;
      } catch (error) {
        console.error(
          "Erro no comando !ia:",
          error?.response?.data || error.message || error,
        );

        if (String(error?.message || "").includes("ECONNREFUSED")) {
          await say(
            "Não consegui falar com o Ollama local. Vê se ele está aberto no PC 👀",
          );
          return;
        }

        await say("Deu ruim ao chamar a IA local 😵‍💫");
        return;
      }
    }
    // =========================
    // !gif
    // =========================
    if (comando === "gif") {
      const termo = args || "funny";

      try {
        const gifUrl = await buscarGif(termo);

        if (!gifUrl) {
          await say(`Não achei nenhum GIF para *${termo}* 😢`);
          return;
        }

        await say({
          text: `🎲 GIF aleatório de ${termo}: ${gifUrl}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `🎲 *GIF aleatório de:* \`${termo}\``,
              },
            },
            {
              type: "image",
              image_url: gifUrl,
              alt_text: termo,
            },
          ],
        });
      } catch (error) {
        console.error(
          "Erro ao buscar GIF:",
          error.response?.data || error.message,
        );
        await say("Deu ruim ao buscar o GIF 😵");
      }

      return;
    }

    // =========================
    // !ping
    // =========================
    if (comando === "ping") {
      await say("pong 🏓");
      return;
    }

    // =========================
    // !help
    // =========================
    if (comando === "help") {
      await say({
        text: "Lista de comandos",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                "*Comandos disponíveis:*\n" +
                "`!gif termo` → manda um GIF aleatório\n" +
                "`!gif` → manda um GIF aleatório genérico\n" +
                "`!ia pergunta` → pergunta para a IA\n" +
                "`!ia help` → mostra os modos da IA\n" +
                "`!caraoucoroa @usuario cara|coroa` → desafia alguém para um cara ou coroa\n" +
                "`!aceitar` → aceita o desafio pendente\n" +
                "`!recusar` → recusa o desafio pendente\n" +
                "`!ping` → testa se o bot está vivo\n" +
                "`!help` → mostra esta lista",
            },
          },
        ],
      });
      return;
    }

    // =========================
    // comando desconhecido
    // =========================
    await say(`Não conheço o comando \`${comando}\` 🤔`);
  } catch (error) {
    console.error("Erro em message event:", error);
  }
});

// =========================
// Inicialização
// =========================
(async () => {
  try {
    await app.start();
    console.log("⚡ Bot está rodando!");
  } catch (error) {
    console.error("Erro ao iniciar o bot:", error);
  }
})();
