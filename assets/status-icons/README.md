# Status icons

Pasta reservada para PNGs dos mini-ícones de buffs/debuffs/status.

## Convenção
- Nome do arquivo: `<status-id>.png`
- Exemplo: `burn.png`, `psychic_barrier.png`
- Fallback: quando não houver PNG, o renderer usa placeholder via `statusVisualRegistry`.

## Objetivo
Essa estrutura permite evoluir o visual sem alterar regra de negócio da battle engine.
