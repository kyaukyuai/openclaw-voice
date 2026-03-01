import { useCallback } from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import { DEFAULT_TELEMETRY_SNAPSHOT } from '../logic/app-constants';
import { applyTelemetryEvent, normalizeTelemetrySnapshot } from '../logic/app-logic';

export default function useMacosTelemetryRuntime({
  gatewayProfiles,
  setTelemetrySnapshot,
  telemetrySnapshot,
}) {
  const telemetry = normalizeTelemetrySnapshot(telemetrySnapshot, gatewayProfiles);

  const recordTelemetryEvent = useCallback(
    (gatewayId, eventName) => {
      setTelemetrySnapshot((previous) => applyTelemetryEvent(previous, gatewayId, eventName));
    },
    [setTelemetrySnapshot],
  );

  const resetTelemetry = useCallback(() => {
    setTelemetrySnapshot(normalizeTelemetrySnapshot(DEFAULT_TELEMETRY_SNAPSHOT, gatewayProfiles));
  }, [gatewayProfiles, setTelemetrySnapshot]);

  const copyTelemetryReport = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      telemetry,
    };
    Clipboard.setString(JSON.stringify(payload, null, 2));
  }, [telemetry]);

  return {
    copyTelemetryReport,
    recordTelemetryEvent,
    resetTelemetry,
    telemetry,
  };
}
