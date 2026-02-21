import { GatewayClient } from '../openclaw/client';
import { resolveStatusMeta } from './status';

function createTurnId() {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function errorMessage(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    const code = typeof error.code === 'string' ? error.code : '';
    if (code) {
      return `${code}: ${error.message}`;
    }
    return error.message;
  }
  return String(error ?? 'Unknown error');
}

function normalizeState(rawState) {
  const normalized = String(rawState ?? '').trim().toLowerCase();
  if (!normalized) return 'streaming';
  if (normalized === 'ok') return 'complete';
  if (normalized === 'done') return 'complete';
  if (normalized === 'completed') return 'complete';
  if (normalized === 'success') return 'complete';
  if (normalized === 'final') return 'complete';
  if (normalized === 'finished') return 'complete';
  if (normalized === 'finish') return 'complete';
  if (normalized === 'end') return 'complete';
  if (normalized === 'ended') return 'complete';
  if (normalized === 'stop') return 'complete';
  if (normalized === 'stopped') return 'complete';
  if (normalized === 'fail') return 'error';
  if (normalized === 'failed') return 'error';
  if (normalized === 'err') return 'error';
  return normalized;
}

function extractTextPieces(value, out, depth = 0) {
  if (depth > 6 || value == null) return;

  if (typeof value === 'string') {
    const text = value.trim();
    if (text) out.push(text);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => extractTextPieces(entry, out, depth + 1));
    return;
  }

  if (typeof value !== 'object') return;

  const record = value;
  extractTextPieces(record.text, out, depth + 1);
  extractTextPieces(record.content, out, depth + 1);
  extractTextPieces(record.message, out, depth + 1);
  extractTextPieces(record.value, out, depth + 1);
  extractTextPieces(record.output, out, depth + 1);
  extractTextPieces(record.thinking, out, depth + 1);
}

function textFromUnknown(value) {
  const pieces = [];
  extractTextPieces(value, pieces);
  const seen = new Set();
  const unique = [];
  pieces.forEach((piece) => {
    if (!seen.has(piece)) {
      seen.add(piece);
      unique.push(piece);
    }
  });
  return unique.join('\n').trim();
}

function extractMessageText(message) {
  if (!message || typeof message !== 'object') return '';
  return textFromUnknown(message.content ?? message.text ?? message);
}

function isIncompleteAssistantText(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return true;
  return normalized === 'Responding...' || normalized === 'No response';
}

function extractFinalEventText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return textFromUnknown([
    payload.message,
    payload.finalMessage,
    payload.finalText,
    payload.outputText,
    payload.text,
    payload.output,
    payload.response,
    payload.result,
    payload.data,
  ]);
}

function resolveCompletedAssistantText({ finalText, streamedText, stopReason }) {
  const normalizedFinalText = String(finalText ?? '').trim();
  const normalizedStreamedText = String(streamedText ?? '').trim();

  if (normalizedFinalText && !isIncompleteAssistantText(normalizedFinalText)) {
    return normalizedFinalText;
  }
  if (normalizedStreamedText && !isIncompleteAssistantText(normalizedStreamedText)) {
    return normalizedStreamedText;
  }
  if (stopReason === 'max_tokens') {
    return 'Response was truncated (max tokens reached).';
  }
  return 'Gateway returned no text content for this response.';
}

function mergeStreamedText(previousText, nextChunk) {
  const previous = String(previousText ?? '');
  const incoming = String(nextChunk ?? '');
  if (!incoming) return previous;
  if (!previous) return incoming;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.includes(incoming)) return previous;

  const overlapMax = Math.min(previous.length, incoming.length);
  for (let size = overlapMax; size > 0; size -= 1) {
    if (previous.slice(previous.length - size) === incoming.slice(0, size)) {
      return `${previous}${incoming.slice(size)}`;
    }
  }

  return incoming;
}

function extractCreatedAt(record, fallbackValue) {
  const candidate =
    record?.timestamp ?? record?.ts ?? record?.createdAt ?? record?.updatedAt;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate > 1_000_000_000_000 ? candidate : candidate * 1000;
  }
  if (typeof candidate === 'string') {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackValue;
}

