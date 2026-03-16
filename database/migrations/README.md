# Migrations

Este projeto passou a usar migrations SQL versionadas em `database/migrations` para alterações incrementais de produção.

## Convenção
- Arquivos nomeados por timestamp/ordem: `YYYYMMDD_NNN_descricao.sql`
- Cada migration deve ser idempotente quando viável (`IF NOT EXISTS`, `ON CONFLICT`, `DO $$` com checagem em catálogo).

## Execução
Aplique os arquivos em ordem alfabética no Supabase SQL editor ou pipeline de deploy.
