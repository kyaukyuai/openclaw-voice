import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import EyeIcon from './EyeIcon';
import { INITIAL_CONTROLLER_STATE, SEMANTIC } from '../logic/app-constants';
import {
  connectionChipFromState,
  createGatewayRuntime,
  gatewayRecoveryHint,
} from '../logic/app-logic';
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
  quickTextLeft,
  quickTextRight,
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
}) {
    const activeRuntime =
      (activeGatewayId ? gatewayRuntimeById[activeGatewayId] : null) ?? createGatewayRuntime();
    const activeControllerState = activeRuntime.controllerState ?? INITIAL_CONTROLLER_STATE;

    const connectionState = activeControllerState.connectionState;
    const isGatewayConnected = connectionState === 'connected';
    const isConnecting = connectionState === 'connecting';
    const isReconnecting = connectionState === 'reconnecting';
    const canDisconnectGateway = connectionState !== 'disconnected';
    const canDeleteGatewayProfile = gatewayProfiles.length > 1;
    const gatewaySettingsRecoveryHint = gatewayRecoveryHint(
      {
        gatewayUrl,
        authToken,
        sessionKey,
      },
      activeControllerState,
    );

    const focusedRuntime = focusedGatewayId ? gatewayRuntimeById[focusedGatewayId] : null;
    const canInsertQuickText = Boolean(
      focusedGatewayId && focusedRuntime && !focusedRuntime.controllerState.isSending,
    );

    const settingsShadowStyle = null;

    const maskedAuthTokenPreview = authToken.length > 0 ? '●'.repeat(authToken.length) : '';
    const removeGatewayActionStyle = {
      borderColor: canDeleteGatewayProfile ? 'rgba(220,38,38,0.35)' : themeTokens.inputBorder,
      backgroundColor: themeTokens.card,
    };
    const removeGatewayActionOpacityStyle = canDeleteGatewayProfile ? null : styles.opacitySoft;
    const removeGatewayTextColorStyle = {
      color: canDeleteGatewayProfile ? '#B91C1C' : themeTokens.textDisabled,
    };
    const gatewayConnectedHintStyle = {
      backgroundColor: isReconnecting ? SEMANTIC.amberSoft : SEMANTIC.greenSoft,
      borderColor: isReconnecting ? 'rgba(217,119,6,0.20)' : 'rgba(5,150,105,0.18)',
    };
    const gatewayConnectActionOpacityStyle = !identityReady || isConnecting ? styles.opacityHalf : null;
    const gatewayDisconnectActionOpacityStyle = canDisconnectGateway ? null : styles.opacitySoft;
    const muteForegroundRowOpacityStyle = notificationSettings.enabled ? null : styles.opacityMuted;
    const muteForegroundTrackOpacityStyle = notificationSettings.enabled ? null : styles.opacityMuted;
    const muteForegroundThumbStyle = {
      backgroundColor:
        notificationSettings.enabled && notificationSettings.muteForeground
          ? '#ffffff'
          : themeTokens.textDisabled,
      transform: [
        {
          translateX:
            notificationSettings.enabled && notificationSettings.muteForeground
              ? 14
              : 0,
        },
      ],
    };
    const enableNotificationThumbStyle = {
      backgroundColor: notificationSettings.enabled ? '#ffffff' : themeTokens.textDisabled,
      transform: [{ translateX: notificationSettings.enabled ? 14 : 0 }],
    };

    return (
      <ScrollView
        style={styles.settingsScroll}
        contentContainerStyle={styles.settingsWrap}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.settingsCard,
            settingsShadowStyle,
            { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
          ]}
        >
          <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Gateway Profiles</Text>
          <View style={styles.gatewayProfilesList}>
            {gatewayProfiles.map((profile) => {
              const runtime = gatewayRuntimeById[profile.id] ?? createGatewayRuntime();
              const statusChip = connectionChipFromState(runtime.controllerState.connectionState);
              const isActiveProfile = profile.id === activeGatewayId;

              return (
                <Pressable
                  key={profile.id}
                  style={[
                    styles.gatewayProfileItem,
                    {
                      borderColor: isActiveProfile
                        ? themeTokens.inputBorderFocus
                        : themeTokens.inputBorder,
                      backgroundColor: isActiveProfile ? themeTokens.sideActiveBg : themeTokens.input,
                    },
                  ]}
                  onPress={() => handleSelectGatewayProfile(profile.id)}
                >
                  <View style={[styles.gatewayProfileDot, { backgroundColor: statusChip.color }]} />
                  <View style={styles.gatewayProfileMeta}>
                    <Text
                      numberOfLines={1}
                      style={[styles.gatewayProfileName, { color: themeTokens.textPrimary }]}
                    >
                      {profile.name || 'Unnamed Gateway'}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.gatewayProfileUrl, { color: themeTokens.textMuted }]}
                    >
                      {profile.gatewayUrl || 'URL not set'}
                    </Text>
                  </View>
                  <Text style={[styles.gatewayProfileActiveTag, { color: statusChip.color }]}>
                    {statusChip.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.settingsActionsRow}>
            <Pressable
              style={[
                styles.secondaryAction,
                { borderColor: themeTokens.inputBorder, backgroundColor: themeTokens.card },
              ]}
              onPress={handleCreateGatewayProfile}
            >
              <Text style={[styles.secondaryActionText, { color: themeTokens.textSecondary }]}>+ Add Gateway</Text>
            </Pressable>

            <Pressable
              style={[
                styles.secondaryAction,
                removeGatewayActionStyle,
                removeGatewayActionOpacityStyle,
              ]}
              disabled={!canDeleteGatewayProfile}
              onPress={handleDeleteActiveGatewayProfile}
            >
              <Text
                style={[
                  styles.secondaryActionText,
                  removeGatewayTextColorStyle,
                ]}
              >
                Remove Active
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.settingsCard,
            settingsShadowStyle,
            { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
          ]}
        >
          <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Gateway Settings</Text>

          {isGatewayConnected || isReconnecting ? (
            <View
              style={[
                styles.gatewayConnectedHint,
                gatewayConnectedHintStyle,
              ]}
            >
              <View
                style={[
                  styles.gatewayConnectedDot,
                  { backgroundColor: isReconnecting ? SEMANTIC.amber : SEMANTIC.green },
                ]}
              />
              <Text
                style={[
                  styles.gatewayConnectedHintText,
                  { color: isReconnecting ? SEMANTIC.amber : SEMANTIC.green },
                ]}
              >
                {isReconnecting
                  ? 'Reconnecting... You can reconnect manually or disconnect.'
                  : 'Connected. Update values and choose Reconnect to apply changes.'}
              </Text>
            </View>
          ) : null}
          {!isGatewayConnected && !isConnecting && gatewaySettingsRecoveryHint ? (
            <Text style={[styles.settingsRecoveryHint, { color: themeTokens.textSecondary }]}>
              {gatewaySettingsRecoveryHint}
            </Text>
          ) : null}

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Gateway Name</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'gateway-name'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={gatewayName}
              onChangeText={setGatewayName}
              autoCorrect={false}
              onFocus={() => setFocusedSettingsInput('gateway-name')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="Gateway 1"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Gateway URL</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'gateway-url'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={gatewayUrl}
              onChangeText={setGatewayUrl}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocusedSettingsInput('gateway-url')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="wss://your-gateway.example.com"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Token (optional)</Text>
            <View style={styles.tokenInputRow}>
              {isAuthTokenVisible ? (
                <TextInput
                  ref={authTokenInputRef}
                  style={[
                    styles.settingsInput,
                    styles.tokenInputField,
                    {
                      backgroundColor: themeTokens.input,
                      borderColor:
                        focusedSettingsInput === 'auth-token'
                          ? themeTokens.inputBorderFocus
                          : themeTokens.inputBorder,
                      color: themeTokens.textPrimary,
                    },
                  ]}
                  value={authToken}
                  onChangeText={setAuthToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  onFocus={() => setFocusedSettingsInput('auth-token')}
                  onBlur={() => setFocusedSettingsInput(null)}
                  placeholder="token"
                  placeholderTextColor={themeTokens.placeholder}
                  selectionColor={themeTokens.inputCaret}
                  cursorColor={themeTokens.inputCaret}
                />
              ) : (
                <Pressable
                  style={[
                    styles.settingsInput,
                    styles.tokenInputField,
                    styles.tokenMaskedField,
                    {
                      backgroundColor: themeTokens.input,
                      borderColor:
                        focusedSettingsInput === 'auth-token'
                          ? themeTokens.inputBorderFocus
                          : themeTokens.inputBorder,
                    },
                  ]}
                  onPress={() => {
                    setIsAuthTokenVisible(true);
                    requestAnimationFrame(() => {
                      authTokenInputRef.current?.focus?.();
                    });
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tokenMaskedText,
                      { color: authToken ? themeTokens.textSecondary : themeTokens.placeholder },
                    ]}
                  >
                    {authToken ? maskedAuthTokenPreview : 'token'}
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={[
                  styles.tokenVisibilityButton,
                  { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
                ]}
                accessibilityRole="button"
                accessibilityLabel={isAuthTokenVisible ? 'Hide token' : 'Show token'}
                onPress={() => {
                  setIsAuthTokenVisible((previous) => {
                    const next = !previous;
                    if (!next) {
                      authTokenInputRef.current?.blur?.();
                      setFocusedSettingsInput(null);
                    } else {
                      requestAnimationFrame(() => {
                        authTokenInputRef.current?.focus?.();
                      });
                    }
                    return next;
                  });
                }}
              >
                <EyeIcon visible={isAuthTokenVisible} color={themeTokens.textSecondary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Session Key</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'session-key'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={sessionKey}
              onChangeText={setSessionKey}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocusedSettingsInput('session-key')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="main"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsActionsRow}>
            <Pressable
              style={[
                styles.primaryAction,
                {
                  backgroundColor: SEMANTIC.blue,
                },
                gatewayConnectActionOpacityStyle,
              ]}
              disabled={!identityReady || isConnecting}
              accessibilityRole="button"
              accessibilityLabel={isGatewayConnected || isReconnecting ? 'Reconnect gateway' : 'Connect gateway'}
              onPress={() => {
                if (!activeGatewayId) return;
                connectGateway(activeGatewayId).catch(() => {
                  // Surface via controller banner state.
                });
              }}
            >
              <Text style={styles.primaryActionText}>
                {isGatewayConnected || isReconnecting ? 'Reconnect' : 'Connect'}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.secondaryAction,
                {
                  borderColor: themeTokens.inputBorder,
                  backgroundColor: themeTokens.card,
                },
                gatewayDisconnectActionOpacityStyle,
              ]}
              disabled={!canDisconnectGateway}
              accessibilityRole="button"
              accessibilityLabel="Disconnect gateway"
              onPress={() => {
                if (!activeGatewayId) return;
                disconnectGateway(activeGatewayId);
              }}
            >
              <Text
                style={[
                  styles.secondaryActionText,
                  { color: canDisconnectGateway ? themeTokens.textSecondary : themeTokens.textDisabled },
                ]}
              >
                Disconnect
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.settingsCard,
            settingsShadowStyle,
            { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
          ]}
        >
          <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Notifications</Text>
          <Pressable
            style={[
              styles.notificationRow,
              {
                borderColor: themeTokens.inputBorder,
                backgroundColor: themeTokens.input,
              },
            ]}
            onPress={toggleNotificationsEnabled}
          >
            <View style={styles.notificationRowTextWrap}>
              <Text style={[styles.notificationRowTitle, { color: themeTokens.textPrimary }]}>
                Enable notifications
              </Text>
              <Text style={[styles.notificationRowDescription, { color: themeTokens.textMuted }]}>
                Show new assistant replies for connected gateways.
              </Text>
            </View>
            <View
              style={[
                styles.notificationToggleTrack,
                {
                  backgroundColor: notificationSettings.enabled ? SEMANTIC.green : themeTokens.card,
                  borderColor: themeTokens.inputBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.notificationToggleThumb,
                  enableNotificationThumbStyle,
                ]}
              />
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.notificationRow,
              {
                borderColor: themeTokens.inputBorder,
                backgroundColor: themeTokens.input,
              },
              muteForegroundRowOpacityStyle,
            ]}
            onPress={toggleMuteForegroundNotifications}
            disabled={!notificationSettings.enabled}
          >
            <View style={styles.notificationRowTextWrap}>
              <Text
                style={[
                  styles.notificationRowTitle,
                  {
                    color: notificationSettings.enabled
                      ? themeTokens.textPrimary
                      : themeTokens.textDisabled,
                  },
                ]}
              >
                Mute sound in foreground
              </Text>
              <Text
                style={[
                  styles.notificationRowDescription,
                  {
                    color: notificationSettings.enabled
                      ? themeTokens.textMuted
                      : themeTokens.textDisabled,
                  },
                ]}
              >
                Keep banner only while app is active.
              </Text>
            </View>
            <View
              style={[
                styles.notificationToggleTrack,
                {
                  backgroundColor:
                    notificationSettings.enabled && notificationSettings.muteForeground
                      ? SEMANTIC.green
                      : themeTokens.card,
                  borderColor: themeTokens.inputBorder,
                },
                muteForegroundTrackOpacityStyle,
              ]}
            >
              <View
                style={[
                  styles.notificationToggleThumb,
                  muteForegroundThumbStyle,
                ]}
              />
            </View>
          </Pressable>

          <Text style={[styles.notificationSectionLabel, { color: themeTokens.textSecondary }]}>
            Per gateway
          </Text>
          <View style={styles.notificationGatewayList}>
            {gatewayProfiles.map((profile) => {
              const enabledForGateway = isGatewayNotificationEnabled(profile.id);
              const enabledForToggle = notificationSettings.enabled;
              const gatewayRowOpacityStyle = enabledForToggle ? null : styles.opacityMuted;
              const gatewayToggleTrackOpacityStyle = enabledForToggle ? null : styles.opacityMuted;
              const gatewayToggleThumbStyle = {
                backgroundColor:
                  enabledForToggle && enabledForGateway
                    ? '#ffffff'
                    : themeTokens.textDisabled,
                transform: [{ translateX: enabledForToggle && enabledForGateway ? 14 : 0 }],
              };
              return (
                <Pressable
                  key={`notification:${profile.id}`}
                  style={[
                    styles.notificationGatewayRow,
                    {
                      borderColor: themeTokens.inputBorder,
                      backgroundColor: themeTokens.input,
                    },
                    gatewayRowOpacityStyle,
                  ]}
                  disabled={!enabledForToggle}
                  onPress={() => toggleGatewayNotifications(profile.id)}
                >
                  <View style={styles.notificationGatewayMeta}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.notificationGatewayName,
                        {
                          color: enabledForToggle
                            ? themeTokens.textPrimary
                            : themeTokens.textDisabled,
                        },
                      ]}
                    >
                      {profile.name || 'Unnamed Gateway'}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.notificationGatewayUrl,
                        {
                          color: enabledForToggle
                            ? themeTokens.textMuted
                            : themeTokens.textDisabled,
                        },
                      ]}
                    >
                      {profile.gatewayUrl || 'URL not set'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.notificationToggleTrack,
                    {
                      backgroundColor:
                        enabledForToggle && enabledForGateway ? SEMANTIC.green : themeTokens.card,
                      borderColor: themeTokens.inputBorder,
                    },
                    gatewayToggleTrackOpacityStyle,
                  ]}
                >
                  <View
                    style={[
                      styles.notificationToggleThumb,
                      gatewayToggleThumbStyle,
                    ]}
                  />
                </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.settingsCard,
            settingsShadowStyle,
            { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
          ]}
        >
          <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Quick Text</Text>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Left</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'quick-left'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={quickTextLeft}
              onChangeText={setQuickTextLeft}
              autoCorrect
              onFocus={() => setFocusedSettingsInput('quick-left')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="Quick text for left"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsGroup}>
            <Text style={[styles.fieldLabel, { color: themeTokens.textSecondary }]}>Right</Text>
            <TextInput
              style={[
                styles.settingsInput,
                {
                  backgroundColor: themeTokens.input,
                  borderColor:
                    focusedSettingsInput === 'quick-right'
                      ? themeTokens.inputBorderFocus
                      : themeTokens.inputBorder,
                  color: themeTokens.textPrimary,
                },
              ]}
              value={quickTextRight}
              onChangeText={setQuickTextRight}
              autoCorrect
              onFocus={() => setFocusedSettingsInput('quick-right')}
              onBlur={() => setFocusedSettingsInput(null)}
              placeholder="Quick text for right"
              placeholderTextColor={themeTokens.placeholder}
              selectionColor={themeTokens.inputCaret}
              cursorColor={themeTokens.inputCaret}
            />
          </View>

          <View style={styles.settingsInsertRow}>
            <Pressable
              style={[
                styles.insertAction,
                styles.insertActionTransparent,
                {
                  borderColor: themeTokens.inputBorder,
                },
                canInsertQuickText ? null : styles.opacitySoft,
              ]}
              disabled={!canInsertQuickText}
              accessibilityState={{ disabled: !canInsertQuickText }}
              onPress={() => insertQuickText(focusedGatewayId, quickTextLeft)}
            >
              <Text
                style={[
                  styles.insertActionText,
                  {
                    color: canInsertQuickText ? themeTokens.textMuted : themeTokens.textDisabled,
                  },
                ]}
              >
                Insert Left
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.insertAction,
                styles.insertActionTransparent,
                {
                  borderColor: themeTokens.inputBorder,
                },
                canInsertQuickText ? null : styles.opacitySoft,
              ]}
              disabled={!canInsertQuickText}
              accessibilityState={{ disabled: !canInsertQuickText }}
              onPress={() => insertQuickText(focusedGatewayId, quickTextRight)}
            >
              <Text
                style={[
                  styles.insertActionText,
                  {
                    color: canInsertQuickText ? themeTokens.textMuted : themeTokens.textDisabled,
                  },
                ]}
              >
                Insert Right
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.quickTextHint, { color: themeTokens.textMuted }]}>
            Focus any gateway composer to enable quick insert.
          </Text>
        </View>
      </ScrollView>
    );
}
