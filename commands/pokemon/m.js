module.exports = {
  name: 'm',
  async execute({ args, say }) {
    const normalized = String(args || '').trim().toLowerCase();
    if (normalized !== 'info') {
      await say('Use `!m info`.');
      return;
    }

    await say(
      '🧾 *Comandos de Market*\n' +
      '• `!mi` → market padrão de itens\n' +
      '• `!mg` → market global\n' +
      '• `!mg add item <item>,<quantidade>,<preço>`\n' +
      '• `!mg add pokemon <pokemonId>,<preço>`\n' +
      '• `!mgml` → seus anúncios\n' +
      '• `!mg remove <idvenda>`\n' +
      '• `!mg @user` → filtra vendedor\n' +
      '• `!re` → consome item Reset Energy',
    );
  },
};
