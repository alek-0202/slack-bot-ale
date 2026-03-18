const { EmbedBuilder } = require("discord.js");
const { buildBattleViewModel } = require("../../../application/battle/renderers/battlePresenter");
const { buildPokemonTypesLabel } = require("../../../services/pokemonTypeService");

function renderDiscordBattleInvite({ challengerId, challengedId }) {
  return {
    content: `<@${challengerId}> desafiou <@${challengedId}> para uma batalha PvP.`,
    embeds: [
      new EmbedBuilder()
        .setTitle("⚔️ Duelo PvP")
        .setDescription(
          `O desafio foi enviado para <@${challengedId}>.\n` +
          "Quando o fluxo interativo do Discord for ligado, a resposta de aceite/recusa acontecerá aqui.",
        )
        .setColor(0xe74c3c),
    ],
  };
}

function renderDiscordBattleState(battle) {
  const view = buildBattleViewModel(battle);
  const description = view.players
    .map((player) => (
      `• <@${player.userId}> — **${player.selectedPokemonName}** (Lv ${player.level}) | ` +
      `${buildPokemonTypesLabel(player.selectedPokemonTypes) ? `${buildPokemonTypesLabel(player.selectedPokemonTypes)} | ` : ""}` +
      `HP ${player.hpCurrent}/${player.hpMax} | ATK ${player.attack} | DEF ${player.defense} | ` +
      `Poções ${player.potionsRemaining}`
    ))
    .join("\n");

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("⚔️ Batalha Pokémon PvP")
        .setDescription(description)
        .addFields({ name: "Turno atual", value: `<@${view.currentTurnUserId}>`, inline: true })
        .addFields({ name: "Rodada", value: String(view.round), inline: true })
        .setColor(0x3498db),
    ],
  };
}

function renderDiscordBattleFinished({ winnerId, loserId }) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle("🏁 Batalha encerrada")
        .setDescription(`🏆 Vencedor: <@${winnerId}>\n💀 Derrotado: <@${loserId}>`)
        .setColor(0x2ecc71),
    ],
  };
}

module.exports = {
  renderDiscordBattleInvite,
  renderDiscordBattleState,
  renderDiscordBattleFinished,
};
