# Assets visuais de Pokémon

Estrutura preparada para o pipeline de render em camadas do card/perfil.

- `frames/tier/*.png`: molduras por faixa visual (`cinza`, `azul`, `roxo`, `vermelho`, `dourado`).
- `effects/shiny/aura.png`: overlay de aura para shiny.
- `effects/level50/aura.png`: overlay de aura para nível 50.

> Este repositório mantém apenas a estrutura de pastas para evitar incompatibilidades de diffs binários.
> Quando quiser gerar placeholders PNG localmente, rode:
>
> `node scripts/generatePokemonVisualAssets.js`

Se os assets PNG estiverem ausentes, o renderer aplica fallback procedural e mantém o comando funcionando.
