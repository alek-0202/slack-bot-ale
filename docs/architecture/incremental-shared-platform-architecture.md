# Arquitetura incremental para comandos compartilhados Slack + Discord

## Diagnóstico atual

- O repositório já possui boa parte da regra de negócio centralizada em `services/`, especialmente para captura, mercado, evolução, trade e Pokédex.
- Slack concentra bootstrap, registro textual de comandos e handlers interativos em `index.js`, `commands/` e `handlers/`.
- Discord concentra bootstrap, slash commands e botões em `adapters/discord/`.
- Há duplicação principalmente em três pontos:
  - orquestração dos mesmos casos de uso (`profile`, `capture`, `upgrade`, `market`, `trade`);
  - textos de ajuda/descrição de comandos;
  - renderização/plumbing misturados à decisão de negócio nos handlers.
- A maior divergência estrutural é que Slack ainda usa módulos de comando independentes e Discord usa um handler monolítico com `if`s por comando.

## Regra adotada a partir desta base

1. **Regra de negócio** deve ficar em `services/` ou migrar gradualmente para `application/useCases/` quando envolver orquestração de múltiplos serviços.
2. **Casos de uso compartilhados** devem receber IDs já normalizados por plataforma e retornar objetos simples (`ok`, `reason`, `data`).
3. **Adapters de plataforma** devem apenas:
   - traduzir entrada (texto/slash/button);
   - chamar caso de uso compartilhado;
   - renderizar resposta com presenter/render específico da plataforma.
4. **Catálogo de comandos compartilhados** deve concentrar nome, categoria e descrições reutilizadas por Slack/Discord.

## Estrutura incremental recomendada

```text
application/
  shared/
    commandCatalog.js
  useCases/
    pokemon/
      getProfileSummary.js
      captureForUser.js
adapters/
  slack/
    renderers/
  discord/
    renderers/
services/
commands/
handlers/
```

## Prova inicial implementada nesta tarefa

- `profile` agora usa o caso de uso compartilhado `application/useCases/pokemon/getProfileSummary.js`.
- `capture` agora usa o caso de uso compartilhado `application/useCases/pokemon/captureForUser.js`.
- Slack e Discord renderizam o resultado por arquivos próprios em `adapters/slack/renderers/` e `adapters/discord/renderers/`.
- O catálogo `application/shared/commandCatalog.js` passa a ser a fonte compartilhada para descrições básicas dos comandos que existem nas duas plataformas.

## Próximos passos seguros

1. Migrar `upgrade`, `market` e `trade` para `application/useCases/` sem alterar os serviços existentes.
2. Extrair um dispatcher compartilhado para o Discord em vez de manter toda a lógica em `commandHandler.js`.
3. Criar presenters compartilhados por intenção de resposta (`success`, `validation_error`, `empty_state`) quando o volume justificar.
4. Manter handlers interativos (`buttons`, `actions`) separados por plataforma, mas consumindo os mesmos casos de uso.

## Padrão para novas features

1. Criar a regra central em `application/useCases/<domínio>/`.
2. Reutilizar `services/` para acesso a banco e cálculos.
3. Criar/ajustar o render Slack em `adapters/slack/renderers/`.
4. Criar/ajustar o render Discord em `adapters/discord/renderers/`.
5. Registrar o comando nos adapters de cada plataforma, mas sem duplicar a regra.
6. Se a feature existir nas duas plataformas, adicionar descrição ao `commandCatalog.js`.
