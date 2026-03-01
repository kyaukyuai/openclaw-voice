import React from 'react';
import { ScrollView } from 'react-native';
import GatewayProfilesCard from './settings/GatewayProfilesCard';
import GatewaySettingsCard from './settings/GatewaySettingsCard';
import NotificationsSettingsCard from './settings/NotificationsSettingsCard';
import QuickTextSettingsCard from './settings/QuickTextSettingsCard';
import RuntimeTelemetryCard from './settings/RuntimeTelemetryCard';
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
  return (
    <ScrollView
      style={styles.settingsScroll}
      contentContainerStyle={styles.settingsWrap}
      keyboardShouldPersistTaps="handled"
    >
      <GatewayProfilesCard
        activeGatewayId={activeGatewayId}
        gatewayProfiles={gatewayProfiles}
        gatewayRuntimeById={gatewayRuntimeById}
        handleCreateGatewayProfile={handleCreateGatewayProfile}
        handleDeleteActiveGatewayProfile={handleDeleteActiveGatewayProfile}
        handleSelectGatewayProfile={handleSelectGatewayProfile}
        themeTokens={themeTokens}
      />

      <GatewaySettingsCard
        activeGatewayId={activeGatewayId}
        authToken={authToken}
        authTokenInputRef={authTokenInputRef}
        connectGateway={connectGateway}
        disconnectGateway={disconnectGateway}
        focusedSettingsInput={focusedSettingsInput}
        gatewayName={gatewayName}
        gatewayRuntimeById={gatewayRuntimeById}
        gatewayUrl={gatewayUrl}
        identityReady={identityReady}
        isAuthTokenVisible={isAuthTokenVisible}
        sessionKey={sessionKey}
        setAuthToken={setAuthToken}
        setFocusedSettingsInput={setFocusedSettingsInput}
        setGatewayName={setGatewayName}
        setGatewayUrl={setGatewayUrl}
        setIsAuthTokenVisible={setIsAuthTokenVisible}
        setSessionKey={setSessionKey}
        themeTokens={themeTokens}
      />

      <NotificationsSettingsCard
        gatewayProfiles={gatewayProfiles}
        isGatewayNotificationEnabled={isGatewayNotificationEnabled}
        notificationSettings={notificationSettings}
        themeTokens={themeTokens}
        toggleGatewayNotifications={toggleGatewayNotifications}
        toggleMuteForegroundNotifications={toggleMuteForegroundNotifications}
        toggleNotificationsEnabled={toggleNotificationsEnabled}
      />

      <QuickTextSettingsCard
        focusedGatewayId={focusedGatewayId}
        focusedSettingsInput={focusedSettingsInput}
        gatewayRuntimeById={gatewayRuntimeById}
        insertQuickText={insertQuickText}
        quickTextLeft={quickTextLeft}
        quickTextRight={quickTextRight}
        setFocusedSettingsInput={setFocusedSettingsInput}
        setQuickTextLeft={setQuickTextLeft}
        setQuickTextRight={setQuickTextRight}
        themeTokens={themeTokens}
      />

      <RuntimeTelemetryCard
        copyTelemetryReport={copyTelemetryReport}
        gatewayProfiles={gatewayProfiles}
        resetTelemetry={resetTelemetry}
        telemetry={telemetry}
        themeTokens={themeTokens}
      />
    </ScrollView>
  );
}
