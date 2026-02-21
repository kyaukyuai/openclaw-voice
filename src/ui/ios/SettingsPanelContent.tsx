import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import DebugInfoPanel from '../DebugInfoPanel';
import { QUICK_TEXT_ICON_OPTIONS, SPEECH_LANG_OPTIONS } from '../../utils';

type SettingsPanelContentProps = {
  styles: Record<string, any>;
  maxTextScale: number;
  maxTextScaleTight: number;
  showOnboardingGuide: boolean;
  isQuickTextSettingsEditMode: boolean;
  sectionIconColor: string;
  currentBadgeIconColor: string;
  optionIconColor: string;
  actionIconColor: string;
  isOnboardingGatewayConfigured: boolean;
  isOnboardingConnectDone: boolean;
  isOnboardingResponseDone: boolean;
  isOnboardingWaitingForResponse: boolean;
  canRunOnboardingConnectTest: boolean;
  canRunOnboardingSampleSend: boolean;
  isGatewayConnecting: boolean;
  onboardingSampleButtonLabel: string;
  onOnboardingConnectTest: () => void;
  onOnboardingSendSample: () => void;
  onCompleteOnboarding: () => void;
  focusedField: string | null;
  setFocusedField: (value: any) => void;
  gatewayUrl: string;
  setGatewayUrl: (value: string) => void;
  authToken: string;
  setAuthToken: (value: string) => void;
  placeholderColor: string;
  isAuthTokenMasked: boolean;
  toggleAuthTokenVisibility: () => void;
  settingsReady: boolean;
  connectGateway: () => Promise<void>;
  isStartupAutoConnecting: boolean;
  isDarkTheme: boolean;
  showGatewayDiagnostic: boolean;
  gatewayDiagnosticIconName: any;
  gatewayConnectDiagnostic: { summary?: string; guidance?: string } | null;
  theme: 'light' | 'dark';
  setTheme: (value: 'light' | 'dark') => void;
  speechLang: 'ja-JP' | 'en-US';
  setSpeechLang: (value: 'ja-JP' | 'en-US') => void;
  quickTextInputRefs: any;
  quickTextLeft: string;
  setQuickTextLeft: (value: string) => void;
  quickTextRight: string;
  setQuickTextRight: (value: string) => void;
  quickTextLeftIcon: any;
  setQuickTextLeftIcon: (value: any) => void;
  quickTextRightIcon: any;
  setQuickTextRightIcon: (value: any) => void;
  ensureSettingsFieldVisible: (field: 'quick-text-left' | 'quick-text-right') => void;
  enableDebugWarnings: boolean;
  connectionState: string;
  gatewayEventState: string;
  activeSessionKey: string;
  activeRunId: string | null;
  historyLastSyncedAt: number | null;
  startupAutoConnectAttempt: number;
};

