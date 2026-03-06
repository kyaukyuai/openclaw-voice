import { STYLE_COLORS, STYLE_RADII } from './tokens';

const historyComponentStyles = {
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyIconText: {
    fontSize: 14,
    fontWeight: '800',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 5,
  },
  emptyDescription: {
    fontSize: 12,
    textAlign: 'center',
  },
  dateLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  importedTag: {
    borderRadius: STYLE_RADII.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  importedTagText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  userBubble: {
    maxWidth: '72%',
    borderRadius: STYLE_RADII.bubble,
    borderBottomRightRadius: STYLE_RADII.bubbleTight,
    backgroundColor: STYLE_COLORS.userBubbleBlue,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userBubbleText: {
    color: STYLE_COLORS.white,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  assistantAvatar: {
    width: 22,
    height: 22,
    borderRadius: STYLE_RADII.avatar,
    backgroundColor: STYLE_COLORS.assistantAvatarBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  assistantAvatarText: {
    color: STYLE_COLORS.white,
    fontSize: 8,
    fontWeight: '800',
  },
  assistantBubble: {
    flex: 1,
    minWidth: 0,
    maxWidth: 980,
    flexShrink: 1,
    borderRadius: STYLE_RADII.bubble,
    borderBottomLeftRadius: STYLE_RADII.bubbleTight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  assistantBubbleHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginBottom: 6,
  },
  copyChip: {
    minHeight: 20,
    borderRadius: STYLE_RADII.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyChipText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  pendingBubbleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingBubbleText: {
    fontSize: 11,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  turnStateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  turnTimeText: {
    fontSize: 9,
    fontWeight: '500',
  },
};

export default historyComponentStyles;
