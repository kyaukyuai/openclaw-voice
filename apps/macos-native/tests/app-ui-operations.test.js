/* global jest */

const React = require('react');
const ReactTestRenderer = require('react-test-renderer');

jest.mock('../src/hooks/useMacosAppRuntime', () => jest.fn());
jest.mock('../components/FileAttachmentPickerSheet', () => () => null);
jest.mock('../src/components/TurnRow', () => () => null);
jest.mock('../src/components/DateRow', () => () => null);
jest.mock('../src/components/SettingsView', () => () => null);
jest.mock('../../../src/shared', () => ({
  formatUpdatedAtLabel: jest.fn(() => 'Updated now'),
  groupTurnsByDate: jest.fn(() => []),
}));

const useMacosAppRuntime = require('../src/hooks/useMacosAppRuntime');
const App = require('../App').default;

function createHookReturn(overrides = {}) {
  const profile = {
    id: 'gateway-alpha',
    name: 'Alpha',
    gatewayUrl: 'wss://gateway-alpha.example.com',
    authToken: 'token-alpha',
    sessionKey: 'main',
    sessions: ['main', 'project-a'],
  };

  const controllerState = {
    connectionState: 'connected',
    isSyncing: false,
    isSending: false,
    lastUpdatedAt: Date.now(),
    turns: [],
    banner: null,
    syncError: null,
  };

  const runtime = {
    controllerState,
    composerText: 'hello',
    composerSelection: { start: 5, end: 5 },
    composerHeight: 44,
    pendingAttachments: [],
    sendingAttachmentCount: 0,
    isComposerFocused: false,
    composerBySession: { main: { text: 'hello', selection: { start: 5, end: 5 } } },
    attachmentsBySession: { main: [] },
  };

  return {
    activeGatewayId: profile.id,
    activeNav: 'chat',
    activeProfile: profile,
    attachmentNoticeByGatewayId: {},
    attachmentPickerGatewayId: null,
    authToken: profile.authToken,
    authTokenInputRef: { current: null },
    booting: false,
    clearPendingAttachmentsForGateway: jest.fn(),
    collapsedGatewayIds: {},
    composerHeightByGatewayIdRef: { current: {} },
    composerInputRefs: { current: new Map() },
    connectGateway: jest.fn(() => Promise.resolve()),
    copiedMessageByKey: {},
    disconnectGateway: jest.fn(),
    dropActiveByGatewayId: {},
    focusedGatewayId: profile.id,
    focusedSettingsInput: null,
    focusComposerForGateway: jest.fn(),
    forcedSelectionByGatewayId: {},
    forcedSelectionByGatewayIdRef: { current: {} },
    gatewayName: profile.name,
    gatewayProfiles: [profile],
    gatewayRuntimeById: { [profile.id]: runtime },
    gatewayUrl: profile.gatewayUrl,
    handleAttachmentPick: jest.fn(),
    handleCopyMessage: jest.fn(),
    handleCreateGatewayProfile: jest.fn(),
    handleCreateSession: jest.fn(),
    handleDeleteActiveGatewayProfile: jest.fn(),
    handleDroppedFilesForGateway: jest.fn(),
    handleOpenExternalLink: jest.fn(),
    handleRootKeyDown: jest.fn(),
    handleSelectGatewayProfile: jest.fn(),
    handleSelectSession: jest.fn(),
    hintHeightByGatewayIdRef: { current: {} },
    historyBottomInsetByGatewayId: {},
    historyContentHeightByGatewayIdRef: { current: {} },
    historyScrollRefs: { current: new Map() },
    historyViewportHeightByGatewayIdRef: { current: {} },
    identityPersistWarning: null,
    identityReady: true,
    insertQuickText: jest.fn(),
    isAuthTokenVisible: false,
    isGatewayNotificationEnabled: jest.fn(() => true),
    isImeComposingByGatewayIdRef: { current: {} },
    notificationSettings: { enabled: true, muteForeground: true, byGatewayId: {} },
    pendingTurnFocusByGatewayIdRef: { current: {} },
    quickMenuOpenByGatewayId: {},
    quickTextLeft: 'left',
    quickTextRight: 'right',
    recomputeHistoryBottomInsetForGateway: jest.fn(),
    refreshHistory: jest.fn(() => Promise.resolve()),
    removePendingAttachmentForGateway: jest.fn(),
    rootRef: { current: null },
    scheduleHistoryBottomSync: jest.fn(),
    scheduleHistoryTurnFocus: jest.fn(),
    sendMessage: jest.fn(() => Promise.resolve()),
    sessionKey: profile.sessionKey,
    setActiveNav: jest.fn(),
    setAttachmentPickerGatewayId: jest.fn(),
    setAuthToken: jest.fn(),
    setComposerFocusedForGateway: jest.fn(),
    setComposerSelectionForGateway: jest.fn(),
    setComposerTextForGateway: jest.fn(),
    setDropActiveByGatewayId: jest.fn(),
    setFocusedGatewayId: jest.fn(),
    setFocusedSettingsInput: jest.fn(),
    setForcedSelectionForGateway: jest.fn(),
    setGatewayName: jest.fn(),
    setGatewayUrl: jest.fn(),
    setImeComposingForGateway: jest.fn(),
    setIsAuthTokenVisible: jest.fn(),
    setQuickMenuOpenForGateway: jest.fn(),
    setQuickTextLeft: jest.fn(),
    setQuickTextRight: jest.fn(),
    setSessionKey: jest.fn(),
    setTheme: jest.fn(),
    skipSubmitEditingByGatewayIdRef: { current: {} },
    summaryChip: { label: '1 Connected', color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
    theme: 'light',
    themeTokens: {
      bg: '#f4f5f3',
      card: '#ffffff',
      input: '#f5f6f7',
      inputBorder: 'rgba(0,0,0,0.12)',
      textPrimary: '#111827',
      textSecondary: '#374151',
      textMuted: '#6b7280',
      textDisabled: '#9ca3af',
      sideActiveBg: '#e4ecff',
      sideActiveInk: '#2563eb',
      sidebar: '#f2f4f6',
      dividerStrong: 'rgba(0,0,0,0.12)',
      accent: '#2563eb',
      bubbleAssistant: '#ffffff',
      bubbleUser: '#2563eb',
      bubbleUserText: '#ffffff',
      bubbleAssistantBorder: 'rgba(0,0,0,0.10)',
      bannerWarnBg: 'rgba(217,119,6,0.08)',
      bannerWarnBorder: 'rgba(217,119,6,0.24)',
      bannerWarnText: '#92400e',
      bannerErrorBg: 'rgba(220,38,38,0.10)',
      bannerErrorBorder: 'rgba(220,38,38,0.25)',
      bannerErrorText: '#b91c1c',
      selection: '#bfdbfe',
      kbdBg: '#f3f4f6',
      kbdBorder: 'rgba(0,0,0,0.12)',
      kbdInk: '#6b7280',
      composerHint: '#6b7280',
      statusConnectedBg: 'rgba(16,185,129,0.10)',
      statusConnectedBorder: 'rgba(16,185,129,0.20)',
      statusConnectedText: '#047857',
      statusMutedBg: 'rgba(107,114,128,0.14)',
      statusMutedBorder: 'rgba(107,114,128,0.24)',
      statusMutedText: '#4b5563',
    },
    toggleGatewayCollapse: jest.fn(),
    toggleGatewayNotifications: jest.fn(),
    toggleMuteForegroundNotifications: jest.fn(),
    toggleNotificationsEnabled: jest.fn(),
    tryImportFromClipboardShortcut: jest.fn(),
    unreadByGatewaySession: {},
    updateGatewayRuntime: jest.fn(),
    ...overrides,
  };
}

async function renderWithRuntime(overrides = {}) {
  const runtime = createHookReturn(overrides);
  useMacosAppRuntime.mockReturnValue(runtime);
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(React.createElement(App));
  });
  return { runtime, renderer };
}