export default function SettingsPanelContent({
  styles,
  maxTextScale,
  maxTextScaleTight,
  showOnboardingGuide,
  isQuickTextSettingsEditMode,
  sectionIconColor,
  currentBadgeIconColor,
  optionIconColor,
  actionIconColor,
  isOnboardingGatewayConfigured,
  isOnboardingConnectDone,
  isOnboardingResponseDone,
  isOnboardingWaitingForResponse,
  canRunOnboardingConnectTest,
  canRunOnboardingSampleSend,
  isGatewayConnecting,
  onboardingSampleButtonLabel,
  onOnboardingConnectTest,
  onOnboardingSendSample,
  onCompleteOnboarding,
  focusedField,
  setFocusedField,
  gatewayUrl,
  setGatewayUrl,
  authToken,
  setAuthToken,
  placeholderColor,
  isAuthTokenMasked,
  toggleAuthTokenVisibility,
  settingsReady,
  connectGateway,
  isStartupAutoConnecting,
  isDarkTheme,
  showGatewayDiagnostic,
  gatewayDiagnosticIconName,
  gatewayConnectDiagnostic,
  theme,
  setTheme,
  speechLang,
  setSpeechLang,
  quickTextInputRefs,
  quickTextLeft,
  setQuickTextLeft,
  quickTextRight,
  setQuickTextRight,
  quickTextLeftIcon,
  setQuickTextLeftIcon,
  quickTextRightIcon,
  setQuickTextRightIcon,
  ensureSettingsFieldVisible,
  enableDebugWarnings,
  connectionState,
  gatewayEventState,
  activeSessionKey,
  activeRunId,
  historyLastSyncedAt,
  startupAutoConnectAttempt,
}: SettingsPanelContentProps) {
  return (
    <>
      {showOnboardingGuide && !isQuickTextSettingsEditMode ? (
        <View style={[styles.settingsSection, styles.onboardingSection]}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="sparkles-outline" size={14} color={sectionIconColor} />
            <Text style={styles.settingsSectionTitle} maxFontSizeMultiplier={maxTextScaleTight}>
              Getting Started
            </Text>
          </View>
          <Text style={styles.onboardingDescription} maxFontSizeMultiplier={maxTextScaleTight}>
            Complete setup in three steps: configure Gateway, test connection, then send one
            sample message.
          </Text>
          <View style={styles.onboardingStepList}>
            <View style={styles.onboardingStepRow}>
              <Ionicons
                name={isOnboardingGatewayConfigured ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={isOnboardingGatewayConfigured ? currentBadgeIconColor : optionIconColor}
              />
              <Text
                style={[
                  styles.onboardingStepText,
                  isOnboardingGatewayConfigured && styles.onboardingStepTextDone,
                ]}
                maxFontSizeMultiplier={maxTextScaleTight}
              >
                1. Enter Gateway URL and optional token.
              </Text>
            </View>
            <View style={styles.onboardingStepRow}>
              <Ionicons
                name={isOnboardingConnectDone ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={isOnboardingConnectDone ? currentBadgeIconColor : optionIconColor}
              />
              <Text
                style={[
                  styles.onboardingStepText,
                  isOnboardingConnectDone && styles.onboardingStepTextDone,
                ]}
                maxFontSizeMultiplier={maxTextScaleTight}
              >
                2. Tap Test Connection and confirm status is Connected.
              </Text>
            </View>
            <View style={styles.onboardingStepRow}>
              <Ionicons
                name={
                  isOnboardingResponseDone
                    ? 'checkmark-circle'
                    : isOnboardingWaitingForResponse
                      ? 'time-outline'
                      : 'ellipse-outline'
                }
                size={14}
                color={
                  isOnboardingResponseDone || isOnboardingWaitingForResponse
                    ? currentBadgeIconColor
                    : optionIconColor
                }
              />
              <Text
                style={[
                  styles.onboardingStepText,
                  isOnboardingResponseDone && styles.onboardingStepTextDone,
                ]}
                maxFontSizeMultiplier={maxTextScaleTight}
              >
                {isOnboardingWaitingForResponse
                  ? '3. Waiting for first response from Gateway...'
                  : '3. Send one sample message to verify chat round-trip.'}
              </Text>
            </View>
          </View>
          <View style={styles.onboardingActionRow}>
            <Pressable
              style={[
                styles.smallButton,
                styles.connectButton,
                !canRunOnboardingConnectTest && styles.smallButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Test gateway connection"
              onPress={onOnboardingConnectTest}
              disabled={!canRunOnboardingConnectTest}
            >
              <Text style={styles.smallButtonText} maxFontSizeMultiplier={maxTextScaleTight}>
                {isGatewayConnecting ? 'Connecting...' : 'Test Connection'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.smallButton,
                styles.onboardingSecondaryButton,
                !canRunOnboardingSampleSend && styles.onboardingSecondaryButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                isOnboardingWaitingForResponse
                  ? 'Waiting for first onboarding response'
                  : 'Send onboarding sample message'
              }
              onPress={onOnboardingSendSample}
              disabled={!canRunOnboardingSampleSend}
            >
              <Text
                style={styles.onboardingSecondaryButtonText}
                maxFontSizeMultiplier={maxTextScaleTight}
              >
                {onboardingSampleButtonLabel}
              </Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.onboardingSkipButton}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            onPress={onCompleteOnboarding}
          >
            <Text style={styles.onboardingSkipButtonText} maxFontSizeMultiplier={maxTextScaleTight}>
              Skip for now
            </Text>
          </Pressable>
        </View>
      ) : null}

      {!isQuickTextSettingsEditMode ? (
        <View style={styles.settingsSection}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="link-outline" size={14} color={sectionIconColor} />
            <Text style={styles.settingsSectionTitle} maxFontSizeMultiplier={maxTextScaleTight}>
              Gateway
            </Text>
          </View>
          <Text style={styles.label} maxFontSizeMultiplier={maxTextScaleTight}>
            Gateway URL
          </Text>
          <TextInput
            style={[styles.input, focusedField === 'gateway-url' && styles.inputFocused]}
            maxFontSizeMultiplier={maxTextScale}
            value={gatewayUrl}
            onChangeText={setGatewayUrl}
            placeholder="wss://your-openclaw-gateway.example.com"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={() => Keyboard.dismiss()}
            onFocus={() => setFocusedField('gateway-url')}
            onBlur={() =>
              setFocusedField((current: string | null) =>
                current === 'gateway-url' ? null : current,
              )
            }
          />

          <Text style={[styles.label, styles.labelSpacing]} maxFontSizeMultiplier={maxTextScaleTight}>
            Token (optional)
          </Text>
          <View
            style={[
              styles.tokenInputRow,
              styles.input,
              focusedField === 'auth-token' && styles.inputFocused,
            ]}
          >
            <TextInput
              style={styles.tokenInputField}
              maxFontSizeMultiplier={maxTextScale}
              value={authToken}
              onChangeText={setAuthToken}
              placeholder="gateway token or password"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType={isAuthTokenMasked ? 'password' : 'none'}
              secureTextEntry={isAuthTokenMasked}
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
              onFocus={() => setFocusedField('auth-token')}
              onBlur={() =>
                setFocusedField((current: string | null) =>
                  current === 'auth-token' ? null : current,
                )
              }
            />
            <Pressable
              style={styles.tokenVisibilityButton}
              accessibilityRole="button"
              accessibilityLabel={isAuthTokenMasked ? 'Show token' : 'Hide token'}
              accessibilityHint={
                isAuthTokenMasked ? 'Temporarily reveals token.' : 'Hide token value.'
              }
              onPress={toggleAuthTokenVisibility}
            >
              <Ionicons
                name={isAuthTokenMasked ? 'eye-outline' : 'eye-off-outline'}
                size={16}
                color={optionIconColor}
              />
            </Pressable>
          </View>
          <View style={styles.connectionRow}>
            <Pressable
              style={[
                styles.smallButton,
                styles.connectButton,
                (isGatewayConnecting || !settingsReady) && styles.smallButtonDisabled,
              ]}
              onPress={() => {
                Keyboard.dismiss();
                setFocusedField(null);
                void connectGateway();
              }}
              disabled={isGatewayConnecting || !settingsReady}
            >
              <Text style={styles.smallButtonText} maxFontSizeMultiplier={maxTextScaleTight}>
                {!settingsReady
                  ? 'Initializing...'
                  : isGatewayConnecting
                    ? 'Connecting...'
                    : 'Connect'}
              </Text>
            </Pressable>
          </View>
          {isStartupAutoConnecting ? (
            <View style={styles.autoConnectLoadingRow}>
              <ActivityIndicator size="small" color={isDarkTheme ? '#9ec0ff' : '#2563EB'} />
              <Text style={styles.autoConnectLoadingText} maxFontSizeMultiplier={maxTextScaleTight}>
                Connecting to saved Gateway...
              </Text>
            </View>
          ) : null}
          {showGatewayDiagnostic ? (
            <View style={styles.gatewayDiagnosticBox}>
              <Ionicons name={gatewayDiagnosticIconName} size={14} color={sectionIconColor} />
              <View style={styles.gatewayDiagnosticTextWrap}>
                <Text
                  style={styles.gatewayDiagnosticSummary}
                  maxFontSizeMultiplier={maxTextScaleTight}
                >
                  {gatewayConnectDiagnostic?.summary}
                </Text>
                <Text style={styles.gatewayDiagnosticHint} maxFontSizeMultiplier={maxTextScaleTight}>
                  {gatewayConnectDiagnostic?.guidance}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {!isQuickTextSettingsEditMode ? (
        <View style={[styles.settingsSection, styles.settingsSectionSpaced]}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="color-palette-outline" size={14} color={sectionIconColor} />
            <Text style={styles.settingsSectionTitle} maxFontSizeMultiplier={maxTextScaleTight}>
              Theme
            </Text>
          </View>
          <View style={styles.settingsOptionRow}>
            <Pressable
              style={[
                styles.settingsOptionButton,
                theme === 'light' && styles.settingsOptionButtonSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Set theme to light"
              onPress={() => {
                setTheme('light');
              }}
            >
              <Ionicons
                name="sunny-outline"
                size={14}
                color={theme === 'light' ? currentBadgeIconColor : optionIconColor}
              />
              <Text
                style={[
                  styles.settingsOptionLabel,
                  theme === 'light' && styles.settingsOptionLabelSelected,
                ]}
                maxFontSizeMultiplier={maxTextScale}
              >
                Light
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.settingsOptionButton,
                theme === 'dark' && styles.settingsOptionButtonSelected,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Set theme to dark"
              onPress={() => {
                setTheme('dark');
              }}
            >
              <Ionicons
                name="moon-outline"
                size={14}
                color={theme === 'dark' ? currentBadgeIconColor : optionIconColor}
              />
              <Text
                style={[
                  styles.settingsOptionLabel,
                  theme === 'dark' && styles.settingsOptionLabelSelected,
                ]}
                maxFontSizeMultiplier={maxTextScale}
              >
                Dark
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!isQuickTextSettingsEditMode ? (
        <View style={[styles.settingsSection, styles.settingsSectionSpaced]}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="mic-outline" size={14} color={sectionIconColor} />
            <Text style={styles.settingsSectionTitle} maxFontSizeMultiplier={maxTextScaleTight}>
              Language
            </Text>
          </View>
          <View style={styles.languagePickerRow}>
            {SPEECH_LANG_OPTIONS.map((option) => {
              const selected = speechLang === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.languageOptionButton,
                    selected && styles.languageOptionButtonSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Set speech language to ${option.label} (${option.value})`}
                  onPress={() => {
                    Keyboard.dismiss();
                    setFocusedField(null);
                    setSpeechLang(option.value);
                  }}
                >
                  <Text
                    style={[styles.languageOptionLabel, selected && styles.languageOptionLabelSelected]}
                    maxFontSizeMultiplier={maxTextScale}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[styles.languageOptionCode, selected && styles.languageOptionCodeSelected]}
                    maxFontSizeMultiplier={maxTextScaleTight}
                  >
                    {option.value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.settingsSection,
          !isQuickTextSettingsEditMode && styles.settingsSectionSpaced,
          isQuickTextSettingsEditMode && styles.settingsSectionFocused,
        ]}
      >
        <View style={styles.quickTextSectionHeaderRow}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={sectionIconColor} />
            <Text style={styles.settingsSectionTitle} maxFontSizeMultiplier={maxTextScaleTight}>
              Quick Text
            </Text>
          </View>
          {isQuickTextSettingsEditMode ? (
            <Pressable
              style={styles.quickTextDoneButton}
              accessibilityRole="button"
              accessibilityLabel="Done editing quick text"
              onPress={() => {
                Keyboard.dismiss();
                setFocusedField(null);
              }}
            >
              <Ionicons name="checkmark-outline" size={12} color={actionIconColor} />
              <Text style={styles.quickTextDoneButtonText} maxFontSizeMultiplier={maxTextScaleTight}>
                Done
              </Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.quickTextConfigRow}>
          <View style={styles.quickTextConfigItem}>
            <Text style={styles.label} maxFontSizeMultiplier={maxTextScaleTight}>
              Left
            </Text>
            <TextInput
              ref={(node) => {
                quickTextInputRefs.current['quick-text-left'] = node;
              }}
              style={[
                styles.input,
                styles.quickTextConfigInput,
                focusedField === 'quick-text-left' && styles.inputFocused,
              ]}
              maxFontSizeMultiplier={maxTextScale}
              value={quickTextLeft}
              onChangeText={setQuickTextLeft}
              placeholder="e.g. ありがとう"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={120}
              multiline
              textAlignVertical="top"
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
              onFocus={() => {
                setFocusedField('quick-text-left');
                ensureSettingsFieldVisible('quick-text-left');
              }}
              onBlur={() =>
                setFocusedField((current: string | null) =>
                  current === 'quick-text-left' ? null : current,
                )
              }
            />
            <Text style={[styles.label, styles.quickTextIconLabel]} maxFontSizeMultiplier={maxTextScaleTight}>
              Icon
            </Text>
            <View style={styles.quickTextIconPickerRow}>
              {QUICK_TEXT_ICON_OPTIONS.map((option) => {
                const selected = quickTextLeftIcon === option.value;
                return (
                  <Pressable
                    key={`left-${option.value}`}
                    style={[
                      styles.quickTextIconOptionButton,
                      selected && styles.quickTextIconOptionButtonSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Set left quick text icon to ${option.label}`}
                    onPress={() => {
                      Keyboard.dismiss();
                      setFocusedField(null);
                      setQuickTextLeftIcon(option.value);
                    }}
                  >
                    <Ionicons
                      name={option.value}
                      size={16}
                      color={selected ? currentBadgeIconColor : optionIconColor}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.quickTextConfigItem}>
            <Text style={styles.label} maxFontSizeMultiplier={maxTextScaleTight}>
              Right
            </Text>
            <TextInput
              ref={(node) => {
                quickTextInputRefs.current['quick-text-right'] = node;
              }}
              style={[
                styles.input,
                styles.quickTextConfigInput,
                focusedField === 'quick-text-right' && styles.inputFocused,
              ]}
              maxFontSizeMultiplier={maxTextScale}
              value={quickTextRight}
              onChangeText={setQuickTextRight}
              placeholder="e.g. お願いします"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={120}
              multiline
              textAlignVertical="top"
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
              onFocus={() => {
                setFocusedField('quick-text-right');
                ensureSettingsFieldVisible('quick-text-right');
              }}
              onBlur={() =>
                setFocusedField((current: string | null) =>
                  current === 'quick-text-right' ? null : current,
                )
              }
            />
            <Text style={[styles.label, styles.quickTextIconLabel]} maxFontSizeMultiplier={maxTextScaleTight}>
              Icon
            </Text>
            <View style={styles.quickTextIconPickerRow}>
              {QUICK_TEXT_ICON_OPTIONS.map((option) => {
                const selected = quickTextRightIcon === option.value;
                return (
                  <Pressable
                    key={`right-${option.value}`}
                    style={[
                      styles.quickTextIconOptionButton,
                      selected && styles.quickTextIconOptionButtonSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Set right quick text icon to ${option.label}`}
                    onPress={() => {
                      Keyboard.dismiss();
                      setFocusedField(null);
                      setQuickTextRightIcon(option.value);
                    }}
                  >
                    <Ionicons
                      name={option.value}
                      size={16}
                      color={selected ? currentBadgeIconColor : optionIconColor}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
      {enableDebugWarnings && !isQuickTextSettingsEditMode ? (
        <DebugInfoPanel
          isDarkTheme={isDarkTheme}
          connectionState={connectionState}
          gatewayEventState={gatewayEventState}
          activeSessionKey={activeSessionKey}
          activeRunId={activeRunId}
          historyLastSyncedAt={historyLastSyncedAt}
          isStartupAutoConnecting={isStartupAutoConnecting}
          startupAutoConnectAttempt={startupAutoConnectAttempt}
        />
      ) : null}
    </>
  );
}
