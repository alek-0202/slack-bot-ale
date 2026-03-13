require("dotenv").config();

const { importPokemonSpecies } = require("../services/pokedexImportService");

async function main() {
  const limit = Number(process.argv[2] || 151);
  const total = await importPokemonSpecies({ limit });
  console.log(`Importação concluída. ${total} espécies processadas.`);
}

main().catch((error) => {
  console.error("Falha ao importar Pokédex:", error.message || error);
  process.exit(1);
});
