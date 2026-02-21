import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

type TopBannerKind = 'gateway' | 'recovery' | 'history' | 'speech';

type TopBannerProps = {
  styles: Record<string, any>;
  kind: TopBannerKind;
  message: string;
  iconName:
    | 'cloud-offline-outline'
    | 'time-outline'
    | 'refresh-outline'
    | 'mic-off-outline';
  canReconnectFromError: boolean;
  canRetryFromError: boolean;
  canRetryMissingResponse: boolean;
  isMissingResponseRecoveryInFlight: boolean;
  isGatewayConnected: boolean;
  onReconnectFromError: () => void;
  onRetryFromError: () => void;
  onRetryMissingResponse: () => void;
  onDismiss: () => void;
  maxTextScaleTight: number;
};

export default function TopBanner({
  styles,
  kind,
  message,
  iconName,
  canReconnectFromError,
  canRetryFromError,
  canRetryMissingResponse,
  isMissingResponseRecoveryInFlight,
  isGatewayConnected,
  onReconnectFromError,
  onRetryFromError,
  onRetryMissingResponse,
  onDismiss,
  maxTextScaleTight,
}: TopBannerProps) {
  return (
    <View
      style={[styles.topBanner, kind === 'speech' && styles.topBannerSpeech]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={iconName} size={13} style={styles.topBannerIcon} />
      <Text
        style={styles.topBannerText}
        maxFontSizeMultiplier={maxTextScaleTight}
        numberOfLines={1}
      >
        {message}
      </Text>
      <View style={styles.topBannerActionRow}>
        {kind === 'gateway' ? (
          <>
            <Pressable
              style={[
                styles.topBannerActionButton,
                !canReconnectFromError && styles.topBannerActionButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reconnect to Gateway"
              onPress={onReconnectFromError}
              disabled={!canReconnectFromError}
            >
              <Ionicons name="refresh-outline" size={14} style={styles.topBannerActionIcon} />
            </Pressable>
            <Pressable
              style={[
                styles.topBannerActionButton,
                !canRetryFromError && styles.topBannerActionButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Retry sending the latest message"
              onPress={onRetryFromError}
              disabled={!canRetryFromError}
            >
              <Ionicons name="arrow-redo-outline" size={14} style={styles.topBannerActionIcon} />
            </Pressable>
          </>
        ) : null}
        {kind === 'recovery' ? (
          <>
            <Pressable
              style={[
                styles.topBannerActionButton,
                !canRetryMissingResponse && styles.topBannerActionButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Retry fetching final response"
              onPress={onRetryMissingResponse}
              disabled={!canRetryMissingResponse}
            >
              <Ionicons
                name={isMissingResponseRecoveryInFlight ? 'sync-outline' : 'arrow-redo-outline'}
                size={14}
                style={styles.topBannerActionIcon}
              />
            </Pressable>
            {!isGatewayConnected ? (
              <Pressable
                style={[
                  styles.topBannerActionButton,
                  !canReconnectFromError && styles.topBannerActionButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Reconnect to Gateway"
                onPress={onReconnectFromError}
                disabled={!canReconnectFromError}
              >
                <Ionicons name="refresh-outline" size={14} style={styles.topBannerActionIcon} />
              </Pressable>
            ) : null}
          </>
        ) : null}
        {kind === 'history' || kind === 'speech' ? (
          <Pressable
            style={styles.topBannerActionButton}
            accessibilityRole="button"
            accessibilityLabel="Dismiss error banner"
            onPress={onDismiss}
          >
            <Ionicons name="close-outline" size={14} style={styles.topBannerActionIcon} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
