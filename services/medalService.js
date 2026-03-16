const { getSupabaseClient } = require("../database/supabase");

const DEFAULT_MEDALS = [
  {
    code: "flame_heart",
    name: "Coração de Chama",
    nature_element: "fire",
    description: "Concede afinidade com progresso ofensivo e combates agressivos.",
  },
  {
    code: "tidal_guard",
    name: "Guarda das Marés",
    nature_element: "water",
    description: "Concede afinidade com consistência e resistência defensiva.",
  },
  {
    code: "terra_root",
    name: "Raiz da Terra",
    nature_element: "earth",
    description: "Concede afinidade com evolução sustentável de coleção.",
  },
  {
    code: "sky_echo",
    name: "Eco dos Ventos",
    nature_element: "air",
    description: "Concede afinidade com velocidade e ações estratégicas.",
  },
  {
    code: "storm_focus",
    name: "Foco da Tempestade",
    nature_element: "storm",
    description: "Concede afinidade com marcos raros e jogadas de alto impacto.",
  },
];

async function seedDefaultMedals() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("medals").upsert(DEFAULT_MEDALS, { onConflict: "code" });
  if (error) throw error;
}

module.exports = {
  DEFAULT_MEDALS,
  seedDefaultMedals,
};
