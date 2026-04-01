const { parsePositiveInt } = require('../utils/number');
const { getMrSkillSetup } = require('../services/pokemonMagicService');

const MRSKILL_TOGGLE_ACTION_ID = 'mrskill_toggle_skill';

function buildMrSkillBlocks({ slackUserId, setup }) {
  const pokemonName = setup.pokemon.pokemon_species?.name || `Pokémon #${setup.pokemon.id}`;
  const selected = new Set(setup.selectedSkillIds.map((id) => String(id)));

  return {
    text: `HUD de skills de ${pokemonName}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🧩 Configurar skills características', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*Treinador:* <@${slackUserId}>\n` +
            `*Pokémon:* ${pokemonName} (#${setup.pokemon.id})\n` +
            `*Nível:* ${setup.pokemon.level}\n` +
            `*Slots equipáveis:* ${selected.size}/2`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Toque para equipar/remover. O loadout final mantém no máximo 2 skills.',
        },
      },
      ...setup.availableSkills.map((skill) => {
        const isSelected = selected.has(String(skill.id));
        return {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*${skill.icon || '✨'} ${skill.name}* (${skill.element})\n` +
              `${skill.description || `CD ${skill.cooldownRounds || 0} rodada(s) • Energia extra ${skill.extraEnergyCost || 0}`}`,
          },
          accessory: {
            type: 'button',
            action_id: MRSKILL_TOGGLE_ACTION_ID,
            style: isSelected ? 'primary' : undefined,
            text: { type: 'plain_text', text: `${isSelected ? '✅ Equipado' : 'Equipar'}`.slice(0, 75), emoji: true },
            value: JSON.stringify({
              slackUserId,
              pokemonId: setup.pokemon.id,
              skillId: String(skill.id),
            }),
          },
        };
      }),
    ],
  };
}

module.exports = {
  name: 'mrskill',
  aliases: ['mskill'],
  async execute({ event, args, say }) {
    const pokemonId = parsePositiveInt(args);
    if (!pokemonId) {
      await say('Use `!mrskill <pokeid>` com um ID válido da sua coleção.');
      return;
    }

    const setup = await getMrSkillSetup({ slackUserId: event.user, pokemonId });
    if (!setup.ok) {
      const map = {
        pokemon_not_found: 'Pokémon não encontrado.',
        not_owner: 'Você não pode configurar skills de Pokémon de outro usuário.',
        characteristic_skills_disabled: 'Skills características estão desativadas neste ambiente.',
        level_too_low: `Esse Pokémon precisa estar no nível ${setup.minLevel || 50}+ para usar !mrskill.`,
        pokemon_without_elements: 'Esse Pokémon não possui elementos válidos para skills características.',
        no_characteristic_skills: 'Nenhuma skill característica disponível para os elementos deste Pokémon.',
      };
      await say(map[setup.reason] || 'Não consegui abrir o HUD de skills agora 😵');
      return;
    }

    await say(buildMrSkillBlocks({ slackUserId: event.user, setup }));
  },
  MRSKILL_TOGGLE_ACTION_ID,
  buildMrSkillBlocks,
};
