import React from 'react';
import { Text, View } from 'react-native';
import styles from '../styles/app-styles';

export default function DateRow({ label, themeTokens }) {
  return (
    <View style={styles.dateRow}>
      <View style={[styles.dateLine, { backgroundColor: themeTokens.dividerStrong }]} />
      <Text style={[styles.dateLabel, { color: themeTokens.textMuted }]}>{label}</Text>
      <View style={[styles.dateLine, { backgroundColor: themeTokens.dividerStrong }]} />
    </View>
  );
}
