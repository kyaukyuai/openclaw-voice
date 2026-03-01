import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import styles from '../../styles/app-styles';

export default function GatewayStatusRow({ statusMeta, themeTokens, updatedLabel }) {
  return (
    <View style={styles.gatewayStatusRow}>
      <View
        style={[
          styles.statusRow,
          {
            backgroundColor: statusMeta.tone.bg,
            borderColor: statusMeta.tone.border,
          },
        ]}
      >
        {statusMeta.spinning ? (
          <ActivityIndicator size="small" color={statusMeta.tone.color} />
        ) : (
          <View style={[styles.statusStaticDot, { backgroundColor: statusMeta.tone.color }]} />
        )}
        <Text style={[styles.statusRowText, { color: statusMeta.tone.color }]} numberOfLines={1}>
          {statusMeta.message}
        </Text>
      </View>
      <Text style={[styles.updatedText, { color: themeTokens.textMuted }]}>{updatedLabel || '-'}</Text>
    </View>
  );
}
