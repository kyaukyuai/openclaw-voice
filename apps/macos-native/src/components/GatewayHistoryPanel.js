import React from 'react';
import { FlatList, Text, View } from 'react-native';
import DateRow from './DateRow';
import TurnRow from './TurnRow';
import styles from '../styles/app-styles';
import { SEMANTIC } from '../logic/app-constants';

function findLastTurnId(items) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.kind === 'turn') {
      return String(items[index]?.id ?? '');
    }
  }
  return '';
}

export default function GatewayHistoryPanel({
  copiedMessageByKey,
  hasPendingTurnFocus,
  historyBottomInset,
  historyContentHeightByGatewayIdRef,
  historyScrollRefs,
  historyViewportHeightByGatewayIdRef,
  isExpanded,
  onCopyMessage,
  onHistorySync,
  onOpenExternalLink,
  pendingTurnFocus,
  previewItems,
  profileId,
  scheduleHistoryTurnFocus,
  themeTokens,
}) {
  const lastTurnId = findLastTurnId(previewItems);

  return (
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
      onLayout={onHistorySync}
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
              historyScrollRefs.current.set(profileId, node);
              if (isExpanded) {
                onHistorySync();
              }
            } else {
              historyScrollRefs.current.delete(profileId);
            }
          }}
          data={previewItems}
          style={styles.gatewayHistoryScroll}
          onLayout={(event) => {
            if (!isExpanded) return;
            const height = Math.ceil(event?.nativeEvent?.layout?.height ?? 0);
            if (!Number.isFinite(height) || height <= 0) return;
            historyViewportHeightByGatewayIdRef.current[profileId] = height;
            onHistorySync();
          }}
          keyExtractor={(item) => `${profileId}:${item.id}`}
          renderItem={({ item }) => {
            if (item.kind === 'date') {
              return <DateRow label={item.label} themeTokens={themeTokens} />;
            }

            const messageCopyKey = `${profileId}:${item.id}:assistant`;
            return (
              <TurnRow
                turn={item.turn}
                themeTokens={themeTokens}
                onOpenExternalLink={onOpenExternalLink}
                copyKey={`${profileId}:${item.id}`}
                copied={copiedMessageByKey[messageCopyKey] === true}
                onCopyMessage={onCopyMessage}
                onAssistantHeightChange={
                  isExpanded
                    ? () => {
                        onHistorySync();
                      }
                    : undefined
                }
                onLayout={
                  isExpanded && String(item.id) === lastTurnId
                    ? () => {
                        onHistorySync();
                      }
                    : undefined
                }
                onTailLayout={
                  isExpanded && String(item.id) === lastTurnId
                    ? () => {
                        onHistorySync();
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
              historyContentHeightByGatewayIdRef.current[profileId] = normalizedHeight;
            }
            onHistorySync();
          }}
          onScrollToIndexFailed={(info) => {
            if (!isExpanded) return;
            const scrollNode = historyScrollRefs.current.get(profileId);
            const approxOffset = Math.max(0, (info?.averageItemLength ?? 64) * (info?.index ?? 0));
            scrollNode?.scrollToOffset?.({ offset: approxOffset, animated: false });
            if (hasPendingTurnFocus) {
              scheduleHistoryTurnFocus(profileId, pendingTurnFocus.turnId, pendingTurnFocus.sessionKey);
            }
          }}
          ListFooterComponent={isExpanded ? <View style={{ height: historyBottomInset }} /> : null}
        />
      )}
    </View>
  );
}
