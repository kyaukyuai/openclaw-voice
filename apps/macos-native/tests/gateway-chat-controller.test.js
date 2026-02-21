/* global jest */

let chatHistoryImpl = async () => ({ messages: [] });
let chatHistoryCallCount = 0;
let chatSendImpl = async () => ({ runId: 'run-test', status: 'ok' });
let chatSendCalls = [];

class MockGatewayClient {
  constructor() {
    this.connectionStateListener = null;
    this.chatEventListener = null;
    this.eventListeners = new Map();
  }

  static reset() {
    chatHistoryImpl = async () => ({ messages: [] });
    chatHistoryCallCount = 0;
    chatSendImpl = async () => ({ runId: 'run-test', status: 'ok' });
    chatSendCalls = [];
  }

  static setChatHistoryImpl(fn) {
    chatHistoryImpl = fn;
  }

  static getChatHistoryCallCount() {
    return chatHistoryCallCount;
  }

  static setChatSendImpl(fn) {
    chatSendImpl = fn;
  }

  static getChatSendCalls() {
    return chatSendCalls;
  }

  onConnectionStateChange(callback) {
    this.connectionStateListener = callback;
    return () => {
      if (this.connectionStateListener === callback) {
        this.connectionStateListener = null;
      }
    };
  }

  onChatEvent(callback) {
    this.chatEventListener = callback;
    return () => {
      if (this.chatEventListener === callback) {
        this.chatEventListener = null;
      }
    };
  }

  on(eventName, callback) {
    this.eventListeners.set(eventName, callback);
  }

  off(eventName, callback) {
    if (this.eventListeners.get(eventName) === callback) {
      this.eventListeners.delete(eventName);
    }
  }

  async connect() {
    this.connectionStateListener?.('connected');
  }

  disconnect() {
    this.connectionStateListener?.('disconnected');
  }

  async chatHistory(sessionKey, options) {
    chatHistoryCallCount += 1;
    return chatHistoryImpl(sessionKey, options);
  }

  async chatSend(sessionKey, message, options) {
    chatSendCalls.push({ sessionKey, message, options });
    return chatSendImpl(sessionKey, message, options);
  }
}

jest.mock('../../../src/openclaw/client', () => ({
  GatewayClient: MockGatewayClient,
}));

const { GatewayChatController } = require('../../../src/shared/gateway-chat-controller');

function createController() {
  return new GatewayChatController({
    refreshTimeoutMs: 120,
    historyLimit: 5,
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('GatewayChatController refreshHistory hardening', () => {
  beforeEach(() => {
    MockGatewayClient.reset();
  });

  test('success path clears isSyncing', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });
    await controller.refreshHistory();

    const state = controller.getState();
    expect(state.isSyncing).toBe(false);
    expect(state.syncError).toBeNull();
  });

  test('timeout path sets syncError and clears isSyncing', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });

    MockGatewayClient.setChatHistoryImpl(() => new Promise(() => {}));
    await controller.refreshHistory();

    const state = controller.getState();
    expect(state.isSyncing).toBe(false);
    expect(String(state.syncError ?? '')).toContain('Refresh timed out');
    expect(state.banner?.message).toContain('Refresh failed');
  });

  test('concurrent refresh reuses in-flight promise', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });

    const wait = deferred();
    MockGatewayClient.setChatHistoryImpl(() => wait.promise);

    const p1 = controller.refreshHistory();
    const p2 = controller.refreshHistory();

    expect(MockGatewayClient.getChatHistoryCallCount()).toBe(2);
    // 1 call happened during connect(), 1 during this refresh burst.

    wait.resolve({ messages: [] });
    await Promise.all([p1, p2]);
  });

  test('disconnect during refresh prevents stale state overwrite', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });

    const wait = deferred();
    MockGatewayClient.setChatHistoryImpl(() => wait.promise);

    const refreshPromise = controller.refreshHistory();
    controller.disconnect();

    wait.resolve({
      messages: [
        { role: 'user', content: 'old user', timestamp: Date.now() },
        { role: 'assistant', content: 'old assistant', timestamp: Date.now() + 1 },
      ],
    });
    await refreshPromise;

    const state = controller.getState();
    expect(state.connectionState).toBe('disconnected');
    expect(state.isSyncing).toBe(false);
    expect(state.turns).toHaveLength(0);
  });

  test('reconnect invalidates old refresh result', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });

    const oldRefresh = deferred();
    MockGatewayClient.setChatHistoryImpl(() => oldRefresh.promise);
    const stalePromise = controller.refreshHistory();

    MockGatewayClient.setChatHistoryImpl(async () => ({
      messages: [
        { role: 'user', content: 'new user', timestamp: Date.now() },
        { role: 'assistant', content: 'new assistant', timestamp: Date.now() + 1 },
      ],
    }));

    await controller.connect({ url: 'wss://example.test', sessionKey: 'new-session' });

    oldRefresh.resolve({
      messages: [
        { role: 'user', content: 'stale user', timestamp: Date.now() },
        { role: 'assistant', content: 'stale assistant', timestamp: Date.now() + 1 },
      ],
    });
    await stalePromise;

    const state = controller.getState();
    expect(state.sessionKey).toBe('new-session');
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0].userText).toContain('new user');
    expect(state.turns[0].assistantText).toContain('new assistant');
  });
});

