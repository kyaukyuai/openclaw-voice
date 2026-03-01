import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, type RefObject } from 'react';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { HistoryListItem } from '../../types';
import { clampMarkdownSource } from './history-markdown';

const WAITING_TURN_STATES = new Set(['sending', 'queued', 'delta', 'streaming']);

function isTurnWaitingState(state: string): boolean {
  return WAITING_TURN_STATES.has(state);
}

function isTurnErrorState(state: string): boolean {
  return state === 'error' || state === 'aborted';
}

type HistoryTimelineCardProps = {
  styles: Record<string, any>;
  isDarkTheme: boolean;
  showHistoryCard: boolean;
  showHistoryRefreshButton: boolean;
  isGatewayConnected: boolean;
  isSessionHistoryLoading: boolean;
  onRefreshHistory: () => void;
  showHistoryUpdatedMeta: boolean;
  historyUpdatedLabel: string | null;
  historyScrollRef: RefObject<FlatList<HistoryListItem> | null>;
  historyItems: HistoryListItem[];
  historyListBottomPadding: number;
  showScrollToBottomButton: boolean;
  showHistoryScrollButton: boolean;
  isHomeComposingMode: boolean;
  showHistoryDateDivider: boolean;
  onHistoryScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onHistoryAutoScroll: () => void;
  onHistoryLayoutAutoScroll: () => void;
  onScrollToBottom: () => void;
  maxTextScale: number;
  maxTextScaleTight: number;
};

