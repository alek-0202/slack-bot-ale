# slack-bot-ale (Slack + Discord)

Bot Pokémon em Node.js com adapters separados para Slack e Discord, usando Supabase/Postgres como banco.

## 1) Estrutura atual (mantida)

- `index.js`: bootstrap do bot Slack.
- `adapters/discord/index.js`: bootstrap do bot Discord.
- `services/`, `database/`, `commands/`: lógica de domínio compartilhada.
- `scripts/runMigrations.js`: execução e status de migrations SQL.

A lógica principal do bot foi preservada; a profissionalização adiciona camada operacional (Docker, Compose, CI/CD, healthcheck e docs).

---

## 2) Variáveis de ambiente

Copie `.env.example` para `.env` e preencha os valores reais:

```bash
cp .env.example .env
```

### Obrigatórias

- Slack: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`
- Discord: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`
- Banco: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### Opcionais

- `DISCORD_GUILD_ID` (registro rápido de comandos em dev)
- `DATABASE_URL` (quando usado por scripts SQL)
- `GIPHY_API_KEY`, `OLLAMA_HOST`, `OLLAMA_MODEL`
- `HEALTHCHECK_PORT` (padrão 3000)
- `LOG_LEVEL` (`debug`, `info`, `warn`, `error`; padrão `info`)
- `LOG_FORMAT` (`text` ou `json`; padrão `text`)
- `CRITICAL_ALERT_WEBHOOK_URL` (opcional, para alertar falhas críticas de runtime/startup)

> Nunca commite `.env`.

---

## 3) Scripts npm

- `npm run test` → executa suíte mínima de testes automatizados (`node --test`)
- `npm run slack:start` → inicia Slack
- `npm run discord:start` → inicia Discord
- `npm run discord:register` → registra slash commands
- `npm run migrate` → aplica migrations
- `npm run migrate:status` → status das migrations

(Compatibilidade preservada com `start:slack` e `start:discord`.)

---

## 4) Execução local (sem Docker)

```bash
npm ci
npm run slack:start
# em outro terminal
npm run discord:start
```

Registro de comandos Discord:

```bash
npm run discord:register
```

Migrations:

```bash
npm run migrate:status
npm run migrate
```

---

## 5) Execução com Docker Compose (VM única)

### Subir serviços

```bash
docker compose up -d --build
```

Serviços criados:

- `slack-bot` (health em `http://VM_IP:3001/health`)
- `discord-bot` (health em `http://VM_IP:3002/health`)

### Logs e status

```bash
docker compose ps
docker compose logs -f slack-bot
docker compose logs -f discord-bot
```

### Parar

```bash
docker compose down
```

---

## 6) Healthcheck e monitoramento

Cada processo do bot sobe um endpoint HTTP simples em `/health`.

Exemplo de retorno:

```json
{"status":"ok","service":"slack-bot","uptimeSeconds":123,"timestamp":"2026-01-01T00:00:00.000Z"}
```

Uso recomendado:

- UptimeRobot apontando para:
  - `http://SEU_HOST:3001/health`
  - `http://SEU_HOST:3002/health`

Também há `healthcheck` nativo no `docker-compose.yml` para reinício automático com `restart: unless-stopped`.

---

## 7) GitHub Actions

### CI (`.github/workflows/ci.yml`)

Executa em push/PR:

1. `npm ci`
2. `npm run test` (testes automatizados reais de regras puras)
3. `docker compose config` (validação do compose)

### Deploy (`.github/workflows/deploy.yml`)

Executa em push na `main` e manual (`workflow_dispatch`) via SSH.

Secrets necessários no GitHub:

- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_PORT`
- `SSH_PROJECT_PATH` (ex.: `/opt/slack-bot-ale`)
- `DEPLOY_ALERT_WEBHOOK_URL` (opcional, alerta simples se workflow falhar)

Comando remoto aplicado (com rollback automático em caso de erro):

1. salva `PREVIOUS_COMMIT`
2. `git fetch --all --prune`
3. `git reset --hard origin/main`
4. `docker compose pull`
5. `docker compose build`
6. `docker compose up -d --remove-orphans`
7. em falha, volta para `PREVIOUS_COMMIT` e sobe containers anteriores

---

## 8) Fluxo de deploy recomendado na VM

Pré-requisitos na VM Linux gratuita:

- Docker + plugin Docker Compose
- repositório clonado no `SSH_PROJECT_PATH`
- `.env` configurado no servidor

Primeiro deploy manual:

```bash
git clone <repo> /opt/slack-bot-ale
cd /opt/slack-bot-ale
cp .env.example .env
# editar .env
docker compose up -d --build
```

Próximos deploys:

- automático via GitHub Actions (push na `main`), ou
- manual com:

```bash
cd /opt/slack-bot-ale
git pull
docker compose up -d --build
```

---

## 9) Observações operacionais

- Falhas fatais encerram o processo com log estruturado e consistente (`unhandledRejection`/`uncaughtException`), permitindo restart automático pelo Docker.
- Alertas críticos opcionais podem ser enviados por webhook sem adicionar stack pesada de observabilidade.
- A lógica de comandos e serviços existente não foi reescrita.
- O projeto continua pronto para evolução via Codex mantendo a stack atual.