describe('GatewayChatController final response resolution', () => {
  beforeEach(() => {
    MockGatewayClient.reset();
  });

  test('complete event uses final text from output payload when message is empty', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });

    controller.setState({
      turns: [
        {
          id: 'turn-1',
          runId: 'run-1',
          userText: 'hello',
          assistantText: 'Responding...',
          state: 'streaming',
          createdAt: Date.now(),
        },
      ],
      isSending: true,
    });

    controller.handleChatEvent({
      runId: 'run-1',
      sessionKey: 'main',
      state: 'complete',
      output: { text: 'Final answer from output payload' },
    });

    const state = controller.getState();
    expect(state.isSending).toBe(false);
    expect(state.turns[0].state).toBe('complete');
    expect(state.turns[0].assistantText).toBe('Final answer from output payload');
  });

  test('complete event keeps streamed text when no explicit final text is present', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });

    controller.setState({
      turns: [
        {
          id: 'turn-2',
          runId: 'run-2',
          userText: 'hello',
          assistantText: 'Streamed final text',
          state: 'streaming',
          createdAt: Date.now(),
        },
      ],
      isSending: true,
    });

    controller.handleChatEvent({
      runId: 'run-2',
      sessionKey: 'main',
      state: 'complete',
    });

    const state = controller.getState();
    expect(state.turns[0].state).toBe('complete');
    expect(state.turns[0].assistantText).toBe('Streamed final text');
  });

  test('complete event shows truncation message when stopReason is max_tokens and no text exists', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });

    controller.setState({
      turns: [
        {
          id: 'turn-3',
          runId: 'run-3',
          userText: 'hello',
          assistantText: 'Responding...',
          state: 'streaming',
          createdAt: Date.now(),
        },
      ],
      isSending: true,
    });

    controller.handleChatEvent({
      runId: 'run-3',
      sessionKey: 'main',
      state: 'complete',
      stopReason: 'max_tokens',
    });

    const state = controller.getState();
    expect(state.turns[0].state).toBe('complete');
    expect(state.turns[0].assistantText).toBe(
      'Response was truncated (max tokens reached).',
    );
  });

  test('missing state but stopReason finalizes sending', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });

    controller.setState({
      turns: [
        {
          id: 'turn-4',
          runId: 'run-4',
          userText: 'hello',
          assistantText: 'Final text without explicit complete state',
          state: 'streaming',
          createdAt: Date.now(),
        },
      ],
      isSending: true,
    });

    controller.handleChatEvent({
      runId: 'run-4',
      sessionKey: 'main',
      message: { text: 'Final text without explicit complete state' },
      stopReason: 'end_turn',
    });

    const state = controller.getState();
    expect(state.isSending).toBe(false);
    expect(state.turns[0].state).toBe('complete');
    expect(state.turns[0].assistantText).toBe('Final text without explicit complete state');
  });

  test('sendMessage forwards attachments to chatSend', async () => {
    const controller = createController();
    await controller.connect({ url: 'wss://example.test', sessionKey: 'main' });

    await controller.sendMessage('check attachment', [
      {
        type: 'image',
        fileName: 'image.png',
        mimeType: 'image/png',
        content: 'YmFzZTY0',
      },
    ]);

    const calls = MockGatewayClient.getChatSendCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].message).toBe('check attachment');
    expect(calls[0].options?.attachments).toHaveLength(1);
    expect(calls[0].options?.attachments?.[0]?.fileName).toBe('image.png');
  });
});
