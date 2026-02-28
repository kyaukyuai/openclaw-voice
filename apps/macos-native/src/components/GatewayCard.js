import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { formatUpdatedAtLabel, groupTurnsByDate } from '../../../../src/shared';
import {
  INITIAL_CONTROLLER_STATE,
  SEMANTIC,
  COMPOSER_MAX_HEIGHT,
} from '../logic/app-constants';
import {
  attachmentLabel,
  bytesLabel,
  clampComposerHeight,
  connectionChipFromState,
  gatewayRecoveryHint,
  normalizeAttachmentDraft,
  normalizeSessionKey,
  normalizeText,
  statusRowMeta,
} from '../logic/app-logic';
import styles from '../styles/app-styles';
import GatewayComposerPanel from './GatewayComposerPanel';
import GatewayHistoryPanel from './GatewayHistoryPanel';

export default function GatewayCard({
  attachmentNotice,
  clearPendingAttachmentsForGateway,
  composerHeightByGatewayIdRef,
  composerInputRefs,
  connectGateway,
  copiedMessageByKey,
  disconnectGateway,
  dropActive,
  focusComposerForGateway,
  forcedSelection,
  forcedSelectionByGatewayIdRef,
  handleCopyMessage,
  handleDroppedFilesForGateway,
  handleOpenExternalLink,
  hintHeightByGatewayIdRef,
  historyBottomInset,
  historyContentHeightByGatewayIdRef,
  historyScrollRefs,
  historyViewportHeightByGatewayIdRef,
  identityPersistWarning,
  identityReady,
  insertQuickText,
  isExpanded,
  isImeComposingByGatewayIdRef,
  pendingTurnFocus,
  profile,
  quickMenuOpen,
  quickTextLeft,
  quickTextRight,
  recomputeHistoryBottomInsetForGateway,
  refreshHistory,
  removePendingAttachmentForGateway,
  scheduleHistoryBottomSync,
  scheduleHistoryTurnFocus,
  sendMessage,
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
  tryImportFromClipboardShortcut,
  updateGatewayRuntime,
  runtime,
}) {
  const controllerState = runtime.controllerState ?? INITIAL_CONTROLLER_STATE;
  const isGatewayConnected = controllerState.connectionState === 'connected';
  const isConnecting = controllerState.connectionState === 'connecting';
  const isReconnecting = controllerState.connectionState === 'reconnecting';
  const canDisconnectGateway = controllerState.connectionState !== 'disconnected';
  const statusMeta = statusRowMeta(controllerState, identityPersistWarning, themeTokens);
  const connectionChip = connectionChipFromState(controllerState.connectionState);
  const updatedLabel = formatUpdatedAtLabel(controllerState.lastUpdatedAt);
  const recoveryHint = gatewayRecoveryHint(profile, controllerState);

  const imeComposing = isImeComposingByGatewayIdRef.current[profile.id] === true;
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

  const leftQuickTextValue = normalizeText(quickTextLeft);
  const rightQuickTextValue = normalizeText(quickTextRight);
  const canInsertLeftQuick = leftQuickTextValue.length > 0;
  const canInsertRightQuick = rightQuickTextValue.length > 0;

  const connectActionOpacityStyle = !identityReady || isConnecting ? styles.opacityHalf : null;
  const disconnectActionOpacityStyle = canDisconnectGateway ? null : styles.opacitySoft;
  const attachmentActionOpacityStyle = controllerState.isSending ? styles.opacitySoft : null;

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

  const sendingAttachmentCount = Number(runtime.sendingAttachmentCount ?? 0);
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

  return (
    <View
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
            },
            connectActionOpacityStyle,
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
            },
            disconnectActionOpacityStyle,
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

      <GatewayHistoryPanel
        copiedMessageByKey={copiedMessageByKey}
        hasPendingTurnFocus={hasPendingTurnFocus}
        historyBottomInset={historyBottomInset}
        historyContentHeightByGatewayIdRef={historyContentHeightByGatewayIdRef}
        historyScrollRefs={historyScrollRefs}
        historyViewportHeightByGatewayIdRef={historyViewportHeightByGatewayIdRef}
        isExpanded={isExpanded}
        onCopyMessage={handleCopyMessage}
        onHistorySync={() => {
          if (!isExpanded) return;
          recomputeHistoryBottomInsetForGateway(profile.id);
          triggerHistorySync();
        }}
        onOpenExternalLink={handleOpenExternalLink}
        pendingTurnFocus={pendingTurnFocus}
        previewItems={previewItems}
        profileId={profile.id}
        scheduleHistoryTurnFocus={scheduleHistoryTurnFocus}
        themeTokens={themeTokens}
      />

      {pendingAttachments.length > 0 ? (
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

      <GatewayComposerPanel
        attachmentActionOpacityStyle={attachmentActionOpacityStyle}
        canInsertLeftQuick={canInsertLeftQuick}
        canInsertRightQuick={canInsertRightQuick}
        canSend={canSend}
        composerHeight={composerHeight}
        composerHeightByGatewayIdRef={composerHeightByGatewayIdRef}
        composerInputRefs={composerInputRefs}
        composerScrollEnabled={composerScrollEnabled}
        composerStatusColor={composerStatusColor}
        composerStatusMessage={composerStatusMessage}
        controllerState={controllerState}
        dropActive={dropActive}
        focusComposerForGateway={focusComposerForGateway}
        forcedSelection={forcedSelection}
        forcedSelectionByGatewayIdRef={forcedSelectionByGatewayIdRef}
        handleDroppedFilesForGateway={handleDroppedFilesForGateway}
        hintHeightByGatewayIdRef={hintHeightByGatewayIdRef}
        insertQuickText={insertQuickText}
        isExpanded={isExpanded}
        isImeComposingByGatewayIdRef={isImeComposingByGatewayIdRef}
        leftQuickTextValue={leftQuickTextValue}
        profileId={profile.id}
        quickMenuOpen={quickMenuOpen}
        recomputeHistoryBottomInsetForGateway={recomputeHistoryBottomInsetForGateway}
        rightQuickTextValue={rightQuickTextValue}
        runtime={runtime}
        sendDisabledReason={sendDisabledReason}
        setAttachmentPickerGatewayId={setAttachmentPickerGatewayId}
        setComposerFocusedForGateway={setComposerFocusedForGateway}
        setComposerSelectionForGateway={setComposerSelectionForGateway}
        setComposerTextForGateway={setComposerTextForGateway}
        setDropActiveByGatewayId={setDropActiveByGatewayId}
        setFocusedGatewayId={setFocusedGatewayId}
        setForcedSelectionForGateway={setForcedSelectionForGateway}
        setImeComposingForGateway={setImeComposingForGateway}
        setQuickMenuOpenForGateway={setQuickMenuOpenForGateway}
        skipSubmitEditingByGatewayIdRef={skipSubmitEditingByGatewayIdRef}
        theme={theme}
        themeTokens={themeTokens}
        triggerHistorySync={triggerHistorySync}
        triggerSendFromComposer={triggerSendFromComposer}
        tryImportFromClipboardShortcut={tryImportFromClipboardShortcut}
        updateGatewayRuntime={updateGatewayRuntime}
      />
    </View>
  );
}
