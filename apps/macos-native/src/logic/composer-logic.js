import {
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  COMPOSER_VERTICAL_PADDING,
  MAX_ATTACHMENT_SIZE_BYTES,
} from './app-constants';
import { normalizeText } from './shared-logic';

export function normalizeComposerSelection(selection, text = '') {
  const safeText = String(text ?? '');
  const max = safeText.length;
  const startRaw = Number.isFinite(selection?.start) ? selection.start : max;
  const endRaw = Number.isFinite(selection?.end) ? selection.end : max;
  const start = Math.max(0, Math.min(max, startRaw));
  const end = Math.max(start, Math.min(max, endRaw));
  return { start, end };
}

export function clampComposerHeight(nextHeight) {
  if (!Number.isFinite(nextHeight)) return COMPOSER_MIN_HEIGHT;
  return Math.max(COMPOSER_MIN_HEIGHT, Math.min(COMPOSER_MAX_HEIGHT, Math.ceil(nextHeight)));
}

export function estimateComposerHeightFromText(text) {
  const safeText = String(text ?? '');
  const lineCount = Math.max(1, safeText.split(/\r?\n/).length);
  return clampComposerHeight(lineCount * COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING);
}

export function compactQuickTextLabel(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '(empty)';
  if (normalized.length <= 44) return normalized;
  return `${normalized.slice(0, 44)}...`;
}

export function createAttachmentId() {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAttachmentDraft(input) {
  if (!input || typeof input !== 'object') return null;

  const fileName = String(input.fileName ?? '').trim();
  const mimeType = String(input.mimeType ?? '').trim();
  const content = String(input.content ?? '').trim();
  const rawType = String(input.type ?? '').trim().toLowerCase();
  const type = rawType === 'image' ? 'image' : 'file';
  const size = Number(input.size ?? 0);

  if (!fileName || !mimeType || !content) return null;
  if (Number.isFinite(size) && size > MAX_ATTACHMENT_SIZE_BYTES) return null;

  return {
    id: String(input.id ?? '').trim() || createAttachmentId(),
    type,
    fileName,
    mimeType,
    content,
    size: Number.isFinite(size) && size > 0 ? size : undefined,
  };
}

export function attachmentLabel(attachment) {
  const typeLabel = attachment?.type === 'image' ? 'IMG' : 'FILE';
  return `${typeLabel}: ${String(attachment?.fileName ?? '').trim() || 'attachment'}`;
}

export function bytesLabel(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '-';
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(sizeBytes / 1024)} KB`;
}

export function decodeFileNameFromUri(uri) {
  const text = String(uri ?? '').trim();
  if (!text) return '';
  const normalized = text.replace(/^file:\/\//i, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return '';
  try {
    return decodeURIComponent(parts[parts.length - 1]);
  } catch {
    return parts[parts.length - 1];
  }
}

export function normalizeFileUri(uriOrPath) {
  const raw = String(uriOrPath ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('file://')) return raw;
  if (raw.startsWith('/')) return `file://${raw}`;
  return '';
}

export function guessAttachmentType({ mimeType, fileName }) {
  const mime = String(mimeType ?? '').toLowerCase();
  const name = String(fileName ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (/\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)$/i.test(name)) return 'image';
  return 'file';
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader unavailable'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error('Failed to read blob.'));
    };
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      const marker = raw.indexOf(',');
      resolve(marker >= 0 ? raw.slice(marker + 1) : raw);
    };
    reader.readAsDataURL(blob);
  });
}

export function extractDroppedFileCandidates(nativeEvent) {
  const transfer = nativeEvent?.dataTransfer ?? nativeEvent ?? {};
  const filesLike = transfer?.files;

  if (Array.isArray(filesLike)) {
    return filesLike;
  }

  if (filesLike && typeof filesLike.length === 'number') {
    const next = [];
    for (let index = 0; index < filesLike.length; index += 1) {
      const item = filesLike[index];
      if (item) next.push(item);
    }
    if (next.length > 0) return next;
  }

  const items = Array.isArray(transfer?.items) ? transfer.items : [];
  return items.filter(Boolean);
}
