#!/usr/bin/env node
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATIONS_DIR = path.join(__dirname, "..", "database", "migrations");

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Pasta de migrations não encontrada: ${MIGRATIONS_DIR}`);
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureSchemaMigrationsTable(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      id bigserial primary key,
      filename text not null unique,
      executed_at timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    "select filename, executed_at from public.schema_migrations order by filename asc",
  );
  return result.rows;
}

async function printStatus(client) {
  const applied = await getAppliedMigrations(client);

  if (applied.length === 0) {
    console.log("Nenhuma migration aplicada ainda.");
    return;
  }

  console.log("Migrations aplicadas:");
  for (const migration of applied) {
    console.log(
      `- ${migration.filename} (${migration.executed_at.toISOString()})`,
    );
  }
}

async function runMigrations(client) {
  const files = getMigrationFiles();

  if (files.length === 0) {
    console.log("Nenhum arquivo .sql encontrado em database/migrations.");
    return;
  }

  const appliedRows = await getAppliedMigrations(client);
  const appliedSet = new Set(appliedRows.map((row) => row.filename));

  for (const filename of files) {
    if (appliedSet.has(filename)) {
      console.log(`→ ${filename} pulada (já aplicada)`);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filePath, "utf8");

    console.log(`Executando migration: ${filename}`);

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "insert into public.schema_migrations (filename) values ($1)",
        [filename],
      );
      await client.query("COMMIT");
      console.log(`✓ ${filename} aplicada`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Falha na migration ${filename}: ${error.message}`);
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error(
      "DATABASE_URL não definida. Configure a variável de ambiente e tente novamente.",
    );
    process.exit(1);
  }

  const statusOnly = process.argv.includes("--status");
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await ensureSchemaMigrationsTable(client);

    if (statusOnly) {
      await printStatus(client);
      return;
    }

    await runMigrations(client);
    console.log("Processo de migrations finalizado.");
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
