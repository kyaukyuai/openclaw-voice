function getSettingsKeyboardAdditionalOffset(platformOs) {
  return platformOs === 'ios' ? 28 : 16;
}

function getSettingsFieldVisibleDelayMs(platformOs) {
  return platformOs === 'ios' ? 240 : 120;
}

module.exports = {
  getSettingsKeyboardAdditionalOffset,
  getSettingsFieldVisibleDelayMs,
};
