import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

function buildPickerHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  </head>
  <body>
    <input id="picker" type="file" style="display:none" />

    <script>
      (function() {
        var picker = document.getElementById('picker');

        function post(payload) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }

        function openPicker() {
          picker.click();
        }

        window.addEventListener('message', function(event) {
          try {
            var payload = JSON.parse(String(event.data || '{}'));
            if (payload && payload.event === 'open-picker') {
              openPicker();
            }
          } catch {
            // ignore parse failures
          }
        });

        picker.addEventListener('change', function() {
          var file = picker.files && picker.files[0];
          if (!file) {
            post({ event: 'cancel' });
            return;
          }

          var reader = new FileReader();
          reader.onload = function() {
            var raw = String(reader.result || '');
            var index = raw.indexOf(',');
            var content = index >= 0 ? raw.slice(index + 1) : raw;
            post({
              event: 'picked',
              fileName: file.name || 'attachment',
              mimeType: file.type || 'application/octet-stream',
              content: content,
              size: Number(file.size || 0),
              type: String(file.type || '').indexOf('image/') === 0 ? 'image' : 'file'
            });
          };
          reader.onerror = function() {
            post({ event: 'error', message: 'Failed to read file.' });
          };
          reader.readAsDataURL(file);
        });

        post({ event: 'ready' });
      })();
      true;
    </script>
  </body>
</html>`;
}

export default function FileAttachmentPickerSheet({ visible, themeTokens, onPick, onClose }) {
  const webviewRef = useRef(null);
  const [pickerReady, setPickerReady] = useState(false);

  const html = useMemo(() => buildPickerHtml(), []);

  const handleMessage = useCallback(
    (event) => {
      const raw = String(event?.nativeEvent?.data ?? '');
      if (!raw) return;

      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      if (!parsed || typeof parsed !== 'object') return;
      if (parsed.event === 'ready') {
        setPickerReady(true);
        return;
      }
      if (parsed.event === 'picked') {
        onPick?.(parsed);
      } else if (parsed.event === 'cancel') {
        onClose?.();
      } else if (parsed.event === 'error') {
        onClose?.();
      }
    },
    [onClose, onPick],
  );

  const handleChooseFile = useCallback(() => {
    if (!pickerReady) return;
    webviewRef.current?.postMessage(JSON.stringify({ event: 'open-picker' }));
  }, [pickerReady]);

  useEffect(() => {
    if (!visible) {
      setPickerReady(false);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: themeTokens?.card ?? '#fff',
            borderColor: themeTokens?.inputBorder ?? 'rgba(0,0,0,0.12)',
          },
        ]}
      >
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: themeTokens?.textPrimary ?? '#111827' }]}>
            Attach File
          </Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeButtonText, { color: themeTokens?.textSecondary ?? '#374151' }]}>
              Close
            </Text>
          </Pressable>
        </View>

        <View style={styles.sheetBody}>
          <Text style={[styles.hintText, { color: themeTokens?.textMuted ?? '#6B7280' }]}>
            Choose an image or file and send it with your next message.
          </Text>
          <Pressable
            style={[
              styles.chooseButton,
              {
                borderColor: themeTokens?.inputBorderFocus ?? '#2563EB',
                opacity: pickerReady ? 1 : 0.6,
              },
            ]}
            disabled={!pickerReady}
            onPress={handleChooseFile}
          >
            <Text style={[styles.chooseButtonText, { color: themeTokens?.textPrimary ?? '#111827' }]}>
              Choose File
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.hiddenWebView}>
        <WebView
          ref={webviewRef}
          source={{ html, baseUrl: 'about:blank' }}
          originWhitelist={['*']}
          style={styles.webview}
          containerStyle={styles.webviewContainer}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={(request) => {
            const url = String(request?.url ?? '');
            return !url || url.startsWith('about:blank');
          }}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          bounces={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  sheet: {
    width: '100%',
    maxWidth: 460,
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sheetHeader: {
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  closeButton: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sheetBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 18,
  },
  chooseButton: {
    minHeight: 36,
    borderWidth: 1.5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chooseButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  hiddenWebView: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0,
    pointerEvents: 'none',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webviewContainer: {
    backgroundColor: 'transparent',
  },
});
