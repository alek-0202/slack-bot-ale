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
- `RENDERED_IMAGE_PUBLIC_BASE_URL` (URL pública do serviço que expõe `/rendered-images/:id`, ex.: `http://SEU_HOST:3001`)
- `PUBLIC_BASE_URL` (fallback legado, usado apenas quando `RENDERED_IMAGE_PUBLIC_BASE_URL` não estiver definido)
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

## 6) Healthcheck e resiliência

Cada processo do bot sobe um endpoint HTTP simples em `/health`.

Exemplo de retorno:

```json
{"status":"ok","service":"slack-bot","uptimeSeconds":123,"timestamp":"2026-01-01T00:00:00.000Z"}
```

Uso recomendado:

- UptimeRobot apontando para:
  - `http://SEU_HOST:3001/health`
  - `http://SEU_HOST:3002/health`

O `docker-compose.yml` usa `restart: always` para os dois serviços, mantendo reinício automático após falhas e reboot da VM.

---

## 7) Fluxo de branches (`dev` -> `main`)

Fluxo recomendado:

1. Criar branch de feature a partir de `dev`:
   - `feature/minha-mudanca`
2. Abrir PR da feature para `dev`.
3. Validar CI no PR.
4. Fazer merge em `dev` (integração).
5. Quando pronto para release, abrir PR de `dev` para `main`.
6. Ao merge/push em `main`, o deploy de produção é executado automaticamente.

Resumo:

- `dev` = integração/desenvolvimento
- `main` = produção
- apenas `main` faz deploy em produção

---

## 8) GitHub Actions

### CI (`.github/workflows/ci.yml`)

Executa em pushes (main/dev/feature/hotfix) e PRs para `dev`/`main`:

1. `npm ci`
2. `npm run test --if-present`
3. `docker compose config`

### Deploy produção (`.github/workflows/deploy.yml`)

Executa **somente** em push na `main`.

Comando remoto aplicado na VM:

1. entra em `VM_APP_PATH`
2. salva commit anterior (`PREVIOUS_COMMIT`) para rollback
3. `git fetch --all --prune`
4. `git reset --hard origin/main`
5. `docker compose up -d --build --remove-orphans`
6. `docker compose ps`

Se ocorrer erro no meio do processo, o script faz rollback para o commit anterior e sobe os containers novamente.

---

## 9) Secrets necessários no GitHub

No repositório (Settings → Secrets and variables → Actions), configurar:

- `VM_HOST` (IP ou domínio da VM)
- `VM_USER` (usuário SSH)
- `VM_SSH_KEY` (chave privada SSH em formato PEM/OpenSSH)
- `VM_APP_PATH` (caminho do projeto na VM, ex.: `/opt/slack-bot-ale`)

Observações:

- Garanta que a chave pública correspondente esteja em `~/.ssh/authorized_keys` do usuário da VM.
- O repositório deve estar clonado em `VM_APP_PATH`.
- O arquivo `.env` de produção deve existir na VM.

---

## 10) Setup inicial na VM

Pré-requisitos na VM Linux:

- Docker + plugin Docker Compose
- Git
- repositório clonado no `VM_APP_PATH`
- `.env` configurado no servidor

Primeiro deploy manual:

```bash
git clone <repo> /opt/slack-bot-ale
cd /opt/slack-bot-ale
cp .env.example .env
# editar .env
docker compose up -d --build
```

Depois disso, o deploy passa a ser automático em push/merge na `main`.

---

## 11) Observações operacionais

- Falhas fatais encerram o processo com log estruturado e consistente (`unhandledRejection`/`uncaughtException`), permitindo restart automático pelo Docker.
- A lógica de comandos e serviços existente não foi reescrita.
- A base fica pronta para próximos passos (ex.: ambiente de staging, migrations automáticas por job dedicado e proteção de branch).
