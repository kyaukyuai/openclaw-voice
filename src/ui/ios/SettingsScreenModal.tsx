import { Ionicons } from '@expo/vector-icons';
import type { ReactNode, RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';

type SettingsScreenModalProps = {
  visible: boolean;
  styles: Record<string, any>;
  isDarkTheme: boolean;
  canDismissSettingsScreen: boolean;
  isSettingsStatusPending: boolean;
  isSettingsStatusError: boolean;
  settingsStatusText: string;
  isKeyboardVisible: boolean;
  settingsScrollRef: RefObject<ScrollView | null>;
  onClose: () => void;
  maxTextScaleTight: number;
  children: ReactNode;
};

export default function SettingsScreenModal({
  visible,
  styles,
  isDarkTheme,
  canDismissSettingsScreen,
  isSettingsStatusPending,
  isSettingsStatusError,
  settingsStatusText,
  isKeyboardVisible,
  settingsScrollRef,
  onClose,
  maxTextScaleTight,
  children,
}: SettingsScreenModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.settingsScreenContainer}>
        <View style={styles.settingsScreenHeader}>
          <Text style={styles.settingsScreenTitle} maxFontSizeMultiplier={maxTextScaleTight}>
            Settings
          </Text>
          <View style={styles.settingsScreenHeaderRight}>
            <View
              style={[
                styles.settingsStatusChip,
                isSettingsStatusPending && styles.settingsStatusChipPending,
                isSettingsStatusError && styles.settingsStatusChipError,
              ]}
            >
              <Ionicons
                name={
                  isSettingsStatusError
                    ? 'alert-circle-outline'
                    : isSettingsStatusPending
                      ? 'sync-outline'
                      : 'checkmark-circle-outline'
                }
                size={12}
                color={
                  isSettingsStatusError
                    ? isDarkTheme
                      ? '#ffb0b0'
                      : '#DC2626'
                    : isDarkTheme
                      ? '#9ec0ff'
                      : '#1D4ED8'
                }
              />
              <Text
                style={[
                  styles.settingsStatusChipText,
                  isSettingsStatusError && styles.settingsStatusChipTextError,
                ]}
                maxFontSizeMultiplier={maxTextScaleTight}
                numberOfLines={1}
              >
                {settingsStatusText}
              </Text>
            </View>
            <Pressable
              style={[
                styles.iconButton,
                !canDismissSettingsScreen && styles.iconButtonDisabled,
              ]}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel="Close settings screen"
              onPress={onClose}
              disabled={!canDismissSettingsScreen}
            >
              <Ionicons name="close" size={18} color={isDarkTheme ? '#bccae2' : '#707070'} />
            </Pressable>
          </View>
        </View>
        <KeyboardAvoidingView
          style={styles.settingsScreenKeyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={settingsScrollRef}
            style={styles.settingsScreenScroll}
            contentContainerStyle={[
              styles.settingsScreenScrollContent,
              isKeyboardVisible && styles.settingsScreenScrollContentKeyboardOpen,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.gatewayPanel}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
