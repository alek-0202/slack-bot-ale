function buildEphemeralResponse(payload = {}) {
  const basePayload = typeof payload === 'string'
    ? { text: payload }
    : { ...payload };

  return {
    ...basePayload,
    response_type: 'ephemeral',
    replace_original: false,
    delete_original: false,
  };
}

async function sendEphemeral(respond, payload) {
  if (!respond) return;
  await respond(buildEphemeralResponse(payload));
}

module.exports = {
  buildEphemeralResponse,
  sendEphemeral,
};
