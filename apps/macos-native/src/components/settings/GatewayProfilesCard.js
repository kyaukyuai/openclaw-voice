import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { connectionChipFromState, createGatewayRuntime } from '../../logic/app-logic';
import styles from '../../styles/app-styles';

export default function GatewayProfilesCard({
  activeGatewayId,
  gatewayProfiles,
  gatewayRuntimeById,
  handleCreateGatewayProfile,
  handleDeleteActiveGatewayProfile,
  handleSelectGatewayProfile,
  themeTokens,
}) {
  const canDeleteGatewayProfile = gatewayProfiles.length > 1;
  const removeGatewayActionStyle = {
    borderColor: canDeleteGatewayProfile ? 'rgba(220,38,38,0.35)' : themeTokens.inputBorder,
    backgroundColor: themeTokens.card,
  };
  const removeGatewayTextColorStyle = {
    color: canDeleteGatewayProfile ? '#B91C1C' : themeTokens.textDisabled,
  };

  return (
    <View
      style={[
        styles.settingsCard,
        { backgroundColor: themeTokens.card, borderColor: themeTokens.inputBorder },
      ]}
    >
      <Text style={[styles.settingsTitle, { color: themeTokens.textPrimary }]}>Gateway Profiles</Text>
      <View style={styles.gatewayProfilesList}>
        {gatewayProfiles.map((profile) => {
          const runtime = gatewayRuntimeById[profile.id] ?? createGatewayRuntime();
          const statusChip = connectionChipFromState(runtime.controllerState.connectionState);
          const isActiveProfile = profile.id === activeGatewayId;

          return (
            <Pressable
              key={profile.id}
              style={[
                styles.gatewayProfileItem,
                {
                  borderColor: isActiveProfile
                    ? themeTokens.inputBorderFocus
                    : themeTokens.inputBorder,
                  backgroundColor: isActiveProfile ? themeTokens.sideActiveBg : themeTokens.input,
                },
              ]}
              onPress={() => handleSelectGatewayProfile(profile.id)}
            >
              <View style={[styles.gatewayProfileDot, { backgroundColor: statusChip.color }]} />
              <View style={styles.gatewayProfileMeta}>
                <Text
                  numberOfLines={1}
                  style={[styles.gatewayProfileName, { color: themeTokens.textPrimary }]}
                >
                  {profile.name || 'Unnamed Gateway'}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.gatewayProfileUrl, { color: themeTokens.textMuted }]}
                >
                  {profile.gatewayUrl || 'URL not set'}
                </Text>
              </View>
              <Text style={[styles.gatewayProfileActiveTag, { color: statusChip.color }]}>
                {statusChip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.settingsActionsRow}>
        <Pressable
          style={[
            styles.secondaryAction,
            { borderColor: themeTokens.inputBorder, backgroundColor: themeTokens.card },
          ]}
          onPress={handleCreateGatewayProfile}
        >
          <Text style={[styles.secondaryActionText, { color: themeTokens.textSecondary }]}>+ Add Gateway</Text>
        </Pressable>

        <Pressable
          style={[
            styles.secondaryAction,
            removeGatewayActionStyle,
            canDeleteGatewayProfile ? null : styles.opacitySoft,
          ]}
          disabled={!canDeleteGatewayProfile}
          onPress={handleDeleteActiveGatewayProfile}
        >
          <Text
            style={[
              styles.secondaryActionText,
              removeGatewayTextColorStyle,
            ]}
          >
            Remove Active
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
