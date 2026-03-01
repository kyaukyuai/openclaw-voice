import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { attachmentLabel, bytesLabel } from '../../logic/app-logic';
import styles from '../../styles/app-styles';

export default function GatewayAttachmentSection({
  clearPendingAttachmentsForGateway,
  gatewayId,
  pendingAttachments,
  removePendingAttachmentForGateway,
  themeTokens,
}) {
  if (!pendingAttachments.length) return null;

  return (
    <View style={styles.attachmentSection}>
      <View style={styles.attachmentSectionHeader}>
        <Text style={[styles.attachmentSectionTitle, { color: themeTokens.textMuted }]}> 
          {pendingAttachments.length} attachment{pendingAttachments.length > 1 ? 's' : ''}
        </Text>
        <Pressable
          style={[styles.attachmentClearButton, { borderColor: themeTokens.inputBorder }]}
          onPress={() => clearPendingAttachmentsForGateway(gatewayId)}
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
              onPress={() => removePendingAttachmentForGateway(gatewayId, attachment.id)}
              style={styles.attachmentChipRemove}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${attachmentLabel(attachment)}`}
            >
              <Text style={[styles.attachmentChipRemoveText, { color: themeTokens.textMuted }]}>x</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