async function pressByA11yLabel(renderer, label) {
  const target = renderer.root.find(
    (node) => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function',
  );
  await ReactTestRenderer.act(async () => {
    target.props.onPress();
  });
}

describe('macOS App UI operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('session list item triggers session switch handler', async () => {
    const { runtime, renderer } = await renderWithRuntime();
    await pressByA11yLabel(renderer, 'Select session project-a');
    expect(runtime.handleSelectSession).toHaveBeenCalledWith('gateway-alpha', 'project-a');
  });

  test('sync button triggers refresh handler', async () => {
    const { runtime, renderer } = await renderWithRuntime();
    await pressByA11yLabel(renderer, 'Sync history');
    expect(runtime.refreshHistory).toHaveBeenCalledWith('gateway-alpha');
  });

  test('send button triggers send handler', async () => {
    const { runtime, renderer } = await renderWithRuntime();
    await pressByA11yLabel(renderer, 'Send message');
    expect(runtime.sendMessage).toHaveBeenCalledWith('gateway-alpha');
  });

  test('quick button opens quick menu', async () => {
    const { runtime, renderer } = await renderWithRuntime();
    await pressByA11yLabel(renderer, 'Open quick text menu');
    expect(runtime.setQuickMenuOpenForGateway).toHaveBeenCalledWith('gateway-alpha', true);
  });

  test('attach button opens attachment picker for active gateway', async () => {
    const { runtime, renderer } = await renderWithRuntime();
    await pressByA11yLabel(renderer, 'Attach file or image');
    expect(runtime.setAttachmentPickerGatewayId).toHaveBeenCalledWith('gateway-alpha');
    expect(runtime.setFocusedGatewayId).toHaveBeenCalledWith('gateway-alpha');
  });
});
