import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type DebugInfoPanelProps = {
  isDarkTheme: boolean;
  connectionState: string;
  gatewayEventState: string;
  activeSessionKey: string;
  activeRunId: string | null;
  historyLastSyncedAt: number | null;
  isStartupAutoConnecting: boolean;
  startupAutoConnectAttempt: number;
};

function formatSyncLabel(timestamp: number | null): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function DebugInfoPanel({
  isDarkTheme,
  connectionState,
  gatewayEventState,
  activeSessionKey,
  activeRunId,
  historyLastSyncedAt,
  isStartupAutoConnecting,
  startupAutoConnectAttempt,
}: DebugInfoPanelProps) {
  const styles = useMemo(() => createStyles(isDarkTheme), [isDarkTheme]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Debug Info</Text>
      <View style={styles.grid}>
        <Text style={styles.label}>Connection</Text>
        <Text style={styles.value}>{connectionState}</Text>

        <Text style={styles.label}>Gateway event</Text>
        <Text style={styles.value}>{gatewayEventState}</Text>

        <Text style={styles.label}>Session</Text>
        <Text style={styles.value} numberOfLines={1}>
          {activeSessionKey || '-'}
        </Text>

        <Text style={styles.label}>Run ID</Text>
        <Text style={styles.value} numberOfLines={1}>
          {activeRunId || '-'}
        </Text>

        <Text style={styles.label}>History sync</Text>
        <Text style={styles.value}>{formatSyncLabel(historyLastSyncedAt)}</Text>

        <Text style={styles.label}>Auto connect</Text>
        <Text style={styles.value}>
          {isStartupAutoConnecting
            ? `running (attempt ${startupAutoConnectAttempt})`
            : startupAutoConnectAttempt > 0
              ? `idle (attempt ${startupAutoConnectAttempt})`
              : 'idle'}
        </Text>
      </View>
    </View>
  );
}

function createStyles(isDarkTheme: boolean) {
  return StyleSheet.create({
    container: {
      marginTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      paddingTop: 10,
    },
    title: {
      fontSize: 12,
      fontWeight: '700',
      color: isDarkTheme ? '#dbe7ff' : '#374151',
      marginBottom: 6,
    },
    grid: {
      rowGap: 4,
      columnGap: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    label: {
      width: 96,
      fontSize: 10,
      color: isDarkTheme ? '#9eb1d2' : '#70706A',
      fontWeight: '600',
    },
    value: {
      flexGrow: 1,
      flexShrink: 1,
      fontSize: 10,
      color: isDarkTheme ? '#f8fbff' : '#1A1A1A',
    },
  });
}

export default memo(DebugInfoPanel);
