import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { compactQuickTextLabel } from '../../logic/app-logic';
import styles from '../../styles/app-styles';

export default function ComposerActionCluster({
  attachmentActionOpacityStyle,
  canInsertLeftQuick,
  canInsertRightQuick,
  canSend,
  controllerState,
  focusComposerForGateway,
  insertQuickText,
  leftQuickTextValue,
  profileId,
  quickMenuOpen,
  rightQuickTextValue,
  sendDisabledReason,
  setAttachmentPickerGatewayId,
  setFocusedGatewayId,
  setQuickMenuOpenForGateway,
  themeTokens,
  triggerSendFromComposer,
}) {
  return (
    <>
      <Pressable
        style={[
          styles.quickMenuTrigger,
          {
            backgroundColor: themeTokens.card,
            borderColor: themeTokens.inputBorder,
          },
          attachmentActionOpacityStyle,
        ]}
        disabled={controllerState.isSending}
        onPress={() => {
          setFocusedGatewayId(profileId);
          setQuickMenuOpenForGateway(profileId, false);
          setAttachmentPickerGatewayId(profileId);
        }}
        accessibilityLabel="Attach file or image"
        accessibilityHint="Attach files or images to the current message."
      >
        <Text style={[styles.quickMenuIconText, { color: themeTokens.textSecondary }]}>📎</Text>
      </Pressable>

      <Pressable
        style={[
          styles.quickMenuTrigger,
          {
            backgroundColor: themeTokens.card,
            borderColor: themeTokens.inputBorder,
          },
        ]}
        onPress={() => {
          setFocusedGatewayId(profileId);
          setQuickMenuOpenForGateway(profileId, !quickMenuOpen);
        }}
        accessibilityLabel="Open quick text menu"
        accessibilityHint="Insert saved quick text at the current cursor position."
      >
        <Text style={[styles.quickMenuIconText, { color: themeTokens.textSecondary }]}>⚡</Text>
      </Pressable>

      {quickMenuOpen ? (
        <View
          style={[
            styles.quickMenuPanel,
            {
              backgroundColor: themeTokens.card,
              borderColor: themeTokens.inputBorder,
            },
          ]}
        >
          <Pressable
            style={[
              styles.quickMenuItem,
              (!canInsertLeftQuick || controllerState.isSending) && styles.quickMenuItemDisabled,
              { backgroundColor: themeTokens.card },
            ]}
            disabled={!canInsertLeftQuick || controllerState.isSending}
            accessibilityLabel="Insert left quick text"
            accessibilityHint="Inserts the left quick text at the current cursor position."
            onPress={() => {
              insertQuickText(profileId, leftQuickTextValue);
              setQuickMenuOpenForGateway(profileId, false);
              focusComposerForGateway(profileId);
            }}
          >
            <Text
              style={[
                styles.quickMenuItemTitle,
                {
                  color:
                    canInsertLeftQuick && !controllerState.isSending
                      ? themeTokens.textSecondary
                      : themeTokens.textDisabled,
                },
              ]}
            >
              Left
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.quickMenuItemValue,
                {
                  color:
                    canInsertLeftQuick && !controllerState.isSending
                      ? themeTokens.textMuted
                      : themeTokens.textDisabled,
                },
              ]}
            >
              {compactQuickTextLabel(leftQuickTextValue)}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.quickMenuItem,
              (!canInsertRightQuick || controllerState.isSending) && styles.quickMenuItemDisabled,
              { backgroundColor: themeTokens.card },
            ]}
            disabled={!canInsertRightQuick || controllerState.isSending}
            accessibilityLabel="Insert right quick text"
            accessibilityHint="Inserts the right quick text at the current cursor position."
            onPress={() => {
              insertQuickText(profileId, rightQuickTextValue);
              setQuickMenuOpenForGateway(profileId, false);
              focusComposerForGateway(profileId);
            }}
          >
            <Text
              style={[
                styles.quickMenuItemTitle,
                {
                  color:
                    canInsertRightQuick && !controllerState.isSending
                      ? themeTokens.textSecondary
                      : themeTokens.textDisabled,
                },
              ]}
            >
              Right
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.quickMenuItemValue,
                {
                  color:
                    canInsertRightQuick && !controllerState.isSending
                      ? themeTokens.textMuted
                      : themeTokens.textDisabled,
                },
              ]}
            >
              {compactQuickTextLabel(rightQuickTextValue)}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {controllerState.isSending ? (
        <View
          style={[
            styles.actionCircle,
            styles.actionBusy,
            { backgroundColor: themeTokens.textDisabled },
          ]}
        >
          <ActivityIndicator size="small" color="#ffffff" />
        </View>
      ) : canSend ? (
        <Pressable
          style={[styles.actionCircle, styles.actionSend]}
          onPress={triggerSendFromComposer}
          accessibilityLabel="Send message"
          accessibilityHint="Sends the current text and attachments."
        >
          <Text style={styles.actionIcon}>{'➤'}</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.actionCircle, styles.actionDisabled, { backgroundColor: themeTokens.input }]}
          disabled
          accessibilityLabel="Send unavailable"
          accessibilityHint={sendDisabledReason}
        >
          <Text style={[styles.actionIcon, { color: themeTokens.textDisabled }]}>{'➤'}</Text>
        </Pressable>
      )}
    </>
  );
}
