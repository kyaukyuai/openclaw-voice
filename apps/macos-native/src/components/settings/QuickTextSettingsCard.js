import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import styles from '../../styles/app-styles';

export default function QuickTextSettingsCard({
  focusedGatewayId,
  focusedSettingsInput,
  gatewayRuntimeById,
  insertQuickText,
  quickTextLeft,
  quickTextRight,
  setFocusedSettingsInput,
  setQuickTextLeft,
  setQuickTextRight,
  themeTokens,
}) {
  const focusedRuntime = focusedGatewayId ? gatewayRuntimeById[focusedGatewayId] : null;
  const canInsertQuickText = Boolean(
    focusedGatewayId && focusedRuntime && !focusedRuntime.controllerState.isSending,
  );

  return (
    <View
      style={[
        styles.settingsCard,
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

      <Text style={[styles.quickTextHint, { color: themeTokens.textMuted }]}>Focus any gateway composer to enable quick insert.</Text>
    </View>
  );
}
