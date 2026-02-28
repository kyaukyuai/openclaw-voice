/* global jest */

let chatHistoryImpl = async () => ({ messages: [] });
let chatSendImpl = async () => ({ runId: 'run-e2e', status: 'ok' });

class MockGatewayClient {
  constructor() {
    this.connectionStateListener = null;
    this.chatEventListener = null;
  }

  static reset() {
    chatHistoryImpl = async () => ({ messages: [] });
    chatSendImpl = async () => ({ runId: 'run-e2e', status: 'ok' });
  }

  static setChatHistoryImpl(fn) {
    chatHistoryImpl = fn;
  }

  static setChatSendImpl(fn) {
    chatSendImpl = fn;
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

  on() {}

  off() {}

  async connect() {
    this.connectionStateListener?.('connected');
  }

  disconnect() {
    this.connectionStateListener?.('disconnected');
  }

  async chatHistory(sessionKey, options) {
    return chatHistoryImpl(sessionKey, options);
  }

  async chatSend(sessionKey, message, options) {
    return chatSendImpl(sessionKey, message, options);
  }
}

jest.mock('../../../src/openclaw/client', () => ({
  GatewayClient: MockGatewayClient,
}));

const { GatewayChatController } = require('../../../src/shared/gateway-chat-controller');

describe('GatewayChatController execution e2e flow', () => {
  beforeEach(() => {
    MockGatewayClient.reset();
  });

  test('connect -> send -> response -> refresh reaches terminal states', async () => {
    const now = Date.now();
    let historyMessages = [
      { role: 'user', content: 'seed user', timestamp: now + 1 },
      { role: 'assistant', content: 'seed assistant', timestamp: now + 2 },
    ];

    MockGatewayClient.setChatHistoryImpl(async () => ({ messages: historyMessages }));

    const controller = new GatewayChatController({
      refreshTimeoutMs: 300,
      historyLimit: 50,
    });

    await controller.connect({ url: 'wss://gateway.example.test', sessionKey: 'main' });

    const connected = controller.getState();
    expect(connected.connectionState).toBe('connected');
    expect(connected.turns).toHaveLength(1);
    expect(connected.isSyncing).toBe(false);

    MockGatewayClient.setChatSendImpl(async () => ({ runId: 'run-e2e-1', status: 'ok' }));

    await controller.sendMessage('please run workflow');
    expect(controller.getState().isSending).toBe(true);

    controller.handleChatEvent({
      runId: 'run-e2e-1',
      sessionKey: 'main',
      state: 'streaming',
      message: { text: 'working...' },
    });

    controller.handleChatEvent({
      runId: 'run-e2e-1',
      sessionKey: 'main',
      state: 'complete',
      output: { text: 'done and persisted' },
    });

    const afterResponse = controller.getState();
    expect(afterResponse.isSending).toBe(false);
    expect(afterResponse.turns.some((turn) => turn.assistantText === 'done and persisted')).toBe(true);

    historyMessages = [
      { role: 'user', content: 'seed user', timestamp: now + 1 },
      { role: 'assistant', content: 'seed assistant', timestamp: now + 2 },
      { role: 'user', content: 'please run workflow', timestamp: now + 10 },
      { role: 'assistant', content: 'done and persisted', timestamp: now + 11 },
    ];

    await controller.refreshHistory();

    const finalState = controller.getState();
    expect(finalState.connectionState).toBe('connected');
    expect(finalState.isSyncing).toBe(false);
    expect(finalState.isSending).toBe(false);
    expect(finalState.syncError).toBeNull();
    expect(finalState.turns).toHaveLength(2);
    expect(finalState.turns[1].assistantText).toContain('done and persisted');
  });
});
