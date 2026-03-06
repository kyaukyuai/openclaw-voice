import composerComponentStyles from './composer-component-styles';
import gatewayComponentStyles from './gateway-component-styles';
import historyComponentStyles from './history-component-styles';
import settingsComponentStyles from './settings-component-styles';

const componentStyles = {
  ...gatewayComponentStyles,
  ...composerComponentStyles,
  ...settingsComponentStyles,
  ...historyComponentStyles,
};

export default componentStyles;
