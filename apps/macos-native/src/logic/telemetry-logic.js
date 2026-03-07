import {
  DEFAULT_TELEMETRY_COUNTERS,
  DEFAULT_TELEMETRY_SNAPSHOT,
} from './app-constants';
import { normalizeText } from './shared-logic';

export function normalizeTelemetrySnapshot(rawSnapshot, profiles = []) {
  const source =
    rawSnapshot && typeof rawSnapshot === 'object' ? rawSnapshot : DEFAULT_TELEMETRY_SNAPSHOT;
  const sourceTotals =
    source.totals && typeof source.totals === 'object' ? source.totals : DEFAULT_TELEMETRY_COUNTERS;
  const sourceByGatewayId =
    source.byGatewayId && typeof source.byGatewayId === 'object' ? source.byGatewayId : {};

  const knownGatewayIds = new Set(
    profiles.map((profile) => String(profile?.id ?? '').trim()).filter(Boolean),
  );
  const byGatewayId = {};
  knownGatewayIds.forEach((gatewayId) => {
    const gatewayCounters =
      sourceByGatewayId[gatewayId] && typeof sourceByGatewayId[gatewayId] === 'object'
        ? sourceByGatewayId[gatewayId]
        : {};
    byGatewayId[gatewayId] = Object.fromEntries(
      Object.keys(DEFAULT_TELEMETRY_COUNTERS).map((key) => {
        const value = Number(gatewayCounters[key] ?? 0);
        return [key, Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0];
      }),
    );
  });

  const totals = Object.fromEntries(
    Object.keys(DEFAULT_TELEMETRY_COUNTERS).map((key) => {
      const value = Number(sourceTotals[key] ?? 0);
      return [key, Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0];
    }),
  );

  const lastUpdatedAt = Number(source.lastUpdatedAt ?? 0);
  return {
    lastUpdatedAt:
      Number.isFinite(lastUpdatedAt) && lastUpdatedAt > 0 ? Math.trunc(lastUpdatedAt) : null,
    totals,
    byGatewayId,
  };
}

export function applyTelemetryEvent(previousSnapshot, gatewayId, eventName) {
  if (!eventName || !(eventName in DEFAULT_TELEMETRY_COUNTERS)) return previousSnapshot;
  const normalizedGatewayId = normalizeText(gatewayId);
  if (!normalizedGatewayId) return previousSnapshot;

  const previous =
    previousSnapshot && typeof previousSnapshot === 'object'
      ? previousSnapshot
      : DEFAULT_TELEMETRY_SNAPSHOT;
  const previousTotals =
    previous.totals && typeof previous.totals === 'object'
      ? previous.totals
      : DEFAULT_TELEMETRY_COUNTERS;
  const previousByGatewayId =
    previous.byGatewayId && typeof previous.byGatewayId === 'object' ? previous.byGatewayId : {};
  const currentGatewayCounters =
    previousByGatewayId[normalizedGatewayId] &&
    typeof previousByGatewayId[normalizedGatewayId] === 'object'
      ? previousByGatewayId[normalizedGatewayId]
      : DEFAULT_TELEMETRY_COUNTERS;

  const nextGatewayCounters = {
    ...DEFAULT_TELEMETRY_COUNTERS,
    ...currentGatewayCounters,
    [eventName]: Math.max(0, Number(currentGatewayCounters[eventName] ?? 0)) + 1,
  };

  return {
    lastUpdatedAt: Date.now(),
    totals: {
      ...DEFAULT_TELEMETRY_COUNTERS,
      ...previousTotals,
      [eventName]: Math.max(0, Number(previousTotals[eventName] ?? 0)) + 1,
    },
    byGatewayId: {
      ...previousByGatewayId,
      [normalizedGatewayId]: nextGatewayCounters,
    },
  };
}
