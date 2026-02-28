import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  COMPOSER_MIN_LINES,
  COMPOSER_VERTICAL_PADDING,
} from '../logic/app-constants';
import {
  clampComposerHeight,
  compactQuickTextLabel,
  extractDroppedFileCandidates,
  normalizeComposerSelection,
} from '../logic/app-logic';
import styles from '../styles/app-styles';

export default function GatewayComposerPanel({
  attachmentActionOpacityStyle,
  canInsertLeftQuick,
  canInsertRightQuick,
  canSend,
  composerHeight,
  composerHeightByGatewayIdRef,
  composerInputRefs,
  composerScrollEnabled,
  composerStatusColor,
  composerStatusMessage,
  controllerState,
  dropActive,
  focusComposerForGateway,
  forcedSelection,
  forcedSelectionByGatewayIdRef,
  handleDroppedFilesForGateway,
  hintHeightByGatewayIdRef,
  isExpanded,
  isImeComposingByGatewayIdRef,
  leftQuickTextValue,
  profileId,
  quickMenuOpen,
  recomputeHistoryBottomInsetForGateway,
  rightQuickTextValue,
  runtime,
  sendDisabledReason,
  setAttachmentPickerGatewayId,
  setComposerFocusedForGateway,
  setComposerSelectionForGateway,
  setComposerTextForGateway,
  setDropActiveByGatewayId,
  setFocusedGatewayId,
  setForcedSelectionForGateway,
  setImeComposingForGateway,
  setQuickMenuOpenForGateway,
  skipSubmitEditingByGatewayIdRef,
  theme,
  themeTokens,
  triggerHistorySync,
  triggerSendFromComposer,
  tryImportFromClipboardShortcut,
  updateGatewayRuntime,
  insertQuickText,
}) {
  const handleComposerDragEnter = () => {
    setDropActiveByGatewayId((previous) => ({ ...previous, [profileId]: true }));
  };

  const handleComposerDragLeave = () => {
    setDropActiveByGatewayId((previous) => {
      if (!previous[profileId]) return previous;
      const next = { ...previous };
      delete next[profileId];
      return next;
    });
  };

  const handleComposerDrop = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    handleComposerDragLeave();
    handleDroppedFilesForGateway(profileId, event?.nativeEvent ?? event);
    focusComposerForGateway(profileId);
  };

  return (
    <>
      {quickMenuOpen ? (
        <Pressable
          style={styles.quickMenuBackdrop}
          onPress={() => setQuickMenuOpenForGateway(profileId, false)}
          accessibilityLabel="Close quick text menu"
        />
      ) : null}

      <View
        style={[
          styles.gatewayComposerRow,
          {
            borderColor: themeTokens.inputBorder,
            backgroundColor: themeTokens.input,
          },
          quickMenuOpen && styles.gatewayComposerRowRaised,
          dropActive && [
            styles.gatewayComposerRowDropActive,
            {
              borderColor: themeTokens.inputBorderFocus,
              backgroundColor: themeTokens.sideActiveBg,
            },
          ],
        ]}
        onDragEnter={handleComposerDragEnter}
        onDragOver={(event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          handleComposerDragEnter();
        }}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
        onLayout={(event) => {
          if (!isExpanded) return;
          const height = Math.ceil(event?.nativeEvent?.layout?.height ?? 0);
          if (!Number.isFinite(height) || height <= 0) return;
          if (composerHeightByGatewayIdRef.current[profileId] === height) return;
          composerHeightByGatewayIdRef.current[profileId] = height;
          recomputeHistoryBottomInsetForGateway(profileId);
          triggerHistorySync();
        }}
      >
        <TextInput
          ref={(node) => {
            if (node) {
              composerInputRefs.current.set(profileId, node);
            } else {
              composerInputRefs.current.delete(profileId);
            }
          }}
          style={[
            styles.composerField,
            {
              backgroundColor: themeTokens.card,
              borderColor: runtime.isComposerFocused
                ? themeTokens.inputBorderFocus
                : themeTokens.inputBorder,
              color: themeTokens.textPrimary,
              height: composerHeight,
            },
          ]}
          value={runtime.composerText}
          onChangeText={(nextText) => {
            if (forcedSelectionByGatewayIdRef.current[profileId]) {
              setForcedSelectionForGateway(profileId, null);
            }
            setComposerTextForGateway(profileId, nextText);
          }}
          onSelectionChange={(event) => {
            const next = event?.nativeEvent?.selection;
            if (next && typeof next.start === 'number' && typeof next.end === 'number') {
              const normalized = normalizeComposerSelection(next, runtime.composerText);
              setComposerSelectionForGateway(profileId, normalized);
              if (forcedSelectionByGatewayIdRef.current[profileId]) {
                setForcedSelectionForGateway(profileId, null);
              }
            }
          }}
          {...(forcedSelection ? { selection: forcedSelection } : {})}
          onFocus={() => {
            setComposerFocusedForGateway(profileId, true);
            setQuickMenuOpenForGateway(profileId, false);
          }}
          onBlur={() => {
            setComposerFocusedForGateway(profileId, false);
            setForcedSelectionForGateway(profileId, null);
            setImeComposingForGateway(profileId, false);
            delete skipSubmitEditingByGatewayIdRef.current[profileId];
          }}
          onKeyDown={(event) => {
            const nativeEvent = event?.nativeEvent ?? {};
            const key = String(nativeEvent.key ?? '');
            const hasMeta = Boolean(nativeEvent.metaKey);
            const hasCtrl = Boolean(nativeEvent.ctrlKey);
            const hasAlt = Boolean(nativeEvent.altKey);
            const hasShift = Boolean(nativeEvent.shiftKey);
            const hasModifier = hasMeta || hasCtrl || hasAlt || hasShift;
            const lowerKey = key.toLowerCase();
            const isEnter = key === 'Enter' || nativeEvent.keyCode === 13;
            const isComposingEvent =
              nativeEvent.isComposing === true ||
              nativeEvent.keyCode === 229 ||
              key === 'Process';
            const isPasteShortcut =
              (hasMeta || hasCtrl) && !hasAlt && !hasShift && lowerKey === 'v';

            if (isComposingEvent) {
              setImeComposingForGateway(profileId, true);
              return;
            }

            if (isPasteShortcut) {
              tryImportFromClipboardShortcut(profileId);
            }

            const isImeComposingNow = isImeComposingByGatewayIdRef.current[profileId] === true;

            if (!isEnter && isImeComposingNow) {
              if (!hasShift && key !== 'Shift') {
                setImeComposingForGateway(profileId, false);
              }
              return;
            }

            if (isEnter && !hasModifier) {
              if (isImeComposingNow) {
                setImeComposingForGateway(profileId, false);
                return;
              }
              event?.preventDefault?.();
              event?.stopPropagation?.();
              triggerSendFromComposer('keydown');
              return;
            }

            if (isEnter && !hasAlt && !hasShift && (hasMeta || hasCtrl)) {
              if (isImeComposingNow) {
                setImeComposingForGateway(profileId, false);
                return;
              }
              event?.preventDefault?.();
              event?.stopPropagation?.();
              triggerSendFromComposer('keydown');
            }
          }}
          onPaste={(event) => {
            const dropped = extractDroppedFileCandidates(event?.nativeEvent ?? event);
            if (!Array.isArray(dropped) || dropped.length === 0) return;
            event?.preventDefault?.();
            event?.stopPropagation?.();
            handleDroppedFilesForGateway(profileId, event?.nativeEvent ?? event);
          }}
          onSubmitEditing={(event) => {
            if (skipSubmitEditingByGatewayIdRef.current[profileId]) {
              delete skipSubmitEditingByGatewayIdRef.current[profileId];
              return;
            }
            if (event?.nativeEvent?.isComposing === true) return;
          }}
          onContentSizeChange={(event) => {
            const contentHeight = Number(event?.nativeEvent?.contentSize?.height ?? 0);
            if (!Number.isFinite(contentHeight) || contentHeight <= 0) return;
            const nextComposerHeight = clampComposerHeight(contentHeight + COMPOSER_VERTICAL_PADDING);
            if (nextComposerHeight === composerHeight) return;
            updateGatewayRuntime(profileId, (current) => ({
              ...current,
              composerHeight: nextComposerHeight,
            }));
            recomputeHistoryBottomInsetForGateway(profileId);
            triggerHistorySync();
          }}
          autoCorrect
          spellCheck={false}
          blurOnSubmit={false}
          multiline
          numberOfLines={COMPOSER_MIN_LINES}
          placeholder={controllerState.isSending ? 'Waiting for response...' : 'Type a message...'}
          placeholderTextColor={themeTokens.placeholder}
          selectionColor={themeTokens.inputCaret}
          cursorColor={themeTokens.inputCaret}
          keyboardAppearance={theme === 'dark' ? 'dark' : 'light'}
          editable={!controllerState.isSending}
          scrollEnabled={composerScrollEnabled}
        />

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
      </View>

      <View
        style={[styles.kbdHintRowCard, { borderTopColor: themeTokens.dividerStrong }]}
        onLayout={(event) => {
          if (!isExpanded) return;
          const height = Math.ceil(event?.nativeEvent?.layout?.height ?? 0);
          if (!Number.isFinite(height) || height <= 0) return;
          if (hintHeightByGatewayIdRef.current[profileId] === height) return;
          hintHeightByGatewayIdRef.current[profileId] = height;
          recomputeHistoryBottomInsetForGateway(profileId);
          triggerHistorySync();
        }}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.attachmentStatusText,
            {
              color: composerStatusColor,
            },
          ]}
        >
          {composerStatusMessage}
        </Text>
        <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Enter send</Text>
        <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Shift+Enter newline</Text>
        <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Cmd+Enter send</Text>
        <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Cmd+R refresh</Text>
        <Text style={[styles.kbdHintText, { color: themeTokens.textMuted }]}>Esc clear</Text>
      </View>
    </>
  );
}
