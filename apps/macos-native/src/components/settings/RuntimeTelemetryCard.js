import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import styles from '../../styles/app-styles';

const METRIC_ITEMS = [
  ['connectAttempts', 'Connect'],
  ['connectFailures', 'Connect Fail'],
  ['reconnectAttempts', 'Reconnect'],
  ['sendAttempts', 'Send'],
  ['sendFailures', 'Send Fail'],
  ['refreshAttempts', 'Refresh'],
  ['refreshFailures', 'Refresh Fail'],
  ['refreshTimeouts', 'Refresh Timeout'],
  ['assistantReplies', 'Replies'],
];

export default function RuntimeTelemetryCard({
  copyTelemetryReport,
  gatewayProfiles,
  resetTelemetry,
  telemetry,
  themeTokens,
}) {
  const updatedLabel = useMemo(() => {
    if (!telemetry?.lastUpdatedAt) return 'No events yet';
    return new Date(telemetry.lastUpdatedAt).toLocaleString();
  }, [telemetry?.lastUpdatedAt]);

  return (
    <View
      style={[
        styles.settingsCard,
        { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
      ]}
    >
      <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Runtime Telemetry</Text>
      <Text style={[styles.notificationRowDescription, { color: themeTokens.textMuted }]}>Last update: {updatedLabel}</Text>

      <View style={styles.telemetryMetricGrid}>
        {METRIC_ITEMS.map(([key, label]) => (
          <View
            key={`telemetry:total:${key}`}
            style={[
              styles.telemetryMetricCard,
              {
                backgroundColor: themeTokens.input,
                borderColor: themeTokens.inputBorder,
              },
            ]}
          >
            <Text style={[styles.telemetryMetricLabel, { color: themeTokens.textMuted }]}>{label}</Text>
            <Text style={[styles.telemetryMetricValue, { color: themeTokens.textPrimary }]}>
              {String(Number(telemetry?.totals?.[key] ?? 0))}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.notificationSectionLabel, { color: themeTokens.textSecondary }]}>By gateway</Text>
      <View style={styles.telemetryGatewayList}>
        {gatewayProfiles.map((profile) => {
          const perGateway = telemetry?.byGatewayId?.[profile.id] ?? {};
          return (
            <View
              key={`telemetry:${profile.id}`}
              style={[
                styles.telemetryGatewayRow,
                {
                  borderColor: themeTokens.inputBorder,
                  backgroundColor: themeTokens.input,
                },
              ]}
            >
              <Text numberOfLines={1} style={[styles.telemetryGatewayName, { color: themeTokens.textPrimary }]}>
                {profile.name || 'Unnamed Gateway'}
              </Text>
              <Text style={[styles.telemetryGatewayInline, { color: themeTokens.textMuted }]}>
                C {Number(perGateway.connectAttempts ?? 0)} / R {Number(perGateway.reconnectAttempts ?? 0)} / S {Number(perGateway.sendAttempts ?? 0)} / F {Number(perGateway.sendFailures ?? 0)}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.settingsActionsRow}>
        <Pressable
          style={[styles.secondaryAction, { borderColor: themeTokens.inputBorder }]}
          onPress={copyTelemetryReport}
          accessibilityRole="button"
          accessibilityLabel="Copy telemetry report"
        >
          <Text style={[styles.secondaryActionText, { color: themeTokens.textSecondary }]}>Copy JSON</Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryAction, { borderColor: themeTokens.inputBorder }]}
          onPress={resetTelemetry}
          accessibilityRole="button"
          accessibilityLabel="Reset telemetry counters"
        >
          <Text style={[styles.secondaryActionText, { color: themeTokens.textSecondary }]}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}
