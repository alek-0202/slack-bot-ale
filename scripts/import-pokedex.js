require("dotenv").config();

const { importPokemonSpecies } = require("../services/pokedexImportService");

function parseOptions(argv) {
  const args = argv.slice(2);
  const options = {
    limit: null,
    batchSize: 12,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--limit") {
      options.limit = Number(args[i + 1]) || null;
      i += 1;
      continue;
    }

    if (arg === "--batch-size") {
      options.batchSize = Math.max(1, Number(args[i + 1]) || 12);
      i += 1;
    }
  }

  return options;
}

async function main() {
  const options = parseOptions(process.argv);
  const total = await importPokemonSpecies(options);
  console.log(`Importação concluída. ${total} espécies processadas.`);
}

main().catch((error) => {
  console.error("Falha ao importar Pokédex:", error.message || error);
  process.exit(1);
});
