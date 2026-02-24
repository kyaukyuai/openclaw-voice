import { Ionicons } from '@expo/vector-icons';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { SessionEntry } from '../../openclaw';

type SessionsPanelContentProps = {
  styles: Record<string, any>;
  sectionIconColor: string;
  actionIconColor: string;
  currentBadgeIconColor: string;
  pinnedBadgeIconColor: string;
  isGatewayConnected: boolean;
  canRefreshSessions: boolean;
  canCreateSession: boolean;
  canSwitchSession: boolean;
  canRenameSession: boolean;
  canPinSession: boolean;
  activeSessionKey: string;
  visibleSessions: SessionEntry[];
  sessionRenameTargetKey: string | null;
  isSessionRenameOpen: boolean;
  sessionRenameDraft: string;
  setSessionRenameDraft: Dispatch<SetStateAction<string>>;
  placeholderColor: string;
  isSessionOperationPending: boolean;
  sessionsError: string | null;
  sessionListHintText: string | null;
  maxTextScale: number;
  maxTextScaleTight: number;
  refreshSessions: () => Promise<void>;
  createAndSwitchSession: () => Promise<void>;
  switchSession: (key: string) => Promise<void>;
  isSessionPinned: (key: string) => boolean;
  getSessionTitle: (session: SessionEntry) => string;
  formatSessionUpdatedAt: (updatedAt?: number) => string;
  startSessionRename: (key: string) => void;
  toggleSessionPinned: (key: string) => void;
  submitSessionRename: () => Promise<void>;
  setIsSessionRenameOpen: Dispatch<SetStateAction<boolean>>;
  setSessionRenameTargetKey: Dispatch<SetStateAction<string | null>>;
};

