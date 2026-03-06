import { STYLE_COLORS, STYLE_RADII } from './tokens';

const gatewayComponentStyles = {
  gatewayCard: {
    borderWidth: 1.25,
    borderRadius: STYLE_RADII.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 9,
    position: 'relative',
  },
  gatewayCardExpanded: {
    flex: 1,
    minHeight: 0,
  },
  gatewayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  gatewayCardMeta: {
    flex: 1,
    minWidth: 0,
  },
  gatewayCardName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  gatewayCardUrl: {
    fontSize: 11,
    marginTop: 1,
  },
  connectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: STYLE_RADII.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 6,
  },
  connectionChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectionChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  gatewayCardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  gatewayActionHint: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
  },
  gatewayRecoveryHint: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: -2,
    marginBottom: 1,
  },
  inlineAction: {
    borderWidth: 1.25,
    borderRadius: STYLE_RADII.smallCard,
    minHeight: 32,
    minWidth: 86,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inlineActionIconText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inlinePrimary: {
    borderRadius: STYLE_RADII.smallCard,
    minHeight: 32,
    minWidth: 102,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlinePrimaryText: {
    color: STYLE_COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  inlinePrimaryIconText: {
    color: STYLE_COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  gatewayStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: STYLE_RADII.smallCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 220,
    maxWidth: '70%',
  },
  statusStaticDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusRowText: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  updatedText: {
    fontSize: 11,
    fontWeight: '500',
  },
  gatewayHistoryPreview: {
    borderWidth: 1,
    borderRadius: STYLE_RADII.card,
    minHeight: 160,
    overflow: 'hidden',
  },
  gatewayHistoryPreviewCompact: {
    maxHeight: 240,
  },
  gatewayHistoryPreviewExpanded: {
    flex: 1,
    minHeight: 0,
  },
  gatewayHistoryScroll: {
    flex: 1,
  },
  gatewayHistoryScrollContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  gatewayHistoryScrollContentExpanded: {
    paddingBottom: 8,
  },
  attachmentList: {
    maxHeight: 40,
  },
  attachmentListContent: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  attachmentChip: {
    maxWidth: 360,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: STYLE_RADII.pill,
    paddingLeft: 9,
    paddingRight: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  attachmentChipPreview: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  attachmentChipType: {
    fontSize: 10,
    fontWeight: '700',
  },
  attachmentChipName: {
    maxWidth: 170,
    fontSize: 11,
    fontWeight: '600',
  },
  attachmentChipSize: {
    fontSize: 10,
    fontWeight: '500',
  },
  attachmentChipRemove: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentChipRemoveText: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: -1,
  },
};

export default gatewayComponentStyles;