function buildTurnsFromHistory(messages, sessionKey) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const turns = [];
  let pendingTurn = null;

  const flushPending = () => {
    if (pendingTurn) {
      turns.push(pendingTurn);
      pendingTurn = null;
    }
  };

  messages.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;

    const role = typeof entry.role === 'string' ? entry.role.toLowerCase() : '';
    const createdAt = extractCreatedAt(entry, Date.now() + index);

    if (role === 'user') {
      flushPending();
      pendingTurn = {
        id: `hist-${sessionKey}-${index}`,
        userText: textFromUnknown(entry.content ?? entry.text ?? entry.message),
        assistantText: '',
        state: 'complete',
        createdAt,
      };
      return;
    }

    const assistantLikeRole =
      role === 'assistant' || role === 'agent' || role === 'model' || role === 'system';

    if (!assistantLikeRole) return;

    const assistantText = textFromUnknown(entry.content ?? entry.text ?? entry.message);
    const nextState = normalizeState(entry.state ?? entry.status);

    if (!pendingTurn) {
      turns.push({
        id: `hist-${sessionKey}-${index}`,
        userText: '(imported)',
        assistantText,
        state: nextState === 'error' ? 'error' : 'complete',
        createdAt,
      });
      return;
    }

    pendingTurn.assistantText = assistantText;
    pendingTurn.state = nextState === 'error' ? 'error' : 'complete';
    flushPending();
  });

  flushPending();

  return turns.sort((a, b) => a.createdAt - b.createdAt);
}

function mergeHistoryWithPending(historyTurns, localTurns) {
  const merged = [...historyTurns];

  localTurns.forEach((turn) => {
    const hasHistory = merged.some((existing) => existing.id === turn.id);
    const keepLocal =
      turn.state === 'sending' ||
      turn.state === 'streaming' ||
      turn.state === 'delta' ||
      turn.state === 'queued';

    if (!hasHistory && keepLocal) {
      merged.push(turn);
    }
  });

  return merged.sort((a, b) => a.createdAt - b.createdAt);
}

function createInitialState() {
  return {
    connectionState: 'disconnected',
    turns: [],
    isSending: false,
    isSyncing: false,
    syncError: null,
    sendError: null,
    banner: null,
    status: resolveStatusMeta({
      connectionState: 'disconnected',
      isSending: false,
      lastAction: null,
      hasError: false,
      hasSyncError: false,
    }),
    lastUpdatedAt: null,
    sessionKey: 'main',
  };
}

