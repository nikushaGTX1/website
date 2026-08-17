interface PersistentCacheRecord<T = unknown> {
  id: string;
  value: T;
  expiresAt: number;
}

const DATABASE_NAME = 'velven-persistent-data';
const DATABASE_VERSION = 1;
const STORE_NAME = 'entries';
let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionFinished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Persistent, structured-clone cache for large location and map geometry data. */
export class PersistentDataCache {
  constructor(
    private readonly namespace: string,
    private readonly maxAgeMs: number,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    if (typeof indexedDB === 'undefined') return undefined;
    try {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const record = await requestResult(
        transaction.objectStore(STORE_NAME).get(this.cacheId(key)),
      ) as PersistentCacheRecord<T> | undefined;
      if (!record) return undefined;
      if (record.expiresAt > Date.now()) return record.value;
      await this.delete(key);
    } catch {
      // Browsers can disable IndexedDB or reject writes in private mode. The
      // caller simply falls back to the normal network request in that case.
    }
    return undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        id: this.cacheId(key),
        value,
        expiresAt: Date.now() + this.maxAgeMs,
      } satisfies PersistentCacheRecord<T>);
      await transactionFinished(transaction);
    } catch {
      // A full storage quota must never prevent the map from working.
    }
  }

  private async delete(key: string): Promise<void> {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(this.cacheId(key));
    await transactionFinished(transaction);
  }

  private cacheId(key: string): string {
    return `${this.namespace}:${key}`;
  }
}
