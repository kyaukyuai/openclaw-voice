import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
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

type SessionsScreenModalProps = {
  visible: boolean;
  styles: Record<string, any>;
  isDarkTheme: boolean;
  isSessionsLoading: boolean;
  hasSessionsError: boolean;
  sessionPanelStatusText: string;
  onClose: () => void;
  maxTextScaleTight: number;
  children: ReactNode;
};

export default function SessionsScreenModal({
  visible,
  styles,
  isDarkTheme,
  isSessionsLoading,
  hasSessionsError,
  sessionPanelStatusText,
  onClose,
  maxTextScaleTight,
  children,
}: SessionsScreenModalProps) {
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
            Sessions
          </Text>
          <View style={styles.settingsScreenHeaderRight}>
            <View
              style={[
                styles.settingsStatusChip,
                isSessionsLoading && styles.settingsStatusChipPending,
                hasSessionsError && styles.settingsStatusChipError,
              ]}
            >
              <Ionicons
                name={
                  hasSessionsError
                    ? 'alert-circle-outline'
                    : isSessionsLoading
                      ? 'sync-outline'
                      : 'albums-outline'
                }
                size={12}
                color={
                  hasSessionsError
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
                  hasSessionsError && styles.settingsStatusChipTextError,
                ]}
                maxFontSizeMultiplier={maxTextScaleTight}
                numberOfLines={1}
              >
                {sessionPanelStatusText}
              </Text>
            </View>
            <Pressable
              style={styles.iconButton}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel="Close sessions screen"
              onPress={onClose}
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
            style={styles.settingsScreenScroll}
            contentContainerStyle={styles.settingsScreenScrollContent}
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
