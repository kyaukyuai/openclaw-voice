export function resolveKeyboardEventNames(platformOs: string): {
  showEvent: 'keyboardWillShow' | 'keyboardDidShow';
  hideEvent: 'keyboardWillHide' | 'keyboardDidHide';
} {
  return platformOs === 'ios'
    ? { showEvent: 'keyboardWillShow', hideEvent: 'keyboardWillHide' }
    : { showEvent: 'keyboardDidShow', hideEvent: 'keyboardDidHide' };
}

export function resolveKeyboardBarAnimation(showKeyboardActionBar: boolean): {
  toValue: 0 | 1;
  duration: number;
} {
  return {
    toValue: showKeyboardActionBar ? 1 : 0,
    duration: showKeyboardActionBar ? 140 : 120,
  };
}
