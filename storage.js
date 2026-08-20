const DB_NAME = 'pwa_vocabulary_v7';
const DB_VERSION = 1;
const KV_STORE = 'kv';
const SNAPSHOT_STORE = 'snapshots';

const INDEXED_KEYS = new Set([
  'vocabWords',
  'practiceHistory',
  'readingQuizHistory',
  'essayHistory',
  'aiAskHistory',
  'studyActivityDays',
  'sentenceLog',
  'importedSentences',
  'boostedWords',
  'todaySentence',
  'geminiApiKey'
]);

class StorageBridge {
  constructor() {
    this.cache = new Map();
    this.db = null;
    this.ready = false;
    this.pending = new Set();
    this.fallback = false;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) this.cache.set(key, localStorage.getItem(key));
      }
    } catch {
      this.fallback = true;
    }
  }

  async init() {
    if (this.ready) return this.getStatus();
    try {
      this.db = await this._open();

      // V7.2.2: load all IndexedDB values in one readonly transaction instead of
      // opening a separate transaction for every key. This is noticeably faster
      // on iOS/PWA startup, especially after the OS has suspended the app.
      const records = await this._getAllRecords();
      const recordMap = new Map(records.map(record => [record.key, record]));
      const migrations = [];

      for (const key of INDEXED_KEYS) {
        const record = recordMap.get(key);
        const legacy = this._localGet(key);
        if (record && typeof record.value === 'string') {
          this.cache.set(key, record.value);
        } else if (legacy !== null) {
          this.cache.set(key, legacy);
          migrations.push([key, legacy]);
        }
      }

      if (migrations.length) await this._putRecords(migrations);
      for (const key of INDEXED_KEYS) {
        if (this.cache.has(key)) this._localRemove(key);
      }

      // Remove legacy OAuth access tokens left by V6.6. Account identity remains remembered.
      this._localRemove('gdriveToken');
      this._localRemove('gdriveExpiry');
      try { sessionStorage.removeItem('gdriveToken'); sessionStorage.removeItem('gdriveExpiry'); } catch {}
      this._localSet('storageSchemaVersion', '8');
      this._localSet('storageMigratedAt', new Date().toISOString());
      this.ready = true;
      return this.getStatus();
    } catch (error) {
      console.warn('[StorageBridge] IndexedDB unavailable; using localStorage fallback.', error);
      this.fallback = true;
      this.ready = true;
      return this.getStatus();
    }
  }

  getStatus() {
    return {
      ready: this.ready,
      mode: this.db && !this.fallback ? 'indexeddb' : 'localstorage-fallback',
      schemaVersion: 8
    };
  }

  getItem(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const value = this._localGet(key);
    if (value !== null) this.cache.set(key, value);
    return value;
  }

  setItem(key, value) {
    const stringValue = String(value);
    this.cache.set(key, stringValue);
    if (INDEXED_KEYS.has(key) && this.db && !this.fallback) {
      this._queue(this._putRecord(key, stringValue));
      this._localRemove(key);
      return;
    }
    this._localSet(key, stringValue);
  }

  removeItem(key) {
    this.cache.delete(key);
    this._localRemove(key);
    if (INDEXED_KEYS.has(key) && this.db && !this.fallback) {
      this._queue(this._deleteRecord(key));
    }
  }

  clear() {
    this.cache.clear();
    try { localStorage.clear(); } catch {}
    if (this.db && !this.fallback) {
      const tx = this.db.transaction([KV_STORE, SNAPSHOT_STORE], 'readwrite');
      tx.objectStore(KV_STORE).clear();
      tx.objectStore(SNAPSHOT_STORE).clear();
    }
  }

  async flush() {
    await Promise.allSettled([...this.pending]);
  }

  async setItemsBatch(entries) {
    const pairs = Array.isArray(entries) ? entries : Object.entries(entries || {});
    if (!pairs.length) return;

    const indexed = [];
    const local = [];
    for (const [key, value] of pairs) {
      const stringValue = String(value);
      this.cache.set(key, stringValue);
      if (INDEXED_KEYS.has(key) && this.db && !this.fallback) indexed.push([key, stringValue]);
      else local.push([key, stringValue]);
    }

    for (const [key, value] of local) this._localSet(key, value);
    if (indexed.length) {
      await this._putRecords(indexed);
      for (const [key] of indexed) this._localRemove(key);
    }
  }

  async createRecoverySnapshot(payload, reason = 'manual') {
    if (!this.db || this.fallback) return null;
    const id = `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const record = {
      id,
      reason,
      createdAt: new Date().toISOString(),
      payload
    };
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(SNAPSHOT_STORE, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    await this._trimSnapshots(5);
    return record;
  }

  async listRecoverySnapshots() {
    if (!this.db || this.fallback) return [];
    return new Promise(resolve => {
      const tx = this.db.transaction(SNAPSHOT_STORE, 'readonly');
      const req = tx.objectStore(SNAPSHOT_STORE).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      req.onerror = () => resolve([]);
    });
  }

  _queue(promise) {
    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise));
  }

  _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('INDEXEDDB_BLOCKED'));
    });
  }

  _getRecord(key) {
    return new Promise(resolve => {
      const tx = this.db.transaction(KV_STORE, 'readonly');
      const req = tx.objectStore(KV_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  _getAllRecords() {
    return new Promise(resolve => {
      const tx = this.db.transaction(KV_STORE, 'readonly');
      const req = tx.objectStore(KV_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  _putRecords(entries) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(KV_STORE, 'readwrite');
      const store = tx.objectStore(KV_STORE);
      const updatedAt = new Date().toISOString();
      for (const [key, value] of entries) store.put({ key, value, updatedAt });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  _putRecord(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(KV_STORE, 'readwrite');
      tx.objectStore(KV_STORE).put({ key, value, updatedAt: new Date().toISOString() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  _deleteRecord(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(KV_STORE, 'readwrite');
      tx.objectStore(KV_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async _trimSnapshots(limit) {
    const snapshots = await this.listRecoverySnapshots();
    const extras = snapshots.slice(limit);
    if (!extras.length) return;
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(SNAPSHOT_STORE, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_STORE);
      extras.forEach(item => store.delete(item.id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  _localGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  _localSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }

  _localRemove(key) {
    try { localStorage.removeItem(key); } catch {}
  }
}

export const AppStorage = new StorageBridge();