export default function HistoryTimelineCard({
  styles,
  isDarkTheme,
  showHistoryCard,
  showHistoryRefreshButton,
  isGatewayConnected,
  isSessionHistoryLoading,
  onRefreshHistory,
  showHistoryUpdatedMeta,
  historyUpdatedLabel,
  historyScrollRef,
  historyItems,
  historyListBottomPadding,
  showScrollToBottomButton,
  showHistoryScrollButton,
  isHomeComposingMode,
  showHistoryDateDivider,
  onHistoryScroll,
  onHistoryAutoScroll,
  onHistoryLayoutAutoScroll,
  onScrollToBottom,
  maxTextScale,
  maxTextScaleTight,
}: HistoryTimelineCardProps) {
  const markdownParser = useMemo(() => new MarkdownIt({ linkify: true }), []);
  const markdownStyles = useMemo(
    () => ({
      body: {
        color: isDarkTheme ? '#f8fbff' : '#1A1A1A',
        fontSize: 14,
        lineHeight: 20,
        marginTop: 0,
        marginBottom: 0,
      },
      text: {
        color: isDarkTheme ? '#f8fbff' : '#1A1A1A',
        fontSize: 14,
        lineHeight: 20,
      },
      paragraph: {
        color: isDarkTheme ? '#f8fbff' : '#1A1A1A',
        marginTop: 0,
        marginBottom: 0,
      },
      heading1: {
        color: isDarkTheme ? '#ffffff' : '#111827',
        fontSize: 24,
        lineHeight: 30,
        fontWeight: '800' as const,
        marginTop: 8,
        marginBottom: 8,
      },
      heading2: {
        color: isDarkTheme ? '#f5f8ff' : '#111827',
        fontSize: 20,
        lineHeight: 26,
        fontWeight: '700' as const,
        marginTop: 8,
        marginBottom: 6,
      },
      heading3: {
        color: isDarkTheme ? '#ecf2ff' : '#1f2937',
        fontSize: 17,
        lineHeight: 23,
        fontWeight: '700' as const,
        marginTop: 6,
        marginBottom: 4,
      },
      heading4: {
        color: isDarkTheme ? '#e6efff' : '#1f2937',
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '700' as const,
        marginTop: 4,
        marginBottom: 2,
      },
      strong: {
        color: isDarkTheme ? '#ffffff' : '#111827',
        fontWeight: '700' as const,
      },
      em: {
        color: isDarkTheme ? '#e6f0ff' : '#374151',
        fontStyle: 'italic' as const,
      },
      link: {
        color: '#2563EB',
        textDecorationLine: 'underline' as const,
      },
      code_inline: {
        color: isDarkTheme ? '#e6f0ff' : '#111827',
        backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 2,
      },
      code_block: {
        color: isDarkTheme ? '#e6f0ff' : '#111827',
        backgroundColor: isDarkTheme ? '#0f1c3f' : '#f3f4f6',
        borderRadius: 8,
        padding: 10,
        marginTop: 6,
        marginBottom: 6,
      },
      fence: {
        marginTop: 6,
        marginBottom: 6,
      },
      blockquote: {
        borderLeftWidth: 2,
        borderLeftColor: isDarkTheme ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.18)',
        paddingLeft: 8,
        marginTop: 4,
        marginBottom: 4,
      },
      bullet_list: {
        marginTop: 4,
        marginBottom: 4,
      },
      ordered_list: {
        marginTop: 4,
        marginBottom: 4,
      },
      list_item: {
        marginTop: 0,
        marginBottom: 0,
      },
      hr: {
        backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
        height: 1,
        marginTop: 8,
        marginBottom: 8,
      },
    }),
    [isDarkTheme],
  );
  const markdownErrorStyles = useMemo(
    () => ({
      ...markdownStyles,
      body: {
        ...(markdownStyles.body ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      text: {
        ...(markdownStyles.text ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      paragraph: {
        ...(markdownStyles.paragraph ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      heading1: {
        ...(markdownStyles.heading1 ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      heading2: {
        ...(markdownStyles.heading2 ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      heading3: {
        ...(markdownStyles.heading3 ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      heading4: {
        ...(markdownStyles.heading4 ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      link: {
        ...(markdownStyles.link ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      code_inline: {
        ...(markdownStyles.code_inline ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
      code_block: {
        ...(markdownStyles.code_block ?? {}),
        color: isDarkTheme ? '#ffb0b0' : '#DC2626',
      },
    }),
    [isDarkTheme, markdownStyles],
  );

  const renderHistoryItem = useCallback(
    ({ item }: { item: HistoryListItem }) => {
      if (item.kind === 'date') {
        if (!showHistoryDateDivider) return null;
        return (
          <View style={styles.historyDateRow}>
            <View style={styles.historyDateLine} />
            <Text style={styles.historyDateText} maxFontSizeMultiplier={maxTextScaleTight}>
              {item.label}
            </Text>
            <View style={styles.historyDateLine} />
          </View>
        );
      }

      const turn = item.turn;
      const waiting = isTurnWaitingState(turn.state);
      const error = isTurnErrorState(turn.state);
      const assistantTextRaw = turn.assistantText || (waiting ? 'Responding...' : 'No response');
      const assistantText = clampMarkdownSource(assistantTextRaw);
      const turnTime = new Date(turn.createdAt).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
      });

      return (
        <View style={[styles.historyTurnGroup, item.isLast && styles.historyTurnGroupLast]}>
          <View style={styles.historyUserRow}>
            <View style={styles.turnUserBubble}>
              <Text style={styles.turnUser} maxFontSizeMultiplier={maxTextScale}>
                {turn.userText}
              </Text>
            </View>
          </View>
          <View style={styles.historyAssistantRow}>
            <View style={styles.assistantAvatar}>
              <Ionicons name="flash" size={11} color={isDarkTheme ? '#ffffff' : '#1d4ed8'} />
            </View>
            <View style={[styles.turnAssistantBubble, error && styles.turnAssistantBubbleError]}>
              <Markdown
                markdownit={markdownParser}
                style={error ? markdownErrorStyles : markdownStyles}
                onLinkPress={(url) => {
                  void Linking.openURL(url).catch(() => {});
                  return false;
                }}
              >
                {assistantText}
              </Markdown>
            </View>
          </View>
          <View style={styles.historyMetaRow}>
            <View
              style={[
                styles.historyMetaDot,
                waiting
                  ? styles.historyMetaDotWaiting
                  : error
                    ? styles.historyMetaDotError
                    : styles.historyMetaDotOk,
              ]}
            />
            <Text style={styles.historyMetaText} maxFontSizeMultiplier={maxTextScaleTight}>
              {turnTime}
            </Text>
          </View>
        </View>
      );
    },
    [
      isDarkTheme,
      markdownErrorStyles,
      markdownParser,
      markdownStyles,
      maxTextScale,
      maxTextScaleTight,
      showHistoryDateDivider,
      styles,
    ],
  );

  const historyItemKeyExtractor = useCallback((item: HistoryListItem) => item.id, []);

  if (!showHistoryCard) return null;

  return (
    <View style={[styles.card, styles.historyCard, styles.historyCardFlat]}>
      {showHistoryRefreshButton ? (
        <Pressable
          style={[
            styles.iconButton,
            styles.historyRefreshButtonFloating,
            (!isGatewayConnected || isSessionHistoryLoading) && styles.iconButtonDisabled,
          ]}
          hitSlop={7}
          accessibilityRole="button"
          accessibilityLabel="Refresh current session history"
          onPress={onRefreshHistory}
          disabled={!isGatewayConnected || isSessionHistoryLoading}
        >
          <Ionicons
            name="refresh-outline"
            size={15}
            color={isDarkTheme ? '#bccae2' : '#707070'}
          />
        </Pressable>
      ) : null}
      {showHistoryUpdatedMeta && historyUpdatedLabel ? (
        <View style={styles.historyMetaTopRow}>
          <Text
            style={styles.historyMetaTopText}
            maxFontSizeMultiplier={maxTextScaleTight}
            numberOfLines={1}
          >
            {historyUpdatedLabel}
          </Text>
        </View>
      ) : null}
      <FlatList
        ref={historyScrollRef}
        data={historyItems}
        keyExtractor={historyItemKeyExtractor}
        renderItem={renderHistoryItem}
        contentContainerStyle={[
          styles.chatList,
          { paddingBottom: historyListBottomPadding },
          showScrollToBottomButton && styles.chatListWithScrollButton,
        ]}
        ListEmptyComponent={
          <Text style={styles.placeholder} maxFontSizeMultiplier={maxTextScale}>
            {isHomeComposingMode ? 'No messages yet.' : 'Conversation history appears here.'}
          </Text>
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onHistoryScroll}
        scrollEventThrottle={16}
        onContentSizeChange={onHistoryAutoScroll}
        onLayout={onHistoryLayoutAutoScroll}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
      />
      {showHistoryScrollButton ? (
        <Pressable
          style={[styles.iconButton, styles.historyScrollToBottomButtonFloating]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Scroll history to the latest message"
          onPress={onScrollToBottom}
        >
          <Ionicons
            name="chevron-down-outline"
            size={17}
            color={isDarkTheme ? '#bccae2' : '#707070'}
          />
        </Pressable>
      ) : null}
    </View>
  );
}
