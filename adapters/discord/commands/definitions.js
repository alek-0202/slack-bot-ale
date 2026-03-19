const { SlashCommandBuilder } = require("discord.js");
const { getSharedCommand } = require("../../../application/shared/commandCatalog");

const commands = [
  new SlashCommandBuilder().setName("help").setDescription(getSharedCommand("help").discordDescription),
  new SlashCommandBuilder().setName("pokemonhelp").setDescription(getSharedCommand("pokemonhelp").discordDescription),
  new SlashCommandBuilder().setName("profile").setDescription(getSharedCommand("profile").discordDescription),
  new SlashCommandBuilder().setName("balance").setDescription("Mostra seu gold atual"),
  new SlashCommandBuilder().setName("daily").setDescription("Resgata sua recompensa diária"),
  new SlashCommandBuilder().setName("dhelp").setDescription("Explica o daily e suas chances"),
  new SlashCommandBuilder().setName("capture").setDescription(getSharedCommand("capture").discordDescription),
  new SlashCommandBuilder().setName("pokedex").setDescription(getSharedCommand("pokedex").discordDescription),
  new SlashCommandBuilder().setName("pokeall").setDescription("Abre o catálogo global de espécies"),
  new SlashCommandBuilder()
    .setName("pokename")
    .setDescription(getSharedCommand("pokename").discordDescription)
    .addStringOption((option) => option.setName("nome").setDescription("Nome exato do Pokémon").setRequired(true)),
  new SlashCommandBuilder()
    .setName("poketag")
    .setDescription(getSharedCommand("poketag").discordDescription)
    .addStringOption((option) => option.setName("tag").setDescription("Tag exibida ao lado do nome, ex.: #25").setRequired(true)),
  new SlashCommandBuilder().setName("elements").setDescription(getSharedCommand("elements").discordDescription),
  new SlashCommandBuilder().setName("pa").setDescription(getSharedCommand("pa").discordDescription),
  new SlashCommandBuilder()
    .setName("pokeid")
    .setDescription(getSharedCommand("pokeid").discordDescription)
    .addIntegerOption((option) =>
      option.setName("pokemon_id").setDescription("ID da captura/coleção").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("pokeplayer")
    .setDescription(getSharedCommand("pokeplayer").discordDescription)
    .addUserOption((option) => option.setName("usuario").setDescription("Jogador alvo").setRequired(true))
    .addStringOption((option) => option.setName("pokemon").setDescription("Nome do Pokémon").setRequired(true)),
  new SlashCommandBuilder()
    .setName("upgrade")
    .setDescription(getSharedCommand("upgrade").discordDescription)
    .addIntegerOption((option) =>
      option.setName("pokemon_id").setDescription("ID da captura para upgrade").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("up")
    .setDescription(getSharedCommand("up").discordDescription)
    .addIntegerOption((option) =>
      option.setName("pokemon_id").setDescription("ID da captura para upgrade em lote").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("nivel").setDescription("Nível alvo do upgrade em lote").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("evolve")
    .setDescription(getSharedCommand("evolve").discordDescription)
    .addIntegerOption((option) =>
      option.setName("pokemon_id").setDescription("ID da captura para evolução").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("sell")
    .setDescription("Abre confirmação para vender um Pokémon")
    .addIntegerOption((option) =>
      option.setName("pokemon_id").setDescription("ID da captura para venda").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("resetpokeid")
    .setDescription("Reseta upgrades de um Pokémon e devolve o gold investido")
    .addIntegerOption((option) =>
      option.setName("pokemon_id").setDescription("ID da captura para reset").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("market")
    .setDescription(getSharedCommand("market").discordDescription)
    .addSubcommand((sub) => sub.setName("view").setDescription("Visualiza a vitrine"))
    .addSubcommand((sub) =>
      sub
        .setName("buy")
        .setDescription("Compra um slot do mercado")
        .addIntegerOption((option) => option.setName("slot").setDescription("Número do slot").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("change").setDescription("Solicita a troca manual da loja diária")),
  new SlashCommandBuilder()
    .setName("trade")
    .setDescription(getSharedCommand("trade").discordDescription)
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Inicia um trade com outro usuário")
        .addUserOption((option) => option.setName("usuario").setDescription("Usuário alvo").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-pokemon")
        .setDescription("Adiciona Pokémon à sua oferta")
        .addIntegerOption((option) => option.setName("pokemon_id").setDescription("ID do Pokémon").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-gold")
        .setDescription("Define o gold ofertado")
        .addIntegerOption((option) => option.setName("valor").setDescription("Gold ofertado").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove-pokemon")
        .setDescription("Remove Pokémon da oferta")
        .addIntegerOption((option) => option.setName("pokemon_id").setDescription("ID do Pokémon").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("remove-gold").setDescription("Zera seu gold ofertado"))
    .addSubcommand((sub) => sub.setName("view").setDescription("Mostra estado do trade"))
    .addSubcommand((sub) => sub.setName("accept").setDescription("Aceita trade pendente"))
    .addSubcommand((sub) => sub.setName("decline").setDescription("Recusa/cancela trade")),
];

module.exports = {
  discordCommandDefinitions: commands,
};
