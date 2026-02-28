import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SEMANTIC } from '../../logic/app-constants';
import styles from '../../styles/app-styles';

export default function NotificationsSettingsCard({
  gatewayProfiles,
  isGatewayNotificationEnabled,
  notificationSettings,
  themeTokens,
  toggleGatewayNotifications,
  toggleMuteForegroundNotifications,
  toggleNotificationsEnabled,
}) {
  return (
    <View
      style={[
        styles.settingsCard,
        { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
      ]}
    >
      <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Notifications</Text>
      <Pressable
        style={[
          styles.notificationRow,
          {
            borderColor: themeTokens.inputBorder,
            backgroundColor: themeTokens.input,
          },
        ]}
        onPress={toggleNotificationsEnabled}
      >
        <View style={styles.notificationRowTextWrap}>
          <Text style={[styles.notificationRowTitle, { color: themeTokens.textPrimary }]}>Enable notifications</Text>
          <Text style={[styles.notificationRowDescription, { color: themeTokens.textMuted }]}>Show new assistant replies for connected gateways.</Text>
        </View>
        <View
          style={[
            styles.notificationToggleTrack,
            {
              backgroundColor: notificationSettings.enabled ? SEMANTIC.green : themeTokens.card,
              borderColor: themeTokens.inputBorder,
            },
          ]}
        >
          <View
            style={[
              styles.notificationToggleThumb,
              {
                backgroundColor: notificationSettings.enabled ? '#ffffff' : themeTokens.textDisabled,
                transform: [{ translateX: notificationSettings.enabled ? 14 : 0 }],
              },
            ]}
          />
        </View>
      </Pressable>

      <Pressable
        style={[
          styles.notificationRow,
          {
            borderColor: themeTokens.inputBorder,
            backgroundColor: themeTokens.input,
          },
          notificationSettings.enabled ? null : styles.opacityMuted,
        ]}
        onPress={toggleMuteForegroundNotifications}
        disabled={!notificationSettings.enabled}
      >
        <View style={styles.notificationRowTextWrap}>
          <Text
            style={[
              styles.notificationRowTitle,
              {
                color: notificationSettings.enabled
                  ? themeTokens.textPrimary
                  : themeTokens.textDisabled,
              },
            ]}
          >
            Mute sound in foreground
          </Text>
          <Text
            style={[
              styles.notificationRowDescription,
              {
                color: notificationSettings.enabled
                  ? themeTokens.textMuted
                  : themeTokens.textDisabled,
              },
            ]}
          >
            Keep banner only while app is active.
          </Text>
        </View>
        <View
          style={[
            styles.notificationToggleTrack,
            {
              backgroundColor:
                notificationSettings.enabled && notificationSettings.muteForeground
                  ? SEMANTIC.green
                  : themeTokens.card,
              borderColor: themeTokens.inputBorder,
            },
            notificationSettings.enabled ? null : styles.opacityMuted,
          ]}
        >
          <View
            style={[
              styles.notificationToggleThumb,
              {
                backgroundColor:
                  notificationSettings.enabled && notificationSettings.muteForeground
                    ? '#ffffff'
                    : themeTokens.textDisabled,
                transform: [
                  {
                    translateX:
                      notificationSettings.enabled && notificationSettings.muteForeground
                        ? 14
                        : 0,
                  },
                ],
              },
            ]}
          />
        </View>
      </Pressable>

      <Text style={[styles.notificationSectionLabel, { color: themeTokens.textSecondary }]}>Per gateway</Text>
      <View style={styles.notificationGatewayList}>
        {gatewayProfiles.map((profile) => {
          const enabledForGateway = isGatewayNotificationEnabled(profile.id);
          const enabledForToggle = notificationSettings.enabled;
          return (
            <Pressable
              key={`notification:${profile.id}`}
              style={[
                styles.notificationGatewayRow,
                {
                  borderColor: themeTokens.inputBorder,
                  backgroundColor: themeTokens.input,
                },
                enabledForToggle ? null : styles.opacityMuted,
              ]}
              disabled={!enabledForToggle}
              onPress={() => toggleGatewayNotifications(profile.id)}
            >
              <View style={styles.notificationGatewayMeta}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.notificationGatewayName,
                    {
                      color: enabledForToggle
                        ? themeTokens.textPrimary
                        : themeTokens.textDisabled,
                    },
                  ]}
                >
                  {profile.name || 'Unnamed Gateway'}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.notificationGatewayUrl,
                    {
                      color: enabledForToggle
                        ? themeTokens.textMuted
                        : themeTokens.textDisabled,
                    },
                  ]}
                >
                  {profile.gatewayUrl || 'URL not set'}
                </Text>
              </View>
              <View
                style={[
                  styles.notificationToggleTrack,
                  {
                    backgroundColor:
                      enabledForToggle && enabledForGateway ? SEMANTIC.green : themeTokens.card,
                    borderColor: themeTokens.inputBorder,
                  },
                  enabledForToggle ? null : styles.opacityMuted,
                ]}
              >
                <View
                  style={[
                    styles.notificationToggleThumb,
                    {
                      backgroundColor:
                        enabledForToggle && enabledForGateway
                          ? '#ffffff'
                          : themeTokens.textDisabled,
                      transform: [{ translateX: enabledForToggle && enabledForGateway ? 14 : 0 }],
                    },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
