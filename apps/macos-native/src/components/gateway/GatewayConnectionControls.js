import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SEMANTIC } from '../../logic/app-constants';
import styles from '../../styles/app-styles';

export default function GatewayConnectionControls({
  canDisconnectGateway,
  connectActionOpacityStyle,
  connectionState,
  disconnectActionOpacityStyle,
  disconnectGateway,
  gatewayId,
  identityReady,
  isConnecting,
  isGatewayConnected,
  isReconnecting,
  recoveryHint,
  refreshHistory,
  isSyncing,
  setQuickMenuOpenForGateway,
  themeTokens,
  connectGateway,
}) {
  return (
    <>
      <View style={styles.gatewayCardActions}>
        <Pressable
          style={[
            styles.inlineAction,
            {
              backgroundColor:
                connectionState === 'connected' && !isSyncing ? themeTokens.card : themeTokens.input,
              borderColor: themeTokens.inputBorder,
            },
          ]}
          disabled={connectionState !== 'connected' || isSyncing}
          accessibilityRole="button"
          accessibilityLabel="Sync history"
          accessibilityHint="Reloads messages for the current session without reconnecting."
          onPress={() => {
            setQuickMenuOpenForGateway(gatewayId, false);
            refreshHistory(gatewayId).catch(() => {
              // surfaced via banner
            });
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.inlineActionText,
              {
                color:
                  connectionState === 'connected' && !isSyncing
                    ? themeTokens.textSecondary
                    : themeTokens.textDisabled,
              },
            ]}
          >
            ↻ Sync
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.inlinePrimary,
            {
              backgroundColor: SEMANTIC.blue,
            },
            connectActionOpacityStyle,
          ]}
          disabled={!identityReady || isConnecting}
          accessibilityRole="button"
          accessibilityLabel={isGatewayConnected || isReconnecting ? 'Reconnect gateway' : 'Connect gateway'}
          accessibilityHint={
            isGatewayConnected || isReconnecting
              ? 'Restarts the gateway connection. Use this after changing URL, token, or session.'
              : 'Starts a gateway connection with the current settings.'
          }
          onPress={() => {
            setQuickMenuOpenForGateway(gatewayId, false);
            connectGateway(gatewayId).catch(() => {
              // surfaced via banner
            });
          }}
        >
          <Text style={styles.inlinePrimaryText} numberOfLines={1}>
            {isGatewayConnected || isReconnecting ? '⇄ Reconnect' : '◎ Connect'}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.inlineAction,
            {
              backgroundColor: themeTokens.card,
              borderColor: themeTokens.inputBorder,
            },
            disconnectActionOpacityStyle,
          ]}
          disabled={!canDisconnectGateway}
          accessibilityRole="button"
          accessibilityLabel="Disconnect gateway"
          accessibilityHint="Stops the gateway connection immediately."
          onPress={() => {
            setQuickMenuOpenForGateway(gatewayId, false);
            disconnectGateway(gatewayId);
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.inlineActionText,
              { color: canDisconnectGateway ? themeTokens.textSecondary : themeTokens.textDisabled },
            ]}
          >
            ⏻ Disconnect
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.gatewayActionHint, { color: themeTokens.textMuted }]}>
        Sync reloads history. Reconnect restarts the connection.
      </Text>
      {recoveryHint ? (
        <Text
          style={[
            styles.gatewayRecoveryHint,
            {
              color:
                connectionState === 'reconnecting'
                  ? SEMANTIC.amber
                  : themeTokens.textSecondary,
            },
          ]}
        >
          {recoveryHint}
        </Text>
      ) : null}
    </>
  );
}
