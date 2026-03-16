# slack-bot-ale (Slack + Discord)

Bot Pokémon com suporte multi-plataforma, reaproveitando serviços e domínio já existentes.

## Arquitetura

- **Core compartilhado**: utilitários de identidade de plataforma em `core/`.
- **Services/Repository compartilhados**: toda lógica de negócio continua em `services/` e acesso Supabase em `database/`.
- **Adapters de plataforma**:
  - Slack: bootstrap em `index.js` (inalterado em comportamento).
  - Discord: bootstrap em `adapters/discord/index.js`.

Para preservar compatibilidade com o schema atual (campos `slack_user_id` e `channel_id`), IDs do Discord são persistidos como `discord:<id>` via `core/platformIdentity.js`.

## Variáveis de ambiente

### Slack (já existente)
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`

### Discord (novo)
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID` (opcional, recomendado em dev para registrar comandos rapidamente)

### Banco
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- demais variáveis já usadas no projeto

## Scripts

- `npm run start:slack` → sobe o bot Slack
- `npm run start:discord` → sobe o bot Discord
- `npm run discord:register` → registra slash commands do Discord

## Registro de slash commands (Discord)

1. Configure `DISCORD_BOT_TOKEN` e `DISCORD_CLIENT_ID`.
2. Para desenvolvimento, configure também `DISCORD_GUILD_ID`.
3. Rode:

```bash
npm run discord:register
```

Com `DISCORD_GUILD_ID`, o registro é no guild informado (propagação rápida). Sem ele, o registro é global.

## Comandos Discord implementados

- `/help`
- `/pokemonhelp`
- `/profile`
- `/capture`
- `/pokedex` (com botões Anterior/Próximo)
- `/pa` (com botões Anterior/Próximo)
- `/upgrade pokemon_id:<id>`
- `/market view`
- `/market buy slot:<n>`
- `/trade start usuario:<@user>`
- `/trade add-pokemon pokemon_id:<id>`
- `/trade add-gold valor:<n>`
- `/trade remove-pokemon pokemon_id:<id>`
- `/trade remove-gold`
- `/trade view`
- `/trade accept`
- `/trade decline`

## Observações

- O Slack não foi misturado com implementação Discord; cada plataforma tem adapter próprio.
- A base de domínio e regras de negócio permanece centralizada nos serviços existentes.
- `/profile` cria o usuário automaticamente se ainda não existir (equivalente prático ao `!poke start`).
