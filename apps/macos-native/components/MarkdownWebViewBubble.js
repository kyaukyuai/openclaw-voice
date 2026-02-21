import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import MarkdownIt from 'markdown-it';

const markdownParser = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

const MIN_HEIGHT = 36;

function buildHtml(markdown, themeTokens) {
  const source = String(markdown ?? '').trim() || 'No response';
  const rendered = markdownParser.render(source);

  const textPrimary = themeTokens?.textPrimary ?? '#111827';
  const textSecondary = themeTokens?.textSecondary ?? '#374151';
  const input = themeTokens?.input ?? '#F3F4F6';
  const hintBg = themeTokens?.hintBg ?? 'rgba(0,0,0,0.05)';
  const border = themeTokens?.inputBorder ?? 'rgba(0,0,0,0.12)';
  const accent = themeTokens?.inputBorderFocus ?? '#2563EB';
  const selection = themeTokens?.sideActiveBg ?? 'rgba(37,99,235,0.18)';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      :root {
        --text-primary: ${textPrimary};
        --text-secondary: ${textSecondary};
        --input-bg: ${input};
        --hint-bg: ${hintBg};
        --border: ${border};
        --accent: ${accent};
        --selection: ${selection};
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: transparent;
        color: var(--text-primary);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        line-height: 1.52;
        overflow-wrap: anywhere;
        word-break: normal;
        -webkit-text-size-adjust: 100%;
        user-select: text;
        -webkit-user-select: text;
      }

      * {
        box-sizing: border-box;
      }

      ::selection {
        background: var(--selection);
      }

      p,
      ul,
      ol,
      blockquote,
      pre,
      table {
        margin: 0 0 9px;
      }

      p:last-child,
      ul:last-child,
      ol:last-child,
      blockquote:last-child,
      pre:last-child,
      table:last-child {
        margin-bottom: 0;
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        color: var(--text-primary);
        margin: 4px 0 8px;
        line-height: 1.35;
      }

      h1 { font-size: 20px; font-weight: 800; }
      h2 { font-size: 18px; font-weight: 800; }
      h3 { font-size: 16px; font-weight: 700; }
      h4 { font-size: 15px; font-weight: 700; }
      h5 { font-size: 14px; font-weight: 700; }
      h6 { font-size: 14px; font-weight: 700; color: var(--text-secondary); }

      blockquote {
        border-left: 2px solid var(--accent);
        padding-left: 8px;
        color: var(--text-secondary);
      }

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
      }

      p code,
      li code {
        background: var(--hint-bg);
        border-radius: 5px;
        padding: 1px 5px;
        font-size: 0.92em;
      }

      pre {
        background: var(--hint-bg);
        border: 1px solid var(--border);
        border-radius: 7px;
        padding: 8px 10px;
        overflow-x: auto;
      }

      pre code {
        background: transparent;
        padding: 0;
        border-radius: 0;
        font-size: 0.9em;
      }

      ul,
      ol {
        padding-left: 1.35em;
      }

      li {
        margin-bottom: 2px;
      }

      hr {
        border: 0;
        border-top: 1px solid var(--border);
        margin: 8px 0 12px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.96em;
      }

      th,
      td {
        border: 1px solid var(--border);
        padding: 7px 8px;
        text-align: left;
        vertical-align: top;
      }

      a {
        color: var(--accent);
        text-decoration: underline;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    ${rendered}
  </body>
</html>`;
}

const injectedBridgeScript = `
(function() {
  var lastHeight = 0;

  function nextHeight() {
    var doc = document.documentElement;
    var body = document.body;
    var height = Math.max(
      doc ? doc.scrollHeight : 0,
      doc ? doc.offsetHeight : 0,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0
    );

    if (!height || !isFinite(height)) {
      return;
    }

    if (height !== lastHeight) {
      lastHeight = height;
      window.ReactNativeWebView.postMessage('height:' + String(height));
    }
  }

  function scheduleMeasurements() {
    setTimeout(nextHeight, 0);
    setTimeout(nextHeight, 60);
    setTimeout(nextHeight, 180);
    setTimeout(nextHeight, 420);
  }

  var observer = new MutationObserver(function() {
    nextHeight();
  });

  observer.observe(document.documentElement || document.body, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });

  window.addEventListener('load', scheduleMeasurements);
  window.addEventListener('resize', nextHeight);

  scheduleMeasurements();
})();
true;
`;

export default function MarkdownWebViewBubble({
  markdown,
  themeTokens,
  onOpenExternalLink,
  onMeasuredHeight,
  cacheKey,
}) {
  const [height, setHeight] = useState(MIN_HEIGHT);
  const heightRef = useRef(MIN_HEIGHT);

  const html = useMemo(() => buildHtml(markdown, themeTokens), [markdown, themeTokens]);

  const handleMessage = useCallback(
    (event) => {
      const raw = String(event?.nativeEvent?.data ?? '');
      if (!raw.startsWith('height:')) return;
      const parsed = Number(raw.slice('height:'.length));
      if (!Number.isFinite(parsed)) return;

      const nextHeight = Math.max(MIN_HEIGHT, Math.ceil(parsed));
      if (nextHeight === heightRef.current) return;

      heightRef.current = nextHeight;
      setHeight(nextHeight);
      onMeasuredHeight?.(nextHeight);
    },
    [onMeasuredHeight],
  );

  const handleShouldStartLoad = useCallback(
    (request) => {
      const url = String(request?.url ?? '').trim();
      if (!url || url.startsWith('about:blank')) {
        return true;
      }

      onOpenExternalLink?.(url);
      return false;
    },
    [onOpenExternalLink],
  );

  return (
    <View style={[styles.container, { height }]}> 
      <WebView
        key={cacheKey}
        source={{ html, baseUrl: 'about:blank' }}
        originWhitelist={['*']}
        style={styles.webview}
        containerStyle={styles.webviewContainer}
        injectedJavaScript={injectedBridgeScript}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        scrollEnabled={false}
        bounces={false}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
    minHeight: MIN_HEIGHT,
    alignSelf: 'stretch',
  },
  webview: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  webviewContainer: {
    backgroundColor: 'transparent',
  },
});
