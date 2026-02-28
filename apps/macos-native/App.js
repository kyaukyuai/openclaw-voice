import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatUpdatedAtLabel, groupTurnsByDate } from '../../src/shared';
import DateRow from './src/components/DateRow';
import SettingsView from './src/components/SettingsView';
import TurnRow from './src/components/TurnRow';
import useMacosAppRuntime from './src/hooks/useMacosAppRuntime';
import {
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_LINES,
  COMPOSER_VERTICAL_PADDING,
  INITIAL_CONTROLLER_STATE,
  SEMANTIC,
} from './src/logic/app-constants';
import {
  attachmentLabel,
  bytesLabel,
  clampComposerHeight,
  compactQuickTextLabel,
  connectionChipFromState,
  createGatewayRuntime,
  extractDroppedFileCandidates,
  gatewayRecoveryHint,
  mergeSessionKeys,
  normalizeAttachmentDraft,
  normalizeComposerSelection,
  normalizeSessionKey,
  normalizeText,
  statusRowMeta,
} from './src/logic/app-logic';
import styles from './src/styles/app-styles';
import FileAttachmentPickerSheet from './components/FileAttachmentPickerSheet';

export default function App() {
  const {
    activeGatewayId,
    activeNav,
    activeProfile,
    attachmentNoticeByGatewayId,
    attachmentPickerGatewayId,
    authToken,
    authTokenInputRef,
    booting,
    clearPendingAttachmentsForGateway,
    collapsedGatewayIds,
    composerHeightByGatewayIdRef,
    composerInputRefs,
    connectGateway,
    copiedMessageByKey,
    disconnectGateway,
    dropActiveByGatewayId,
    focusedGatewayId,
    focusedSettingsInput,
    focusComposerForGateway,
    forcedSelectionByGatewayId,
    forcedSelectionByGatewayIdRef,
    gatewayName,
    gatewayProfiles,
    gatewayRuntimeById,
    gatewayUrl,
    handleAttachmentPick,
    handleCopyMessage,
    handleCreateGatewayProfile,
    handleCreateSession,
    handleDeleteActiveGatewayProfile,
    handleDroppedFilesForGateway,
    handleOpenExternalLink,
    handleRootKeyDown,
    handleSelectGatewayProfile,
    handleSelectSession,
    hintHeightByGatewayIdRef,
    historyBottomInsetByGatewayId,
    historyContentHeightByGatewayIdRef,
    historyScrollRefs,
    historyViewportHeightByGatewayIdRef,
    identityPersistWarning,
    identityReady,
    insertQuickText,
    isAuthTokenVisible,
    isGatewayNotificationEnabled,
    isImeComposingByGatewayIdRef,
    notificationSettings,
    pendingTurnFocusByGatewayIdRef,
    quickMenuOpenByGatewayId,
    quickTextLeft,
    quickTextRight,
    recomputeHistoryBottomInsetForGateway,
    refreshHistory,
    removePendingAttachmentForGateway,
    rootRef,
    scheduleHistoryBottomSync,
    scheduleHistoryTurnFocus,
    sendMessage,
    sessionKey,
    setActiveNav,
    setAttachmentPickerGatewayId,
    setAuthToken,
    setComposerFocusedForGateway,
    setComposerSelectionForGateway,
    setComposerTextForGateway,
    setDropActiveByGatewayId,
    setFocusedGatewayId,
    setFocusedSettingsInput,
    setForcedSelectionForGateway,
    setGatewayName,
    setGatewayUrl,
    setImeComposingForGateway,
    setIsAuthTokenVisible,
    setQuickMenuOpenForGateway,
    setQuickTextLeft,
    setQuickTextRight,
    setSessionKey,
    setTheme,
    skipSubmitEditingByGatewayIdRef,
    summaryChip,
    theme,
    themeTokens,
    toggleGatewayCollapse,
    toggleGatewayNotifications,
    toggleMuteForegroundNotifications,
    toggleNotificationsEnabled,
    tryImportFromClipboardShortcut,
    unreadByGatewaySession,
    updateGatewayRuntime,
  } = useMacosAppRuntime();

  const renderGatewayCard = useCallback(
    (profile, options = {}) => {
      const runtime = gatewayRuntimeById[profile.id] ?? createGatewayRuntime();
      const controllerState = runtime.controllerState ?? INITIAL_CONTROLLER_STATE;
      const isExpanded = options.expanded === true;

      const isGatewayConnected = controllerState.connectionState === 'connected';
      const isConnecting = controllerState.connectionState === 'connecting';
      const isReconnecting = controllerState.connectionState === 'reconnecting';
      const canDisconnectGateway = controllerState.connectionState !== 'disconnected';
      const statusMeta = statusRowMeta(controllerState, identityPersistWarning, themeTokens);
      const connectionChip = connectionChipFromState(controllerState.connectionState);
      const updatedLabel = formatUpdatedAtLabel(controllerState.lastUpdatedAt);
      const recoveryHint = gatewayRecoveryHint(profile, controllerState);

      const imeComposing = isImeComposingByGatewayIdRef.current[profile.id] === true;
      const forcedSelection = forcedSelectionByGatewayId[profile.id];
      const composerHeight = clampComposerHeight(runtime.composerHeight);
      const composerScrollEnabled = composerHeight >= COMPOSER_MAX_HEIGHT;
      const hasComposerText = normalizeText(runtime.composerText).length > 0;
      const pendingAttachments = Array.isArray(runtime.pendingAttachments)
        ? runtime.pendingAttachments
            .map((entry) => normalizeAttachmentDraft(entry))
            .filter(Boolean)
        : [];
      const hasPendingAttachments = pendingAttachments.length > 0;
      const canSend =
        controllerState.connectionState === 'connected' &&
        !controllerState.isSending &&
        (hasComposerText || hasPendingAttachments) &&
        !imeComposing;
      const isDisconnected = controllerState.connectionState === 'disconnected';
      const quickMenuOpen = quickMenuOpenByGatewayId[profile.id] === true;
      const leftQuickTextValue = normalizeText(quickTextLeft);
      const rightQuickTextValue = normalizeText(quickTextRight);
      const canInsertLeftQuick = leftQuickTextValue.length > 0;
      const canInsertRightQuick = rightQuickTextValue.length > 0;
      const sendDisabledReason =
        controllerState.connectionState !== 'connected'
          ? isReconnecting
            ? 'Reconnecting... You can reconnect manually.'
            : isConnecting
              ? 'Connecting... Please wait before sending.'
              : 'Connect to send messages'
          : imeComposing
          ? 'Finish text composition to send'
          : hasComposerText || hasPendingAttachments
            ? 'Sending is temporarily unavailable'
            : 'Type a message or attach a file';
      const dropActive = dropActiveByGatewayId[profile.id] === true;
      const sendingAttachmentCount = Number(runtime.sendingAttachmentCount ?? 0);
      const attachmentNotice = attachmentNoticeByGatewayId[profile.id] ?? null;
      const attachmentStatusMessage =
        controllerState.isSending && sendingAttachmentCount > 0
          ? `Uploading ${sendingAttachmentCount} attachment${sendingAttachmentCount > 1 ? 's' : ''}...`
          : dropActive
            ? 'Drop file(s) to attach'
            : attachmentNotice?.message ?? '';
      const attachmentStatusColor =
        controllerState.isSending && sendingAttachmentCount > 0
          ? SEMANTIC.blue
          : attachmentNotice?.kind === 'error'
            ? SEMANTIC.red
            : attachmentNotice?.kind === 'warn'
              ? SEMANTIC.amber
              : attachmentNotice?.kind === 'success'
                ? SEMANTIC.green
                : themeTokens.textMuted;
      const composerStatusMessage = attachmentStatusMessage
        ? attachmentStatusMessage
        : controllerState.connectionState !== 'connected'
          ? isReconnecting
            ? 'Reconnecting... You can reconnect manually.'
            : isConnecting
              ? 'Connecting...'
              : 'Connect to send'
          : imeComposing
            ? 'Composing text...'
            : controllerState.isSending
              ? 'Sending...'
              : 'Ready';
      const composerStatusColor = attachmentStatusMessage
        ? attachmentStatusColor
        : isDisconnected
          ? themeTokens.textMuted
          : isConnecting || isReconnecting || imeComposing || controllerState.isSending
            ? SEMANTIC.amber
            : themeTokens.textMuted;

      const historyItems = groupTurnsByDate(controllerState.turns ?? []);
      const previewItems = isExpanded ? historyItems : historyItems.slice(-8);
      let lastTurnId = '';
      for (let index = previewItems.length - 1; index >= 0; index -= 1) {
        if (previewItems[index]?.kind === 'turn') {
          lastTurnId = String(previewItems[index]?.id ?? '');
          break;
        }
      }
      const historyBottomInset = isExpanded ? historyBottomInsetByGatewayId[profile.id] ?? 24 : 0;
      const pendingTurnFocus = pendingTurnFocusByGatewayIdRef.current[profile.id];
      const hasPendingTurnFocus =
        Boolean(pendingTurnFocus?.turnId) &&
        normalizeSessionKey(profile.sessionKey) === normalizeSessionKey(pendingTurnFocus?.sessionKey);
      const triggerHistorySync = () => {
        if (!isExpanded) return;
        if (hasPendingTurnFocus) {
          scheduleHistoryTurnFocus(profile.id, pendingTurnFocus.turnId, pendingTurnFocus.sessionKey);
          return;
        }
        scheduleHistoryBottomSync(profile.id);
      };
      const triggerSendFromComposer = (source = 'manual') => {
        if (source === 'keydown') {
          skipSubmitEditingByGatewayIdRef.current[profile.id] = true;
        }
        setQuickMenuOpenForGateway(profile.id, false);
        sendMessage(profile.id).catch(() => {
          // surfaced via banner
        });
      };
      const handleComposerDragEnter = () => {
        setDropActiveByGatewayId((previous) => ({ ...previous, [profile.id]: true }));
      };
      const handleComposerDragLeave = () => {
        setDropActiveByGatewayId((previous) => {
          if (!previous[profile.id]) return previous;
          const next = { ...previous };
          delete next[profile.id];
          return next;
        });
      };
      const handleComposerDrop = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        handleComposerDragLeave();
        handleDroppedFilesForGateway(profile.id, event?.nativeEvent ?? event);
        focusComposerForGateway(profile.id);
      };

      return (
        <View
          key={profile.id}
          style={[
            styles.gatewayCard,
            isExpanded && styles.gatewayCardExpanded,
            {
              backgroundColor: themeTokens.card,
              borderColor: themeTokens.inputBorder,
            },
          ]}
        >
          <View style={styles.gatewayCardHeader}>
            <View style={styles.gatewayCardMeta}>
              <Text style={[styles.gatewayCardName, { color: themeTokens.textPrimary }]}>
                {profile.name || 'Unnamed Gateway'}
              </Text>
            </View>
            <View style={[styles.connectionChip, { backgroundColor: connectionChip.bg }]}>
              <View style={[styles.connectionChipDot, { backgroundColor: connectionChip.color }]} />
              <Text style={[styles.connectionChipText, { color: connectionChip.color }]}> 
                {connectionChip.label}
              </Text>
            </View>
          </View>

          <View style={styles.gatewayCardActions}>
            <Pressable
              style={[
                styles.inlineAction,
                {
                  backgroundColor:
                    controllerState.connectionState === 'connected' && !controllerState.isSyncing
                      ? themeTokens.card
                      : themeTokens.input,
                  borderColor: themeTokens.inputBorder,
                },
              ]}
              disabled={controllerState.connectionState !== 'connected' || controllerState.isSyncing}
              accessibilityRole="button"
              accessibilityLabel="Sync history"
              accessibilityHint="Reloads messages for the current session without reconnecting."
              onPress={() => {
                setQuickMenuOpenForGateway(profile.id, false);
                refreshHistory(profile.id).catch(() => {
                  // surfaced via banner
                });
              }}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.inlineActionText,
                  {
                    color:
                      controllerState.connectionState === 'connected' && !controllerState.isSyncing
                        ? themeTokens.textSecondary
                        : themeTokens.textDisabled,
                  },
                ]}
              >
                ↻ Sync
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.inlinePrimary,
                {
                  backgroundColor: SEMANTIC.blue,
                  opacity: !identityReady || isConnecting ? 0.5 : 1,
                },
              ]}
              disabled={!identityReady || isConnecting}
              accessibilityRole="button"
              accessibilityLabel={isGatewayConnected || isReconnecting ? 'Reconnect gateway' : 'Connect gateway'}
              accessibilityHint={
                isGatewayConnected || isReconnecting
                  ? 'Restarts the gateway connection. Use this after changing URL, token, or session.'
                  : 'Starts a gateway connection with the current settings.'
              }
              onPress={() => {
                setQuickMenuOpenForGateway(profile.id, false);
                connectGateway(profile.id).catch(() => {
                  // surfaced via banner
                });
              }}
            >
              <Text style={styles.inlinePrimaryText} numberOfLines={1}>
                {isGatewayConnected || isReconnecting ? '⇄ Reconnect' : '◎ Connect'}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.inlineAction,
                {
                  backgroundColor: themeTokens.card,
                  borderColor: themeTokens.inputBorder,
                  opacity: canDisconnectGateway ? 1 : 0.65,
                },
              ]}
              disabled={!canDisconnectGateway}
              accessibilityRole="button"
              accessibilityLabel="Disconnect gateway"
              accessibilityHint="Stops the gateway connection immediately."
              onPress={() => {
                setQuickMenuOpenForGateway(profile.id, false);
                disconnectGateway(profile.id);
              }}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.inlineActionText,
                  { color: canDisconnectGateway ? themeTokens.textSecondary : themeTokens.textDisabled },
                ]}
              >
                ⏻ Disconnect
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.gatewayActionHint, { color: themeTokens.textMuted }]}>
            Sync reloads history. Reconnect restarts the connection.
          </Text>
          {recoveryHint ? (
            <Text
              style={[
                styles.gatewayRecoveryHint,
                {
                  color:
                    controllerState.connectionState === 'reconnecting'
                      ? SEMANTIC.amber
                      : themeTokens.textSecondary,
                },
              ]}
            >
              {recoveryHint}
            </Text>
          ) : null}

          <View style={styles.gatewayStatusRow}>
            <View
              style={[
                styles.statusRow,
                {
                  backgroundColor: statusMeta.tone.bg,
                  borderColor: statusMeta.tone.border,
                },
              ]}
            >
              {statusMeta.spinning ? (
                <ActivityIndicator size="small" color={statusMeta.tone.color} />
              ) : (
                <View style={[styles.statusStaticDot, { backgroundColor: statusMeta.tone.color }]} />
              )}
              <Text style={[styles.statusRowText, { color: statusMeta.tone.color }]} numberOfLines={1}>
                {statusMeta.message}
              </Text>
            </View>
            <Text style={[styles.updatedText, { color: themeTokens.textMuted }]}>{updatedLabel || '-'}</Text>
          </View>

          <View
            style={[
              styles.gatewayHistoryPreview,
              !isExpanded && styles.gatewayHistoryPreviewCompact,
              isExpanded && styles.gatewayHistoryPreviewExpanded,
              {
                backgroundColor: themeTokens.input,
                borderColor: themeTokens.inputBorder,
              },
            ]}
            onLayout={() => {
              if (!isExpanded) return;
              recomputeHistoryBottomInsetForGateway(profile.id);
              triggerHistorySync();
            }}
          >
            {previewItems.length === 0 ? (
              <View style={styles.emptyWrapCompact}>
                <View style={[styles.emptyIcon, { backgroundColor: themeTokens.emptyIconBg }]}> 
                  <Text style={[styles.emptyIconText, { color: SEMANTIC.blue }]}>OC</Text>
                </View>
                <Text style={[styles.emptyDescription, { color: themeTokens.textMuted }]}>No messages yet.</Text>
              </View>
            ) : (
              <FlatList
                ref={(node) => {
                  if (node) {
                    historyScrollRefs.current.set(profile.id, node);
                    if (isExpanded) {
                      triggerHistorySync();
                    }
                  } else {
                    historyScrollRefs.current.delete(profile.id);
                  }
                }}
                data={previewItems}
                style={styles.gatewayHistoryScroll}
                onLayout={(event) => {
                  if (!isExpanded) return;
                  const height = Math.ceil(event?.nativeEvent?.layout?.height ?? 0);
                  if (!Number.isFinite(height) || height <= 0) return;
                  historyViewportHeightByGatewayIdRef.current[profile.id] = height;
                  triggerHistorySync();
                }}
                keyExtractor={(item) => `${profile.id}:${item.id}`}
                renderItem={({ item }) => {
                  if (item.kind === 'date') {
                    return <DateRow label={item.label} themeTokens={themeTokens} />;
                  }

                  const messageCopyKey = `${profile.id}:${item.id}:assistant`;
                  return (
                    <TurnRow
                      turn={item.turn}
                      themeTokens={themeTokens}
                      onOpenExternalLink={handleOpenExternalLink}
                      copyKey={`${profile.id}:${item.id}`}
                      copied={copiedMessageByKey[messageCopyKey] === true}
                      onCopyMessage={handleCopyMessage}
                      onAssistantHeightChange={
                        isExpanded
                          ? () => {
                              triggerHistorySync();
                            }
                          : undefined
                      }
                      onLayout={
                        isExpanded && String(item.id) === lastTurnId
                          ? () => {
                              triggerHistorySync();
                            }
                          : undefined
                      }
                      onTailLayout={
                        isExpanded && String(item.id) === lastTurnId
                          ? () => {
                              triggerHistorySync();
                            }
                          : undefined
                      }
                    />
                  );
                }}
                contentContainerStyle={[
                  styles.gatewayHistoryScrollContent,
                  isExpanded && styles.gatewayHistoryScrollContentExpanded,
                ]}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews={false}
                initialNumToRender={isExpanded ? Math.min(24, previewItems.length) : previewItems.length}
                maxToRenderPerBatch={isExpanded ? 24 : previewItems.length}
                windowSize={isExpanded ? 7 : 3}
                onContentSizeChange={(_width, height) => {
                  if (!isExpanded) return;
                  const normalizedHeight = Math.ceil(height ?? 0);
                  if (Number.isFinite(normalizedHeight) && normalizedHeight > 0) {
                    historyContentHeightByGatewayIdRef.current[profile.id] = normalizedHeight;
                  }
                  triggerHistorySync();
                }}
                onScrollToIndexFailed={(info) => {
                  if (!isExpanded) return;
                  const scrollNode = historyScrollRefs.current.get(profile.id);
                  const approxOffset = Math.max(0, (info?.averageItemLength ?? 64) * (info?.index ?? 0));
                  scrollNode?.scrollToOffset?.({ offset: approxOffset, animated: false });
                  if (hasPendingTurnFocus) {
                    scheduleHistoryTurnFocus(profile.id, pendingTurnFocus.turnId, pendingTurnFocus.sessionKey);
                  }
                }}
                ListFooterComponent={isExpanded ? <View style={{ height: historyBottomInset }} /> : null}
              />
            )}
          </View>

          {hasPendingAttachments ? (
            <View style={styles.attachmentSection}>
              <View style={styles.attachmentSectionHeader}>
                <Text style={[styles.attachmentSectionTitle, { color: themeTokens.textMuted }]}>
                  {pendingAttachments.length} attachment{pendingAttachments.length > 1 ? 's' : ''}
                </Text>
                <Pressable
                  style={[styles.attachmentClearButton, { borderColor: themeTokens.inputBorder }]}
                  onPress={() => clearPendingAttachmentsForGateway(profile.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all attachments"
                >
                  <Text style={[styles.attachmentClearButtonText, { color: themeTokens.textSecondary }]}>
                    Clear all
                  </Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                style={styles.attachmentList}
                contentContainerStyle={styles.attachmentListContent}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {pendingAttachments.map((attachment) => (
                  <View
                    key={attachment.id}
                    style={[
                      styles.attachmentChip,
                      {
                        backgroundColor: themeTokens.card,
                        borderColor: themeTokens.inputBorder,
                      },
                    ]}
                  >
                    {attachment.type === 'image' ? (
                      <Image
                        source={{ uri: `data:${attachment.mimeType};base64,${attachment.content}` }}
                        style={styles.attachmentChipPreview}
                      />
                    ) : null}
                    <Text style={[styles.attachmentChipType, { color: themeTokens.textSecondary }]}>
                      {attachment.type === 'image' ? 'IMG' : 'FILE'}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.attachmentChipName, { color: themeTokens.textSecondary }]}
                    >
                      {attachment.fileName}
                    </Text>
                    <Text style={[styles.attachmentChipSize, { color: themeTokens.textMuted }]}>
                      {bytesLabel(Number(attachment.size ?? 0))}
                    </Text>
                    <Pressable
                      onPress={() => removePendingAttachmentForGateway(profile.id, attachment.id)}
                      style={styles.attachmentChipRemove}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${attachmentLabel(attachment)}`}
                    >
                      <Text style={[styles.attachmentChipRemoveText, { color: themeTokens.textMuted }]}>
                        x
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {quickMenuOpen ? (
            <Pressable
              style={styles.quickMenuBackdrop}
              onPress={() => setQuickMenuOpenForGateway(profile.id, false)}
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
              if (composerHeightByGatewayIdRef.current[profile.id] === height) return;
              composerHeightByGatewayIdRef.current[profile.id] = height;
              recomputeHistoryBottomInsetForGateway(profile.id);
              triggerHistorySync();
            }}
          >

            <TextInput
              ref={(node) => {
                if (node) {
                  composerInputRefs.current.set(profile.id, node);
                } else {
                  composerInputRefs.current.delete(profile.id);
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
                  fontStyle: 'normal',
                },
              ]}
              value={runtime.composerText}
              onChangeText={(nextText) => {
                if (forcedSelectionByGatewayIdRef.current[profile.id]) {
                  setForcedSelectionForGateway(profile.id, null);
                }
                setComposerTextForGateway(profile.id, nextText);
              }}
              onSelectionChange={(event) => {
                const next = event?.nativeEvent?.selection;
                if (next && typeof next.start === 'number' && typeof next.end === 'number') {
                  const normalized = normalizeComposerSelection(next, runtime.composerText);
                  setComposerSelectionForGateway(profile.id, normalized);
                  if (forcedSelectionByGatewayIdRef.current[profile.id]) {
                    setForcedSelectionForGateway(profile.id, null);
                  }
                }
              }}
              {...(forcedSelection ? { selection: forcedSelection } : {})}
              onFocus={() => {
                setComposerFocusedForGateway(profile.id, true);
                setQuickMenuOpenForGateway(profile.id, false);
              }}
              onBlur={() => {
                setComposerFocusedForGateway(profile.id, false);
                setForcedSelectionForGateway(profile.id, null);
                setImeComposingForGateway(profile.id, false);
                delete skipSubmitEditingByGatewayIdRef.current[profile.id];
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
                  setImeComposingForGateway(profile.id, true);
                  return;
                }

                if (isPasteShortcut) {
                  tryImportFromClipboardShortcut(profile.id);
                }

                const isImeComposingNow = isImeComposingByGatewayIdRef.current[profile.id] === true;

                if (!isEnter && isImeComposingNow) {
                  if (!hasShift && key !== 'Shift') {
                    setImeComposingForGateway(profile.id, false);
                  }
                  return;
                }

                if (isEnter && !hasModifier) {
                  if (isImeComposingNow) {
                    setImeComposingForGateway(profile.id, false);
                    return;
                  }
                  event?.preventDefault?.();
                  event?.stopPropagation?.();
                  triggerSendFromComposer('keydown');
                  return;
                }

                if (isEnter && !hasAlt && !hasShift && (hasMeta || hasCtrl)) {
                  if (isImeComposingNow) {
                    setImeComposingForGateway(profile.id, false);
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
                handleDroppedFilesForGateway(profile.id, event?.nativeEvent ?? event);
              }}
              onSubmitEditing={(event) => {
                if (skipSubmitEditingByGatewayIdRef.current[profile.id]) {
                  delete skipSubmitEditingByGatewayIdRef.current[profile.id];
                  return;
                }
                if (event?.nativeEvent?.isComposing === true) return;
              }}
              onContentSizeChange={(event) => {
                const contentHeight = Number(event?.nativeEvent?.contentSize?.height ?? 0);
                if (!Number.isFinite(contentHeight) || contentHeight <= 0) return;
                const nextComposerHeight = clampComposerHeight(contentHeight + COMPOSER_VERTICAL_PADDING);
                if (nextComposerHeight === composerHeight) return;
                updateGatewayRuntime(profile.id, (current) => ({
                  ...current,
                  composerHeight: nextComposerHeight,
                }));
                recomputeHistoryBottomInsetForGateway(profile.id);
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
                  opacity: controllerState.isSending ? 0.65 : 1,
                },
              ]}
              disabled={controllerState.isSending}
              onPress={() => {
                setFocusedGatewayId(profile.id);
                setQuickMenuOpenForGateway(profile.id, false);
                setAttachmentPickerGatewayId(profile.id);
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
                setFocusedGatewayId(profile.id);
                setQuickMenuOpenForGateway(profile.id, !quickMenuOpen);
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
                  onPress={() => {
                    insertQuickText(profile.id, leftQuickTextValue);
                    setQuickMenuOpenForGateway(profile.id, false);
                    focusComposerForGateway(profile.id);
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
                  onPress={() => {
                    insertQuickText(profile.id, rightQuickTextValue);
                    setQuickMenuOpenForGateway(profile.id, false);
                    focusComposerForGateway(profile.id);
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
              if (hintHeightByGatewayIdRef.current[profile.id] === height) return;
              hintHeightByGatewayIdRef.current[profile.id] = height;
              recomputeHistoryBottomInsetForGateway(profile.id);
              triggerHistorySync();
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.attachmentStatusText,
                {
                  color: composerStatusColor,
                  opacity: 1,
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
        </View>
      );
    },
    [
      clearPendingAttachmentsForGateway,
      composerHeightByGatewayIdRef,
      composerInputRefs,
      connectGateway,
      dropActiveByGatewayId,
      copiedMessageByKey,
      disconnectGateway,
      attachmentNoticeByGatewayId,
      forcedSelectionByGatewayId,
      forcedSelectionByGatewayIdRef,
      focusComposerForGateway,
      gatewayRuntimeById,
      handleCopyMessage,
      handleDroppedFilesForGateway,
      handleOpenExternalLink,
      hintHeightByGatewayIdRef,
      historyBottomInsetByGatewayId,
      historyContentHeightByGatewayIdRef,
      historyScrollRefs,
      historyViewportHeightByGatewayIdRef,
      identityPersistWarning,
      identityReady,
      insertQuickText,
      isImeComposingByGatewayIdRef,
      pendingTurnFocusByGatewayIdRef,
      quickTextLeft,
      quickTextRight,
      refreshHistory,
      removePendingAttachmentForGateway,
      recomputeHistoryBottomInsetForGateway,
      scheduleHistoryBottomSync,
      scheduleHistoryTurnFocus,
      sendMessage,
      setAttachmentPickerGatewayId,
      setDropActiveByGatewayId,
      setImeComposingForGateway,
      setComposerFocusedForGateway,
      setComposerSelectionForGateway,
      setComposerTextForGateway,
      setFocusedGatewayId,
      setForcedSelectionForGateway,
      setQuickMenuOpenForGateway,
      skipSubmitEditingByGatewayIdRef,
      theme,
      themeTokens,
      tryImportFromClipboardShortcut,
      updateGatewayRuntime,
      quickMenuOpenByGatewayId,
    ],
  );

  const renderSelectedSession = useCallback(() => {
    if (!activeProfile) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyTitle, { color: themeTokens.textPrimary }]}>No gateways configured.</Text>
          <Text style={[styles.emptyDescription, { color: themeTokens.textMuted }]}>Create a gateway profile in Settings.</Text>
        </View>
      );
    }

    return (
      <View
        style={styles.selectedSessionWrap}
        onLayout={() => {
          if (!activeProfile?.id) return;
          scheduleHistoryBottomSync(activeProfile.id);
        }}
      >
        {renderGatewayCard(activeProfile, { expanded: true })}
      </View>
    );
  }, [activeProfile, renderGatewayCard, scheduleHistoryBottomSync, themeTokens]);

  if (booting) {
    return (
      <SafeAreaView style={[styles.bootScreen, { backgroundColor: themeTokens.bg }]}>
        <Text style={[styles.bootText, { color: themeTokens.textSecondary }]}>Booting macOS workspace...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeTokens.bg }]}> 
      <View ref={rootRef} style={styles.outer} focusable onKeyDown={handleRootKeyDown}>
        <View style={[styles.window, { backgroundColor: themeTokens.bg }]}> 
          <View style={styles.windowBody}>
            <View
              style={[
                styles.sidebar,
                { backgroundColor: themeTokens.sidebar, borderRightColor: themeTokens.dividerStrong },
              ]}
            >
              <View style={[styles.sideChip, { backgroundColor: summaryChip.bg }]}>
                <View style={[styles.sideChipDot, { backgroundColor: summaryChip.color }]} />
                <Text style={[styles.sideChipText, { color: summaryChip.color }]}>{summaryChip.label}</Text>
              </View>

              <View style={[styles.sideSeparator, { backgroundColor: themeTokens.dividerStrong }]} />

              <Text style={[styles.sideHeader, { color: themeTokens.textMuted }]}>Gateways</Text>
              <View style={styles.sideList}>
                {gatewayProfiles.map((profile) => {
                  const profileSessions = mergeSessionKeys([profile.sessionKey], profile.sessions);
                  const profileRuntime = gatewayRuntimeById[profile.id];
                  const connectionState = profileRuntime?.controllerState?.connectionState ?? 'disconnected';
                  const connectionChip = connectionChipFromState(connectionState);
                  const unreadBySession = unreadByGatewaySession[profile.id] ?? {};
                  const gatewayUnreadCount = Object.values(unreadBySession).reduce((total, value) => {
                    const count = Number(value ?? 0);
                    return total + (Number.isFinite(count) ? Math.max(0, count) : 0);
                  }, 0);
                  const isActiveGateway = profile.id === activeGatewayId;
                  const isCollapsed = collapsedGatewayIds[profile.id] === true;

                  return (
                    <View key={profile.id} style={styles.gatewayGroup}>
                      <View style={styles.gatewayHeaderRow}>
                        <Pressable
                          onPress={() => handleSelectGatewayProfile(profile.id, 'chat')}
                          style={[
                            styles.sideItem,
                            styles.gatewayHeaderMain,
                            {
                              backgroundColor: isActiveGateway
                                ? themeTokens.sideActiveBg
                                : 'transparent',
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.sessionItemDot,
                              {
                                backgroundColor: connectionChip.color,
                              },
                            ]}
                          />
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.sideItemLabel,
                              {
                                color: isActiveGateway
                                  ? themeTokens.sideActiveInk
                                  : themeTokens.textSecondary,
                                fontWeight: isActiveGateway ? '700' : '600',
                              },
                            ]}
                          >
                            {profile.name}
                          </Text>
                          {gatewayUnreadCount > 0 ? (
                            <View
                              style={[
                                styles.unreadBadge,
                                {
                                  backgroundColor: themeTokens.sideActiveBg,
                                  borderColor: themeTokens.inputBorder,
                                },
                              ]}
                            >
                              <Text style={[styles.unreadBadgeText, { color: themeTokens.sideActiveInk }]}>
                                {gatewayUnreadCount > 99 ? '99+' : String(gatewayUnreadCount)}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>

                        <Pressable
                          style={[
                            styles.gatewayCollapseButton,
                            {
                              borderColor: themeTokens.inputBorder,
                              backgroundColor: themeTokens.card,
                            },
                          ]}
                          onPress={() => toggleGatewayCollapse(profile.id)}
                          accessibilityRole="button"
                          accessibilityLabel={isCollapsed ? 'Expand sessions' : 'Collapse sessions'}
                        >
                          <Text
                            style={[
                              styles.gatewayCollapseButtonText,
                              { color: themeTokens.textSecondary },
                            ]}
                          >
                            {isCollapsed ? '▸' : '▾'}
                          </Text>
                        </Pressable>
                      </View>

                      {!isCollapsed ? <View style={styles.gatewaySessionList}>
                        {profileSessions.map((knownSessionKey) => {
                          const isActiveSession =
                            isActiveGateway && knownSessionKey === profile.sessionKey;
                          const unreadCount = Number(unreadBySession[knownSessionKey] ?? 0);

                          return (
                            <Pressable
                              key={`${profile.id}:${knownSessionKey}`}
                              style={[
                                styles.gatewaySessionItem,
                                {
                                  backgroundColor: isActiveSession
                                    ? themeTokens.sideActiveBg
                                    : 'transparent',
                                },
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`Select session ${knownSessionKey}`}
                              onPress={() => {
                                handleSelectSession(profile.id, knownSessionKey);
                              }}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.gatewaySessionItemText,
                                  {
                                    color: isActiveSession
                                      ? themeTokens.sideActiveInk
                                      : themeTokens.textMuted,
                                    fontWeight: isActiveSession ? '700' : '500',
                                  },
                                ]}
                              >
                                {knownSessionKey}
                              </Text>
                              {unreadCount > 0 ? (
                                <View
                                  style={[
                                    styles.unreadBadge,
                                    styles.unreadBadgeSmall,
                                    {
                                      backgroundColor: isActiveSession
                                        ? themeTokens.card
                                        : themeTokens.sideActiveBg,
                                      borderColor: themeTokens.inputBorder,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.unreadBadgeText,
                                      styles.unreadBadgeTextSmall,
                                      {
                                        color: isActiveSession
                                          ? themeTokens.sideActiveInk
                                          : themeTokens.textSecondary,
                                      },
                                    ]}
                                  >
                                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                                  </Text>
                                </View>
                              ) : null}
                            </Pressable>
                          );
                        })}

                        <Pressable
                          style={[
                            styles.gatewaySessionItem,
                            styles.gatewaySessionCreateItem,
                            {
                              borderColor: themeTokens.inputBorder,
                            },
                          ]}
                          onPress={() => {
                            handleCreateSession(profile.id);
                          }}
                        >
                          <Text
                            style={[
                              styles.gatewaySessionItemText,
                              {
                                color: themeTokens.textSecondary,
                                fontWeight: '600',
                              },
                            ]}
                          >
                            + New Session
                          </Text>
                        </Pressable>
                      </View> : null}
                    </View>
                  );
                })}
              </View>

              <View style={[styles.sideSeparator, { backgroundColor: themeTokens.dividerStrong }]} />

              <Pressable
                style={[
                  styles.sideItem,
                  styles.settingsNavItem,
                  {
                    backgroundColor: activeNav === 'settings' ? themeTokens.sideActiveBg : 'transparent',
                  },
                ]}
                onPress={() => setActiveNav('settings')}
              >
                <Text
                  style={[
                    styles.sideItemLabel,
                    {
                      color: activeNav === 'settings' ? themeTokens.sideActiveInk : themeTokens.textSecondary,
                      fontWeight: activeNav === 'settings' ? '700' : '600',
                    },
                  ]}
                >
                  Settings
                </Text>
              </Pressable>

              <View style={styles.sidebarGrow} />

              <Pressable
                style={[
                  styles.themeSwitch,
                  {
                    backgroundColor: themeTokens.card,
                    borderColor: themeTokens.inputBorder,
                  },
                ]}
                onPress={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
              >
                <Text style={[styles.themeSwitchText, { color: themeTokens.textSecondary }]}>Theme: {theme === 'light' ? 'Light' : 'Dark'}</Text>
              </Pressable>
            </View>

            <View style={styles.content}>
              {activeNav === 'settings' ? (
                <SettingsView
                  activeGatewayId={activeGatewayId}
                  authToken={authToken}
                  authTokenInputRef={authTokenInputRef}
                  connectGateway={connectGateway}
                  disconnectGateway={disconnectGateway}
                  focusedGatewayId={focusedGatewayId}
                  focusedSettingsInput={focusedSettingsInput}
                  gatewayName={gatewayName}
                  gatewayProfiles={gatewayProfiles}
                  gatewayRuntimeById={gatewayRuntimeById}
                  gatewayUrl={gatewayUrl}
                  handleCreateGatewayProfile={handleCreateGatewayProfile}
                  handleDeleteActiveGatewayProfile={handleDeleteActiveGatewayProfile}
                  handleSelectGatewayProfile={handleSelectGatewayProfile}
                  identityReady={identityReady}
                  insertQuickText={insertQuickText}
                  isAuthTokenVisible={isAuthTokenVisible}
                  isGatewayNotificationEnabled={isGatewayNotificationEnabled}
                  notificationSettings={notificationSettings}
                  quickTextLeft={quickTextLeft}
                  quickTextRight={quickTextRight}
                  sessionKey={sessionKey}
                  setAuthToken={setAuthToken}
                  setFocusedSettingsInput={setFocusedSettingsInput}
                  setGatewayName={setGatewayName}
                  setGatewayUrl={setGatewayUrl}
                  setIsAuthTokenVisible={setIsAuthTokenVisible}
                  setQuickTextLeft={setQuickTextLeft}
                  setQuickTextRight={setQuickTextRight}
                  setSessionKey={setSessionKey}
                  themeTokens={themeTokens}
                  toggleGatewayNotifications={toggleGatewayNotifications}
                  toggleMuteForegroundNotifications={toggleMuteForegroundNotifications}
                  toggleNotificationsEnabled={toggleNotificationsEnabled}
                />
              ) : (
                renderSelectedSession()
              )}
            </View>
          </View>
        </View>
      </View>
      <FileAttachmentPickerSheet
        visible={Boolean(attachmentPickerGatewayId)}
        themeTokens={themeTokens}
        onClose={() => setAttachmentPickerGatewayId(null)}
        onPick={handleAttachmentPick}
      />
    </SafeAreaView>
  );
}
