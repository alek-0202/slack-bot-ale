const sharedCommandCatalog = {
  help: {
    name: 'help',
    category: 'general',
    summary: 'Mostra os comandos gerais',
    slackUsage: '`!help`',
    discordDescription: 'Mostra os comandos gerais',
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
    summary: 'Melhora um Pokémon',
    slackUsage: '`!upgrade <pokemon_id>`',
    discordDescription: 'Melhora um Pokémon',
  },
  market: {
    name: 'market',
    category: 'pokemon',
    summary: 'Mostra o mercado diário ou compra um slot',
    slackUsage: '`!market` / `!market buy <slot>`',
    discordDescription: 'Mostra o mercado diário ou compra um slot',
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
