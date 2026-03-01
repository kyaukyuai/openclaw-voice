import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import EyeIcon from '../EyeIcon';
import { INITIAL_CONTROLLER_STATE, SEMANTIC } from '../../logic/app-constants';
import { createGatewayRuntime, gatewayRecoveryHint } from '../../logic/app-logic';
import styles from '../../styles/app-styles';

export default function GatewaySettingsCard({
  activeGatewayId,
  authToken,
  authTokenInputRef,
  connectGateway,
  disconnectGateway,
  focusedSettingsInput,
  gatewayName,
  gatewayRuntimeById,
  gatewayUrl,
  identityReady,
  isAuthTokenVisible,
  sessionKey,
  setAuthToken,
  setFocusedSettingsInput,
  setGatewayName,
  setGatewayUrl,
  setIsAuthTokenVisible,
  setSessionKey,
  themeTokens,
}) {
  const activeRuntime =
    (activeGatewayId ? gatewayRuntimeById[activeGatewayId] : null) ?? createGatewayRuntime();
  const activeControllerState = activeRuntime.controllerState ?? INITIAL_CONTROLLER_STATE;

  const connectionState = activeControllerState.connectionState;
  const isGatewayConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const isReconnecting = connectionState === 'reconnecting';
  const canDisconnectGateway = connectionState !== 'disconnected';

  const recoveryHint = gatewayRecoveryHint(
    {
      gatewayUrl,
      authToken,
      sessionKey,
    },
    activeControllerState,
  );

  const maskedAuthTokenPreview = authToken.length > 0 ? '●'.repeat(authToken.length) : '';
  const gatewayConnectedHintStyle = {
    backgroundColor: isReconnecting ? SEMANTIC.amberSoft : SEMANTIC.greenSoft,
    borderColor: isReconnecting ? 'rgba(217,119,6,0.20)' : 'rgba(5,150,105,0.18)',
  };
  const gatewayConnectedDotStyle = {
    backgroundColor: isReconnecting ? SEMANTIC.amber : SEMANTIC.green,
  };
  const gatewayConnectedHintTextStyle = {
    color: isReconnecting ? SEMANTIC.amber : SEMANTIC.green,
  };

  return (
    <View
      style={[
        styles.settingsCard,
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
          <View style={[styles.gatewayConnectedDot, gatewayConnectedDotStyle]} />
          <Text
            style={[
              styles.gatewayConnectedHintText,
              gatewayConnectedHintTextStyle,
            ]}
          >
            {isReconnecting
              ? 'Reconnecting... You can reconnect manually or disconnect.'
              : 'Connected. Update values and choose Reconnect to apply changes.'}
          </Text>
        </View>
      ) : null}
      {!isGatewayConnected && !isConnecting && recoveryHint ? (
        <Text style={[styles.settingsRecoveryHint, { color: themeTokens.textSecondary }]}>
          {recoveryHint}
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
            !identityReady || isConnecting ? styles.opacityHalf : null,
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
            canDisconnectGateway ? null : styles.opacitySoft,
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
  );
}