export class GatewayChatController {
  constructor(options = {}) {
    this.options = {
      sessionKey: options.sessionKey ?? 'main',
      historyLimit: options.historyLimit ?? 80,
      refreshTimeoutMs: options.refreshTimeoutMs ?? 20_000,
      clientOptions: options.clientOptions ?? {},
    };

    this.state = {
      ...createInitialState(),
      sessionKey: this.options.sessionKey,
    };
    this.client = null;
    this.listeners = new Set();
    this.unsubscribers = [];
    this.lastAction = null;
    this.pendingRunId = null;
    this.inFlightRefreshPromise = null;
    this.refreshEpoch = 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState() {
    return this.state;
  }

  emit() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  setState(patch) {
    const nextState = {
      ...this.state,
      ...patch,
    };

    nextState.status = resolveStatusMeta({
      connectionState: nextState.connectionState,
      isSending: nextState.isSending,
      lastAction: this.lastAction,
      hasError: Boolean(nextState.sendError),
      hasSyncError: Boolean(nextState.syncError),
    });

    this.state = nextState;
    this.emit();
  }

  cleanupClient() {
    this.unsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // ignore cleanup errors
      }
    });
    this.unsubscribers = [];

    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        // ignore
      }
    }
    this.client = null;
  }

  invalidateRefreshState() {
    this.refreshEpoch += 1;
    this.inFlightRefreshPromise = null;
  }

  async connect({ url, token, sessionKey } = {}) {
    const nextSessionKey = String(sessionKey ?? this.state.sessionKey ?? 'main').trim() || 'main';

    this.cleanupClient();
    this.invalidateRefreshState();
    this.pendingRunId = null;
    this.lastAction = null;

    this.setState({
      connectionState: 'connecting',
      sendError: null,
      syncError: null,
      banner: null,
      sessionKey: nextSessionKey,
      turns: [],
      isSyncing: false,
      lastUpdatedAt: null,
    });

    const client = new GatewayClient(String(url ?? '').trim(), {
      clientId: this.options.clientOptions.clientId ?? 'openclaw-ios',
      displayName: this.options.clientOptions.displayName ?? 'OpenClaw Pocket macOS',
      platform: this.options.clientOptions.platform ?? 'macos',
      role: this.options.clientOptions.role ?? 'operator',
      scopes: this.options.clientOptions.scopes ?? ['operator.read', 'operator.write'],
      caps: this.options.clientOptions.caps ?? ['talk'],
      ...(token ? { token } : {}),
    });

    this.client = client;

    const unsubscribeConnection = client.onConnectionStateChange((connectionState) => {
      this.setState({ connectionState });
    });

    const unsubscribeChat = client.onChatEvent((payload) => {
      this.handleChatEvent(payload);
    });

    const pairingListener = () => {
      this.setState({
        banner: {
          kind: 'error',
          message: 'Pairing approval required on OpenClaw side.',
        },
      });
      this.lastAction = 'retry';
    };

    client.on('pairing.required', pairingListener);
    this.unsubscribers.push(unsubscribeConnection, unsubscribeChat, () => {
      client.off('pairing.required', pairingListener);
    });

    try {
      await client.connect();
      this.setState({ connectionState: 'connected' });
      await this.refreshHistory();
    } catch (error) {
      this.lastAction = 'retry';
      this.setState({
        connectionState: 'disconnected',
        sendError: errorMessage(error),
        banner: {
          kind: 'error',
          message: errorMessage(error),
        },
      });
      throw error;
    }
  }

  disconnect() {
    this.cleanupClient();
    this.invalidateRefreshState();
    this.pendingRunId = null;
    this.lastAction = null;
    this.setState({
      connectionState: 'disconnected',
      isSending: false,
      isSyncing: false,
      banner: null,
      sendError: null,
      syncError: null,
    });
  }

  clearBanner() {
    this.setState({ banner: null });
  }

  async refreshHistory() {
    if (!this.client || this.state.connectionState !== 'connected') {
      this.lastAction = 'retry';
      this.setState({
        syncError: 'Not connected.',
        banner: {
          kind: 'error',
          message: 'Refresh failed: not connected.',
        },
      });
      return;
    }

    if (this.inFlightRefreshPromise) {
      return this.inFlightRefreshPromise;
    }

    const refreshEpoch = this.refreshEpoch;
    const timeoutMs = this.options.refreshTimeoutMs;
    const client = this.client;
    let timeoutHandle = null;

    this.setState({ isSyncing: true, syncError: null });

    const refreshPromise = (async () => {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            const timeoutError = new Error(`Refresh timed out after ${timeoutMs}ms`);
            timeoutError.code = 'REFRESH_TIMEOUT';
            reject(timeoutError);
          }, timeoutMs);
        });

        const result = await Promise.race([
          client.chatHistory(this.state.sessionKey, {
            limit: this.options.historyLimit,
          }),
          timeoutPromise,
        ]);

        if (refreshEpoch !== this.refreshEpoch) {
          return;
        }

        const historyTurns = buildTurnsFromHistory(
          result?.messages ?? [],
          this.state.sessionKey,
        );
        const mergedTurns = mergeHistoryWithPending(historyTurns, this.state.turns);

        this.lastAction = 'completed';
        this.setState({
          turns: mergedTurns,
          lastUpdatedAt: Date.now(),
        });
      } catch (error) {
        if (refreshEpoch !== this.refreshEpoch) {
          return;
        }

        this.lastAction = 'retry';
        const message = errorMessage(error);
        this.setState({
          syncError: message,
          banner: {
            kind: 'error',
            message: `Refresh failed: ${message}`,
          },
        });
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        if (this.inFlightRefreshPromise === refreshPromise) {
          this.inFlightRefreshPromise = null;
        }

        if (refreshEpoch === this.refreshEpoch && this.state.isSyncing) {
          this.setState({ isSyncing: false });
        }
      }
    })();

    this.inFlightRefreshPromise = refreshPromise;
    return refreshPromise;
  }

  async sendMessage(messageText, attachments = []) {
    if (!this.client || this.state.connectionState !== 'connected') {
      const message = 'Not connected.';
      this.lastAction = 'retry';
      this.setState({
        sendError: message,
        banner: {
          kind: 'error',
          message,
        },
      });
      throw new Error(message);
    }

    const userText = String(messageText ?? '').trim();
    const normalizedAttachments = Array.isArray(attachments)
      ? attachments
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const fileName = String(entry.fileName ?? '').trim();
            const mimeType = String(entry.mimeType ?? '').trim();
            const content = String(entry.content ?? '').trim();
            const type = String(entry.type ?? '').trim().toLowerCase() === 'image' ? 'image' : 'file';
            if (!fileName || !mimeType || !content) return null;
            return { type, fileName, mimeType, content };
          })
          .filter(Boolean)
      : [];

    if (!userText && normalizedAttachments.length === 0) {
      throw new Error('Message and attachments are empty.');
    }

    if (this.state.isSending) {
      return;
    }

    const attachmentSummary = normalizedAttachments
      .map((entry) => `[${entry.type}] ${entry.fileName}`)
      .join('\n');
    const outboundText = userText || attachmentSummary;
    const turnUserText = userText
      ? attachmentSummary
        ? `${userText}\n\n${attachmentSummary}`
        : userText
      : attachmentSummary;

    const turn = {
      id: createTurnId(),
      userText: turnUserText,
      assistantText: 'Responding...',
      state: 'sending',
      createdAt: Date.now(),
    };

    this.lastAction = null;

    this.setState({
      turns: [...this.state.turns, turn],
      isSending: true,
      sendError: null,
      banner: null,
    });

    try {
      const response = await this.client.chatSend(this.state.sessionKey, outboundText, {
        thinking: '',
        attachments: normalizedAttachments,
      });
      this.pendingRunId = response.runId;
      this.setState({
        turns: this.state.turns.map((entry) =>
          entry.id === turn.id
            ? {
                ...entry,
                runId: response.runId,
                state: 'streaming',
              }
            : entry,
        ),
      });
    } catch (error) {
      const message = errorMessage(error);
      this.lastAction = 'retry';
      this.pendingRunId = null;
      this.setState({
        isSending: false,
        sendError: message,
        turns: this.state.turns.map((entry) =>
          entry.id === turn.id
            ? {
                ...entry,
                state: 'error',
                assistantText: message,
              }
            : entry,
        ),
        banner: {
          kind: 'error',
          message,
        },
      });
      throw error;
    }
  }

  handleChatEvent(payload) {
    if (!payload || typeof payload !== 'object') return;

    const runId = typeof payload.runId === 'string' ? payload.runId : this.pendingRunId;
    if (!runId) return;

    const targetIndex = this.state.turns.findIndex((turn) => turn.runId === runId);
    if (targetIndex < 0) return;

    const normalizedState = normalizeState(payload.state);
    const streamedText = extractMessageText(payload.message);
    const finalEventText = extractFinalEventText(payload);
    const hasTerminalStopReason = Boolean(String(payload.stopReason ?? '').trim());
    const hasTerminalFlag =
      payload.done === true ||
      payload.completed === true ||
      payload.final === true;
    const shouldTreatAsComplete =
      normalizedState === 'complete' || hasTerminalStopReason || hasTerminalFlag;

    const updatedTurns = [...this.state.turns];
    const targetTurn = { ...updatedTurns[targetIndex] };

    if (streamedText) {
      targetTurn.assistantText = mergeStreamedText(targetTurn.assistantText, streamedText);
    }

    if (normalizedState === 'error') {
      this.lastAction = 'retry';
      targetTurn.state = 'error';
      targetTurn.assistantText =
        payload.errorMessage ?? targetTurn.assistantText ?? 'Gateway returned an error.';
      updatedTurns[targetIndex] = targetTurn;
      this.pendingRunId = null;
      this.setState({
        turns: updatedTurns,
        isSending: false,
        sendError: targetTurn.assistantText,
        banner: {
          kind: 'error',
          message: targetTurn.assistantText,
        },
        lastUpdatedAt: Date.now(),
      });
      return;
    }

    if (shouldTreatAsComplete) {
      this.lastAction = 'completed';
      targetTurn.state = 'complete';
      targetTurn.assistantText = resolveCompletedAssistantText({
        finalText: finalEventText,
        streamedText: targetTurn.assistantText,
        stopReason: payload.stopReason,
      });
      updatedTurns[targetIndex] = targetTurn;
      this.pendingRunId = null;
      this.setState({
        turns: updatedTurns,
        isSending: false,
        sendError: null,
        lastUpdatedAt: Date.now(),
      });
      return;
    }

    targetTurn.state = normalizedState;
    updatedTurns[targetIndex] = targetTurn;
    this.setState({
      turns: updatedTurns,
      lastUpdatedAt: Date.now(),
    });
  }
}

export function formatUpdatedAtLabel(updatedAt) {
  if (!updatedAt) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(updatedAt);
}

export function groupTurnsByDate(turns) {
  const items = [];
  let currentDateLabel = '';

  turns.forEach((turn) => {
    const dateLabel = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(turn.createdAt);

    if (dateLabel !== currentDateLabel) {
      currentDateLabel = dateLabel;
      items.push({
        kind: 'date',
        id: `date-${dateLabel}`,
        label: dateLabel,
      });
    }

    items.push({
      kind: 'turn',
      id: `turn-${turn.id}`,
      turn,
    });
  });

  return items;
}
