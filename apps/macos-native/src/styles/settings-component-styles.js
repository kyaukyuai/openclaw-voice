import { STYLE_COLORS, STYLE_RADII } from './tokens';

const settingsComponentStyles = {
  settingsCard: {
    borderWidth: 1.25,
    borderRadius: STYLE_RADII.card,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  settingsTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  gatewayProfilesList: {
    gap: 8,
  },
  gatewayProfileItem: {
    minHeight: 42,
    borderRadius: STYLE_RADII.smallCard,
    borderWidth: 1.25,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gatewayProfileDot: {
    width: 8,
    height: 8,
    borderRadius: STYLE_RADII.pill,
  },
  gatewayProfileMeta: {
    flex: 1,
    minWidth: 0,
  },
  gatewayProfileName: {
    fontSize: 13,
    fontWeight: '700',
  },
  gatewayProfileUrl: {
    fontSize: 11,
    marginTop: 1,
  },
  gatewayProfileActiveTag: {
    fontSize: 11,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  settingsInput: {
    height: 38,
    borderWidth: 1.25,
    borderRadius: STYLE_RADII.smallCard,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  tokenInputField: {
    flex: 1,
  },
  tokenMaskedField: {
    justifyContent: 'center',
  },
  tokenMaskedText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  tokenVisibilityButton: {
    width: 38,
    height: 38,
    borderRadius: STYLE_RADII.smallCard,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    width: 16,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeOutline: {
    position: 'absolute',
    width: 16,
    height: 10,
    borderWidth: 1.5,
    borderRadius: STYLE_RADII.pill,
  },
  eyePupil: {
    width: 4,
    height: 4,
    borderRadius: STYLE_RADII.pill,
  },
  eyeSlash: {
    position: 'absolute',
    width: 18,
    height: 1.5,
    borderRadius: STYLE_RADII.pill,
    transform: [{ rotate: '-30deg' }],
  },
  primaryAction: {
    flex: 1,
    minHeight: 36,
    borderRadius: STYLE_RADII.smallCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: STYLE_COLORS.white,
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryAction: {
    flex: 1,
    borderWidth: 1.25,
    borderRadius: STYLE_RADII.smallCard,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  gatewayConnectedHint: {
    minHeight: 30,
    borderRadius: STYLE_RADII.smallCard,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gatewayConnectedDot: {
    width: 7,
    height: 7,
    borderRadius: STYLE_RADII.pill,
  },
  gatewayConnectedHintText: {
    fontSize: 11,
    fontWeight: '600',
  },
  insertAction: {
    flex: 1,
    minHeight: 34,
    borderRadius: STYLE_RADII.smallCard,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insertActionTransparent: {
    backgroundColor: 'transparent',
  },
  insertActionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  quickTextHint: {
    fontSize: 10,
    marginTop: 4,
    fontStyle: 'italic',
  },
  settingsRecoveryHint: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: -2,
  },
  notificationRow: {
    minHeight: 42,
    borderRadius: STYLE_RADII.smallCard,
    borderWidth: 1.25,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  notificationRowTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  notificationRowTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  notificationRowDescription: {
    fontSize: 10,
    lineHeight: 14,
  },
  notificationToggleTrack: {
    width: 34,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  notificationToggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  notificationSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  notificationGatewayList: {
    gap: 6,
  },
  notificationGatewayRow: {
    minHeight: 42,
    borderRadius: STYLE_RADII.smallCard,
    borderWidth: 1.25,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  notificationGatewayMeta: {
    flex: 1,
    minWidth: 0,
  },
  notificationGatewayName: {
    fontSize: 12,
    fontWeight: '600',
  },
  notificationGatewayUrl: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '500',
  },
  telemetryMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  telemetryMetricCard: {
    width: '31%',
    minWidth: 120,
    borderWidth: 1.25,
    borderRadius: STYLE_RADII.smallCard,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  telemetryMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  telemetryMetricValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  telemetryGatewayList: {
    gap: 6,
  },
  telemetryGatewayRow: {
    borderWidth: 1.25,
    borderRadius: STYLE_RADII.smallCard,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  telemetryGatewayName: {
    fontSize: 12,
    fontWeight: '700',
  },
  telemetryGatewayInline: {
    fontSize: 10,
    fontWeight: '500',
  },
};

export default settingsComponentStyles;
