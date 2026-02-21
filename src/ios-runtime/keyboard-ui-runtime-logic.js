function resolveKeyboardEventNames(platformOs) {
  return platformOs === 'ios'
    ? { showEvent: 'keyboardWillShow', hideEvent: 'keyboardWillHide' }
    : { showEvent: 'keyboardDidShow', hideEvent: 'keyboardDidHide' };
}

function resolveKeyboardBarAnimation(showKeyboardActionBar) {
  return {
    toValue: showKeyboardActionBar ? 1 : 0,
    duration: showKeyboardActionBar ? 140 : 120,
  };
}

module.exports = {
  resolveKeyboardEventNames,
  resolveKeyboardBarAnimation,
};
