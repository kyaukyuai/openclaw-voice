import React from 'react';
import { ScrollView } from 'react-native';
import SettingsSections from './settings/SettingsSections';
import useSettingsViewWiring from '../hooks/useSettingsViewWiring';
import styles from '../styles/app-styles';

export default function SettingsView({
  activeGatewayId,
  authToken,
  authTokenInputRef,
  connectGateway,
  disconnectGateway,
  focusedGatewayId,
  focusedSettingsInput,
  gatewayName,
  gatewayProfiles,
  gatewayRuntimeById,
  gatewayUrl,
  handleCreateGatewayProfile,
  handleDeleteActiveGatewayProfile,
  handleSelectGatewayProfile,
  identityReady,
  insertQuickText,
  isAuthTokenVisible,
  isGatewayNotificationEnabled,
  notificationSettings,
  copyTelemetryReport,
  quickTextLeft,
  quickTextRight,
  resetTelemetry,
  sessionKey,
  setAuthToken,
  setFocusedSettingsInput,
  setGatewayName,
  setGatewayUrl,
  setIsAuthTokenVisible,
  setQuickTextLeft,
  setQuickTextRight,
  setSessionKey,
  themeTokens,
  toggleGatewayNotifications,
  toggleMuteForegroundNotifications,
  toggleNotificationsEnabled,
  telemetry,
}) {
  const settingsWiring = useSettingsViewWiring({
    activeGatewayId,
    authToken,
    authTokenInputRef,
    connectGateway,
    disconnectGateway,
    focusedGatewayId,
    focusedSettingsInput,
    gatewayName,
    gatewayProfiles,
    gatewayRuntimeById,
    gatewayUrl,
    handleCreateGatewayProfile,
    handleDeleteActiveGatewayProfile,
    handleSelectGatewayProfile,
    identityReady,
    insertQuickText,
    isAuthTokenVisible,
    isGatewayNotificationEnabled,
    notificationSettings,
    copyTelemetryReport,
    quickTextLeft,
    quickTextRight,
    resetTelemetry,
    sessionKey,
    setAuthToken,
    setFocusedSettingsInput,
    setGatewayName,
    setGatewayUrl,
    setIsAuthTokenVisible,
    setQuickTextLeft,
    setQuickTextRight,
    setSessionKey,
    themeTokens,
    toggleGatewayNotifications,
    toggleMuteForegroundNotifications,
    toggleNotificationsEnabled,
    telemetry,
  });

  return (
    <ScrollView
      style={styles.settingsScroll}
      contentContainerStyle={styles.settingsWrap}
      keyboardShouldPersistTaps="handled"
    >
      <SettingsSections
        order={settingsWiring.order}
        sectionPropsByKey={settingsWiring.sectionPropsByKey}
      />
    </ScrollView>
  );
}
