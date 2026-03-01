/* global jest */

let chatHistoryBySession = {
  main: [],
  'project-a': [],
};
let chatSendImpl = async () => ({ runId: 'run-e2e-switch', status: 'ok' });

class MockGatewayClient {
  constructor() {
    this.connectionStateListener = null;
    this.chatEventListener = null;
  }

  static reset() {
    chatHistoryBySession = {
      main: [],
      'project-a': [],
    };
    chatSendImpl = async () => ({ runId: 'run-e2e-switch', status: 'ok' });
  }

  static setChatHistoryBySession(value) {
    chatHistoryBySession = value;
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

  async chatHistory(sessionKey) {
    return { messages: chatHistoryBySession[sessionKey] ?? [] };
  }

  async chatSend(sessionKey, message, options) {
    return chatSendImpl(sessionKey, message, options);
  }
}

jest.mock('../../../src/openclaw/client', () => ({
  GatewayClient: MockGatewayClient,
}));

const { GatewayChatController } = require('../../../src/shared/gateway-chat-controller');

describe('GatewayChatController execution e2e session switch flow', () => {
  beforeEach(() => {
    MockGatewayClient.reset();
  });

  test('connect -> session switch -> send -> response -> refresh keeps terminal state', async () => {
    const now = Date.now();

    MockGatewayClient.setChatHistoryBySession({
      main: [
        { role: 'user', content: 'main seed user', timestamp: now + 1 },
        { role: 'assistant', content: 'main seed assistant', timestamp: now + 2 },
      ],
      'project-a': [
        { role: 'user', content: 'project seed user', timestamp: now + 3 },
        { role: 'assistant', content: 'project seed assistant', timestamp: now + 4 },
      ],
    });

    const controller = new GatewayChatController({
      refreshTimeoutMs: 300,
      historyLimit: 50,
    });

    await controller.connect({ url: 'wss://gateway.example.test', sessionKey: 'main' });
    const mainState = controller.getState();
    expect(mainState.connectionState).toBe('connected');
    expect(mainState.sessionKey).toBe('main');
    expect(mainState.turns).toHaveLength(1);
    expect(mainState.turns[0].assistantText).toContain('main seed assistant');

    await controller.connect({ url: 'wss://gateway.example.test', sessionKey: 'project-a' });
    const switchedState = controller.getState();
    expect(switchedState.connectionState).toBe('connected');
    expect(switchedState.sessionKey).toBe('project-a');
    expect(switchedState.turns).toHaveLength(1);
    expect(switchedState.turns[0].assistantText).toContain('project seed assistant');
    expect(switchedState.isSending).toBe(false);

    MockGatewayClient.setChatSendImpl(async () => ({ runId: 'run-project-a', status: 'ok' }));
    await controller.sendMessage('new project question');
    expect(controller.getState().isSending).toBe(true);

    controller.handleChatEvent({
      runId: 'run-project-a',
      sessionKey: 'project-a',
      state: 'streaming',
      message: { text: 'processing project...' },
    });

    controller.handleChatEvent({
      runId: 'run-project-a',
      sessionKey: 'project-a',
      state: 'complete',
      output: { text: 'project final answer' },
    });

    const afterResponse = controller.getState();
    expect(afterResponse.connectionState).toBe('connected');
    expect(afterResponse.sessionKey).toBe('project-a');
    expect(afterResponse.isSending).toBe(false);
    expect(afterResponse.turns.some((turn) => turn.assistantText === 'project final answer')).toBe(true);

    MockGatewayClient.setChatHistoryBySession({
      main: [
        { role: 'user', content: 'main seed user', timestamp: now + 1 },
        { role: 'assistant', content: 'main seed assistant', timestamp: now + 2 },
      ],
      'project-a': [
        { role: 'user', content: 'project seed user', timestamp: now + 3 },
        { role: 'assistant', content: 'project seed assistant', timestamp: now + 4 },
        { role: 'user', content: 'new project question', timestamp: now + 10 },
        { role: 'assistant', content: 'project final answer', timestamp: now + 11 },
      ],
    });

    await controller.refreshHistory();

    const finalState = controller.getState();
    expect(finalState.connectionState).toBe('connected');
    expect(finalState.sessionKey).toBe('project-a');
    expect(finalState.isSending).toBe(false);
    expect(finalState.isSyncing).toBe(false);
    expect(finalState.syncError).toBeNull();
    expect(finalState.turns).toHaveLength(2);
    expect(finalState.turns[1].assistantText).toContain('project final answer');
  });
});
