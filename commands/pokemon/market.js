module.exports = {
  name: 'market',
  async execute({ event, say }) {
    await say(
      `🧭 O comando \`!market\` mudou.\n` +
      `• Use \`!mi\` para o market padrão de itens.\n` +
      `• Use \`!mg\` para o market global entre jogadores.\n` +
      `• Use \`!m info\` para ver todos os comandos.`,
    );
  },
};
