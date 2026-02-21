import { Text, TextInput, View } from 'react-native';
import type { FocusField } from '../../types';

type TranscriptComposerCardProps = {
  styles: Record<string, any>;
  isRecognizing: boolean;
  isTranscriptEditingWithKeyboard: boolean;
  shouldUseCompactTranscriptCard: boolean;
  focusedField: FocusField;
  transcript: string;
  transcriptPlaceholder: string;
  placeholderColor: string;
  interimTranscript: string;
  maxTextScale: number;
  onTranscriptChange: (value: string) => void;
  onFocusTranscript: () => void;
  onBlurTranscript: () => void;
};

export default function TranscriptComposerCard({
  styles,
  isRecognizing,
  isTranscriptEditingWithKeyboard,
  shouldUseCompactTranscriptCard,
  focusedField,
  transcript,
  transcriptPlaceholder,
  placeholderColor,
  interimTranscript,
  maxTextScale,
  onTranscriptChange,
  onFocusTranscript,
  onBlurTranscript,
}: TranscriptComposerCardProps) {
  return (
    <View
      style={[
        styles.card,
        isRecognizing && styles.recordingCard,
        isTranscriptEditingWithKeyboard && styles.transcriptCardExpanded,
        shouldUseCompactTranscriptCard && styles.transcriptCardCompact,
      ]}
    >
      <View
        style={[
          styles.transcriptEditor,
          isTranscriptEditingWithKeyboard && styles.transcriptEditorExpanded,
          shouldUseCompactTranscriptCard && styles.transcriptEditorCompact,
        ]}
      >
        <TextInput
          style={[
            styles.transcriptInput,
            focusedField === 'transcript' && styles.inputFocused,
            isRecognizing && styles.transcriptInputDisabled,
            isTranscriptEditingWithKeyboard && styles.transcriptInputExpanded,
            shouldUseCompactTranscriptCard && styles.transcriptInputCompact,
          ]}
          maxFontSizeMultiplier={maxTextScale}
          value={transcript}
          onChangeText={onTranscriptChange}
          placeholder={transcriptPlaceholder}
          placeholderTextColor={placeholderColor}
          multiline
          textAlignVertical="top"
          editable={!isRecognizing}
          onFocus={onFocusTranscript}
          onBlur={onBlurTranscript}
        />
        {interimTranscript ? (
          <Text style={styles.interimText} maxFontSizeMultiplier={maxTextScale}>
            Live: {interimTranscript}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
