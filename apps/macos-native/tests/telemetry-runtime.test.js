/* global describe, test, expect */

const {
  applyTelemetryEvent,
  normalizeTelemetrySnapshot,
} = require('../src/logic/app-logic');

describe('macOS telemetry runtime logic', () => {
  test('normalizeTelemetrySnapshot keeps counters for known gateways only', () => {
    const profiles = [{ id: 'gateway-a' }, { id: 'gateway-b' }];
    const snapshot = normalizeTelemetrySnapshot(
      {
        lastUpdatedAt: 1234567890,
        totals: {
          connectAttempts: 2,
          sendAttempts: 3,
        },
        byGatewayId: {
          'gateway-a': {
            connectAttempts: 1,
            sendAttempts: 2,
          },
          'gateway-unknown': {
            connectAttempts: 999,
          },
        },
      },
      profiles,
    );

    expect(snapshot.lastUpdatedAt).toBe(1234567890);
    expect(snapshot.totals.connectAttempts).toBe(2);
    expect(snapshot.totals.sendAttempts).toBe(3);
    expect(Object.keys(snapshot.byGatewayId)).toEqual(['gateway-a', 'gateway-b']);
    expect(snapshot.byGatewayId['gateway-a'].connectAttempts).toBe(1);
    expect(snapshot.byGatewayId['gateway-b'].connectAttempts).toBe(0);
  });

  test('applyTelemetryEvent increments totals and per-gateway counters', () => {
    const initial = normalizeTelemetrySnapshot(
      {
        totals: {
          sendAttempts: 1,
        },
        byGatewayId: {
          'gateway-a': {
            sendAttempts: 2,
          },
        },
      },
      [{ id: 'gateway-a' }],
    );

    const next = applyTelemetryEvent(initial, 'gateway-a', 'sendAttempts');
    expect(next.totals.sendAttempts).toBe(2);
    expect(next.byGatewayId['gateway-a'].sendAttempts).toBe(3);
    expect(typeof next.lastUpdatedAt).toBe('number');
    expect(next.lastUpdatedAt).toBeGreaterThan(0);
  });

  test('applyTelemetryEvent returns previous snapshot for invalid event or gateway', () => {
    const previous = normalizeTelemetrySnapshot(null, [{ id: 'gateway-a' }]);
    const invalidEvent = applyTelemetryEvent(previous, 'gateway-a', 'unknown-event');
    const invalidGateway = applyTelemetryEvent(previous, '', 'sendAttempts');
    expect(invalidEvent).toBe(previous);
    expect(invalidGateway).toBe(previous);
  });
});
