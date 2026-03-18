# Fundação arquitetural compartilhada para batalhas Slack + Discord

## Diagnóstico objetivo

O projeto já tinha uma primeira versão de PvP funcional para Slack, mas com acoplamento em três pontos:

- `services/battleService.js` concentrava regras de domínio, fluxo de estado e mensagens de plataforma.
- `services/battleEngineService.js` tinha parte do cálculo compartilhável, porém ainda fora de um domínio explícito.
- `services/battleRenderService.js` representava apenas a visão Slack, então o fluxo não deixava um contrato claro para Discord.

Isso gerava um risco direto para a evolução do sistema PvP/PvE: a batalha poderia continuar nascendo como uma feature "do Slack" com adaptação tardia para Discord.

## Base proposta

A fundação passa a separar a batalha em quatro camadas simples:

```text
application/
  battle/
    domain/
      battleState.js
      battleEngine.js
      actionResolver.js
      turnResolver.js
    renderers/
      battlePresenter.js
adapters/
  slack/
    renderers/
      battleRenderer.js
  discord/
    renderers/
      battleRenderer.js
services/
  battleService.js
  battleStateStore.js
```

## Responsabilidades dos módulos

### `battleState.js`
Responsável por:
- criar o estado inicial da batalha;
- controlar status (`pending`, `selecting`, `active`, `finished`, `declined`);
- aplicar seleção de Pokémon;
- iniciar batalha;
- trocar turno;
- finalizar batalha.

### `battleEngine.js`
Responsável por:
- cálculo de HP de batalha;
- dano e crítico;
- resolução de ataque;
- resolução de poção;
- decisão de primeiro turno.

### `actionResolver.js`
Responsável por:
- validar se convite pode ser respondido;
- validar se seleção pode acontecer;
- validar se a ação do turno é permitida no estado atual.

### `turnResolver.js`
Responsável por:
- resolver a ação do turno usando o núcleo (`attack`, `potion`, `magic` placeholder);
- decidir se a batalha terminou;
- decidir se passa turno ou não.

### `battlePresenter.js`
Responsável por:
- montar um view model neutro de batalha;
- servir como ponto comum para renderização Slack e Discord.

### Renderers por plataforma
- Slack: converte o view model em mensagem Bolt/blocos.
- Discord: converte o view model em embed/payload compatível com interactions.

## Como Slack e Discord devem consumir o núcleo

### Slack
- continua usando comandos textuais (`!b`, `!bpick`, `!ataque`, `!pocao`, `!magia`);
- traduz entrada em intenção de domínio;
- chama `battleService.js`, que agora orquestra o núcleo compartilhado;
- renderiza via `adapters/slack/renderers/battleRenderer.js`.

### Discord
Próximo passo esperado:
- criar slash commands/subcommands de batalha;
- usar o mesmo núcleo (`battleState`, `actionResolver`, `turnResolver`);
- renderizar convites/estado/finalização via `adapters/discord/renderers/battleRenderer.js`;
- trocar apenas o transporte/interação (buttons, selects, slash commands), sem duplicar regra.

## Decisões importantes desta fundação

1. O estado da batalha continua em memória por enquanto, preservando o comportamento atual e evitando ampliar escopo.
2. A regra de `magic` permanece placeholder, mas já passa pelo mesmo contrato de resolução de turno.
3. O presenter neutro prepara o terreno para PvE futuro, spectators e persistência sem depender do formato do Slack.
4. O store atual não foi substituído nesta tarefa; ele segue como infraestrutura e não como regra de domínio.

## Próximos passos seguros

1. Criar use cases explícitos em `application/useCases/battle/` para iniciar convite, aceitar, escolher Pokémon e agir no turno.
2. Conectar Discord a esse mesmo fluxo via slash commands + componentes interativos.
3. Persistir batalhas em banco quando o PvP/PvE exigir retomada, histórico ou timeout distribuído.
4. Evoluir `turnResolver.js` para suportar skills, efeitos, buffs/debuffs e IA PvE sem mudar adapters.
