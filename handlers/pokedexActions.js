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
const { sendEphemeral } = require("../utils/slackResponse");

const POKEDEX_FILTER_RARITY_ACTION_ID = "pokedex_filter_rarity";
const POKEDEX_FILTER_ELEMENT_ACTION_ID = "pokedex_filter_element";

function parseFilterActionValue(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function registerPokedexActions(app) {
  const handlePokedexNavigation = async ({ ack, body, action, client, respond }) => {
    await ack();

    try {
      const { ownerSlackUserId, index, mode, filter } = parseNavValue(action.value);
      const actorSlackUserId = body.user?.id;

      if (!ownerSlackUserId || !actorSlackUserId || actorSlackUserId !== ownerSlackUserId) {
        if (respond) {
          await sendEphemeral(respond, {
            text: "Você só pode navegar na Pokédex que você abriu com `!pokedex` ou `!pa`.",
          });
        }

        return;
      }

      const view = await getPokedexView(ownerSlackUserId, index, filter);
      const message = await buildPokedexMessage({
        slackUserId: ownerSlackUserId,
        entry: view.entry,
        index: view.index,
        total: view.total,
        mode,
        slackClient: client,
        channelId: body.channel.id,
        commandName: mode,
        filter,
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
        await sendEphemeral(respond, {
          text: "Não consegui atualizar essa visualização da Pokédex 😵",
        });
      }
    }
  };

  const handleFilterAction = async ({ ack, body, action, client, respond }) => {
    await ack();

    const payload = parseFilterActionValue(action?.value);
    const actorSlackUserId = body.user?.id;
    if (!payload?.ownerSlackUserId || payload.ownerSlackUserId !== actorSlackUserId) {
      if (respond) {
        await sendEphemeral(respond, { text: "Só o dono pode usar este filtro." });
      }
      return;
    }

    const filter = { rarity: payload.rarity || null, element: payload.element || null };
    const view = await getPokedexView(actorSlackUserId, 0, filter);
    const message = await buildPokedexMessage({
      slackUserId: actorSlackUserId,
      entry: view.entry,
      index: view.index,
      total: view.total,
      mode: payload.mode || "pa",
      slackClient: client,
      channelId: body.channel.id,
      commandName: payload.mode || "pa",
      filter,
    });

    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: message.text,
      blocks: message.blocks,
    });
  };

  app.action(POKEDEX_NAV_PREV_ACTION_ID, handlePokedexNavigation);
  app.action(POKEDEX_NAV_NEXT_ACTION_ID, handlePokedexNavigation);
  app.action(PA_NAV_PREV_ACTION_ID, handlePokedexNavigation);
  app.action(PA_NAV_NEXT_ACTION_ID, handlePokedexNavigation);
  app.action(POKEDEX_FILTER_RARITY_ACTION_ID, handleFilterAction);
  app.action(POKEDEX_FILTER_ELEMENT_ACTION_ID, handleFilterAction);

  const handleSpeciesNavigation = async ({ ack, body, action, client, respond }) => {
    await ack();

    try {
      const { ownerSlackUserId, index, speciesIds } = parseSpeciesNavValue(action.value);
      const actorSlackUserId = body.user?.id;

      if (!ownerSlackUserId || !actorSlackUserId || actorSlackUserId !== ownerSlackUserId) {
        if (respond) {
          await sendEphemeral(respond, {
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
        await sendEphemeral(respond, {
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
  POKEDEX_FILTER_RARITY_ACTION_ID,
  POKEDEX_FILTER_ELEMENT_ACTION_ID,
};
