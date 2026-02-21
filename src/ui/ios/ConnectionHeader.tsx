import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';

type ConnectionHeaderProps = {
  styles: Record<string, any>;
  isDarkTheme: boolean;
  connectionLabel: string;
  isGatewayConnected: boolean;
  isGatewayConnecting: boolean;
  isSessionPanelOpen: boolean;
  isSettingsPanelOpen: boolean;
  canToggleSettingsPanel: boolean;
  onToggleSessionPanel: () => void;
  onToggleSettingsPanel: () => void;
  maxTextScaleTight: number;
};

export default function ConnectionHeader({
  styles,
  isDarkTheme,
  connectionLabel,
  isGatewayConnected,
  isGatewayConnecting,
  isSessionPanelOpen,
  isSettingsPanelOpen,
  canToggleSettingsPanel,
  onToggleSessionPanel,
  onToggleSettingsPanel,
  maxTextScaleTight,
}: ConnectionHeaderProps) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <View style={styles.logoBadge}>
          <Image
            source={require('../../../assets/logo-badge.png')}
            style={styles.logoBadgeImage}
          />
        </View>
        <Text style={styles.headerTitle} maxFontSizeMultiplier={maxTextScaleTight}>
          OpenClaw Pocket
        </Text>
      </View>
      <View style={styles.headerRight}>
        <View
          style={[
            styles.statusChip,
            isGatewayConnected
              ? styles.statusChipConnected
              : isGatewayConnecting
                ? styles.statusChipConnecting
                : styles.statusChipDisconnected,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              isGatewayConnected
                ? styles.statusDotConnected
                : isGatewayConnecting
                  ? styles.statusDotConnecting
                  : styles.statusDotDisconnected,
            ]}
          />
          <Text
            style={[
              styles.statusChipText,
              isGatewayConnected
                ? styles.statusChipTextConnected
                : isGatewayConnecting
                  ? styles.statusChipTextConnecting
                  : styles.statusChipTextDisconnected,
            ]}
            maxFontSizeMultiplier={maxTextScaleTight}
          >
            {connectionLabel}
          </Text>
        </View>
        <Pressable
          style={[
            styles.iconButton,
            isSessionPanelOpen && styles.iconButtonActive,
            !isGatewayConnected && styles.iconButtonDisabled,
          ]}
          hitSlop={7}
          accessibilityRole="button"
          accessibilityLabel={isSessionPanelOpen ? 'Hide sessions screen' : 'Show sessions screen'}
          onPress={onToggleSessionPanel}
          disabled={!isGatewayConnected}
        >
          <Ionicons
            name="albums-outline"
            size={18}
            color={isDarkTheme ? '#bccae2' : '#707070'}
          />
        </Pressable>
        <Pressable
          style={[
            styles.iconButton,
            isSettingsPanelOpen && styles.iconButtonActive,
            !canToggleSettingsPanel && styles.iconButtonDisabled,
          ]}
          hitSlop={7}
          accessibilityRole="button"
          accessibilityLabel={isSettingsPanelOpen ? 'Hide settings screen' : 'Show settings screen'}
          onPress={onToggleSettingsPanel}
          disabled={!canToggleSettingsPanel}
        >
          <Ionicons
            name="settings-outline"
            size={18}
            color={isDarkTheme ? '#bccae2' : '#707070'}
          />
        </Pressable>
      </View>
    </View>
  );
}
