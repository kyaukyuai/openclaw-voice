import { useCallback, useState } from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '../logic/app-constants';
import {
  blobToBase64,
  bytesLabel,
  createGatewayRuntime,
  decodeFileNameFromUri,
  extractDroppedFileCandidates,
  guessAttachmentType,
  normalizeAttachmentDraft,
  normalizeFileUri,
  normalizeText,
} from '../logic/app-logic';

export default function useMacosAttachmentRuntime({
  activeGatewayId,
  currentSessionKeyForGateway,
  focusComposerForGateway,
  focusedGatewayId,
  gatewayRuntimeById,
  updateGatewayRuntime,
}) {
  const [attachmentPickerGatewayId, setAttachmentPickerGatewayId] = useState(null);
  const [attachmentNoticeByGatewayId, setAttachmentNoticeByGatewayId] = useState({});
  const [dropActiveByGatewayId, setDropActiveByGatewayId] = useState({});

  const setAttachmentNoticeForGateway = useCallback((gatewayId, message, kind = 'info') => {
    if (!gatewayId) return;
    const normalizedMessage = String(message ?? '').trim();
    if (!normalizedMessage) {
      setAttachmentNoticeByGatewayId((previous) => {
        if (!(gatewayId in previous)) return previous;
        const next = { ...previous };
        delete next[gatewayId];
        return next;
      });
      return;
    }

    setAttachmentNoticeByGatewayId((previous) => ({
      ...previous,
      [gatewayId]: {
        message: normalizedMessage,
        kind,
      },
    }));
  }, []);

  const setPendingAttachmentsForGateway = useCallback(
    (gatewayId, nextAttachments) => {
      if (!gatewayId) return;
      const normalized = Array.isArray(nextAttachments)
        ? nextAttachments.map((entry) => normalizeAttachmentDraft(entry)).filter(Boolean)
        : [];
      const activeSessionKeyForGateway = currentSessionKeyForGateway(gatewayId);

      updateGatewayRuntime(gatewayId, (current) => ({
        ...current,
        pendingAttachments: normalized,
        attachmentsBySession: {
          ...(current.attachmentsBySession ?? {}),
          [activeSessionKeyForGateway]: normalized,
        },
      }));
    },
    [currentSessionKeyForGateway, updateGatewayRuntime],
  );

  const appendPendingAttachmentForGateway = useCallback(
    (gatewayId, candidate) => {
      if (!gatewayId) return false;
      const size = Number(candidate?.size ?? 0);
      if (Number.isFinite(size) && size > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Attachment exceeds 10MB limit (${bytesLabel(size)}).`,
          'error',
        );
        return false;
      }

      const nextAttachment = normalizeAttachmentDraft(candidate);
      if (!nextAttachment) {
        setAttachmentNoticeForGateway(gatewayId, 'Attachment could not be processed.', 'error');
        return false;
      }

      const runtime = gatewayRuntimeById[gatewayId] ?? createGatewayRuntime();
      const current = Array.isArray(runtime.pendingAttachments) ? runtime.pendingAttachments : [];
      if (current.length >= MAX_ATTACHMENT_COUNT) {
        setAttachmentNoticeForGateway(gatewayId, `You can attach up to ${MAX_ATTACHMENT_COUNT} files.`, 'warn');
        return false;
      }

      const duplicated = current.some(
        (entry) =>
          String(entry?.fileName ?? '') === nextAttachment.fileName &&
          String(entry?.content ?? '') === nextAttachment.content,
      );
      if (duplicated) {
        setAttachmentNoticeForGateway(gatewayId, 'This attachment is already added.', 'info');
        return false;
      }

      setPendingAttachmentsForGateway(gatewayId, [...current, nextAttachment]);
      setAttachmentNoticeForGateway(gatewayId, `Attached: ${nextAttachment.fileName}`, 'success');
      return true;
    },
    [gatewayRuntimeById, setAttachmentNoticeForGateway, setPendingAttachmentsForGateway],
  );

  const removePendingAttachmentForGateway = useCallback(
    (gatewayId, attachmentId) => {
      if (!gatewayId || !attachmentId) return;
      const runtime = gatewayRuntimeById[gatewayId] ?? createGatewayRuntime();
      const existing = Array.isArray(runtime.pendingAttachments) ? runtime.pendingAttachments : [];
      const filtered = existing.filter((entry) => entry?.id !== attachmentId);
      if (filtered.length === existing.length) return;
      setPendingAttachmentsForGateway(gatewayId, filtered);
      if (filtered.length === 0) {
        setAttachmentNoticeForGateway(gatewayId, '');
      }
    },
    [gatewayRuntimeById, setAttachmentNoticeForGateway, setPendingAttachmentsForGateway],
  );

  const clearPendingAttachmentsForGateway = useCallback(
    (gatewayId) => {
      if (!gatewayId) return;
      setPendingAttachmentsForGateway(gatewayId, []);
      setAttachmentNoticeForGateway(gatewayId, '');
    },
    [setAttachmentNoticeForGateway, setPendingAttachmentsForGateway],
  );

  const importAttachmentFromUriForGateway = useCallback(
    async (gatewayId, candidate) => {
      const fileUri = normalizeFileUri(
        candidate?.uri ?? candidate?.url ?? candidate?.path ?? candidate?.filePath,
      );
      if (!fileUri) {
        setAttachmentNoticeForGateway(gatewayId, 'Unsupported dropped content. Use Attach button.', 'warn');
        return false;
      }

      const sizeHint = Number(candidate?.size ?? 0);
      if (Number.isFinite(sizeHint) && sizeHint > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Attachment exceeds 10MB limit (${bytesLabel(sizeHint)}).`,
          'error',
        );
        return false;
      }

      try {
        setAttachmentNoticeForGateway(gatewayId, 'Importing dropped file...', 'info');
        const response = await fetch(fileUri);
        if (!response || !response.ok) {
          throw new Error(`File read failed (${response?.status ?? 'unknown'})`);
        }

        const blob = await response.blob();
        const blobSize = Number(blob?.size ?? sizeHint ?? 0);
        if (Number.isFinite(blobSize) && blobSize > MAX_ATTACHMENT_SIZE_BYTES) {
          setAttachmentNoticeForGateway(
            gatewayId,
            `Attachment exceeds 10MB limit (${bytesLabel(blobSize)}).`,
            'error',
          );
          return false;
        }

        const fileName =
          normalizeText(candidate?.fileName ?? candidate?.name) || decodeFileNameFromUri(fileUri) || 'attachment';
        const mimeType =
          normalizeText(candidate?.mimeType ?? candidate?.type) ||
          normalizeText(blob?.type) ||
          'application/octet-stream';
        const type = guessAttachmentType({ mimeType, fileName });
        const content = await blobToBase64(blob);

        return appendPendingAttachmentForGateway(gatewayId, {
          fileName,
          mimeType,
          content,
          type,
          size: blobSize,
        });
      } catch (error) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Failed to import dropped file: ${String(error?.message ?? error)}`,
          'error',
        );
        return false;
      }
    },
    [appendPendingAttachmentForGateway, setAttachmentNoticeForGateway],
  );

  const handleDroppedFilesForGateway = useCallback(
    (gatewayId, nativeEvent) => {
      const candidates = extractDroppedFileCandidates(nativeEvent);
      if (!Array.isArray(candidates) || candidates.length === 0) {
        setAttachmentNoticeForGateway(gatewayId, 'No file detected from drop.', 'warn');
        return;
      }

      const limited = candidates.slice(0, MAX_ATTACHMENT_COUNT);
      if (candidates.length > MAX_ATTACHMENT_COUNT) {
        setAttachmentNoticeForGateway(
          gatewayId,
          `Only first ${MAX_ATTACHMENT_COUNT} dropped files were considered.`,
          'warn',
        );
      }

      (async () => {
        for (const entry of limited) {
          if (!entry) continue;

          const directAttachment = normalizeAttachmentDraft(entry);
          if (directAttachment) {
            appendPendingAttachmentForGateway(gatewayId, directAttachment);
            continue;
          }

          await importAttachmentFromUriForGateway(gatewayId, entry);
        }
      })().catch(() => {
        // surfaced via notice
      });
    },
    [appendPendingAttachmentForGateway, importAttachmentFromUriForGateway, setAttachmentNoticeForGateway],
  );

  const tryImportFromClipboardShortcut = useCallback(
    (gatewayId) => {
      Clipboard.getString()
        .then((clipboardText) => {
          const uri = normalizeFileUri(clipboardText);
          if (!uri) return;
          return importAttachmentFromUriForGateway(gatewayId, { uri });
        })
        .catch(() => {
          // ignore clipboard failures
        });
    },
    [importAttachmentFromUriForGateway],
  );

  const handleAttachmentPick = useCallback(
    (payload) => {
      const gatewayId = attachmentPickerGatewayId || focusedGatewayId || activeGatewayId;
      if (!gatewayId) {
        setAttachmentPickerGatewayId(null);
        return;
      }

      appendPendingAttachmentForGateway(gatewayId, payload);
      setAttachmentPickerGatewayId(null);
      focusComposerForGateway(gatewayId);
    },
    [
      activeGatewayId,
      attachmentPickerGatewayId,
      appendPendingAttachmentForGateway,
      focusedGatewayId,
      focusComposerForGateway,
    ],
  );

  return {
    attachmentNoticeByGatewayId,
    attachmentPickerGatewayId,
    clearPendingAttachmentsForGateway,
    dropActiveByGatewayId,
    handleAttachmentPick,
    handleDroppedFilesForGateway,
    removePendingAttachmentForGateway,
    setAttachmentNoticeForGateway,
    setAttachmentPickerGatewayId,
    setDropActiveByGatewayId,
    setPendingAttachmentsForGateway,
    tryImportFromClipboardShortcut,
  };
}
