import React from 'react';
import { View } from 'react-native';
import styles from '../styles/app-styles';

export default function EyeIcon({ visible, color }) {
  return (
    <View style={styles.eyeIcon}>
      <View style={[styles.eyeOutline, { borderColor: color }]} />
      <View style={[styles.eyePupil, { backgroundColor: color }]} />
      {!visible ? <View style={[styles.eyeSlash, { backgroundColor: color }]} /> : null}
    </View>
  );
}
