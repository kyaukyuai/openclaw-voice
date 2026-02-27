import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import MarkdownWebViewBubble from '../../components/MarkdownWebViewBubble';
import { SEMANTIC } from '../logic/app-constants';
import { isPendingTurn, timestampLabel, turnDotColor } from '../logic/app-logic';
import styles from '../styles/app-styles';

export default function TurnRow({
  turn,
  themeTokens,
  onOpenExternalLink,
  copyKey,
  copied,
  onCopyMessage,
  onAssistantHeightChange,
  onLayout,
  onTailLayout,
}) {
  const pending = isPendingTurn(turn);
  const userText = String(turn?.userText ?? '').trim();
  const assistantText = String(turn?.assistantText ?? '').trim();
  const isImportedPlaceholder = userText === '(imported)';
  const shouldShowUserBubble = userText.length > 0 && !isImportedPlaceholder;

  return (
    <View style={styles.turnPair} onLayout={onLayout}>
      {shouldShowUserBubble ? (
        <View style={styles.userRow}>
          <Pressable
            style={styles.userBubble}
            onLongPress={() => {
              if (!onCopyMessage) return;
              onCopyMessage(copyKey ? `${copyKey}:user` : '', userText);
            }}
          >
            <Text style={styles.userBubbleText} selectable>
              {userText}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isImportedPlaceholder ? (
        <View style={styles.importedTagRow}>
          <View style={[styles.importedTag, { backgroundColor: themeTokens.sideActiveBg }]}>
            <Text style={[styles.importedTagText, { color: themeTokens.sideActiveInk }]}>imported</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.assistantRow}>
        <View style={styles.assistantAvatar}>
          <Text style={styles.assistantAvatarText}>OC</Text>
        </View>
        <View
          style={[
            styles.assistantBubble,
            {
              backgroundColor: themeTokens.assistantBubble,
              borderColor: themeTokens.assistantBubbleBorder,
            },
          ]}
        >
          {!pending && assistantText ? (
            <View style={styles.assistantBubbleHeader}>
              <Pressable
                style={[
                  styles.copyChip,
                  {
                    backgroundColor: themeTokens.hintBg,
                    borderColor: themeTokens.inputBorder,
                  },
                ]}
                onPress={() => {
                  if (!onCopyMessage) return;
                  onCopyMessage(copyKey ? `${copyKey}:assistant` : '', assistantText);
                }}
              >
                <Text
                  style={[
                    styles.copyChipText,
                    { color: copied ? SEMANTIC.green : themeTokens.textSecondary },
                  ]}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {pending && (!assistantText || assistantText === 'Responding...') ? (
            <View style={styles.pendingBubbleRow}>
              <ActivityIndicator size="small" color={themeTokens.textSecondary} />
              <Text style={[styles.pendingBubbleText, { color: themeTokens.textSecondary }]}>Responding...</Text>
            </View>
          ) : (
            <MarkdownWebViewBubble
              markdown={assistantText || 'No response'}
              themeTokens={themeTokens}
              cacheKey={copyKey ?? String(turn?.id ?? '')}
              onOpenExternalLink={onOpenExternalLink}
              onMeasuredHeight={onAssistantHeightChange}
            />
          )}
        </View>
      </View>

      <View style={styles.turnTimeRow} onLayout={onTailLayout}>
        <View style={[styles.turnStateDot, { backgroundColor: turnDotColor(turn.state) }]} />
        <Text style={[styles.turnTimeText, { color: themeTokens.textMuted }]}> 
          {timestampLabel(turn.createdAt)}
        </Text>
      </View>
    </View>
  );
}
