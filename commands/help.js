const { listSharedCommandsByCategory } = require("../application/shared/commandCatalog");
const { buildBattleHelp } = require("../services/battleService");

function linesFrom(names, commands) {
  return names.map((name) => {
    const command = commands[name];
    return `${command.slackUsage} → ${command.summary.toLowerCase()}`;
  });
}

function buildGeneralHelp() {
  return [
    "📘 *HELP DO BOT*",
    "",
    "Use `!help pokemon` para sistema Pokémon, `!help dungeon` para dungeons e `!help battle` para batalha.",
    "",
    "*Gerais*",
    "`!help` → mostra esta página geral",
    "`!help pokemon` → mostra a categoria Pokémon",
    "`!help battle` → mostra a categoria de batalha",
    "`!help dungeon` → mostra a categoria de dungeon",
    "`!ping` → testa se o bot está vivo",
    "`!gif <termo>` → manda um GIF aleatório",
    "`!ia <pergunta>` → pergunta para a IA",
    "`!ia help` → mostra os modos da IA",
    "`!caraoucoroa @usuario cara|coroa` → desafia alguém",
    "`!aceitar` / `!recusar` → responde ao desafio de cara ou coroa",
    "`!daily` → resgata recompensa diária de gold",
    "`!dhelp` → explica como funciona o !daily",
    "`!coffe` → envia um card interativo de coffe break",
  ].join("\n");
}

function buildPokemonHelp() {
  const sharedPokemonCommands = Object.fromEntries(
    listSharedCommandsByCategory("pokemon").map((command) => [command.name, command]),
  );

  return [
    "📗 *HELP — POKÉMON*",
    "",
    "💡 Compatibilidade: `!pokemonhelp` continua funcionando como atalho para esta categoria.",
    "",
    "📖 *Perfil e progresso*",
    "`!poke start` → inicia seu perfil Pokémon",
    "`!balance` → mostra seu gold atual",
    "`!daily` → resgata recompensa diária (1x por dia)",
    "`!dhelp` → explica o !daily e mostra as chances",
    ...linesFrom(["profile", "dungeon", "mochila"], sharedPokemonCommands),
    "",
    "⚡ *Captura, coleção e consulta*",
    ...linesFrom(["capture", "pokedex", "pa"], sharedPokemonCommands),
    "`!pokeall` → abre o catálogo global de espécies",
    ...linesFrom(["pokename", "poketag", "pokeid", "pokeplayer", "elements"], sharedPokemonCommands),
    "",
    "⬆️ *Progressão*",
    ...linesFrom(["upgrade", "up", "evolve"], sharedPokemonCommands),
    "`!sell <pokemon_id[,pokemon_id,...]>` → abre confirmação para vender um ou mais Pokémons da sua coleção",
    "`!resetpokeid <pokemon_id>` → reseta upgrades e devolve o gold investido",
    ...linesFrom(["market"], sharedPokemonCommands),
    "`!magicregister <pokeid>` → registra ou atualiza as magias do Pokémon",
    "",
    "🩺 *Estação de cura*",
    "`!healstation` → abre o HUD da sua estação de cura",
    "`!healpoke add <id>` → envia um Pokémon para a estação",
    "`!healpoke remove <id>` → remove um Pokémon da estação",
    "`!upstation` → abre a confirmação para subir o nível da estação",
    "",
    "🏰 *Dungeon*",
    "`!dungeon` → abre o fluxo interativo de dungeon",
    "`!help dungeon` → mostra regras, recompensas e observações da dungeon",
    "",
    "🤝 *Trade*",
    "`!trade @usuario` → inicia um trade",
    "`!trade add pokemon <id>` → adiciona um Pokémon à oferta",
    "`!trade add gold <valor>` → adiciona/define gold na oferta",
    "`!trade remove pokemon <id>` → remove um Pokémon da oferta",
    "`!trade remove gold` → remove (zera) sua oferta de gold",
    "`!trade view` → mostra o estado atual da troca",
    "`!trade accept` → aceita a troca (somente alvo)",
    "`!trade decline` → recusa/cancela a troca",
  ].join("\n");
}


function buildDungeonHelp() {
  return [
    "🏰 *HELP — DUNGEON*",
    "",
    "*Como usar*",
    "1. Use `!dungeon`.",
    "2. Escolha 1 Pokémon elegível pelos botões.",
    "3. Escolha `Farm` ou `Diária`.",
    "4. Escolha a sala/dificuldade e a dungeon inicia automaticamente.",
    "",
    "*Regras gerais*",
    "• O Pokémon precisa pertencer ao jogador.",
    "• O bot valida novamente antes de iniciar: posse, heal station, HP e batalha ativa.",
    "• O mesmo recado do Slack é atualizado entre as etapas do fluxo.",
    "",
    "*Farm — regras e recompensas*",
    "• Salas disponíveis: níveis 5, 10, 15, 20, 25, 30, 35, 40, 45 e 50.",
    "• A Farm enfrenta 2 inimigos em sequência.",
    "• Recompensa: `300 x nível` de gold, `100 x nível` de XP da conta e Livro Ancião.",
    "• A partir do nível 25 a recompensa dá 2 Livros Anciãos.",
    "",
    "*Diária — regras e recompensas*",
    "• Modos: `Normal` e `Difícil`.",
    "• Normal: 3000 gold, 500 XP e 1 Pokémon aleatório.",
    "• Difícil: 5000 gold, 1500 XP e 1 Pokémon aleatório.",
    "• Cada modo diário só pode ser usado 1x por dia por usuário.",
    "",
    "*Observações importantes*",
    "• Pokémon da heal station não entra.",
    "• O HP persiste após a batalha.",
    "• O inimigo pode usar magia.",
    "• O inimigo não usa poção.",
  ].join("\n");
}

function buildBattleCategoryHelp() {
  return [
    "⚔️ *HELP — BATALHA*",
    "",
    buildBattleHelp(),
  ].join("\n");
}

function resolveHelpCategory(args) {
  const normalized = String(args || "").trim().toLowerCase();
  if (!normalized) return "general";
  if (["pokemon", "poke", "pokémon"].includes(normalized)) return "pokemon";
  if (["battle", "batalha", "pvp"].includes(normalized)) return "battle";
  if (["dungeon", "dg", "masmorra"].includes(normalized)) return "dungeon";
  return "unknown";
}

module.exports = {
  name: "help",
  async execute({ args, say }) {
    const category = resolveHelpCategory(args);

    let text;
    if (category === "pokemon") {
      text = buildPokemonHelp();
    } else if (category === "battle") {
      text = buildBattleCategoryHelp();
    } else if (category === "dungeon") {
      text = buildDungeonHelp();
    } else if (category === "general") {
      text = buildGeneralHelp();
    } else {
      text = [
        "❓ Categoria de help não reconhecida.",
        "Use `!help`, `!help pokemon`, `!help dungeon` ou `!help battle`.",
      ].join("\n");
    }

    await say({
      text: "Help do bot",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text,
          },
        },
      ],
    });
  },
};
