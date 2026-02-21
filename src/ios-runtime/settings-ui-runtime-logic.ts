export function getSettingsKeyboardAdditionalOffset(platformOs: string): number {
  return platformOs === 'ios' ? 28 : 16;
}

export function getSettingsFieldVisibleDelayMs(platformOs: string): number {
  return platformOs === 'ios' ? 240 : 120;
}
