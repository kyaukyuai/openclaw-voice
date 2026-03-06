import { STYLE_LAYOUT, STYLE_RADII } from './tokens';

const shellLayoutStyles = {
  safeArea: {
    flex: 1,
  },
  outer: {
    flex: 1,
  },
  window: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  windowBody: {
    flex: 1,
    flexDirection: 'row',
    gap: 0,
  },
  sidebar: {
    width: STYLE_LAYOUT.sidebarWidth,
    borderRightWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sideChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: STYLE_RADII.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    marginBottom: 8,
  },
  sideChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sideChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sideSeparator: {
    height: 1,
    marginVertical: 10,
  },
  sideHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  sideList: {
    gap: 3,
  },
  gatewayGroup: {
    gap: 3,
    marginBottom: 4,
  },
  gatewayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
  },
  gatewayHeaderMain: {
    flex: 1,
  },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: STYLE_RADII.smallCard,
    marginBottom: 2,
  },
  settingsNavItem: {
    paddingVertical: 10,
  },
  sideGlyphWrap: {
    width: 16,
    alignItems: 'center',
  },
  sideGlyph: {
    fontSize: 11,
    fontWeight: '800',
  },
  sideItemLabel: {
    flex: 1,
    fontSize: 13,
  },
  opacityHalf: {
    opacity: 0.5,
  },
  opacitySoft: {
    opacity: 0.65,
  },
  opacityMuted: {
    opacity: 0.7,
  },
  fontWeight500: {
    fontWeight: '500',
  },
  fontWeight600: {
    fontWeight: '600',
  },
  fontWeight700: {
    fontWeight: '700',
  },
  unreadBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: STYLE_RADII.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  unreadBadgeSmall: {
    minWidth: 18,
    height: 16,
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  unreadBadgeTextSmall: {
    fontSize: 9,
  },
  sessionItemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gatewaySessionCountBadge: {
    minWidth: 22,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  gatewaySessionCountText: {
    fontSize: 10,
    fontWeight: '700',
  },
  gatewayCollapseButton: {
    width: 28,
    borderWidth: 1,
    borderRadius: STYLE_RADII.smallCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  gatewayCollapseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: -1,
  },
  gatewaySessionList: {
    paddingLeft: 22,
    gap: 2,
  },
  gatewaySessionItem: {
    borderRadius: 7,
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 9,
  },
  gatewaySessionCreateItem: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  gatewaySessionItemText: {
    fontSize: 12,
  },
  newSessionButton: {
    borderWidth: 1,
    borderRadius: STYLE_RADII.smallCard,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
  newSessionButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sidebarGrow: {
    flex: 1,
  },
  themeSwitch: {
    borderWidth: 1,
    borderRadius: STYLE_RADII.smallCard,
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  themeSwitchText: {
    fontSize: 12,
    fontWeight: '700',
  },
};

export default shellLayoutStyles;
