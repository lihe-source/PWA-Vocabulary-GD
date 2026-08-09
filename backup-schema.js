const LEGACY_COLLECTION_KEYS = [
  'words', 'history', 'sentences', 'imported', 'boosted',
  'readingQuizHistory', 'essayHistory', 'aiAskHistory'
];
const COLLECTION_KEYS = [...LEGACY_COLLECTION_KEYS, 'studyDays'];

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
  schemaVersion: 8,
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
      aiAskHistory: safeArray(source.aiAskHistory),
      studyDays: safeArray(source.studyDays)
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
      aiAsk: c.aiAskHistory.length,
      studyDays: c.studyDays.length
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

  legacyChecksum(data = {}) {
    const normalized = this.normalize(data);
    const legacy = Object.fromEntries(LEGACY_COLLECTION_KEYS.map(key => [key, normalized[key]]));
    return hashString(stableStringify(legacy));
  },

  validate(data) {
    if (!data || typeof data !== 'object') return { valid: false, reason: 'INVALID_OBJECT' };
    const collections = this.normalize(data);
    const hasRecognizedCollection = COLLECTION_KEYS.some(key => Array.isArray((data.collections || data)[key]));
    if (!hasRecognizedCollection) return { valid: false, reason: 'NO_COLLECTIONS' };
    const schemaVersion = Number(data.schemaVersion) || 0;
    if (schemaVersion >= 7 && data.payloadChecksum) {
      const actual = schemaVersion >= 8 ? this.checksum(collections) : this.legacyChecksum(collections);
      if (actual !== data.payloadChecksum) return { valid: false, reason: 'CHECKSUM_MISMATCH', actual };
    }
    return { valid: true, collections, legacy: schemaVersion < 8, sourceSchemaVersion: schemaVersion };
  },

  attach(collections, { appVersion, deviceId, revision } = {}) {
    const normalized = this.normalize(collections);
    const now = new Date().toISOString();
    const backupId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const metadata = {
      schemaVersion: 8,
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
    if ((Number(localData?.schemaVersion) || 0) >= 8 && (Number(cloudData?.schemaVersion) || 0) >= 8) {
      keys.push('studyDays');
    }
    const cloudLess = keys.some(key => (cloudCounts[key] || 0) < (localCounts[key] || 0));
    const cloudMore = keys.some(key => (cloudCounts[key] || 0) > (localCounts[key] || 0));
    const sameCounts = keys.every(key => (cloudCounts[key] || 0) === (localCounts[key] || 0));
    const compareLegacy = (Number(localData?.schemaVersion) || 0) < 8 || (Number(cloudData?.schemaVersion) || 0) < 8;
    const localHash = compareLegacy ? this.legacyChecksum(localData) : this.checksum(localData);
    const cloudHash = compareLegacy ? this.legacyChecksum(cloudData) : this.checksum(cloudData);
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
