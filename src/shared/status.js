export const STATUS_META = {
  disconnected: {
    label: 'Disconnected',
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
  },
  connecting: {
    label: 'Connecting',
    color: '#8b5cf6',
    backgroundColor: '#f3e8ff',
  },
  connected: {
    label: 'Connected',
    color: '#099268',
    backgroundColor: '#e6fcf5',
  },
  sending: {
    label: 'Sending',
    color: '#1d4ed8',
    backgroundColor: '#e0ecff',
  },
  completed: {
    label: 'Completed',
    color: '#0f766e',
    backgroundColor: '#e6fcf5',
  },
  retry: {
    label: 'Retry',
    color: '#b45309',
    backgroundColor: '#fef3c7',
  },
};

export function resolveStatusKey({
  connectionState,
  isSending,
  lastAction,
  hasError,
  hasSyncError,
}) {
  if (connectionState === 'connecting' || connectionState === 'reconnecting') {
    return 'connecting';
  }
  if (connectionState !== 'connected') {
    return 'disconnected';
  }
  if (isSending) return 'sending';
  if (hasError || hasSyncError || lastAction === 'retry') return 'retry';
  if (lastAction === 'completed') return 'completed';
  return 'connected';
}

export function resolveStatusMeta(input) {
  const key = resolveStatusKey(input);
  return {
    key,
    ...STATUS_META[key],
  };
}
