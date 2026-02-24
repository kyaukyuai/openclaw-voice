import { StatusBar } from 'expo-status-bar';
import {
  KeyboardAvoidingView,
  LogBox,
  Platform,
  SafeAreaView,
} from 'react-native';
import {
  setStorage,
  type Storage as OpenClawStorage,
} from './src/openclaw';
import {
  ENABLE_DEBUG_WARNINGS,
  getKvStore,
} from './src/utils';
import { useAppScreenWiring } from './src/ios-runtime/useAppScreenWiring';
import ConnectionHeader from './src/ui/ios/ConnectionHeader';
import SettingsScreenModal from './src/ui/ios/SettingsScreenModal';
import SessionsScreenModal from './src/ui/ios/SessionsScreenModal';
import SettingsPanelContent from './src/ui/ios/SettingsPanelContent';
import SessionsPanelContent from './src/ui/ios/SessionsPanelContent';
import HomeMainLayout from './src/ui/ios/HomeMainLayout';
import {
  ThemeProvider,
  SettingsProvider,
  GatewayProvider,
} from './src/contexts';

if (__DEV__ && !ENABLE_DEBUG_WARNINGS) {
  LogBox.ignoreAllLogs(true);
}

const kvStore = getKvStore();
const openClawIdentityMemory = new Map<string, string>();

const openClawStorage: OpenClawStorage = {
  getString(key) {
    return openClawIdentityMemory.get(key);
  },
  set(key, value) {
    openClawIdentityMemory.set(key, value);
    void kvStore.setItemAsync(key, value).catch(() => {
      // ignore persistence errors
    });
  },
};

setStorage(openClawStorage);

function AppContent() {
  const {
    isDarkTheme,
    styles,
    connectionHeaderProps,
    settingsScreenModalProps,
    settingsPanelContentProps,
    sessionsScreenModalProps,
    sessionsPanelContentProps,
    homeMainLayoutProps,
  } = useAppScreenWiring({
    kvStore,
    openClawIdentityMemory,
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={isDarkTheme ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ConnectionHeader {...connectionHeaderProps} />

        <SettingsScreenModal {...settingsScreenModalProps}>
          <SettingsPanelContent {...settingsPanelContentProps} />
        </SettingsScreenModal>
        <SessionsScreenModal {...sessionsScreenModalProps}>
          <SessionsPanelContent {...sessionsPanelContentProps} />
        </SessionsScreenModal>
        <HomeMainLayout {...homeMainLayoutProps} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Root App component with Providers
 */
export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <GatewayProvider>
          <AppContent />
        </GatewayProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
