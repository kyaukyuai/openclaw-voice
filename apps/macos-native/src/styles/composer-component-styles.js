import { StyleSheet } from 'react-native';
import {
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  SEMANTIC,
} from '../logic/app-constants';
import { STYLE_COLORS, STYLE_RADII } from './tokens';

const composerComponentStyles = {
  gatewayComposerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    zIndex: 2,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: STYLE_RADII.card,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  gatewayComposerRowRaised: {
    zIndex: 4,
  },
  gatewayComposerRowDropActive: {
    borderStyle: 'dashed',
  },
  quickMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  quickMenuTrigger: {
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: 0,
    borderRadius: STYLE_RADII.smallCard,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickMenuTriggerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  quickMenuIconText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 17,
  },
  quickMenuPanel: {
    position: 'absolute',
    right: 48,
    bottom: 44,
    width: 256,
    borderWidth: 1.25,
    borderRadius: STYLE_RADII.card,
    paddingVertical: 6,
    zIndex: 5,
  },
  quickMenuItem: {
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    gap: 2,
  },
  quickMenuItemDisabled: {
    opacity: 1,
  },
  quickMenuItemTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  quickMenuItemValue: {
    fontSize: 10,
    fontWeight: '500',
  },
  composerField: {
    flex: 1,
    minHeight: COMPOSER_MIN_HEIGHT,
    maxHeight: COMPOSER_MAX_HEIGHT,
    borderWidth: 1.25,
    borderRadius: STYLE_RADII.smallCard,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    lineHeight: COMPOSER_LINE_HEIGHT,
    textAlignVertical: 'top',
    fontStyle: 'normal',
  },
  actionCircle: {
    width: 36,
    height: 36,
    borderRadius: STYLE_RADII.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSend: {
    backgroundColor: SEMANTIC.green,
  },
  actionBusy: {
    backgroundColor: STYLE_COLORS.actionBusy,
  },
  actionDisabled: {
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  actionIcon: {
    color: STYLE_COLORS.white,
    fontSize: 17,
    fontWeight: '700',
    marginTop: -2,
  },
  kbdHintRowCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 6,
  },
  attachmentStatusText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    marginRight: 8,
  },
  kbdHintText: {
    fontSize: 10,
    fontWeight: '500',
  },
};

export default composerComponentStyles;
