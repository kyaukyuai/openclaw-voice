import type { KeyValueStore } from '../types';

type SecureStoreModule = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

type FileSystemModule = {
  documentDirectory: string | null;
  readAsStringAsync: (uri: string) => Promise<string>;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
};

let cachedStore: KeyValueStore | null = null;

function createMemoryStore(): KeyValueStore {
  const memory = new Map<string, string>();
  return {
    async getItemAsync(key) {
      return memory.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      memory.set(key, value);
    },
    async deleteItemAsync(key) {
      memory.delete(key);
    },
  };
}

function resolveSecureStoreModule(): SecureStoreModule | null {
  try {
    return require('expo-secure-store') as SecureStoreModule;
  } catch {
    return null;
  }
}

function resolveFileSystemModule(): FileSystemModule | null {
  try {
    return require('expo-file-system') as FileSystemModule;
  } catch {
    return null;
  }
}

function createFileBackedStore(fileSystem: FileSystemModule): KeyValueStore {
  const baseDir = fileSystem.documentDirectory;
  if (!baseDir) {
    return createMemoryStore();
  }

  const storageFilePath = `${baseDir}openclaw-pocket-kv.json`;
  let loaded = false;
  let cache: Record<string, string> = {};

  const ensureLoaded = async () => {
    if (loaded) return;
    try {
      const raw = await fileSystem.readAsStringAsync(storageFilePath);
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cache = Object.entries(parsed as Record<string, unknown>).reduce<
          Record<string, string>
        >((next, [key, value]) => {
          if (typeof value === 'string') {
            next[key] = value;
          }
          return next;
        }, {});
      } else {
        cache = {};
      }
    } catch {
      cache = {};
    } finally {
      loaded = true;
    }
  };

  const persist = async () => {
    try {
      await fileSystem.writeAsStringAsync(storageFilePath, JSON.stringify(cache));
    } catch {
      // Ignore persistence errors and keep in-memory cache.
    }
  };

  return {
    async getItemAsync(key) {
      await ensureLoaded();
      return cache[key] ?? null;
    },
    async setItemAsync(key, value) {
      await ensureLoaded();
      cache[key] = value;
      await persist();
    },
    async deleteItemAsync(key) {
      await ensureLoaded();
      if (key in cache) {
        delete cache[key];
        await persist();
      }
    },
  };
}

function createPersistentFallbackStore(): KeyValueStore {
  const fileSystem = resolveFileSystemModule();
  if (fileSystem) {
    return createFileBackedStore(fileSystem);
  }
  return createMemoryStore();
}

function createHybridStore(
  secureStore: SecureStoreModule | null,
  fallbackStore: KeyValueStore,
): KeyValueStore {
  return {
    async getItemAsync(key) {
      if (secureStore) {
        try {
          const secureValue = await secureStore.getItemAsync(key);
          if (secureValue !== null) {
            return secureValue;
          }
        } catch {
          // Fallback read below.
        }
      }
      return fallbackStore.getItemAsync(key);
    },
    async setItemAsync(key, value) {
      if (secureStore) {
        try {
          await secureStore.setItemAsync(key, value);
        } catch {
          // Keep fallback persistence as a safety net.
        }
      }
      await fallbackStore.setItemAsync(key, value);
    },
    async deleteItemAsync(key) {
      if (secureStore) {
        try {
          await secureStore.deleteItemAsync(key);
        } catch {
          // Keep fallback cleanup as a safety net.
        }
      }
      await fallbackStore.deleteItemAsync(key);
    },
  };
}

export function getKvStore(): KeyValueStore {
  if (cachedStore) {
    return cachedStore;
  }
  const fallbackStore = createPersistentFallbackStore();
  const secureStore = resolveSecureStoreModule();
  cachedStore = createHybridStore(secureStore, fallbackStore);
  return cachedStore;
}
