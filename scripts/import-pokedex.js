require("dotenv").config();

const { importPokemonSpecies } = require("../services/pokedexImportService");

async function main() {
  const limit = Number(process.argv[2] || 151);
  const result = await importPokemonSpecies({ limit });
  console.log(
    `Importação concluída. total=${result.totalSpecies}, primeira_passada=${result.firstPassRows}, segunda_passada=${result.secondPassRows}`,
  );
}

main().catch((error) => {
  console.error("Falha ao importar Pokédex:", error.message || error);
  process.exit(1);
});