export default function SessionsPanelContent({
  styles,
  sectionIconColor,
  actionIconColor,
  currentBadgeIconColor,
  pinnedBadgeIconColor,
  isGatewayConnected,
  canRefreshSessions,
  canCreateSession,
  canSwitchSession,
  canRenameSession,
  canPinSession,
  activeSessionKey,
  visibleSessions,
  sessionRenameTargetKey,
  isSessionRenameOpen,
  sessionRenameDraft,
  setSessionRenameDraft,
  placeholderColor,
  isSessionOperationPending,
  sessionsError,
  sessionListHintText,
  maxTextScale,
  maxTextScaleTight,
  refreshSessions,
  createAndSwitchSession,
  switchSession,
  isSessionPinned,
  getSessionTitle,
  formatSessionUpdatedAt,
  startSessionRename,
  toggleSessionPinned,
  submitSessionRename,
  setIsSessionRenameOpen,
  setSessionRenameTargetKey,
}: SessionsPanelContentProps) {
  return (
    <View style={styles.settingsSection}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name="albums-outline" size={14} color={sectionIconColor} />
        <Text style={styles.settingsSectionTitle} maxFontSizeMultiplier={maxTextScaleTight}>
          Sessions
        </Text>
      </View>
      <View style={styles.sessionActionRow}>
        <Pressable
          style={[
            styles.sessionActionButton,
            styles.sessionActionButtonWide,
            !canRefreshSessions && styles.sessionActionButtonDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Refresh sessions list"
          onPress={() => {
            void refreshSessions();
          }}
          disabled={!canRefreshSessions}
        >
          <View style={styles.sessionButtonContent}>
            <Ionicons name="refresh-outline" size={12} color={actionIconColor} />
            <Text style={styles.sessionActionButtonText} maxFontSizeMultiplier={maxTextScaleTight}>
              Refresh
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={[
            styles.sessionActionButton,
            styles.sessionActionButtonWide,
            !canCreateSession && styles.sessionActionButtonDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create new session"
          onPress={() => {
            void createAndSwitchSession();
          }}
          disabled={!canCreateSession}
        >
          <View style={styles.sessionButtonContent}>
            <Ionicons name="add" size={12} color={actionIconColor} />
            <Text style={styles.sessionActionButtonText} maxFontSizeMultiplier={maxTextScaleTight}>
              New
            </Text>
          </View>
        </Pressable>
      </View>
      {isGatewayConnected ? (
        <View style={styles.sessionListColumn}>
          {visibleSessions.map((session) => {
            const selected = session.key === activeSessionKey;
            const pinned = isSessionPinned(session.key);
            const updatedLabel = formatSessionUpdatedAt(session.updatedAt);
            const renameTarget = sessionRenameTargetKey === session.key;
            return (
              <View
                key={session.key}
                style={[
                  styles.sessionChip,
                  selected && styles.sessionChipActive,
                  !canSwitchSession && styles.sessionChipDisabled,
                ]}
              >
                <Pressable
                  style={styles.sessionChipPrimary}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to session ${getSessionTitle(session)}`}
                  onPress={() => {
                    void switchSession(session.key);
                  }}
                  disabled={!canSwitchSession}
                >
                  <View style={styles.sessionChipTopRow}>
                    <Text
                      style={[styles.sessionChipTitle, selected && styles.sessionChipTitleActive]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={maxTextScaleTight}
                    >
                      {getSessionTitle(session)}
                    </Text>
                    <View style={styles.sessionChipBadgeRow}>
                      {selected ? (
                        <View style={[styles.sessionChipBadge, styles.sessionChipBadgeCurrent]}>
                          <Ionicons name="checkmark-circle" size={10} color={currentBadgeIconColor} />
                        </View>
                      ) : null}
                      {pinned ? (
                        <View style={[styles.sessionChipBadge, styles.sessionChipBadgePinned]}>
                          <Ionicons name="star" size={10} color={pinnedBadgeIconColor} />
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Text
                    style={[styles.sessionChipMeta, selected && styles.sessionChipMetaActive]}
                    maxFontSizeMultiplier={maxTextScaleTight}
                  >
                    {updatedLabel ? `Updated ${updatedLabel} · ${session.key}` : session.key}
                  </Text>
                </Pressable>
                <View style={styles.sessionChipActionRow}>
                  <Pressable
                    style={[
                      styles.sessionChipActionButton,
                      !canRenameSession && styles.sessionChipActionButtonDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Rename session ${getSessionTitle(session)}`}
                    onPress={() => {
                      startSessionRename(session.key);
                    }}
                    disabled={!canRenameSession}
                  >
                    <Ionicons name="create-outline" size={13} color={actionIconColor} />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.sessionChipActionButton,
                      !canPinSession && styles.sessionChipActionButtonDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isSessionPinned(session.key)
                        ? `Unpin session ${getSessionTitle(session)}`
                        : `Pin session ${getSessionTitle(session)}`
                    }
                    onPress={() => {
                      toggleSessionPinned(session.key);
                    }}
                    disabled={!canPinSession}
                  >
                    <Ionicons
                      name={isSessionPinned(session.key) ? 'bookmark' : 'bookmark-outline'}
                      size={13}
                      color={actionIconColor}
                    />
                  </Pressable>
                </View>
                {isSessionRenameOpen && renameTarget ? (
                  <View style={[styles.sessionRenameRow, styles.sessionRenameRowInline]}>
                    <TextInput
                      style={[styles.input, styles.sessionRenameInput]}
                      maxFontSizeMultiplier={maxTextScale}
                      value={sessionRenameDraft}
                      onChangeText={setSessionRenameDraft}
                      placeholder="Session name"
                      placeholderTextColor={placeholderColor}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      blurOnSubmit
                      onSubmitEditing={() => {
                        void submitSessionRename();
                      }}
                    />
                    <Pressable
                      style={[
                        styles.sessionRenameActionButton,
                        isSessionOperationPending && styles.sessionRenameActionButtonDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Save session name"
                      onPress={() => {
                        void submitSessionRename();
                      }}
                      disabled={isSessionOperationPending}
                    >
                      <View style={styles.sessionButtonContent}>
                        <Ionicons name="checkmark-outline" size={12} color={actionIconColor} />
                        <Text
                          style={styles.sessionRenameActionButtonText}
                          maxFontSizeMultiplier={maxTextScaleTight}
                        >
                          Save
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={styles.sessionRenameActionButton}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel session rename"
                      onPress={() => {
                        setIsSessionRenameOpen(false);
                        setSessionRenameTargetKey(null);
                      }}
                    >
                      <View style={styles.sessionButtonContent}>
                        <Ionicons name="close-outline" size={12} color={actionIconColor} />
                        <Text
                          style={styles.sessionRenameActionButtonText}
                          maxFontSizeMultiplier={maxTextScaleTight}
                        >
                          Cancel
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.sessionHintText} maxFontSizeMultiplier={maxTextScale}>
          Connect to load available sessions.
        </Text>
      )}
      {isGatewayConnected && sessionListHintText ? (
        <Text
          style={[styles.sessionHintText, sessionsError && styles.sessionHintTextWarning]}
          maxFontSizeMultiplier={maxTextScale}
        >
          {sessionListHintText}
        </Text>
      ) : null}
    </View>
  );
}
