import { useEffect } from 'react';
import {
  buildOutboxQueuedTurnsBySession,
  resolveRestoredActiveSessionKey,
} from './runtime-effects-helpers';
import type { UseRuntimePersistenceEffectsInput } from './runtime-effects.types';

export function useRuntimePersistenceEffects(input: UseRuntimePersistenceEffectsInput) {
  useEffect(() => {
    let alive = true;

    const loadLocalState = async () => {
      try {
        const [savedIdentity, savedSessionKey, savedSessionPrefs, savedOutboxQueue] =
          await Promise.all([
            input.kvStore.getItemAsync(input.identityStorageKey),
            input.kvStore.getItemAsync(input.sessionKeyStorageKey),
            input.kvStore.getItemAsync(input.sessionPrefsStorageKey),
            input.kvStore.getItemAsync(input.outboxQueueStorageKey),
          ]);
        if (!alive) return;

        if (savedSessionKey?.trim()) {
          input.setActiveSessionKey(savedSessionKey.trim());
        }
        input.setSessionPreferences(input.parseSessionPreferences(savedSessionPrefs));
        const restoredOutbox = input.parseOutboxQueue(savedOutboxQueue);
        if (restoredOutbox.length > 0) {
          input.setOutboxQueue(restoredOutbox);
          input.setGatewayEventState('queued');

          const turnsBySession = buildOutboxQueuedTurnsBySession(restoredOutbox);
          turnsBySession.forEach((turns, sessionKey) => {
            input.sessionTurnsRef.current.set(sessionKey, turns);
          });

          const restoredActiveSessionKey = resolveRestoredActiveSessionKey({
            savedSessionKey,
            activeSessionKeyRefValue: input.activeSessionKeyRef.current,
            defaultSessionKey: input.defaultSessionKey,
          });
          const restoredActiveTurns = turnsBySession.get(restoredActiveSessionKey);
          if (restoredActiveTurns?.length) {
            input.setChatTurns(
              [...restoredActiveTurns].sort((a, b) => a.createdAt - b.createdAt),
            );
          }
        }
        if (savedIdentity) {
          input.openClawIdentityMemory.set(input.identityStorageKey, savedIdentity);
        }
      } catch {
        // ignore load errors
      } finally {
        if (alive) {
          input.setLocalStateReady(true);
        }
      }
    };

    void loadLocalState();
    return () => {
      alive = false;
    };
  }, [
    input.activeSessionKeyRef,
    input.defaultSessionKey,
    input.identityStorageKey,
    input.kvStore,
    input.openClawIdentityMemory,
    input.outboxQueueStorageKey,
    input.parseOutboxQueue,
    input.parseSessionPreferences,
    input.sessionKeyStorageKey,
    input.sessionPrefsStorageKey,
    input.sessionTurnsRef,
    input.setActiveSessionKey,
    input.setChatTurns,
    input.setGatewayEventState,
    input.setLocalStateReady,
    input.setOutboxQueue,
    input.setSessionPreferences,
  ]);

  useEffect(() => {
    if (!input.settingsReady) return;
    const sessionKey = input.activeSessionKey.trim();
    input.persistRuntimeSetting(async () => {
      if (sessionKey) {
        await input.kvStore.setItemAsync(input.sessionKeyStorageKey, sessionKey);
      } else {
        await input.kvStore.deleteItemAsync(input.sessionKeyStorageKey);
      }
    });
  }, [
    input.activeSessionKey,
    input.kvStore,
    input.persistRuntimeSetting,
    input.sessionKeyStorageKey,
    input.settingsReady,
  ]);

  useEffect(() => {
    if (!input.settingsReady) return;
    input.persistRuntimeSetting(async () => {
      const entries = Object.entries(input.sessionPreferences);
      if (entries.length === 0) {
        await input.kvStore.deleteItemAsync(input.sessionPrefsStorageKey);
        return;
      }
      await input.kvStore.setItemAsync(
        input.sessionPrefsStorageKey,
        JSON.stringify(input.sessionPreferences),
      );
    });
  }, [
    input.kvStore,
    input.persistRuntimeSetting,
    input.sessionPreferences,
    input.sessionPrefsStorageKey,
    input.settingsReady,
  ]);

  useEffect(() => {
    if (!input.settingsReady) return;
    input.persistRuntimeSetting(async () => {
      if (input.outboxQueue.length === 0) {
        await input.kvStore.deleteItemAsync(input.outboxQueueStorageKey);
        return;
      }
      await input.kvStore.setItemAsync(
        input.outboxQueueStorageKey,
        JSON.stringify(input.outboxQueue),
      );
    });
  }, [
    input.kvStore,
    input.outboxQueue,
    input.outboxQueueStorageKey,
    input.persistRuntimeSetting,
    input.settingsReady,
  ]);
}
