const { SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Mostra os comandos gerais"),
  new SlashCommandBuilder().setName("pokemonhelp").setDescription("Mostra os comandos do sistema Pokémon"),
  new SlashCommandBuilder().setName("profile").setDescription("Mostra seu perfil Pokémon"),
  new SlashCommandBuilder().setName("capture").setDescription("Captura um Pokémon"),
  new SlashCommandBuilder().setName("pokedex").setDescription("Abre sua Pokédex"),
  new SlashCommandBuilder().setName("pa").setDescription("Mostra atributos dos seus Pokémons"),
  new SlashCommandBuilder()
    .setName("upgrade")
    .setDescription("Melhora um Pokémon")
    .addIntegerOption((option) =>
      option.setName("pokemon_id").setDescription("ID da captura para upgrade").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("market")
    .setDescription("Mostra o mercado diário ou compra um slot")
    .addSubcommand((sub) => sub.setName("view").setDescription("Visualiza a vitrine"))
    .addSubcommand((sub) =>
      sub
        .setName("buy")
        .setDescription("Compra um slot do mercado")
        .addIntegerOption((option) => option.setName("slot").setDescription("Número do slot").setRequired(true)),
    ),
  new SlashCommandBuilder()
    .setName("trade")
    .setDescription("Inicia ou gerencia trades")
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
