const {
  POKEDEX_NAV_PREV_ACTION_ID,
  POKEDEX_NAV_NEXT_ACTION_ID,
  PA_NAV_PREV_ACTION_ID,
  PA_NAV_NEXT_ACTION_ID,
  parseNavValue,
  getPokedexView,
  buildPokedexMessage,
} = require("../services/pokedexViewService");
const {
  SPECIES_NAV_PREV_ACTION_ID,
  SPECIES_NAV_NEXT_ACTION_ID,
  parseSpeciesNavValue,
  getSpeciesView,
  buildSpeciesMessage,
} = require("../services/speciesCatalogViewService");

function registerPokedexActions(app) {
  const handlePokedexNavigation = async ({ ack, body, action, client, respond }) => {
    await ack();

    try {
      const { ownerSlackUserId, index, mode } = parseNavValue(action.value);
      const actorSlackUserId = body.user?.id;

      if (!ownerSlackUserId || !actorSlackUserId || actorSlackUserId !== ownerSlackUserId) {
        if (respond) {
          await respond({
            response_type: "ephemeral",
            text: "Você só pode navegar na Pokédex que você abriu com `!pokedex` ou `!pa`.",
          });
        }

        return;
      }

      const view = await getPokedexView(ownerSlackUserId, index);
      const message = await buildPokedexMessage({
        slackUserId: ownerSlackUserId,
        entry: view.entry,
        index: view.index,
        total: view.total,
        mode,
      });

      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: message.text,
        blocks: message.blocks,
      });
    } catch (error) {
      console.error("Erro na navegação da pokédex:", error.message || error);

      if (respond) {
        await respond({
          response_type: "ephemeral",
          text: "Não consegui atualizar essa visualização da Pokédex 😵",
        });
      }
    }
  };

  app.action(POKEDEX_NAV_PREV_ACTION_ID, handlePokedexNavigation);
  app.action(POKEDEX_NAV_NEXT_ACTION_ID, handlePokedexNavigation);
  app.action(PA_NAV_PREV_ACTION_ID, handlePokedexNavigation);
  app.action(PA_NAV_NEXT_ACTION_ID, handlePokedexNavigation);

  const handleSpeciesNavigation = async ({ ack, body, action, client, respond }) => {
    await ack();

    try {
      const { ownerSlackUserId, index, speciesIds } = parseSpeciesNavValue(action.value);
      const actorSlackUserId = body.user?.id;

      if (!ownerSlackUserId || !actorSlackUserId || actorSlackUserId !== ownerSlackUserId) {
        if (respond) {
          await respond({
            response_type: "ephemeral",
            text: "Você só pode navegar na consulta de espécies que você abriu com `!pokeall` ou `!pokename`.",
          });
        }

        return;
      }

      const view = await getSpeciesView(index, speciesIds);
      const message = buildSpeciesMessage({
        slackUserId: ownerSlackUserId,
        entry: view.entry,
        index: view.index,
        total: view.total,
        speciesIds: view.speciesIds,
      });

      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: message.text,
        blocks: message.blocks,
      });
    } catch (error) {
      console.error("Erro na navegação de espécies:", error.message || error);

      if (respond) {
        await respond({
          response_type: "ephemeral",
          text: "Não consegui atualizar essa visualização do catálogo global 😵",
        });
      }
    }
  };

  app.action(SPECIES_NAV_PREV_ACTION_ID, handleSpeciesNavigation);
  app.action(SPECIES_NAV_NEXT_ACTION_ID, handleSpeciesNavigation);
}

module.exports = {
  registerPokedexActions,
};
