import React, { useCallback } from 'react';
import {
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import SettingsView from './src/components/SettingsView';
import GatewayCard from './src/components/GatewayCard';
import useMacosAppRuntime from './src/hooks/useMacosAppRuntime';
import {
  connectionChipFromState,
  createGatewayRuntime,
  mergeSessionKeys,
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
    copyTelemetryReport,
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
    resetTelemetry,
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
    telemetry,
    toggleGatewayCollapse,
    toggleGatewayNotifications,
    toggleMuteForegroundNotifications,
    toggleNotificationsEnabled,
    tryImportFromClipboardShortcut,
    unreadByGatewaySession,
    updateGatewayRuntime,
  } = useMacosAppRuntime();

  const renderSelectedSession = useCallback(() => {
    if (!activeProfile) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyTitle, { color: themeTokens.textPrimary }]}>No gateways configured.</Text>
          <Text style={[styles.emptyDescription, { color: themeTokens.textMuted }]}>Create a gateway profile in Settings.</Text>
        </View>
      );
    }

    const profileId = activeProfile.id;
    const runtime = gatewayRuntimeById[profileId] ?? createGatewayRuntime();

    return (
      <View
        style={styles.selectedSessionWrap}
        onLayout={() => {
          if (!profileId) return;
          scheduleHistoryBottomSync(profileId);
        }}
      >
        <GatewayCard
          attachmentNotice={attachmentNoticeByGatewayId[profileId] ?? null}
          clearPendingAttachmentsForGateway={clearPendingAttachmentsForGateway}
          composerHeightByGatewayIdRef={composerHeightByGatewayIdRef}
          composerInputRefs={composerInputRefs}
          connectGateway={connectGateway}
          copiedMessageByKey={copiedMessageByKey}
          disconnectGateway={disconnectGateway}
          dropActive={dropActiveByGatewayId[profileId] === true}
          focusComposerForGateway={focusComposerForGateway}
          forcedSelection={forcedSelectionByGatewayId[profileId]}
          forcedSelectionByGatewayIdRef={forcedSelectionByGatewayIdRef}
          handleCopyMessage={handleCopyMessage}
          handleDroppedFilesForGateway={handleDroppedFilesForGateway}
          handleOpenExternalLink={handleOpenExternalLink}
          hintHeightByGatewayIdRef={hintHeightByGatewayIdRef}
          historyBottomInset={historyBottomInsetByGatewayId[profileId] ?? 24}
          historyContentHeightByGatewayIdRef={historyContentHeightByGatewayIdRef}
          historyScrollRefs={historyScrollRefs}
          historyViewportHeightByGatewayIdRef={historyViewportHeightByGatewayIdRef}
          identityPersistWarning={identityPersistWarning}
          identityReady={identityReady}
          insertQuickText={insertQuickText}
          isExpanded
          isImeComposingByGatewayIdRef={isImeComposingByGatewayIdRef}
          pendingTurnFocus={pendingTurnFocusByGatewayIdRef.current[profileId]}
          profile={activeProfile}
          quickMenuOpen={quickMenuOpenByGatewayId[profileId] === true}
          quickTextLeft={quickTextLeft}
          quickTextRight={quickTextRight}
          recomputeHistoryBottomInsetForGateway={recomputeHistoryBottomInsetForGateway}
          refreshHistory={refreshHistory}
          removePendingAttachmentForGateway={removePendingAttachmentForGateway}
          runtime={runtime}
          scheduleHistoryBottomSync={scheduleHistoryBottomSync}
          scheduleHistoryTurnFocus={scheduleHistoryTurnFocus}
          sendMessage={sendMessage}
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
          tryImportFromClipboardShortcut={tryImportFromClipboardShortcut}
          updateGatewayRuntime={updateGatewayRuntime}
        />
      </View>
    );
  }, [
    activeProfile,
    attachmentNoticeByGatewayId,
    clearPendingAttachmentsForGateway,
    composerHeightByGatewayIdRef,
    composerInputRefs,
    connectGateway,
    copiedMessageByKey,
    disconnectGateway,
    dropActiveByGatewayId,
    focusComposerForGateway,
    forcedSelectionByGatewayId,
    forcedSelectionByGatewayIdRef,
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
    quickMenuOpenByGatewayId,
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
  ]);

  return (
    <SafeAreaProvider>
      {booting ? (
        <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.bootScreen, { backgroundColor: themeTokens.bg }]}>
          <Text style={[styles.bootText, { color: themeTokens.textSecondary }]}>Booting macOS workspace...</Text>
        </SafeAreaView>
      ) : (
        <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: themeTokens.bg }]}>
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
                      const gatewayHeaderItemStyle = isActiveGateway
                        ? { backgroundColor: themeTokens.sideActiveBg }
                        : null;
                      const gatewayHeaderLabelStyle = [
                        {
                          color: isActiveGateway
                            ? themeTokens.sideActiveInk
                            : themeTokens.textSecondary,
                        },
                        isActiveGateway ? styles.fontWeight700 : styles.fontWeight600,
                      ];

                      return (
                        <View key={profile.id} style={styles.gatewayGroup}>
                          <View style={styles.gatewayHeaderRow}>
                            <Pressable
                              onPress={() => handleSelectGatewayProfile(profile.id, 'chat')}
                              style={[
                                styles.sideItem,
                                styles.gatewayHeaderMain,
                                gatewayHeaderItemStyle,
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
                                  ...gatewayHeaderLabelStyle,
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
                              const sessionItemStyle = isActiveSession
                                ? { backgroundColor: themeTokens.sideActiveBg }
                                : null;
                              const sessionTextStyle = [
                                {
                                  color: isActiveSession
                                    ? themeTokens.sideActiveInk
                                    : themeTokens.textMuted,
                                },
                                isActiveSession ? styles.fontWeight700 : styles.fontWeight500,
                              ];

                              return (
                                <Pressable
                                  key={`${profile.id}:${knownSessionKey}`}
                                  style={[
                                    styles.gatewaySessionItem,
                                    sessionItemStyle,
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
                                      ...sessionTextStyle,
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
                                  },
                                  styles.fontWeight600,
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
                      activeNav === 'settings' ? { backgroundColor: themeTokens.sideActiveBg } : null,
                    ]}
                    onPress={() => setActiveNav('settings')}
                  >
                    <Text
                      style={[
                        styles.sideItemLabel,
                        {
                          color: activeNav === 'settings' ? themeTokens.sideActiveInk : themeTokens.textSecondary,
                        },
                        activeNav === 'settings' ? styles.fontWeight700 : styles.fontWeight600,
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
                      copyTelemetryReport={copyTelemetryReport}
                      quickTextLeft={quickTextLeft}
                      quickTextRight={quickTextRight}
                      resetTelemetry={resetTelemetry}
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
                      telemetry={telemetry}
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
      )}
    </SafeAreaProvider>
  );
}
