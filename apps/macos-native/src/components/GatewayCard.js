import React from 'react';
import {
  Text,
  View,
} from 'react-native';
import { formatUpdatedAtLabel, groupTurnsByDate } from '../../../../src/shared';
import {
  INITIAL_CONTROLLER_STATE,
  COMPOSER_MAX_HEIGHT,
  SEMANTIC,
} from '../logic/app-constants';
import {
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
import GatewayAttachmentSection from './gateway/GatewayAttachmentSection';
import GatewayConnectionControls from './gateway/GatewayConnectionControls';
import GatewayStatusRow from './gateway/GatewayStatusRow';

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
      <GatewayConnectionControls
        canDisconnectGateway={canDisconnectGateway}
        connectActionOpacityStyle={connectActionOpacityStyle}
        connectGateway={connectGateway}
        connectionState={controllerState.connectionState}
        disconnectActionOpacityStyle={disconnectActionOpacityStyle}
        disconnectGateway={disconnectGateway}
        gatewayId={profile.id}
        identityReady={identityReady}
        isConnecting={isConnecting}
        isGatewayConnected={isGatewayConnected}
        isReconnecting={isReconnecting}
        isSyncing={controllerState.isSyncing}
        recoveryHint={recoveryHint}
        refreshHistory={refreshHistory}
        setQuickMenuOpenForGateway={setQuickMenuOpenForGateway}
        themeTokens={themeTokens}
      />

      <GatewayStatusRow
        statusMeta={statusMeta}
        themeTokens={themeTokens}
        updatedLabel={updatedLabel}
      />

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

      <GatewayAttachmentSection
        clearPendingAttachmentsForGateway={clearPendingAttachmentsForGateway}
        gatewayId={profile.id}
        pendingAttachments={pendingAttachments}
        removePendingAttachmentForGateway={removePendingAttachmentForGateway}
        themeTokens={themeTokens}
      />

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
