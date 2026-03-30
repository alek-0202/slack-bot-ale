const sharedCommandCatalog = {
  help: {
    name: 'help',
    category: 'general',
    summary: 'Mostra os comandos gerais',
    slackUsage: '`!help`',
    discordDescription: 'Mostra os comandos gerais',
  },
  att: {
    name: 'att',
    category: 'general',
    summary: 'Mostra a atualização atual do jogo/bot',
    slackUsage: '`!att`',
    discordDescription: 'Mostra a atualização atual do jogo/bot',
  },
  pokemonhelp: {
    name: 'pokemonhelp',
    category: 'pokemon',
    summary: 'Mostra os comandos do sistema Pokémon',
    slackUsage: '`!pokemonhelp`',
    discordDescription: 'Mostra os comandos do sistema Pokémon',
  },
  profile: {
    name: 'profile',
    category: 'pokemon',
    summary: 'Mostra seu perfil Pokémon',
    slackUsage: '`!profile`',
    discordDescription: 'Mostra seu perfil Pokémon',
  },
  capture: {
    name: 'capture',
    category: 'pokemon',
    summary: 'Captura um Pokémon',
    slackUsage: '`!capture`',
    discordDescription: 'Captura um Pokémon',
  },
  pokedex: {
    name: 'pokedex',
    category: 'pokemon',
    summary: 'Abre sua Pokédex',
    slackUsage: '`!pokedex`',
    discordDescription: 'Abre sua Pokédex',
  },
  pokename: {
    name: 'pokename',
    category: 'pokemon',
    summary: 'Busca espécie no catálogo global pelo nome exato',
    slackUsage: '`!pokename <nome>`',
    discordDescription: 'Busca espécie no catálogo global pelo nome',
  },
  poketag: {
    name: 'poketag',
    category: 'pokemon',
    summary: 'Busca espécie no catálogo global pela tag exibida ao lado do nome',
    slackUsage: '`!poketag <tag>`',
    discordDescription: 'Busca espécie no catálogo global pela tag',
  },
  elements: {
    name: 'elements',
    category: 'pokemon',
    summary: 'Lista os elementos disponíveis e suas fraquezas',
    slackUsage: '`!elements`',
    discordDescription: 'Lista os elementos disponíveis e suas fraquezas',
  },
  pa: {
    name: 'pa',
    category: 'pokemon',
    summary: 'Mostra atributos dos seus Pokémons',
    slackUsage: '`!pa`',
    discordDescription: 'Mostra atributos dos seus Pokémons',
  },
  upgrade: {
    name: 'upgrade',
    category: 'pokemon',
    summary: 'Melhora um Pokémon em +1 nível',
    slackUsage: '`!upgrade <pokemon_id>`',
    discordDescription: 'Melhora um Pokémon',
  },
  up: {
    name: 'up',
    category: 'pokemon',
    summary: 'Sobe um Pokémon diretamente até um nível alvo com confirmação',
    slackUsage: '`!up <pokemon_id> <nível>`',
    discordDescription: 'Atalho de upgrade em lote',
  },
  evolve: {
    name: 'evolve',
    category: 'pokemon',
    summary: 'Mostra preview e confirma a evolução de um Pokémon',
    slackUsage: '`!evolve <pokemon_id>`',
    discordDescription: 'Evolui um Pokémon',
  },
  applyitem: {
    name: 'applyitem',
    category: 'pokemon',
    summary: 'Abre o HUD para aplicar Livro do Ancião em um Pokémon seu',
    slackUsage: '`!applyitem <pokemon_id>`',
    discordDescription: 'Aplica Livro do Ancião em um Pokémon da coleção',
  },
  pokeid: {
    name: 'pokeid',
    category: 'pokemon',
    summary: 'Consulta um Pokémon real da coleção pelo ID do registro',
    slackUsage: '`!pokeid <id>`',
    discordDescription: 'Consulta um Pokémon de coleção por ID',
  },
  pokeplayer: {
    name: 'pokeplayer',
    category: 'pokemon',
    summary: 'Verifica se um jogador possui uma espécie na coleção',
    slackUsage: '`!pokeplayer @player <nomepokemon>`',
    discordDescription: 'Consulta Pokémons de outro jogador',
  },
  market: {
    name: 'market',
    category: 'pokemon',
    summary: 'Mostra o mercado diário ou compra um slot',
    slackUsage: '`!market` / `!market buy <slot>`',
    discordDescription: 'Mostra o mercado diário ou compra um slot',
  },
  healstation: {
    name: 'healstation',
    category: 'pokemon',
    summary: 'Abre o HUD da estação de cura',
    slackUsage: '`!healstation`',
    discordDescription: 'Abre a estação de cura',
  },
  upstation: {
    name: 'upstation',
    category: 'pokemon',
    summary: 'Mostra a confirmação para subir a estação de cura',
    slackUsage: '`!upstation`',
    discordDescription: 'Sobe a estação de cura',
  },

  magicregister: {
    name: 'magicregister',
    category: 'pokemon',
    summary: 'Registra ou atualiza as magias de um Pokémon',
    slackUsage: '`!magicregister <pokeid>`',
    discordDescription: 'Registra as magias de um Pokémon',
  },
  mrskill: {
    name: 'mrskill',
    category: 'pokemon',
    summary: 'Configura até 2 skills características de um Pokémon (nível 50+)',
    slackUsage: '`!mrskill <pokeid>`',
    discordDescription: 'Configura skills características',
  },

  dungeon: {
    name: 'dungeon',
    category: 'pokemon',
    summary: 'Abre ou executa dungeons PvE',
    slackUsage: '`!dungeon`',
    discordDescription: 'Abre ou executa dungeons PvE',
  },
  mochila: {
    name: 'mochila',
    category: 'pokemon',
    summary: 'Mostra sua mochila de itens',
    slackUsage: '`!mochila`',
    discordDescription: 'Mostra sua mochila de itens',
  },
  trade: {
    name: 'trade',
    category: 'pokemon',
    summary: 'Inicia ou gerencia trades',
    slackUsage: '`!trade ...`',
    discordDescription: 'Inicia ou gerencia trades',
  },
};

function getSharedCommand(name) {
  return sharedCommandCatalog[name] || null;
}

function listSharedCommandsByCategory(category) {
  return Object.values(sharedCommandCatalog).filter((command) => command.category === category);
}

module.exports = {
  sharedCommandCatalog,
  getSharedCommand,
  listSharedCommandsByCategory,
};
