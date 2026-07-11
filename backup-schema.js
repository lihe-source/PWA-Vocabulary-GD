const COLLECTION_KEYS = [
  'words', 'history', 'sentences', 'imported', 'boosted',
  'readingQuizHistory', 'essayHistory', 'aiAskHistory'
];

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export const BackupSchema = {
  schemaVersion: 7,
  collectionKeys: COLLECTION_KEYS,

  normalize(data = {}) {
    const source = data.collections && typeof data.collections === 'object' ? data.collections : data;
    return {
      words: safeArray(source.words),
      history: safeArray(source.history),
      sentences: safeArray(source.sentences),
      imported: safeArray(source.imported),
      boosted: safeArray(source.boosted),
      readingQuizHistory: safeArray(source.readingQuizHistory),
      essayHistory: safeArray(source.essayHistory),
      aiAskHistory: safeArray(source.aiAskHistory)
    };
  },

  counts(data = {}) {
    const c = this.normalize(data);
    const reading = c.readingQuizHistory.reduce((sum, h) => sum + safeArray(h?.sessions).length, 0);
    const essay = c.essayHistory.reduce((sum, h) => sum + safeArray(h?.sessions).length, 0);
    const counts = {
      words: c.words.length,
      examples: c.sentences.length + c.imported.length,
      practice: c.history.length,
      boosted: c.boosted.length,
      reading,
      essay,
      aiAsk: c.aiAskHistory.length
    };
    counts.total = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);
    return counts;
  },

  hashes(data = {}) {
    const collections = this.normalize(data);
    return Object.fromEntries(COLLECTION_KEYS.map(key => [key, hashString(stableStringify(collections[key]))]));
  },

  checksum(data = {}) {
    return hashString(stableStringify(this.normalize(data)));
  },

  validate(data) {
    if (!data || typeof data !== 'object') return { valid: false, reason: 'INVALID_OBJECT' };
    const collections = this.normalize(data);
    const hasRecognizedCollection = COLLECTION_KEYS.some(key => Array.isArray((data.collections || data)[key]));
    if (!hasRecognizedCollection) return { valid: false, reason: 'NO_COLLECTIONS' };
    if (data.schemaVersion && Number(data.schemaVersion) >= 7 && data.payloadChecksum) {
      const actual = this.checksum(collections);
      if (actual !== data.payloadChecksum) return { valid: false, reason: 'CHECKSUM_MISMATCH', actual };
    }
    return { valid: true, collections, legacy: !data.schemaVersion || Number(data.schemaVersion) < 7 };
  },

  attach(collections, { appVersion, deviceId, revision } = {}) {
    const normalized = this.normalize(collections);
    const now = new Date().toISOString();
    const backupId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const metadata = {
      schemaVersion: 7,
      backupId,
      deviceId: deviceId || 'unknown-device',
      revision: revision || Date.now(),
      createdAt: now,
      updatedAt: now,
      appVersion: appVersion || '',
      collectionCounts: this.counts(normalized),
      collectionHashes: this.hashes(normalized),
      payloadChecksum: this.checksum(normalized)
    };
    // Keep collections at the top level for V6 restore compatibility without duplicating the payload.
    return { ...normalized, ...metadata };
  },

  compare(localData, cloudData) {
    const localCounts = this.counts(localData);
    const cloudCounts = this.counts(cloudData);
    const keys = ['words', 'examples', 'practice', 'boosted', 'reading', 'essay', 'aiAsk'];
    const cloudLess = keys.some(key => (cloudCounts[key] || 0) < (localCounts[key] || 0));
    const cloudMore = keys.some(key => (cloudCounts[key] || 0) > (localCounts[key] || 0));
    const sameCounts = keys.every(key => (cloudCounts[key] || 0) === (localCounts[key] || 0));
    const localHash = this.checksum(localData);
    const cloudHash = this.checksum(cloudData);
    return {
      localCounts,
      cloudCounts,
      localHash,
      cloudHash,
      same: sameCounts && localHash === cloudHash,
      conflict: (cloudLess && cloudMore) || (sameCounts && localHash !== cloudHash),
      cloudIsStrictSuperset: cloudMore && !cloudLess
    };
  }
};
