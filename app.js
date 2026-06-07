// ===========================
// 英文單字複習 PWA - app.js V6_1
// 更新：設定頁折疊資訊、順序重排與快速捲動按鈕
// ===========================

const APP_VERSION = 'V6_1';
const APP_DISPLAY_VERSION = 'V6.1';
const APP_CACHE_VERSION = 'Voc-PWA-V6_1';

// Register Service Worker only when supported (prevents errors in unsupported browsers / webviews).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SW_UPDATED') {
      setTimeout(() => showToast('🔄 已更新至最新版本', 3500), 500);
    }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ===== Web Audio Sound Effects =====
const Sound = {
  ctx: null,
  // Create or return AudioContext
  _getCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  },
  // Unlock / prime — call this from a direct user-gesture handler
  unlock() {
    try {
      const ctx = this._getCtx();
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    } catch(e) {}
  },
  // Schedule audio only AFTER context is confirmed running (handles async resume)
  _withCtx(fn) {
    try {
      const ctx = this._getCtx();
      if (ctx.state === 'running') {
        fn(ctx);
      } else {
        // Context is suspended — resume first, then play
        ctx.resume().then(() => fn(ctx)).catch(() => {});
      }
    } catch(e) {}
  },
  playCorrect() {
    this._withCtx(ctx => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sine';
      o.frequency.setValueAtTime(523, ctx.currentTime);
      o.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      o.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
      g.gain.setValueAtTime(0.4, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.5);
    });
  },
  playWrong() {
    this._withCtx(ctx => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sawtooth';
      o.frequency.setValueAtTime(200, ctx.currentTime);
      o.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.3);
    });
  },
  // pct: 0-100 → play tiered result fanfare
  playResult(pct) {
    this._withCtx(ctx => {
      const t = ctx.currentTime;
      if (pct === 100) {
        // Perfect: bright 5-note ascending fanfare + shimmer
        const notes = [523,659,784,1047,1319];
        notes.forEach((freq, i) => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination); o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0, t + i*0.1);
          g.gain.linearRampToValueAtTime(0.35, t + i*0.1 + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t + i*0.1 + 0.35);
          o.start(t + i*0.1); o.stop(t + i*0.1 + 0.4);
        });
      } else if (pct >= 80) {
        // Great: cheerful 4-note arpeggio
        const notes = [523,659,784,1047];
        notes.forEach((freq, i) => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination); o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.3, t + i*0.1);
          g.gain.exponentialRampToValueAtTime(0.001, t + i*0.1 + 0.3);
          o.start(t + i*0.1); o.stop(t + i*0.1 + 0.35);
        });
      } else if (pct >= 60) {
        // Good: 3-note upward
        [523, 659, 784].forEach((freq, i) => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination); o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.28, t + i*0.12);
          g.gain.exponentialRampToValueAtTime(0.001, t + i*0.12 + 0.3);
          o.start(t + i*0.12); o.stop(t + i*0.12 + 0.35);
        });
      } else if (pct >= 40) {
        // OK: simple 2-note neutral
        [440, 523].forEach((freq, i) => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination); o.type = 'sine';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.25, t + i*0.15);
          g.gain.exponentialRampToValueAtTime(0.001, t + i*0.15 + 0.3);
          o.start(t + i*0.15); o.stop(t + i*0.15 + 0.35);
        });
      } else if (pct >= 20) {
        // Poor: descending 2 notes
        [392, 330].forEach((freq, i) => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination); o.type = 'triangle';
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.22, t + i*0.18);
          g.gain.exponentialRampToValueAtTime(0.001, t + i*0.18 + 0.35);
          o.start(t + i*0.18); o.stop(t + i*0.18 + 0.4);
        });
      } else {
        // 0%: low descending tone
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.type = 'sawtooth';
        o.frequency.setValueAtTime(280, t);
        o.frequency.linearRampToValueAtTime(180, t + 0.4);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.start(t); o.stop(t + 0.55);
      }
    });
  }
};

// ===== ECDICT IndexedDB Module =====
const ECDICT = {
  DB_NAME: 'ecdict_db', DB_VERSION: 1,
  STORE_NAME: 'words', META_NAME: 'meta',
  _db: null,
  async openDB() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'word' }).createIndex('word', 'word', { unique: true });
        }
        if (!db.objectStoreNames.contains(this.META_NAME)) db.createObjectStore(this.META_NAME, { keyPath: 'key' });
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },
  async getMeta() {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(this.META_NAME, 'readonly');
        const req = tx.objectStore(this.META_NAME).get('info');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  },
  async saveMeta(info) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.META_NAME, 'readwrite');
      tx.objectStore(this.META_NAME).put({ key: 'info', ...info });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  },
  async clearAll() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.STORE_NAME, this.META_NAME], 'readwrite');
      tx.objectStore(this.STORE_NAME).clear(); tx.objectStore(this.META_NAME).clear();
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  },
  // Parse full CSV text into records, correctly handling quoted fields with embedded newlines
  _parseCSVRecords(text) {
    const records = [];
    let i = 0; const n = text.length;
    let fields = []; let cur = ''; let inQ = false;
    while (i < n) {
      const ch = text[i];
      if (ch === '"') {
        if (inQ && text[i+1] === '"') { cur += '"'; i += 2; continue; }
        inQ = !inQ; i++; continue;
      }
      if (ch === ',' && !inQ) { fields.push(cur); cur = ''; i++; continue; }
      if (!inQ && (ch === '\r' || ch === '\n')) {
        fields.push(cur); cur = '';
        if (fields.some(f => f.trim())) records.push(fields);
        fields = [];
        if (ch === '\r' && (i + 1) < n && text[i+1] === '\n') i++;
        i++; continue;
      }
      cur += ch; i++;
    }
    if (cur || fields.length) { fields.push(cur); if (fields.some(f => f.trim())) records.push(fields); }
    return records;
  },
  _mapPos(posStr) {
    if (!posStr) return '';
    // ECDICT pos field format (per README): "n:46/v:54"
    //   Each segment = code:percentage, "/" separates multiple pos.
    //   Pick the code with the highest percentage as the primary pos.
    //
    // ECDICT single-letter codes (from BNC-derived scheme):
    //   n = noun      v = verb      a = adjective   r = adverb
    //   p = prep      c = conj      u = aux/modal   d = determiner
    //   m = numeral   q = classifier/meas
    // Two-letter codes also found in ECDICT:
    //   vt = transitive verb    vi = intransitive verb    ad = adverb
    const codeMap = {
      // ── ECDICT native codes ──
      'n':'n.', 'v':'v.', 'a':'adj.', 'r':'adv.',
      'p':'prep.', 'c':'conj.', 'u':'aux.', 'd':'det.',
      'm':'num.', 'q':'meas.',
      'vt':'v.', 'vi':'v.', 'ad':'adv.', 'pron':'pron.',
      // ── Full English words (for manually-added words) ──
      'noun':'n.', 'verb':'v.', 'adjective':'adj.', 'adj':'adj.',
      'adverb':'adv.', 'adv':'adv.', 'preposition':'prep.', 'prep':'prep.',
      'conjunction':'conj.', 'conj':'conj.', 'pronoun':'pron.',
      'auxiliary':'aux.', 'aux':'aux.', 'interjection':'interj.', 'interj':'interj.',
      'numeral':'num.', 'num':'num.', 'phrase':'phrase', 'phr':'phrase',
    };
    const p = posStr.trim();
    // Format A: "n:46/v:54" — pick code with highest percentage
    if (p.includes(':')) {
      let best = '', bestPct = -1;
      p.split('/').forEach(seg => {
        const m = seg.match(/^([a-z]+):([0-9]+)/i);
        if (m) {
          const code = m[1].toLowerCase();
          const pct  = parseInt(m[2]);
          const label = codeMap[code];
          if (label && pct > bestPct) { best = label; bestPct = pct; }
        }
      });
      if (best) return best;
    }
    // Format B: plain code "n" / "adj" / "vt"
    const first = p.toLowerCase().split(/[\/\s]/)[0].replace(/\.$/, '');
    return codeMap[first] || '';
  },
  _extractChinese(translationField, posField) {
    if (!translationField) return '';
    // ECDICT translation field: each line = "pos. 中文釋義", separated by literal "\n"
    // e.g. "n. 名詞釋義\nv. 動詞釋義\nvt. 及物動詞釋義"
    const lines = translationField.split(/\\n|\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) return '';

    // Find the dominant raw pos code from posField "n:46/v:54" → "v"
    // Use the FULL raw code (e.g. "ad", "vt") so we can match "ad. " or "vt. " lines
    let targetCode = '';
    if (posField) {
      const ps = posField.trim();
      if (ps.includes(':')) {
        // "n:46/v:54" — pick code with highest percentage
        let bestCode = '', bestPct = -1;
        ps.split('/').forEach(seg => {
          const m = seg.match(/^([a-z]+):([0-9]+)/i);
          if (m && parseInt(m[2]) > bestPct) { bestPct = parseInt(m[2]); bestCode = m[1].toLowerCase(); }
        });
        targetCode = bestCode;
      } else {
        // plain "n" or "adj"
        targetCode = ps.toLowerCase().split(/[\/\s]/)[0].replace(/\.$/, '');
      }
    }

    // Try to match a translation line whose prefix equals targetCode (full match, e.g. "vt. " not just "v. ")
    // Also try the single-letter fallback in case targetCode is "ad" but line uses "r. "
    const adverbAliases = { 'ad': 'r', 'adv': 'r' };
    let bestLine = lines[0];
    if (targetCode) {
      // Escape for regex: targetCode is always letters only
      const tryMatch = (code) => lines.find(l => new RegExp('^' + code + '\\.\\s', 'i').test(l));
      bestLine = tryMatch(targetCode)
              || tryMatch(adverbAliases[targetCode] || '')
              || lines[0];
    }

    // Strip leading pos prefix ("n. ", "vt. ", "adj. " …)
    bestLine = bestLine.replace(/^[a-z]+\.\s*/i, '').trim();
    return bestLine.split(/[；;]/)[0].trim() || bestLine;
  },
  async importCSV(text, onProgress) {
    // Use record-aware parser to handle quoted fields with embedded newlines
    const records = this._parseCSVRecords(text);
    // Skip header row (first record)
    const dataRecords = records.slice(1);
    const total = dataRecords.length;
    await this.clearAll(); const db = await this.openDB();
    const BATCH = 2000; let count = 0; let batch = [];
    const writeBatch = (items) => new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      items.forEach(item => store.put(item));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    for (let i = 0; i < dataRecords.length; i++) {
      const cols = dataRecords[i];
      const word = (cols[0] || '').trim().toLowerCase(); if (!word) continue;
      // ECDICT columns: word(0) phonetic(1) definition(2) translation(3) pos(4)
      //                 collins(5) oxford(6) tag(7) bnc(8) frq(9) exchange(10)
      const posRaw  = (cols[4] || '').trim();
      const transRaw = (cols[3] || '').trim();
      const chinese = this._extractChinese(transRaw, posRaw);
      if (!chinese) continue;
      batch.push({
        word,
        phonetic:    (cols[1] || '').trim(),
        chinese,
        pos:         this._mapPos(posRaw),
        frq:         parseInt(cols[9]) || 0,
        translation: transRaw
      });
      count++;
      if (batch.length >= BATCH) { await writeBatch(batch); batch = []; if (onProgress) onProgress(count, total); await new Promise(r => setTimeout(r, 0)); }
    }
    if (batch.length) await writeBatch(batch);
    if (onProgress) onProgress(count, total);
    await this.saveMeta({ count, importedAt: new Date().toISOString() });
    return count;
  },
  // If a record was imported with empty pos (old data), derive pos on-the-fly
  // from the translation field prefix lines (e.g. "n. 游泳\nv. 游过" → dominant pos)
  _enrichPos(record) {
    if (!record) return record;
    if (record.pos) return record;            // already has pos — nothing to do
    if (!record.translation) return record;   // no translation to derive from

    // Parse translation lines, count pos occurrences + Chinese definition richness
    // e.g. "n. 游泳；漂浮；潮流；眩晕\nv. 游泳；游过；漂浮"
    //   n: lines=1, defs=4   v: lines=1, defs=3  → n wins by def count
    // Secondary score: number of Chinese items (separated by ；/;) on all matching lines
    const lines = record.translation.split(/\\n|\n/).map(s => s.trim()).filter(Boolean);
    const tally = {};  // code → { lines, defs }
    lines.forEach(l => {
      const m = l.match(/^([a-z]+)\.\s+(.+)/i);
      if (m) {
        const c = m[1].toLowerCase();
        const defCount = (m[2].match(/[；;]/g) || []).length + 1;
        if (!tally[c]) tally[c] = { lines: 0, defs: 0 };
        tally[c].lines += 1;
        tally[c].defs  += defCount;
      }
    });
    // Pick best: primary sort by line count, secondary by def count
    let bestCode = '', bestScore = [-1, -1];
    Object.entries(tally).forEach(([code, stat]) => {
      const score = [stat.lines, stat.defs];
      if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
        bestScore = score; bestCode = code;
      }
    });
    if (bestCode) {
      const derived = this._mapPos(bestCode);
      if (derived) return { ...record, pos: derived };
    }
    return record;
  },
  async search(query, limit = 20) {
    if (!query) return [];
    const db = await this.openDB(); const q = query.toLowerCase().trim();
    return new Promise((resolve) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const results = []; const range = IDBKeyRange.bound(q, q + '\uffff');
      const req = tx.objectStore(this.STORE_NAME).openCursor(range);
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) { results.push(this._enrichPos(cursor.value)); cursor.continue(); }
        else { resolve(results.sort((a, b) => (b.frq || 0) - (a.frq || 0))); }
      };
      req.onerror = () => resolve([]);
    });
  },
  async isLoaded() {
    // Check actual records in the store (meta may be missing for older imports)
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_NAME, 'readonly');
        const req = tx.objectStore(this.STORE_NAME).count();
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => resolve(false);
      });
    } catch { return false; }
  },
  async lookup(word) {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_NAME, 'readonly');
        const req = tx.objectStore(this.STORE_NAME).get(word.toLowerCase());
        req.onsuccess = () => resolve(this._enrichPos(req.result) || null);
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  }
};

// ===== DATA MANAGEMENT =====
const DB = {
  getWords() { try { return JSON.parse(localStorage.getItem('vocabWords') || '[]'); } catch { return []; } },
  saveWords(words) { localStorage.setItem('vocabWords', JSON.stringify(words)); },
  addWord(word) {
    const words = this.getWords();
    const newWord = { id: Date.now().toString(), english: word.english.trim().toLowerCase(), partOfSpeech: word.partOfSpeech || '', chinese: word.chinese.trim(), phonetic: word.phonetic || '', wrongCount: 0, createdAt: todayStr(), frequencyWeight: 1 };
    words.push(newWord); this.saveWords(words); return newWord;
  },
  updateWord(id, data) {
    const words = this.getWords(); const idx = words.findIndex(w => w.id === id);
    if (idx !== -1) { words[idx] = { ...words[idx], ...data }; this.saveWords(words); return words[idx]; }
  },
  deleteWords(ids) { this.saveWords(this.getWords().filter(w => !ids.includes(w.id))); },
  getHistory() { try { return JSON.parse(localStorage.getItem('practiceHistory') || '[]'); } catch { return []; } },
  saveHistory(h) { localStorage.setItem('practiceHistory', JSON.stringify(h)); },
  // ── Essay Writing History ──
  getEssayHistory() { try { return JSON.parse(localStorage.getItem('essayHistory') || '[]'); } catch { return []; } },
  saveEssayHistory(arr) { localStorage.setItem('essayHistory', JSON.stringify(arr)); },
  addEssaySession(entry) {
    // entry: { date, words:[{english,chinese,partOfSpeech}], essay, feedback, score, annotatedHtml }
    const history = this.getEssayHistory();
    const idx = history.findIndex(h => h.date === entry.date);
    const newSession = { essay: entry.essay, feedback: entry.feedback, score: entry.score, words: entry.words, annotatedHtml: entry.annotatedHtml||'', ts: Date.now() };
    if (idx >= 0) {
      // Append new session — never overwrite existing sessions
      history[idx].sessions = [...(history[idx].sessions||[]), newSession];
    } else {
      history.unshift({ date: entry.date, sessions: [newSession] });
    }
    if (history.length > 180) history.length = 180;
    this.saveEssayHistory(history);
  },
  exportEssayCSV() {
    const history = this.getEssayHistory();
    const header = ['日期','使用單字','文章','AI批改','分數','模式','題目'];
    const rows = [];
    history.forEach(h => {
      (h.sessions||[]).forEach(s => {
        rows.push([h.date, (s.words||[]).map(w=>w.english).join(';'), s.essay||'', s.feedback||'', s.score||'', s.essayMode||'vocab', s.topic||''].map(v=>`"${String(v).replace(/"/g,'""')}"`));
      });
    });
    return [header.join(','), ...rows.map(r=>r.join(','))].join('\n');
  },
  importEssayCSV(text) {
    const records = this._splitCSVRecords(text.replace(/^\uFEFF/, '').trim());
    if (records.length < 2) return { added: 0 };
    const headerLine = records[0].replace(/"/g, '').trim();
    if (headerLine !== this.CSV_HEADERS.essay) throw new Error('FORMAT_MISMATCH_ESSAY');
    const history = this.getEssayHistory();
    let added = 0;
    for (let i = 1; i < records.length; i++) {
      const cols = this._parseCSVLine(records[i]);
      if (cols.length < 4) continue;
      const date = (cols[0]||'').trim();
      const wordsStr = (cols[1]||'').trim();
      const essay = (cols[2]||'').trim();
      const feedback = (cols[3]||'').trim();
      const score = (cols[4]||'').trim();
      const essayMode = (cols[5]||'vocab').trim() || 'vocab';
      const topic = (cols[6]||'').trim();
      if (!date || !essay) continue;
      const words = wordsStr ? wordsStr.split(';').map(w=>({ english: w.trim(), chinese:'', partOfSpeech:'' })) : [];
      const session = { essay, feedback, score, words, essayMode, topic, ts: Date.now() + i };
      const idx = history.findIndex(h => h.date === date);
      if (idx >= 0) { history[idx].sessions = history[idx].sessions || []; history[idx].sessions.push(session); }
      else { history.unshift({ date, sessions: [session] }); added++; }
    }
    this.saveEssayHistory(history);
    return { added };
  },
  // ── AI Ask History ──
  getAiAskHistory()         { try { return JSON.parse(localStorage.getItem('aiAskHistory') || '[]'); } catch { return []; } },
  saveAiAskHistory(arr)     { localStorage.setItem('aiAskHistory', JSON.stringify(arr)); },
  addAiAskEntry(entry) {
    // entry: { id (YYMMDDHHMM), question, answer, ts }
    const history = this.getAiAskHistory();
    history.unshift(entry);
    if (history.length > 300) history.length = 300;
    this.saveAiAskHistory(history);
  },
  exportAiAskCSV() {
    const history = this.getAiAskHistory();
    const header  = ['ID','問題','回覆','時間戳'];
    const rows    = history.map(e =>
      [e.id||'', e.question||'', e.answer||'', e.ts||''].map(v => `"${String(v).replace(/"/g,'""')}"`)
    );
    return [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  },
  importAiAskCSV(text) {
    const records = this._splitCSVRecords(text.replace(/^\uFEFF/, '').trim());
    if (records.length < 2) return { added: 0 };
    const headerLine = records[0].replace(/"/g, '').trim();
    if (headerLine !== this.CSV_HEADERS.aiask) throw new Error('FORMAT_MISMATCH_AIASK');
    const history = this.getAiAskHistory();
    let added = 0;
    for (let i = 1; i < records.length; i++) {
      const cols = this._parseCSVLine(records[i]);
      if (cols.length < 2) continue;
      const id = (cols[0]||'').trim(); const question = (cols[1]||'').trim();
      const answer = (cols[2]||'').trim(); const ts = parseInt(cols[3]||'0') || Date.now();
      if (!id || !question) continue;
      if (!history.find(e => e.id === id)) { history.unshift({ id, question, answer, ts }); added++; }
    }
    this.saveAiAskHistory(history);
    return { added };
  },

  addPracticeSession(date, totalWords, wrongWordDetails) {
    const correct = totalWords - wrongWordDetails.length; const wrong = wrongWordDetails.length;
    const history = this.getHistory(); const existing = history.find(h => h.date === date);
    if (existing) {
      existing.correct += correct; existing.wrong += wrong; existing.total += totalWords;
      if (!existing.wrongWordDetails) existing.wrongWordDetails = [];
      wrongWordDetails.forEach(wd => { if (!existing.wrongWordDetails.find(e => e.english === wd.english)) existing.wrongWordDetails.push(wd); });
    } else { history.push({ date, correct, wrong, total: totalWords, wrongWordDetails }); }
    this.saveHistory(history);
  },
  getApiKey() { return localStorage.getItem('geminiApiKey') || ''; },
  saveApiKey(key) { localStorage.setItem('geminiApiKey', key); },
  getModel() {
    const saved = localStorage.getItem('geminiModel') || '';
    const validModels = (typeof Gemini !== 'undefined' && Gemini.AVAILABLE_MODELS)
      ? Gemini.AVAILABLE_MODELS.map(m => m.id)
      : [];
    if (saved && (!validModels.length || validModels.includes(saved))) return saved;
    const fallback = 'gemini-3.5-flash';
    if (saved && validModels.length && !validModels.includes(saved)) localStorage.setItem('geminiModel', fallback);
    return fallback;
  },
  saveModel(m) { localStorage.setItem('geminiModel', m); },
  // ── Google Drive config ──
  getGDriveClientId()  { return localStorage.getItem('gdriveClientId') || ''; },
  setGDriveClientId(v) { localStorage.setItem('gdriveClientId', v); },
  getGDriveFolderId()  { return localStorage.getItem('gdriveFolderId') || ''; },
  setGDriveFolderId(v) { localStorage.setItem('gdriveFolderId', v); },
  getGDriveAutoSync()  { return localStorage.getItem('gdriveAutoSync') === '1'; },
  setGDriveAutoSync(v) { localStorage.setItem('gdriveAutoSync', v ? '1' : '0'); },
  getGDriveLastSync()  { return localStorage.getItem('gdriveLastSync') || ''; },
  setGDriveLastSync(v) { localStorage.setItem('gdriveLastSync', v); },
  getBoostedWords() { try { return JSON.parse(localStorage.getItem('boostedWords') || '[]'); } catch { return []; } },
  saveBoostedWords(ids) { localStorage.setItem('boostedWords', JSON.stringify(ids)); },
  getTtsDelay()    { return parseInt(localStorage.getItem('ttsDelay') || '300'); },
  saveTtsDelay(ms) { localStorage.setItem('ttsDelay', String(ms)); },
  toggleBoost(id) {
    const b = this.getBoostedWords(); const idx = b.indexOf(id);
    if (idx === -1) b.push(id); else b.splice(idx, 1);
    this.saveBoostedWords(b); return idx === -1;
  },
  isBoosted(id) { return this.getBoostedWords().includes(id); },
  getTodaySentence() {
    try { const s = JSON.parse(localStorage.getItem('todaySentence') || 'null'); return (s && s.date === todayStr()) ? s : null; }
    catch { return null; }
  },
  saveTodaySentence(data) { localStorage.setItem('todaySentence', JSON.stringify({ ...data, date: todayStr() })); },
  // AI-generated sentence log
  getSentenceLog() { try { return JSON.parse(localStorage.getItem('sentenceLog') || '[]'); } catch { return []; } },
  saveSentenceToLog(entry) {
    const log = this.getSentenceLog();
    log.unshift({ ...entry, id: Date.now().toString() });
    if (log.length > 120) log.length = 120;
    localStorage.setItem('sentenceLog', JSON.stringify(log));
  },
  // Imported sentence bank (CSV)
  getImportedSentences() { try { return JSON.parse(localStorage.getItem('importedSentences') || '[]'); } catch { return []; } },
  saveImportedSentences(arr) { localStorage.setItem('importedSentences', JSON.stringify(arr)); },
  importSentencesCSV(text) {
    const records = this._splitCSVRecords(text.replace(/^\uFEFF/, '').trim());
    if (records.length < 2) return { added: 0, total: 0 };
    // ── 格式驗證 ──
    const headerLine = records[0].replace(/\r/,'').trim().replace(/^\uFEFF/,'').replace(/"/g,'');
    if (headerLine !== this.CSV_HEADERS.sentences) throw new Error('FORMAT_MISMATCH_SENTENCES');
    const existing = this.getImportedSentences();
    const existingKeys = new Set(existing.map(s => s.date + '|' + s.wordEn));
    let added = 0;
    for (let i = 1; i < records.length; i++) {
      const cols = this._parseCSVLine(records[i]);
      if (cols.length < 6) continue;
      const date = (cols[0] || '').trim();
      const wordEn = (cols[1] || '').trim().toLowerCase();
      const wordPos = (cols[2] || '').trim();
      const wordZh = (cols[3] || '').trim();
      const en = (cols[4] || '').trim();
      const zh = (cols[5] || '').trim();
      if (!date || !wordEn || !en || !zh) continue;
      const key = date + '|' + wordEn;
      if (!existingKeys.has(key)) {
        existing.unshift({ date, wordEn, wordPos, wordZh, en, zh, id: Date.now().toString() + i, source: 'csv' });
        existingKeys.add(key); added++;
      }
    }
    this.saveImportedSentences(existing);
    return { added, total: existing.length };
  },
  exportSentencesCSV() {
    const wordMap = {};
    this.getWords().forEach(w => { wordMap[w.english.toLowerCase()] = w.chinese; });
    const ai = this.getSentenceLog().map(e => ({
      date: e.date, wordEn: e.wordEn, wordPos: e.wordPos||'',
      // wordZh: use stored value, fall back to DB lookup so older entries still highlight
      wordZh: e.wordZh || wordMap[(e.wordEn||'').toLowerCase()] || '',
      en: e.en, zh: e.zh, source: 'ai'
    }));
    const imported = this.getImportedSentences();
    const all = [...imported, ...ai];
    // Deduplicate by date+wordEn
    const seen = new Set(); const unique = all.filter(e => { const k = e.date+'|'+e.wordEn; if (seen.has(k)) return false; seen.add(k); return true; });
    const header = ['date','wordEn','wordPos','wordZh','en','zh'];
    const rows = unique.map(e => [e.date, e.wordEn, e.wordPos||'', e.wordZh||'', e.en, e.zh].map(v => `"${String(v).replace(/"/g,'""')}"`));
    return [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  },
  // Combined sentence log for home display
  getCombinedSentenceLog() {
    const ai = this.getSentenceLog();
    const imported = this.getImportedSentences();
    // Merge, prefer AI for same date+word key
    const seen = new Set();
    const result = [];
    [...ai, ...imported].forEach(e => {
      const k = e.date + '|' + (e.wordEn || '');
      if (!seen.has(k)) { seen.add(k); result.push(e); }
    });
    // Sort by date descending
    result.sort((a, b) => {
      const da = a.date || ''; const db2 = b.date || '';
      return db2.localeCompare(da);
    });
    return result.slice(0, 150);
  },
  // Get sentence for today from any source
  getTodaySentenceAny() {
    const today = todayStr();
    // 1. Check AI cached (priority)
    const ai = this.getTodaySentence();
    if (ai) return ai;
    // 2. Filter all imported sentences matching today, pick one at random
    const todayImported = this.getImportedSentences().filter(s => s.date === today);
    if (todayImported.length > 0) {
      return todayImported[Math.floor(Math.random() * todayImported.length)];
    }
    return null;
  },
  // ── CSV 標頭定義（格式鎖定）──
  CSV_HEADERS: {
    vocab:     '英文單字,詞性,中文,音標,答錯次數,建立日期,頻率加權',
    essay:     '日期,使用單字,文章,AI批改,分數,模式,題目',
    sentences: 'date,wordEn,wordPos,wordZh,en,zh',
    stats:     '日期,總題數,正確,錯誤,正確率%',
    aiask:     'ID,問題,回覆,時間戳'
  },
  // 自動偵測 CSV 類型，回傳 'vocab' | 'sentences' | 'stats' | null
  detectCSVType(text) {
    const firstLine = text.trim().split('\n')[0].replace(/\r/,'').trim();
    // 去除 BOM 和引號比對
    const clean = firstLine.replace(/^\uFEFF/,'').replace(/"/g,'');
    if (clean === this.CSV_HEADERS.vocab)     return 'vocab';
    if (clean === this.CSV_HEADERS.sentences)  return 'sentences';
    if (clean === this.CSV_HEADERS.stats)      return 'stats';
    if (clean === this.CSV_HEADERS.essay)      return 'essay';
    if (clean === this.CSV_HEADERS.aiask)      return 'aiask';
    return null;
  },
  exportCSV() {
    const words = this.getWords();
    const header = ['英文單字','詞性','中文','音標','答錯次數','建立日期','頻率加權'];
    const rows = words.map(w => [w.english, w.partOfSpeech, w.chinese, w.phonetic||'', w.wrongCount||0, w.createdAt||'', w.frequencyWeight||1].map(v => `"${String(v).replace(/"/g,'""')}"`));
    return [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  },
  importCSV(text) {
    const records = this._splitCSVRecords(text.replace(/^\uFEFF/, '').trim());
    if (records.length < 2) return { added: 0, skipped: 0 };
    // ── 格式驗證 ──
    const headerLine = records[0].replace(/\r/,'').trim().replace(/^\uFEFF/,'').replace(/"/g,'');
    if (headerLine !== this.CSV_HEADERS.vocab) throw new Error('FORMAT_MISMATCH_VOCAB');
    const words = this.getWords(); let added = 0, skipped = 0;
    for (let i = 1; i < records.length; i++) {
      const cols = this._parseCSVLine(records[i]);
      if (cols.length < 3) { skipped++; continue; }
      const english = (cols[0] || '').trim().toLowerCase();
      const partOfSpeech = (cols[1] || '').trim();
      const chinese = (cols[2] || '').trim();
      if (!english || !chinese) { skipped++; continue; }
      const existing = words.find(w => w.english === english);
      if (existing) {
        existing.partOfSpeech = partOfSpeech; existing.chinese = chinese;
        if (cols[3]) existing.phonetic = cols[3];
        if (cols[4]) existing.wrongCount = parseInt(cols[4]) || 0;
        if (cols[6]) existing.frequencyWeight = parseInt(cols[6]) || 1;
      } else {
        words.push({ id: (Date.now() + i).toString(), english, partOfSpeech, chinese, phonetic: (cols[3]||'').trim(), wrongCount: parseInt(cols[4])||0, createdAt: (cols[5]||'').trim()||todayStr(), frequencyWeight: parseInt(cols[6])||1 });
        added++;
      }
    }
    this.saveWords(words); return { added, skipped };
  },
  // Stats CSV export
  exportStatsCSV() {
    const history = this.getHistory();
    const header = ['日期','總題數','正確','錯誤','正確率%'];
    const rows = history.map(h => {
      const pct = h.total > 0 ? Math.round((h.correct/h.total)*100) : 0;
      return [h.date, h.total||0, h.correct||0, h.wrong||0, pct].map(v=>`"${v}"`);
    });
    return [header.join(','), ...rows.map(r=>r.join(','))].join('\n');
  },
  // Stats CSV import (merge into existing history)
  importStatsCSV(text) {
    const records = this._splitCSVRecords(text.replace(/^\uFEFF/, '').trim());
    if (records.length < 2) return { added: 0, updated: 0 };
    // ── 格式驗證 ──
    const headerLine = records[0].replace(/\r/,'').trim().replace(/^\uFEFF/,'').replace(/"/g,'');
    if (headerLine !== this.CSV_HEADERS.stats) throw new Error('FORMAT_MISMATCH_STATS');
    const history = this.getHistory();
    const dataMap = {};
    history.forEach(h => { dataMap[h.date] = h; });
    let added = 0, updated = 0;
    for (let i = 1; i < records.length; i++) {
      const cols = this._parseCSVLine(records[i]);
      if (cols.length < 4) continue;
      const date = (cols[0]||'').trim();
      const total = parseInt(cols[1])||0;
      const correct = parseInt(cols[2])||0;
      const wrong = parseInt(cols[3])||0;
      if (!date || (!total && !correct && !wrong)) continue;
      if (dataMap[date]) {
        if (total > (dataMap[date].total||0)) {
          dataMap[date].total = total; dataMap[date].correct = correct; dataMap[date].wrong = wrong; updated++;
        }
      } else {
        dataMap[date] = { date, total, correct, wrong, wrongWordDetails: [] }; added++;
      }
    }
    const merged = Object.values(dataMap).sort((a,b)=>a.date.localeCompare(b.date));
    this.saveHistory(merged);
    return { added, updated };
  },
  // Split CSV text into records, respecting quoted multiline fields
  _splitCSVRecords(text) {
    const records = [];
    let current = '';
    let inQuote = false;
    const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '"') {
        if (inQuote && src[i + 1] === '"') { current += '"'; i++; }
        else { inQuote = !inQuote; current += ch; }
      } else if (ch === '\n' && !inQuote) {
        records.push(current); current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) records.push(current);
    return records;
  },
  _parseCSVLine(line) {
    const result = []; let current = ''; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuote && line[i+1] === '"') { current += '"'; i++; } else inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { result.push(current); current = ''; }
      else { current += ch; }
    }
    result.push(current); return result;
  }
};

// ===== GEMINI API =====
const Gemini = {
  // All selectable models (display name -> API id)
  AVAILABLE_MODELS: [
    // Text-generation models available in Gemini API / AI Studio as of 2026/06.
    // Removed retired preview/latest aliases; keep stable low-latency models first.
    { label: 'Gemini 3.5 Flash',              id: 'gemini-3.5-flash',              tag: '推薦' },
    { label: 'Gemini 3.1 Flash-Lite',         id: 'gemini-3.1-flash-lite',         tag: '快速' },
    { label: 'Gemini 3 Flash Preview',        id: 'gemini-3-flash-preview',        tag: 'Preview' },
    { label: 'Gemini 3.1 Pro Preview',        id: 'gemini-3.1-pro-preview',        tag: '高階' },
    { label: 'Gemini 2.5 Flash',              id: 'gemini-2.5-flash',              tag: '備援' },
    { label: 'Gemini 2.5 Flash-Lite',         id: 'gemini-2.5-flash-lite',         tag: '備援' },
    { label: 'Gemini 2.5 Pro',                id: 'gemini-2.5-pro',                tag: '備援' },
  ],

  // Returns model list with user-selected model first, then the rest as fallback
  _getModelList() {
    const selected = DB.getModel();
    const ids = this.AVAILABLE_MODELS.map(m => m.id);
    return [...new Set([selected, ...ids])].filter(Boolean);
  },

  // Extract the actual response text, skipping "thought" parts from thinking models
  _extractText(data) {
    const parts = data.candidates?.[0]?.content?.parts || [];
    if (!parts.length) return '';
    // Gemini 2.5 Flash thinking model returns thought parts first — skip them
    const responsePart = parts.find(p => !p.thought && p.text) || parts[parts.length - 1];
    return responsePart?.text || '';
  },

  // Robust parser: handles EN:/ZH: labels, bold markers, thinking model artifacts
  _parse(raw) {
    if (!raw) return null;
    // Strip markdown bold/italic markers and <thinking> blocks
    let text = raw
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/\*+/g, '')
      .trim();
    // Try EN: / ZH: labels (case-insensitive, handles extra spaces)
    const enMatch = text.match(/EN:\s*([^\n]+)/i);
    const zhMatch = text.match(/ZH:\s*([^\n]+)/i);
    if (enMatch && zhMatch) {
      const en = enMatch[1].trim().replace(/^["']|["']$/g, '');
      const zh = zhMatch[1].trim().replace(/^["']|["']$/g, '');
      if (en && zh) return { en, zh };
    }
    // Fallback: take first two non-empty lines as EN then ZH
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const en = lines[0].replace(/^(English|EN|Sentence|句子):\s*/i, '').replace(/^["']|["']$/g, '').trim();
      const zh = lines[1].replace(/^(Chinese|ZH|Translation|中文|翻譯):\s*/i, '').replace(/^["']|["']$/g, '').trim();
      if (en && zh && en.length > 3 && zh.length > 1) return { en, zh };
    }
    return null;
  },

  async _callModel(model, body, apiKey) {
    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
      );
    } catch {
      throw new Error('NETWORK_ERROR');
    }
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try { const d = await res.json(); errMsg = d.error?.message || errMsg; } catch {}
      const lower = String(errMsg).toLowerCase();
      const err = new Error(errMsg);
      // Try the next model for unavailable/retired/quota/preview-permission issues,
      // but keep API-key/auth errors visible so the user can fix settings.
      const apiKeyProblem = lower.includes('api key') || lower.includes('apikey') || lower.includes('permission denied') || lower.includes('authentication');
      const modelProblem = lower.includes('model') || lower.includes('not found') || lower.includes('not supported') || lower.includes('deprecated') || lower.includes('quota') || lower.includes('rate limit') || lower.includes('unavailable');
      err.fallback = !apiKeyProblem && (res.status === 404 || res.status === 429 || res.status === 503 || (res.status === 400 && modelProblem));
      throw err;
    }
    const data = await res.json();
    return this._extractText(data);
  },

  async reviewEssay(essay, words) {
    const apiKey = DB.getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');
    const wordList = words.map(w => `"${w.english}" (${w.partOfSpeech}: ${w.chinese})`).join(', ');
    const prompt = `You are an English writing teacher. Review the student essay below.

Required vocabulary words: ${wordList}

Student essay:
${essay}

Respond ONLY with a single valid JSON object. No markdown fences, no explanation, no text before or after the JSON.
Required format:
{"wordCheck":[{"word":"string","used":true,"correct":true,"note":"string"}],"grammar":[{"exact":"string","corrected":"string","explanation":"string"}],"suggestions":["string"],"score":7,"comment":"string"}

Rules:
- wordCheck: one entry per required vocabulary word (used=false if not found in essay)
- grammar: list up to 5 grammar or spelling errors (empty array [] if none).
  CRITICAL CONSTRAINT: When correcting errors, you MUST keep the required vocabulary words unchanged in "corrected". Do NOT replace or substitute any required vocabulary word with a different word — only fix surrounding grammar, spelling, or sentence structure.
  "exact" must be the EXACT substring copied verbatim from the student essay so it can be found by string search. "corrected" is the fixed replacement. "explanation" is in Traditional Chinese (繁體中文).
- suggestions: 2-3 tips to improve the essay in Traditional Chinese (繁體中文). Do NOT suggest replacing the required vocabulary words.
- comment: one sentence overall evaluation in Traditional Chinese (繁體中文)
- score: integer 1-10`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2500 }
    });

    // Helper: extract first valid JSON object from raw text
    const extractJSON = (raw) => {
      // Remove thinking tags (Gemini 2.5 Flash thinking model)
      let text = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
      // Remove markdown fences (```json ... ``` or ``` ... ```)
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      // Find the first { ... } block (handles leading/trailing whitespace or text)
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) return null;
      return text.slice(start, end + 1);
    };

    let lastErr = null;
    for (const model of this._getModelList()) {
      try {
        const raw = await this._callModel(model, body, apiKey);
        if (!raw) { lastErr = new Error('EMPTY_RESPONSE'); continue; }
        const jsonStr = extractJSON(raw);
        if (!jsonStr) { lastErr = new Error(`PARSE_ERROR: no JSON found in response`); continue; }
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed.score !== 'undefined') return parsed;
        lastErr = new Error('PARSE_ERROR: missing score field');
      } catch(err) {
        if (err.message === 'NETWORK_ERROR') throw err;
        if (err.fallback) { lastErr = err; continue; }
        if (err instanceof SyntaxError) { lastErr = new Error(`PARSE_ERROR: ${err.message}`); continue; }
        throw err;
      }
    }
    throw lastErr || new Error('API_ERROR');
  },
  // Review essay with a free topic (no required vocabulary words)
  async reviewEssayFree(essay, topic) {
    const apiKey = DB.getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');
    const prompt = `You are an English writing teacher. The student was given this topic/prompt: "${topic}"

Student essay:
${essay}

Respond ONLY with a single valid JSON object. No markdown fences, no explanation.
Required format:
{"grammar":[{"exact":"string","corrected":"string","explanation":"string"}],"suggestions":["string"],"score":7,"comment":"string"}

Rules:
- grammar: up to 5 errors. "exact" must be verbatim from essay. "explanation" in 繁體中文.
- suggestions: 2-3 tips in 繁體中文.
- comment: one sentence evaluation in 繁體中文.
- score: integer 1-10`;

    const body = JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.2,maxOutputTokens:2500} });

    const extractJSON = (raw) => {
      let text = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi,'').trim()
        .replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`\s*$/,'').trim();
      const start = text.indexOf('{'); const end = text.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) return null;
      return text.slice(start, end + 1);
    };

    let lastErr = null;
    for (const model of this._getModelList()) {
      try {
        const raw = await this._callModel(model, body, apiKey);
        if (!raw) { lastErr = new Error('EMPTY_RESPONSE'); continue; }
        const jsonStr = extractJSON(raw);
        if (!jsonStr) { lastErr = new Error('PARSE_ERROR: no JSON'); continue; }
        const parsed = JSON.parse(jsonStr);
        // Normalize: add empty wordCheck for compatibility
        if (parsed && typeof parsed.score !== 'undefined') {
          parsed.wordCheck = parsed.wordCheck || [];
          return parsed;
        }
        lastErr = new Error('PARSE_ERROR: missing score');
      } catch(err) {
        if (err.message === 'NETWORK_ERROR') throw err;
        if (err.fallback) { lastErr = err; continue; }
        if (err instanceof SyntaxError) { lastErr = new Error('PARSE_ERROR: ' + err.message); continue; }
        throw err;
      }
    }
    throw lastErr || new Error('API_ERROR');
  },

  async generateSentence(word) {
    const apiKey = DB.getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');

    const prompt = `You are a language learning assistant. Create one natural English sentence using the word "${word.english}" (${word.partOfSpeech}: ${word.chinese}), then provide its Traditional Chinese translation.

Output ONLY these two lines, nothing else:
EN: [your English sentence]
ZH: [繁體中文 translation]`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
    });

    let lastErr = null;
    for (const model of this._getModelList()) {
      try {
        const raw = await this._callModel(model, body, apiKey);
        const parsed = this._parse(raw);
        if (parsed && parsed.en && parsed.zh) return parsed;
        lastErr = new Error('PARSE_ERROR');
        // Parse failed — try next model
      } catch (err) {
        if (err.message === 'NETWORK_ERROR') throw err;
        if (err.fallback) { lastErr = err; continue; }
        throw err;
      }
    }
    throw lastErr || new Error('API_ERROR');
  },

  _isLocationError(err) {
    return /user location is not supported|location.*not supported|region.*not supported|failed_precondition/i.test(String(err?.message || err || ''));
  },

  _isAuthError(err) {
    return /api key|apikey|invalid|permission denied|authentication|unauthenticated/i.test(String(err?.message || err || ''));
  },

  _normalizePos(pos) {
    const map = {
      noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', preposition: 'prep.', conjunction: 'conj.',
      pronoun: 'pron.', auxiliary: 'aux.', numeral: 'num.', interjection: 'interj.'
    };
    const key = String(pos || '').toLowerCase().trim();
    return map[key] || key.replace(/\.$/, '') + (key ? '.' : '');
  },

  async _translateWithPublicService(text) {
    const q = String(text || '').trim();
    if (!q) return '';
    const endpoints = [
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|zh-TW`,
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|zh-CN`
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) continue;
        const data = await res.json();
        const translated = data?.responseData?.translatedText || data?.matches?.find(m => m?.translation)?.translation || '';
        const cleaned = String(translated).replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
        if (cleaned && cleaned.toLowerCase() !== q.toLowerCase()) return cleaned;
      } catch {}
    }
    return '';
  },

  async _lookupWordPublicFallback(word) {
    const cleanWord = String(word || '').trim().toLowerCase();
    if (!cleanWord) return [];
    let dict = null;
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
      if (res.ok) dict = await res.json();
    } catch {}

    const entries = [];
    const first = Array.isArray(dict) ? dict[0] : null;
    const phonetic = (first?.phonetic || first?.phonetics?.find(p => p?.text)?.text || '').replace(/^\/+|\/+$/g, '').trim();
    const meanings = Array.isArray(first?.meanings) ? first.meanings : [];
    for (const meaning of meanings.slice(0, 6)) {
      const def = meaning?.definitions?.find(d => d?.definition)?.definition || '';
      const example = meaning?.definitions?.find(d => d?.example)?.example || '';
      const zh = await this._translateWithPublicService(def || cleanWord);
      entries.push({
        english: cleanWord,
        phonetic,
        pos: this._normalizePos(meaning?.partOfSpeech),
        chinese: (zh || await this._translateWithPublicService(cleanWord) || '公開字典查詢結果').replace(/；\s*$/,'').slice(0, 60),
        example: String(example || '').slice(0, 120),
        source: 'public-fallback'
      });
    }

    if (!entries.length) {
      const zh = await this._translateWithPublicService(cleanWord);
      if (zh) entries.push({ english: cleanWord, phonetic: '', pos: '', chinese: zh.slice(0, 60), example: '', source: 'public-fallback' });
    }
    return entries.filter(e => e.english && e.chinese);
  },

  // Look up a single word via AI and return all POS senses as structured JSON
  async lookupWord(word) {
    const apiKey = DB.getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');
    const prompt = `You are an English dictionary. Look up the word "${word}" and return ALL its parts of speech (noun, verb, adjective, etc.) as a JSON array.

Each element must have these fields:
- "english": the word in lowercase
- "phonetic": IPA pronunciation WITHOUT any slashes, e.g. ˈpæʃən (NOT /ˈpæʃən/)
- "pos": part of speech abbreviation in Traditional Chinese style, use one of: n. v. adj. adv. prep. conj. pron. aux. num. interj.
- "chinese": concise Traditional Chinese definition (1-3 meanings separated by semicolons, max 30 chars)
- "example": one short example sentence in English (max 12 words)

Return ONLY the JSON array. No markdown, no explanation. Example:
[{"english":"run","phonetic":"rʌn","pos":"v.","chinese":"跑；運行；管理","example":"She runs every morning."},{"english":"run","phonetic":"rʌn","pos":"n.","chinese":"跑步；一段路程","example":"Let's go for a run."}]

If the word does not exist or is invalid, return: []`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json'
      }
    });

    let lastErr = null;
    for (const model of this._getModelList()) {
      try {
        const raw = await this._callModel(model, body, apiKey);
        if (!raw) { lastErr = new Error('EMPTY_RESPONSE'); continue; }
        // Strip markdown fences/thinking tags and extract the first JSON array.
        let text = String(raw)
          .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
          .replace(/^\s*```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();
        const start = text.indexOf('['), end = text.lastIndexOf(']');
        if (start === -1 || end === -1 || end <= start) { lastErr = new Error('PARSE_ERROR'); continue; }
        const arr = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(arr)) {
          return arr.map(item => ({
            english:  String(item.english || word || '').trim().toLowerCase(),
            phonetic: String(item.phonetic || '').replace(/^\/+|\/+$/g, '').trim(),
            pos:      String(item.pos || '').trim(),
            chinese:  String(item.chinese || '').trim(),
            example:  String(item.example || '').trim()
          })).filter(item => item.english && item.chinese);
        }
        lastErr = new Error('NOT_ARRAY');
      } catch(err) {
        if (err.message === 'NETWORK_ERROR') throw err;
        if (err.fallback) { lastErr = err; continue; }
        lastErr = err;
      }
    }
    // Database lookup should remain useful even when Gemini is blocked by network/region, model availability, quota, or parsing issues.
    // Do not hide true API-key/auth problems, because those require settings changes.
    if (!this._isAuthError(lastErr)) {
      const fallbackEntries = await this._lookupWordPublicFallback(word);
      if (fallbackEntries.length) return fallbackEntries;
      if (this._isLocationError(lastErr)) {
        const e = new Error('REGION_UNSUPPORTED_NO_FALLBACK');
        e.originalMessage = String(lastErr?.message || '');
        throw e;
      }
    }
    throw lastErr || new Error('API_ERROR');
  }
};

// ===== GOOGLE DRIVE SYNC =====
const GDrive = {
  _token: null,
  _email: null,
  _client: null,
  _clientKey: '',
  SESSION_KEYS: {
    token: 'gdriveToken',
    email: 'gdriveEmail',
    expiry: 'gdriveExpiry',
    clientId: 'gdriveSessionClientId',
    scope: 'gdriveSessionScope',
    lastLogin: 'gdriveLastLoginAt'
  },
  SCOPE: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
  EXPIRY_MARGIN_MS: 5 * 60 * 1000,

  isSignedIn() { return !!this._token && !this._isTokenExpired(); },
  hasRememberedSession() { return !!this.getUserEmail(); },
  getUserEmail() { return this._email || localStorage.getItem(this.SESSION_KEYS.email) || ''; },
  getSessionStatus() {
    if (this.isSignedIn()) return 'active';
    return this.hasRememberedSession() ? 'remembered' : 'none';
  },

  _loadGIS() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) { resolve(); return; }
      const existing = document.querySelector('script[data-gis="1"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('GIS_LOAD_FAILED')), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.dataset.gis = '1';
      s.onload = resolve;
      s.onerror = () => reject(new Error('GIS_LOAD_FAILED'));
      document.head.appendChild(s);
    });
  },

  _sessionClientId() { return localStorage.getItem(this.SESSION_KEYS.clientId) || ''; },
  _sessionScope() { return localStorage.getItem(this.SESSION_KEYS.scope) || ''; },
  _expiry() { return parseInt(localStorage.getItem(this.SESSION_KEYS.expiry) || '0', 10) || 0; },
  _isTokenExpired() { return !this._token || Date.now() > this._expiry() - this.EXPIRY_MARGIN_MS; },
  _hasSameClientAndScope(clientId) {
    return this._sessionClientId() === clientId && this._sessionScope() === this.SCOPE;
  },

  _saveSession(token, email, expiresIn, clientId) {
    const exp = Date.now() + (Number(expiresIn) || 3500) * 1000;
    this._token = token;
    this._email = email || this.getUserEmail();
    localStorage.setItem(this.SESSION_KEYS.token, token);
    localStorage.setItem(this.SESSION_KEYS.email, this._email || '');
    localStorage.setItem(this.SESSION_KEYS.expiry, String(exp));
    localStorage.setItem(this.SESSION_KEYS.clientId, clientId || DB.getGDriveClientId());
    localStorage.setItem(this.SESSION_KEYS.scope, this.SCOPE);
    localStorage.setItem(this.SESSION_KEYS.lastLogin, new Date().toISOString());
  },

  _clearTokenOnly() {
    this._token = null;
    localStorage.removeItem(this.SESSION_KEYS.token);
    localStorage.removeItem(this.SESSION_KEYS.expiry);
  },

  _clearSession() {
    this._token = null;
    this._email = null;
    Object.values(this.SESSION_KEYS).forEach(k => localStorage.removeItem(k));
  },

  tryRestoreFromStorage() {
    const clientId = DB.getGDriveClientId();
    const token = localStorage.getItem(this.SESSION_KEYS.token);
    const email = localStorage.getItem(this.SESSION_KEYS.email) || '';
    const exp = this._expiry();
    if (email) this._email = email;
    if (!token || !email || !clientId || !this._hasSameClientAndScope(clientId)) return false;
    if (Date.now() > exp - this.EXPIRY_MARGIN_MS) return false;
    this._token = token;
    this._email = email;
    return true;
  },

  async _getClient(clientId) {
    await this._loadGIS();
    const key = clientId + '|' + this.SCOPE;
    if (!this._client || this._clientKey !== key) {
      this._clientKey = key;
      this._client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: this.SCOPE,
        include_granted_scopes: true,
        callback: () => {},
        error_callback: () => {}
      });
    }
    return this._client;
  },

  async _requestToken({ promptMode = '', accountHint = '' } = {}) {
    const clientId = DB.getGDriveClientId();
    if (!clientId) throw new Error('NO_CLIENT_ID');
    const client = await this._getClient(clientId);
    const hint = accountHint || this.getUserEmail();
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err || 'AUTH_FAILED')));
      };
      client.callback = async (resp) => {
        if (settled) return;
        if (resp.error) { fail(new Error(resp.error)); return; }
        let email = this.getUserEmail();
        try {
          const r = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
            headers: { Authorization: 'Bearer ' + resp.access_token }
          });
          const info = await r.json();
          email = info.email || email;
        } catch {}
        settled = true;
        this._saveSession(resp.access_token, email, resp.expires_in, clientId);
        resolve();
      };
      client.error_callback = (e) => fail(new Error(e?.type || e?.message || 'AUTH_FAILED'));
      const req = { prompt: promptMode };
      if (hint) {
        req.hint = hint;
        req.login_hint = hint;
      }
      client.requestAccessToken(req);
    });
  },

  async silentRefresh() {
    await this._requestToken({ promptMode: '' });
  },

  async signIn() {
    await this._requestToken({ promptMode: 'consent select_account' });
  },

  async reconnect() {
    await this._requestToken({ promptMode: '', accountHint: this.getUserEmail() });
  },

  async ensureToken(options = {}) {
    const interactive = !!options.interactive;
    if (this.isSignedIn()) return;
    if (this.tryRestoreFromStorage()) return;
    try {
      await this.silentRefresh();
      return;
    } catch (e) {
      this._clearTokenOnly();
      if (!interactive) throw new Error('TOKEN_EXPIRED');
      // Safari / iOS PWA often blocks silent OAuth after the app is closed.
      // Because this path is triggered by a user click, we can safely show the Google consent/account UI.
      await this._requestToken({ promptMode: this.getUserEmail() ? 'consent' : 'consent select_account' });
    }
  },

  async tryRestoreToken() {
    if (this.tryRestoreFromStorage()) return true;
    if (!DB.getGDriveClientId()) return false;
    if (this.getUserEmail()) {
      try {
        await this.silentRefresh();
        return true;
      } catch (e) {
        this._clearTokenOnly();
        return false;
      }
    }
    return false;
  },

  signOut() {
    if (this._token && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(this._token, () => {});
    }
    this._client = null;
    this._clientKey = '';
    this._clearSession();
  },

  _buildPayload() {
    return {
      words:        DB.getWords(),
      history:      DB.getHistory(),
      sentences:    DB.getSentenceLog(),
      imported:     DB.getImportedSentences(),
      boosted:      DB.getBoostedWords(),
      essayHistory: DB.getEssayHistory(),
      aiAskHistory: DB.getAiAskHistory(),
      updatedAt:    new Date().toISOString(),
      appVersion:   APP_DISPLAY_VERSION
    };
  },

  async upload(options = {}) {
    await this.ensureToken(options);
    const data     = this._buildPayload();
    const folderId = DB.getGDriveFolderId();
    const ts       = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = 'vocab_backup_' + ts + '.json';
    const boundary = 'vocab_boundary_' + Date.now();
    const summary  = {
      words:     (data.words||[]).length,
      sentences: [...(data.sentences||[]), ...(data.imported||[])].length,
      stats:     (data.history||[]).length,
      essay:     (data.essayHistory||[]).reduce((s,h)=>s+(h.sessions||[]).length,0),
      aiAsk:     (data.aiAskHistory||[]).length,
      version:   APP_DISPLAY_VERSION
    };
    const metadata = { name: fileName, mimeType: 'application/json', description: JSON.stringify(summary), ...(folderId ? { parents: [folderId] } : {}) };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n'
      + JSON.stringify(data) + '\r\n--' + boundary + '--';
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this._token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      if (r.status === 401) { this._clearTokenOnly(); throw new Error('TOKEN_EXPIRED'); }
      throw new Error('UPLOAD_FAILED: ' + (err.error?.message || r.status));
    }
    const now = new Date().toLocaleString('zh-TW');
    DB.setGDriveLastSync(now);
    return now;
  },

  async listBackups(options = {}) {
    await this.ensureToken(options);
    const folderId = DB.getGDriveFolderId();
    let q = "name contains 'vocab_backup_' and mimeType='application/json' and trashed=false";
    if (folderId) q += " and '" + folderId + "' in parents";
    const params = new URLSearchParams({ q, fields: 'files(id,name,createdTime,description)', orderBy: 'createdTime desc', pageSize: '10' });
    const r = await fetch('https://www.googleapis.com/drive/v3/files?' + params, {
      headers: { Authorization: 'Bearer ' + this._token }
    });
    if (!r.ok) {
      if (r.status === 401) { this._clearTokenOnly(); throw new Error('TOKEN_EXPIRED'); }
      throw new Error('LIST_FAILED: ' + r.status);
    }
    const data = await r.json();
    return data.files || [];
  },

  async downloadFile(fileId, options = {}) {
    await this.ensureToken(options);
    const r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
      headers: { Authorization: 'Bearer ' + this._token }
    });
    if (!r.ok) {
      if (r.status === 401) { this._clearTokenOnly(); throw new Error('TOKEN_EXPIRED'); }
      throw new Error('DOWNLOAD_FAILED: ' + r.status);
    }
    return r.json();
  },

  applyDownload(data, mode) {
    if (mode === 'overwrite') {
      if (Array.isArray(data.words))        localStorage.setItem('vocabWords',        JSON.stringify(data.words));
      if (Array.isArray(data.history))      localStorage.setItem('practiceHistory',   JSON.stringify(data.history));
      if (Array.isArray(data.sentences))    localStorage.setItem('sentenceLog',       JSON.stringify(data.sentences));
      if (Array.isArray(data.imported))     localStorage.setItem('importedSentences', JSON.stringify(data.imported));
      if (Array.isArray(data.boosted))      localStorage.setItem('boostedWords',      JSON.stringify(data.boosted));
      if (Array.isArray(data.essayHistory)) localStorage.setItem('essayHistory',      JSON.stringify(data.essayHistory));
      if (Array.isArray(data.aiAskHistory)) localStorage.setItem('aiAskHistory',      JSON.stringify(data.aiAskHistory));
    } else {
      const lw = DB.getWords(); const cw = data.words || [];
      const merged = [...lw]; cw.forEach(w => { const key = String(w.english || w.wordEn || '').toLowerCase(); if (key && !merged.find(x => String(x.english || x.wordEn || '').toLowerCase() === key)) merged.push(w); });
      localStorage.setItem('vocabWords', JSON.stringify(merged));
      const lh = DB.getHistory(); const ch = data.history || []; const hm = {};
      [...lh, ...ch].forEach(h => { if (!hm[h.date] || h.total > hm[h.date].total) hm[h.date] = h; });
      localStorage.setItem('practiceHistory', JSON.stringify(Object.values(hm)));
      const ls = DB.getSentenceLog(); const cs = data.sentences || [];
      const ss = new Set(ls.map(s => s.word + s.date));
      localStorage.setItem('sentenceLog', JSON.stringify([...ls, ...cs.filter(s => !ss.has(s.word + s.date))]));
      const li = DB.getImportedSentences(); const ci = data.imported || [];
      const iss = new Set(li.map(s => s.word + s.english));
      localStorage.setItem('importedSentences', JSON.stringify([...li, ...ci.filter(s => !iss.has(s.word + s.english))]));
      const lb = new Set(DB.getBoostedWords()); (data.boosted || []).forEach(id => lb.add(id));
      localStorage.setItem('boostedWords', JSON.stringify([...lb]));
      if (Array.isArray(data.essayHistory)) {
        const le = DB.getEssayHistory(); const em = {};
        [...le, ...data.essayHistory].forEach(h => {
          if (!em[h.date]) { em[h.date] = { ...h, sessions: [...(h.sessions||[])] }; }
          else { const ex = new Set((em[h.date].sessions||[]).map(s => s.ts)); (h.sessions||[]).forEach(s => { if (!ex.has(s.ts)) { em[h.date].sessions.push(s); ex.add(s.ts); } }); }
        });
        localStorage.setItem('essayHistory', JSON.stringify(Object.values(em)));
      }
      if (Array.isArray(data.aiAskHistory)) {
        const la = DB.getAiAskHistory(); const as = new Set(la.map(e => e.id));
        localStorage.setItem('aiAskHistory', JSON.stringify([...la, ...data.aiAskHistory.filter(e => !as.has(e.id))]));
      }
    }
    const now = new Date().toLocaleString('zh-TW');
    DB.setGDriveLastSync(now);
    return now;
  }
};

// ===== UTILITIES =====
function showToast(msg, duration = 2200) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}
function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function nl2br(value) { return escapeHTML(value).replace(/\n/g, '<br>'); }
function escapeAttr(value) { return escapeHTML(value).replace(/`/g, '&#96;'); }
const Modal = {
  show(html) {
    const o = document.getElementById('modal-overlay');
    document.getElementById('modal-content').innerHTML = html;
    o.classList.remove('hidden');
    o.onclick = (e) => { if (e.target === o) this.hide(); };
  },
  hide() { document.getElementById('modal-overlay').classList.add('hidden'); }
};
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function selectWords(count, mode, boostedIds) {
  const all = DB.getWords(); if (!all.length) return [];
  let pool = mode === 'newest' ? [...all].sort((a,b)=>b.id-a.id).slice(0,Math.max(count*2,30)) : [...all];
  const weighted = [];
  pool.forEach(w => { const wt = boostedIds.includes(w.id)?(w.frequencyWeight||1)*3:(w.frequencyWeight||1); for(let i=0;i<wt;i++) weighted.push(w); });
  const selected=[], usedIds=new Set(), shuffled=[...weighted].sort(()=>Math.random()-0.5);
  for(const w of shuffled) { if(!usedIds.has(w.id)){ usedIds.add(w.id); selected.push(w); if(selected.length>=count)break;} }
  return selected;
}
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function highlightEn(text, word) {
  const safeText = escapeHTML(text);
  if (!word || !safeText) return safeText;
  const safeWord = escapeHTML(word);
  return safeText.replace(new RegExp(`(${escapeRegex(safeWord)})`, 'gi'), '<span class="hl-en">$1</span>');
}
function highlightZh(text, wordZh) {
  const safeText = escapeHTML(text);
  if (!wordZh || !safeText) return safeText;
  const tokens = String(wordZh).split(/[、，,；;／/\s]+/)
    .map(t => t.replace(/[（(）)【】「」『』""''<>]/g,'').trim())
    .filter(t => t.length >= 2)
    .map(t => escapeHTML(t));
  if (!tokens.length) return safeText;
  tokens.sort((a,b) => b.length - a.length);
  const pattern = tokens.map(t => escapeRegex(t)).join('|');
  return safeText.replace(new RegExp(`(${pattern})`, 'g'), '<span class="hl-zh">$1</span>');
}
const TTS = {
  _synth: window.speechSynthesis || null,
  _enabled: localStorage.getItem('ttsEnabled') !== 'false',

  get enabled() { return this._enabled; },
  set enabled(v) { this._enabled = v; localStorage.setItem('ttsEnabled', v); },

  speak(text, rate = 0.85) {
    if (!this._synth || !this._enabled) return;
    this._synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US'; utter.rate = rate; utter.pitch = 1.0; utter.volume = 1.0;
    const voices = this._synth.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') &&
      (v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Karen') || v.name.includes('Moira'))
    ) || voices.find(v => v.lang.startsWith('en-US')) || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utter.voice = preferred;
    this._synth.speak(utter);
  },

  speakWhenReady(text, rate = 0.85) {
    if (!this._synth || !this._enabled) return;
    const voices = this._synth.getVoices();
    if (voices.length > 0) {
      this.speak(text, rate);
    } else {
      this._synth.onvoiceschanged = () => { this.speak(text, rate); this._synth.onvoiceschanged = null; };
    }
  }
};

// ===== ROUTER — FIX: quiz guard applies to ALL nav clicks including practice =====
const Router = {
  currentView: 'home',
  quizActive: false,
  essayActive: false,
  navigate(view, params = {}, force = false) {
    // Block ALL navigation (even back to practice) when quiz is active
    if ((this.quizActive || this.essayActive) && !force) {
      const isEssay = this.essayActive && !this.quizActive;
      // If already on that view AND quiz is active → show warning
      Modal.show(`
        <div class="modal-handle"></div>
        <div class="modal-title">⚠️ ${isEssay ? "文章撰寫中" : "測驗進行中"}</div>
        <p style="color:var(--text-muted);font-size:14px;margin-bottom:16px">
          ${isEssay ? "離開將會中斷目前的文章撰寫，<br>已輸入的內容將不會被儲存。" : "離開將會中斷目前的測驗，<br>進度將不會被記錄。"}確定要離開嗎？
        </p>
        <div class="modal-actions">
          <button class="modal-btn-cancel" id="stay-btn">${isEssay ? "繼續撰寫" : "繼續測驗"}</button>
          <button class="modal-btn-delete" id="leave-btn">${isEssay ? "離開撰寫" : "離開測驗"}</button>
        </div>
      `);
      document.getElementById('stay-btn').addEventListener('click', () => Modal.hide());
      document.getElementById('leave-btn').addEventListener('click', () => {
        Modal.hide(); this.quizActive = false; this.essayActive = false; this._doNavigate(view, params);
      });
      return;
    }
    this._doNavigate(view, params);
  },
  _doNavigate(view, params) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    this.currentView = view;
    const container = document.getElementById('view-container');
    container.innerHTML = '';
    const viewDiv = document.createElement('div');
    viewDiv.id = `${view}-view`; viewDiv.className = 'view-enter';
    container.appendChild(viewDiv);
    Views[view].render(viewDiv, params);
    setTimeout(() => window.updateScrollFabs?.(), 0);
  }
};

// ===== VIEWS =====
const Views = {};

// ===========================
// HOME VIEW
// ===========================
Views.home = {
  render(container) {
    container.innerHTML = `
      <div id="home-view">
        <div class="home-hero" id="hero-card">
          <div class="hero-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            今日例句
          </div>
          <div id="hero-content">
            <div class="hero-idle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;opacity:0.35;display:block;margin:0 auto 8px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><div style="font-size:12px;opacity:0.5">點右上角 ↻ 生成今日例句</div></div>
          </div>
          <button class="hero-refresh-btn" id="hero-refresh" title="強制重新生成">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
        </div>
        <div class="home-menu-grid">
          <div class="menu-card" data-nav="practice">
            <div class="menu-icon" style="background:#e8f5ee"><svg viewBox="0 0 24 24" fill="none" stroke="#1a7a4a" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>
            <div><div class="menu-card-title">英文練習</div><div class="menu-card-sub">單字拼寫測驗</div></div>
          </div>
          <div class="menu-card" data-nav="database">
            <div class="menu-icon" style="background:#e8f0ff"><svg viewBox="0 0 24 24" fill="none" stroke="#3366cc" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></div>
            <div><div class="menu-card-title">資料庫</div><div class="menu-card-sub">管理單字資料</div></div>
          </div>
          <div class="menu-card" data-nav="stats">
            <div class="menu-icon" style="background:#fff3e0"><svg viewBox="0 0 24 24" fill="none" stroke="#e67e00" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
            <div><div class="menu-card-title">練習統計</div><div class="menu-card-sub">近期練習情形</div></div>
          </div>
          <div class="menu-card" data-nav="settings">
            <div class="menu-icon" style="background:#f0e8ff"><svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></div>
            <div><div class="menu-card-title">設定</div><div class="menu-card-sub">API Key 與例句匯入</div><div class="menu-card-ver">版本別：${APP_VERSION}</div></div>
          </div>
        </div>
        <div class="sentence-log-section">
          <div class="sentence-log-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            每日例句記錄
          </div>
          <div id="sentence-log-content"></div>
        </div>
        <div style="height:8px"></div>
      </div>
    `;
    container.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => Router.navigate(el.dataset.nav)));
    document.getElementById('hero-refresh').addEventListener('click', () => this.loadSentence(true));
    // On page load: show cached sentence if available, otherwise show idle state (no auto API call)
    const cached = DB.getTodaySentenceAny();
    if (cached) { this.displaySentence(cached); }
    this.renderSentenceLog();
  },
  async loadSentence(forceNew) {
    const heroContent = document.getElementById('hero-content');
    if (!heroContent) return;
    // If not force, show cached and stop — user must press ↻ to generate
    if (!forceNew) {
      const cached = DB.getTodaySentenceAny();
      if (cached) { this.displaySentence(cached); }
      return;
    }
    // Check prerequisites before calling API
    if (!DB.getApiKey()) {
      heroContent.innerHTML = `<div style="font-size:13px;opacity:0.8">請先在設定頁填入 Gemini API Key</div>`;
      return;
    }
    const words = DB.getWords();
    if (!words.length) { heroContent.innerHTML = `<div style="font-size:13px;opacity:0.8">請先在資料庫新增單字</div>`; return; }
    heroContent.innerHTML = `<div class="hero-loading"><div class="loading-dots"><span></span><span></span><span></span></div><span>正在生成例句...</span></div>`;
    try {
      const word = words[Math.floor(Math.random() * words.length)];
      const result = await Gemini.generateSentence(word);
      if (!result.en || !result.zh) throw new Error('Invalid');
      if (!document.getElementById('hero-content')) return;
      const entry = { date: todayStr(), wordEn: word.english, wordZh: word.chinese, wordPos: word.partOfSpeech, en: result.en, zh: result.zh };
      DB.saveTodaySentence(entry); DB.saveSentenceToLog(entry);
      this.displaySentence(entry); this.renderSentenceLog();
    } catch(e) {
      if (!document.getElementById('hero-content')) return;
      let errText = '例句生成失敗，請點右上角重試';
      if (e.message === 'NO_API_KEY') errText = '請先在設定頁填入 Gemini API Key';
      else if (e.message === 'NETWORK_ERROR') errText = '網路連線失敗，請確認網路狀態後重試';
      else if (e.message === 'PARSE_ERROR') errText = 'AI 回應格式異常，請重試';
      else if (e.message) {
        const m = e.message;
        if (m.includes('quota') || m.includes('Quota') || m.includes('RESOURCE_EXHAUSTED')) errText = '⏳ API 配額已用盡，請稍後再試';
        else if (m.includes('API_KEY_INVALID') || m.includes('invalid')) errText = '🔑 API Key 無效，請重新確認';
        else if (m.includes('403') || m.includes('permission')) errText = '🔑 API Key 無權限，請確認設定';
        else if (m.includes('429')) errText = '⏳ 請求過於頻繁，請稍後再試';
        else errText = '⚠️ API 暫時無法使用，請稍後重試';
      }
      heroContent.innerHTML = `<div style="font-size:13px;opacity:0.85;line-height:1.6">${escapeHTML(errText)}<br><span style="font-size:11px;opacity:0.6">點右上角 ↻ 重試</span></div>`;
    }
  },
  displaySentence(entry) {
    const heroContent = document.getElementById('hero-content');
    if (!heroContent) return;
    const sourceTag = entry.source === 'csv'
      ? `<span class="hero-source-tag">📄 CSV</span>`
      : `<span class="hero-source-tag">✨ AI</span>`;
    heroContent.innerHTML = `
      <div class="hero-sentence">
        <div>${highlightEn(entry.en, entry.wordEn)}</div>
        <span class="zh-text">${highlightZh(entry.zh, entry.wordZh)}</span>
        <div style="margin-top:8px;display:flex;align-items:center;gap:6px">
          <span class="log-word-chip" style="margin:0">${escapeHTML(entry.wordEn)} <span style="opacity:0.6;font-size:10px">${escapeHTML(entry.wordPos||'')}</span></span>
          ${sourceTag}
        </div>
      </div>`;
  },
  renderSentenceLog() {
    const logContent = document.getElementById('sentence-log-content');
    if (!logContent) return;
    const log = DB.getCombinedSentenceLog();
    if (!log.length) {
      logContent.innerHTML = `<div class="log-empty">尚無例句記錄<br><span style="font-size:12px">可生成 AI 例句，或在設定頁匯入 CSV 例句</span></div>`;
      return;
    }
    // Show all entries in a scrollable container (shows ~4 at a time)
    logContent.innerHTML = `<div class="sentence-log-scroll">${log.map(entry => `
      <div class="log-entry-card">
        <div class="log-entry-header">
          <span class="log-date">${escapeHTML(entry.date)}</span>
          <span class="log-word-chip">${escapeHTML(entry.wordEn)} <span style="opacity:0.6;font-size:10px">${escapeHTML(entry.wordPos||'')}</span></span>
          ${entry.source === 'csv' ? `<span class="log-source-csv">CSV</span>` : ''}
        </div>
        <div class="log-entry-en">${highlightEn(entry.en, entry.wordEn)}</div>
        <div class="log-entry-zh">${highlightZh(entry.zh, entry.wordZh)}</div>
      </div>`).join('')}</div>`;
  }
};


// ===========================
// PRACTICE MODE SELECTOR — shared by quiz / essay / AI ask
// ===========================
function renderPracticeModeSelector(currentMode = 'quiz') {
  const isQuiz = currentMode === 'quiz';
  const isEssay = currentMode === 'essay';
  const isAiAsk = currentMode === 'aiask';
  return `
    <div class="practice-mode-bar">
      <select class="practice-mode-select" id="practice-mode-select" aria-label="選擇練習模式">
        <option value="quiz" ${isQuiz ? 'selected' : ''}>📝 單字拼寫</option>
        <option value="essay" ${isEssay ? 'selected' : ''}>✍️ 文章撰寫</option>
        <option value="aiask" ${isAiAsk ? 'selected' : ''}>💬 AI 詢問</option>
      </select>
    </div>`;
}

function bindPracticeModeSelector(container, currentMode = 'quiz') {
  const selector = container.querySelector('#practice-mode-select');
  if (!selector) return;
  selector.addEventListener('change', (e) => {
    const mode = e.target.value;
    if (mode === currentMode) return;
    Router.essayActive = false;
    Router.quizActive = false;
    if (mode === 'essay') Views.essay.render(container);
    else if (mode === 'aiask') Views.aiAsk.render(container);
    else Views.practice.render(container);
  });
}

// ===========================
// PRACTICE VIEW
// ===========================
Views.practice = {
  state: { selectedCount: 10, selectedMode: 'all', phase: 'setup', words: [], currentIdx: 0, wrongWords: [], showAnswer: false, waitingRetype: false },
  render(container) { this.state.phase = 'setup'; this.renderSetup(container); },
  renderSetup(container) {
    Router.quizActive = false;
    const totalWords = DB.getWords().length;
    container.innerHTML = `
      <div class="section-header"><h1 class="section-title">練習</h1></div>
      ${renderPracticeModeSelector('quiz')}
      <div class="practice-setup">
        ${totalWords === 0 ? `<div class="no-api-warning"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>資料庫尚無單字，請先新增單字</div>` : ''}
        <div class="option-group">
          <div class="option-label">練習題數</div>
          <div class="option-chips">${[5,10,15,20,25,30].map(n=>`<button class="chip ${n===10?'selected':''}" data-count="${n}">${n}</button>`).join('')}</div>
          <div class="num-words-info">資料庫共 ${totalWords} 個單字</div>
        </div>
        <div class="option-group">
          <div class="option-label">出題順序</div>
          <div class="option-radio-group">
            <div class="radio-option" data-mode="newest"><div class="radio-circle"></div><div><div class="radio-text">從最新加入開始</div><div class="radio-sub">依最近加入的單字優先出題</div></div></div>
            <div class="radio-option selected" data-mode="all"><div class="radio-circle"></div><div><div class="radio-text">全部隨機</div><div class="radio-sub">從題庫所有單字中隨機出題</div></div></div>
          </div>
        </div>
        <div class="option-group">
          <div class="option-label">唸單字延遲</div>
          <div class="option-chips">
            ${[0,300,600,1000,2000].map(ms => {
              const label = ms === 0 ? '立即' : ms < 1000 ? ms+'ms' : (ms/1000)+'s';
              const saved = DB.getTtsDelay();
              return `<button class="chip ${ms === saved ? 'selected' : ''}" data-tts-delay="${ms}">${label}</button>`;
            }).join('')}
          </div>
          <div class="num-words-info">進入單字練習後，系統唸出單字前的等待時間</div>
        </div>
        <button class="btn-primary" id="start-btn" ${totalWords===0?'disabled':''}>開始練習</button>
      </div>
    `;
    const state = this.state;
    container.querySelectorAll('[data-count]').forEach(btn => btn.addEventListener('click', () => {
      container.querySelectorAll('[data-count]').forEach(b=>b.classList.remove('selected')); btn.classList.add('selected'); state.selectedCount = parseInt(btn.dataset.count);
    }));
    container.querySelectorAll('[data-mode]').forEach(opt => opt.addEventListener('click', () => {
      container.querySelectorAll('[data-mode]').forEach(o=>o.classList.remove('selected')); opt.classList.add('selected'); state.selectedMode = opt.dataset.mode;
    }));
    bindPracticeModeSelector(container, 'quiz');
    container.querySelectorAll('[data-tts-delay]').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('[data-tts-delay]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        DB.saveTtsDelay(parseInt(btn.dataset.ttsDelay));
      });
    });

    document.getElementById('start-btn').addEventListener('click', () => {
      Sound.unlock(); // Prime AudioContext on user gesture before quiz starts
      const selected = selectWords(state.selectedCount, state.selectedMode, DB.getBoostedWords());
      if (!selected.length) { showToast('沒有可練習的單字'); return; }
      state.words = selected; state.currentIdx = 0; state.wrongWords = []; state.phase = 'quiz';
      Router.quizActive = true; this.initQuizShell(container);
      // Pre-warm speech synthesis so first word has voices ready
      if (window.speechSynthesis) { window.speechSynthesis.getVoices(); }
      this.renderQuiz(container);
    });
  },
  initQuizShell(container) {
    container.innerHTML = `
      <div class="progress-bar-wrap" id="quiz-progress-wrap">
        <div class="progress-label"><span id="progress-text">進度 1 / ${this.state.words.length}</span><span id="progress-pct">0%</span></div>
        <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
      </div>
      <div class="quiz-area">
        <div class="quiz-word-info" id="quiz-word-info"></div>
        <div class="letter-input-wrap" id="letter-wrap"></div>
      </div>
      <div class="quiz-actions" id="quiz-actions"></div>
    `;
    this._setupGhostInput();
  },
  _setupGhostInput() {
    let ghost = document.getElementById('quiz-ghost-input');
    if (!ghost) {
      ghost = document.createElement('input');
      ghost.id = 'quiz-ghost-input';
      // Keep a real input focused for the iOS keyboard, but make it visually inert.
      // type="text" avoids native search-field decoration work while typing.
      ghost.type = 'text';
      ghost.style.cssText = `position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:none;outline:none;background:transparent;color:transparent;caret-color:transparent;font-size:16px;z-index:-1;pointer-events:none;-webkit-appearance:none;appearance:none;`;
      ghost.setAttribute('autocapitalize','none');
      ghost.setAttribute('autocorrect','off');
      ghost.setAttribute('autocomplete','off');
      ghost.setAttribute('spellcheck','false');
      ghost.setAttribute('inputmode','text');
      ghost.setAttribute('enterkeyhint','done');
      ghost.setAttribute('name', 'quiz-' + Date.now()); // unique name prevents browser autocomplete
      document.getElementById('app').appendChild(ghost);
    }
    this._ghost = ghost; return ghost;
  },
  renderQuiz(container) {
    const state = this.state; const word = state.words[state.currentIdx];
    const total = state.words.length; const current = state.currentIdx + 1;
    const progress = Math.round((state.currentIdx / total) * 100);
    state.showAnswer = false; state.waitingRetype = false;
    const progressText = document.getElementById('progress-text');
    const progressPct = document.getElementById('progress-pct');
    const progressFill = document.getElementById('progress-fill');
    if (progressText) progressText.textContent = `進度 ${current} / ${total}`;
    if (progressPct) progressPct.textContent = `${progress}%`;
    if (progressFill) progressFill.style.width = `${progress}%`;
    const wordInfo = document.getElementById('quiz-word-info');
    if (wordInfo) {
      const ttsOn = TTS.enabled;
      wordInfo.innerHTML = `
        <div class="quiz-chinese">${word.chinese}</div>
        <div class="quiz-phonetic-row">
          <span class="quiz-pos">${word.partOfSpeech}</span>
          ${word.phonetic ? `<span class="quiz-phonetic">/${word.phonetic}/</span>` : ''}
          <button class="tts-inline-btn ${ttsOn?'':'tts-off'}" id="tts-replay-btn" title="${ttsOn?'再聽一次':'發音已關閉'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>${ttsOn?`<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`:`<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`}</svg>
          </button>
        </div>
        <div class="quiz-hint">${word.english.replace(/[^a-zA-Z]/g,'').length} 個字母</div>
      `;
      document.getElementById('tts-replay-btn')?.addEventListener('click', () => {
        if (TTS.enabled) {
          TTS.speakWhenReady(word.english, 0.75);
        } else {
          TTS.enabled = true;
          this.renderQuiz(container); // re-render to update icon state
        }
      });
    }
    const actionsEl = document.getElementById('quiz-actions');
    if (actionsEl) actionsEl.innerHTML = `<button class="btn-secondary" id="show-answer-btn">顯示答案</button>`;
    this.buildLetterBoxes(word, container);
    document.getElementById('show-answer-btn')?.addEventListener('click', () => this.showAnswer(word, container));
    // Speak the word aloud when it appears (slight delay so keyboard doesn't interrupt)
    // Delay TTS: 600ms for first word (voices may still be loading), 300ms for subsequent
    const ttsDelay = DB.getTtsDelay();
    setTimeout(() => TTS.speakWhenReady(word.english, 0.82), ttsDelay);
  },
  buildLetterBoxes(word, container) {
    const wrap = document.getElementById('letter-wrap'); if (!wrap) return;
    wrap.innerHTML = '';
    const wordParts = word.english.split(' ');
    // Only count actual letters — hyphens/apostrophes are static separators
    const totalLetters = word.english.replace(/[^a-zA-Z]/g, '').length;
    // Dynamic box size: fit all letters within available screen width
    const GAP = 4; // gap between boxes
    const PADDING = 48; // total horizontal padding
    const maxWidth = (window.innerWidth || 390) - PADDING;
    const longestPartLetters = Math.max(...wordParts.map(p => p.replace(/[^a-zA-Z]/g,'').length || 1));
    const boxesPerRow = longestPartLetters; // base size on letter count only
    const maxBoxSize = Math.floor((maxWidth - GAP * (boxesPerRow - 1)) / boxesPerRow);
    let boxSize = Math.min(38, maxBoxSize);
    // Enforce minimum readability
    if (boxSize < 20) boxSize = 20;
    const fontSize = Math.round(boxSize * 0.52);
    const allBoxDivs = [];
    wordParts.forEach((part, wi) => {
      if (wi > 0) { const sep = document.createElement('div'); sep.className = 'word-separator'; sep.textContent = ' '; wrap.appendChild(sep); }
      const group = document.createElement('div'); group.className = 'word-group';
      [...part].forEach((ch) => {
        const box = document.createElement('div');
        if (/[a-zA-Z]/.test(ch)) {
          // Interactive input box
          box.className = 'letter-box-vis';
          box.style.cssText = `width:${boxSize}px;height:${boxSize+6}px;font-size:${fontSize}px`;
          allBoxDivs.push(box);
        } else {
          // Static separator (hyphen, apostrophe, etc.) — never part of userInput
          box.className = 'letter-box-sep';
          box.textContent = ch;
          box.style.cssText = `font-size:${Math.round(fontSize*1.1)}px;line-height:${boxSize+6}px`;
        }
        group.appendChild(box);
      });
      wrap.appendChild(group);
    });
    const ghost = this._ghost; ghost.value = '';
    // Clean up previous handlers. V6_1 uses beforeinput fast-path + input fallback.
    if (ghost._beforeInputH) { ghost.removeEventListener('beforeinput', ghost._beforeInputH); ghost._beforeInputH = null; }
    if (ghost._inputH)       { ghost.removeEventListener('input', ghost._inputH);             ghost._inputH = null;       }
    if (ghost._keydownH)     { ghost.removeEventListener('keydown', ghost._keydownH);          ghost._keydownH = null;     }

    // correctStr contains only letters — matches what the user can type.
    let userInput = '';
    const maxLen = totalLetters;
    const correctStr = word.english.replace(/[^a-zA-Z]/g,'').toLowerCase();

    // Track previous box state to avoid unnecessary DOM writes.
    const prevCls = new Array(allBoxDivs.length).fill('');
    const prevTxt = new Array(allBoxDivs.length).fill('');
    let lastRenderedInput = null;
    let evaluating = false;

    const writeBox = (i, cls, txt) => {
      if (i < 0 || i >= allBoxDivs.length) return;
      const box = allBoxDivs[i];
      if (prevTxt[i] !== txt) { box.textContent = txt; prevTxt[i] = txt; }
      if (prevCls[i] !== cls) { box.className = cls ? 'letter-box-vis ' + cls : 'letter-box-vis'; prevCls[i] = cls; }
    };

    const updateDefaultVisual = () => {
      const previous = lastRenderedInput;
      const next = userInput;

      // First render: paint all boxes once.
      if (previous === null) {
        for (let i = 0; i < allBoxDivs.length; i++) {
          if (i < next.length) writeBox(i, 'filled', next[i]);
          else if (i === next.length) writeBox(i, 'cursor cursor-active', '');
          else writeBox(i, '', '');
        }
        lastRenderedInput = next;
        return;
      }

      // Incremental render: only update changed letters plus old/new cursor positions.
      let firstChanged = 0;
      const minLen = Math.min(previous.length, next.length);
      while (firstChanged < minLen && previous[firstChanged] === next[firstChanged]) firstChanged++;

      const indices = new Set();
      const oldCursor = previous.length < allBoxDivs.length ? previous.length : -1;
      const newCursor = next.length < allBoxDivs.length ? next.length : -1;
      if (oldCursor >= 0) indices.add(oldCursor);
      if (newCursor >= 0) indices.add(newCursor);
      for (let i = firstChanged; i <= Math.max(previous.length, next.length); i++) indices.add(i);

      indices.forEach(i => {
        if (i < 0 || i >= allBoxDivs.length) return;
        if (i < next.length) writeBox(i, 'filled', next[i]);
        else if (i === next.length) writeBox(i, 'cursor cursor-active', '');
        else writeBox(i, '', '');
      });
      lastRenderedInput = next;
    };

    const updateVisual = (state = 'default') => {
      if (state === 'correct') {
        for (let i = 0; i < allBoxDivs.length; i++) writeBox(i, 'correct', correctStr[i] || '');
        lastRenderedInput = userInput;
        return;
      }
      if (state === 'wrong') {
        for (let i = 0; i < allBoxDivs.length; i++) writeBox(i, 'wrong', userInput[i] || '');
        lastRenderedInput = userInput;
        return;
      }
      updateDefaultVisual();
    };

    const normalizeInput = (value) => (value || '').replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, maxLen);

    const maybeEvaluate = () => {
      if (userInput.length < maxLen || evaluating) return;
      evaluating = true;
      const snapshot = userInput;
      requestAnimationFrame(() => {
        evaluating = false;
        if (this.state.showAnswer) return;
        if (!this.state.waitingRetype)
          this._checkAnswer(word, snapshot, allBoxDivs, container, updateVisual, correctStr, maxLen);
        else
          this._checkRetype(word, snapshot, allBoxDivs, container, updateVisual, correctStr);
      });
    };

    const applyInput = (nextValue, syncGhost = true) => {
      if (this.state.showAnswer) return;
      const next = normalizeInput(nextValue);
      if (next === userInput) {
        if (syncGhost && ghost.value !== userInput) ghost.value = userInput;
        return;
      }
      userInput = next;
      if (syncGhost && ghost.value !== userInput) ghost.value = userInput;
      updateVisual();
      maybeEvaluate();
    };

    // ── Input handling ──────────────────────────────────────────────────────────
    // V6_1: beforeinput is used as a fast path, so the app updates the letter boxes
    // before Safari finishes its native input rendering pipeline. To avoid the old
    // iOS Chinese-keyboard double-letter bug, intermediate insertCompositionText is
    // ignored and only committed text / deletion is processed. The input event stays
    // as a fallback for browsers or IME paths that do not allow beforeinput canceling.
    ghost._beforeInputH = (e) => {
      if (this.state.showAnswer) return;
      const type = e.inputType || '';

      // Ignore intermediate IME composition. The committed value arrives later as
      // insertFromComposition or via the normal input fallback.
      if (e.isComposing || type === 'insertCompositionText') return;

      if (type === 'deleteContentBackward') {
        e.preventDefault();
        applyInput(userInput.slice(0, -1));
        return;
      }

      if (type === 'deleteContentForward' || type === 'deleteByCut') {
        e.preventDefault();
        return;
      }

      if (type === 'insertFromPaste') {
        e.preventDefault();
        const pasted = e.data || e.clipboardData?.getData?.('text') || e.dataTransfer?.getData?.('text') || '';
        applyInput(userInput + pasted);
        return;
      }

      if (type === 'insertText' || type === 'insertFromComposition' || type === '') {
        const letters = normalizeInput(e.data || '');
        if (!letters || userInput.length >= maxLen) {
          e.preventDefault();
          if (ghost.value !== userInput) ghost.value = userInput;
          return;
        }
        e.preventDefault();
        applyInput(userInput + letters);
      }
    };

    ghost._inputH = () => {
      // Fallback path: browser/IME updated the hidden input itself.
      applyInput(ghost.value, false);
    };

    // Hardware-keyboard fallback for environments where beforeinput is incomplete.
    // Guard against double handling: normal mobile input is already covered above.
    ghost._keydownH = (e) => {
      if (this.state.showAnswer) return;
      if (e.key === 'Backspace' && !e.isComposing && e.inputType === undefined && typeof InputEvent === 'undefined') {
        e.preventDefault();
        applyInput(userInput.slice(0, -1));
      }
    };

    ghost.addEventListener('beforeinput', ghost._beforeInputH, { passive: false });
    ghost.addEventListener('input', ghost._inputH);
    ghost.addEventListener('keydown', ghost._keydownH);
    ghost.style.pointerEvents = 'auto';
    wrap.style.cursor = 'text';
    // Use .onclick assignment (not addEventListener) so it never accumulates across buildLetterBoxes calls.
    wrap.onclick = (e) => { e.stopPropagation(); ghost.focus({ preventScroll: true }); };
    const _qa = document.querySelector('.quiz-area');
    if (_qa) { _qa.onclick = () => { if (this._ghost) this._ghost.focus({ preventScroll: true }); }; }
    Sound.unlock(); // ensure AudioContext is running before first keystroke
    ghost.focus({ preventScroll: true }); updateVisual();
  },
  // Canonical answer normaliser — strips everything except a-z, lowercases
  _norm(s) { return (s || '').replace(/[^a-zA-Z]/g, '').toLowerCase(); },

  _checkAnswer(word, typed, allBoxDivs, container, updateVisual, correctStr, maxLen) {
    // Always recompute from the word itself — guards against any stale closure value
    const canonical = this._norm(word.english);
    const isCorrect = this._norm(typed) === canonical;

    if (isCorrect) {
      Sound.playCorrect(); updateVisual('correct');
      // Brief pause so the green animation is visible, then show the Next button
      requestAnimationFrame(() => requestAnimationFrame(() => this.showNextBtn(word, container)));
    } else {
      Sound.playWrong(); updateVisual('wrong');
      if (!this.state.wrongWords.find(w => w.id === word.id)) {
        this.state.wrongWords.push(word);
        setTimeout(() => DB.updateWord(word.id, { wrongCount: (word.wrongCount||0)+1 }), 50);
      }
      setTimeout(() => {
        this.buildLetterBoxes(word, container);
        if (!document.getElementById('show-answer-btn')) {
          const actionsEl = document.getElementById('quiz-actions');
          if (actionsEl) { const btn = document.createElement('button'); btn.className='btn-secondary'; btn.id='show-answer-btn'; btn.textContent='顯示答案'; btn.addEventListener('click',()=>this.showAnswer(word,container)); actionsEl.prepend(btn); }
        }
      }, 800);
    }
  },
  _checkRetype(word, typed, allBoxDivs, container, updateVisual, correctStr) {
    const isCorrect = this._norm(typed) === this._norm(word.english);
    if (isCorrect) {
      Sound.playCorrect(); updateVisual('correct');
      this.state.waitingRetype = false;
      requestAnimationFrame(() => requestAnimationFrame(() => this.showNextBtn(word, container)));
    } else {
      Sound.playWrong(); updateVisual('wrong');
      setTimeout(() => { this.buildLetterBoxes(word, container); }, 800);
    }
  },
  showAnswer(word, container) {
    const state = this.state; state.showAnswer = true;
    // Count as wrong silently
    if (!state.wrongWords.find(w => w.id === word.id)) {
      state.wrongWords.push(word);
      DB.updateWord(word.id, { wrongCount: (word.wrongCount||0)+1 });
    }
    const correctStr = this._norm(word.english);
    const actionsEl  = document.getElementById('quiz-actions');
    const boxes      = document.querySelectorAll('.letter-box-vis');
    // Flash correct letters in red
    boxes.forEach((box,i) => { box.className='letter-box-vis wrong'; box.textContent=correctStr[i]||''; });
    actionsEl.innerHTML = `<div class="answer-reveal answer-reveal-wrong"><div class="revealed-word revealed-word-wrong">${word.english.toLowerCase()}</div><div class="reveal-hint">請重新輸入一次正確拼字</div></div>`;
    // showAnswer=false BEFORE the timeout so beforeinput is live again
    state.showAnswer = false;
    state.waitingRetype = true;
    if (this._ghost) { this._ghost.style.pointerEvents = 'auto'; this._ghost.focus(); }
    setTimeout(() => { this.buildLetterBoxes(word, container); }, 80);
  },
  showNextBtn(word, container) {
    const actionsEl = document.getElementById('quiz-actions');
    const isLast = this.state.currentIdx + 1 >= this.state.words.length;
    actionsEl.innerHTML = `<div class="correct-answer-row">${word.english.toLowerCase()}</div><button class="btn-primary" id="next-btn">${isLast ? '查看結果 →' : '下一題 → (Enter)'}</button>`;
    const doNext = () => {
      if (this._ghost) this._ghost.removeEventListener('keydown', this._enterNextH);
      this.state.currentIdx++;
      if (this.state.currentIdx >= this.state.words.length) {
        Router.quizActive = false;
        const ghost = document.getElementById('quiz-ghost-input');
        if (ghost) { ghost.style.pointerEvents='none'; ghost.blur(); ghost.remove(); this._ghost=null; }
        this.renderResult(container);
      } else {
        this.renderQuiz(container);
        if (this._ghost) { this._ghost.value=''; this._ghost.focus(); }
      }
    };
    document.getElementById('next-btn').addEventListener('click', doNext);
    this._enterNextH = (e) => { if (e.key==='Enter') { e.preventDefault(); doNext(); } };
    if (this._ghost) { this._ghost.addEventListener('keydown', this._enterNextH); this._ghost.focus(); }
  },
  renderResult(container) {
    const state = this.state; const total = state.words.length; const wrongCount = state.wrongWords.length;
    const correctCount = total - wrongCount; const pct = total > 0 ? Math.round((correctCount/total)*100) : 0;
    DB.addPracticeSession(todayStr(), total, state.wrongWords.map(w=>({english:w.english,partOfSpeech:w.partOfSpeech,chinese:w.chinese})));
    setTimeout(() => Sound.playResult(pct), 150);
    container.innerHTML = `
      <div class="result-view">
        <div class="result-score">
          <div class="result-circle"><div class="result-percent">${pct}%</div><div class="result-label">正確率</div></div>
          <div class="result-stats"><span class="stat-correct">✓ 正確 ${correctCount}</span><span style="color:var(--border)">|</span><span class="stat-wrong">✗ 錯誤 ${wrongCount}</span><span style="color:var(--border)">|</span><span>共 ${total} 題</span></div>
        </div>
        ${wrongCount > 0 ? `<div class="wrong-list-title">需要加強的單字（${wrongCount}個）</div>` : ''}
        ${wrongCount === 0 ? `<div style="text-align:center;padding:24px;color:var(--text-muted);font-weight:700">🎉 全部答對！太棒了！</div>`
          : state.wrongWords.map(w=>`
            <div class="wrong-word-card" data-id="${w.id}">
              <div class="wrong-word-en">${w.english.toLowerCase()}</div>
              <div class="wrong-word-meta"><span class="wrong-word-pos">${w.partOfSpeech}</span><span class="wrong-word-zh">${w.chinese}</span></div>
              <button class="boost-btn ${DB.isBoosted(w.id)?'boosted':''}" data-boost="${w.id}">${DB.isBoosted(w.id)?'✓ 已加強練習':'⚡ 加入加強練習'}</button>
            </div>`).join('')}
        <div style="height:16px"></div>
        <button class="btn-primary" id="back-home-btn">回到主頁</button>
        <div style="height:8px"></div>
        <button class="btn-secondary" id="retry-btn">重新練習</button>
      </div>
    `;
    container.querySelectorAll('[data-boost]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.boost; const isBoosted = DB.toggleBoost(id);
      btn.textContent = isBoosted?'✓ 已加強練習':'⚡ 加入加強練習'; btn.classList.toggle('boosted', isBoosted);
      showToast(isBoosted?'已加入加強練習清單':'已移除加強練習');
    }));
    document.getElementById('back-home-btn').addEventListener('click', () => Router.navigate('home'));
    document.getElementById('retry-btn').addEventListener('click', () => { state.phase='setup'; this.renderSetup(container); });
  }
};

// ===========================
// DATABASE VIEW
// ===========================
Views.database = {
  deleteMode: false, selectedIds: new Set(),
  aiCorrectMode: false, aiCorrectIds: new Set(),
  sortMode: localStorage.getItem('dbSortMode') || 'createdAt',
  render(container) { this.deleteMode = false; this.selectedIds = new Set(); this.aiCorrectMode = false; this.aiCorrectIds = new Set(); this.renderList(container); },
  // 僅更新單字列表區塊，不重整整頁（保留 ECDICT 搜尋結果）
  _refreshWordList(container) {
    const words = this._sortWords(DB.getWords());
    const dm = this.deleteMode; const sel = this.selectedIds;
    const acm = this.aiCorrectMode; const acs = this.aiCorrectIds;
    // Update badge
    const badge = container.querySelector('.word-count-badge');
    if (badge) badge.textContent = `${words.length} 個單字`;
    // Update sort bar active state
    container.querySelectorAll('.db-sort-chip').forEach(b => b.classList.toggle('active', b.dataset.sort === this.sortMode));
    // Rebuild word list
    const listEl = document.getElementById('db-list');
    if (!listEl) return;
    if (words.length === 0) {
      listEl.innerHTML = `<div class="db-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display:block;margin:auto"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg><div class="db-empty-title">資料庫是空的</div><div class="db-empty-sub">點選「新增」或從 ECDICT 搜尋加入單字</div></div>`;
      return;
    }
    listEl.innerHTML = words.map(w => {
      const boosted = DB.isBoosted(w.id);
      return `<div class="db-word-card ${dm?'delete-mode':acm?'ai-correct-mode':''}" data-id="${w.id}">
        <div class="db-checkbox ${dm&&sel.has(w.id)?'checked':acm&&acs.has(w.id)?'checked ai-check':''}" data-id="${w.id}"></div>
        <div class="db-word-main">
          <div class="db-word-en">${w.english}${w.partOfSpeech ? `<span class="db-word-pos">${w.partOfSpeech}</span>` : ''}${boosted?'<span class="boost-badge">⚡</span>':''}</div>
          ${w.phonetic?`<div class="db-word-phonetic">/${w.phonetic}/</div>`:''}
          <div class="db-word-zh">${w.chinese}</div>
          <div class="db-word-meta"><span>${w.createdAt||'—'}</span><span>答錯 ${w.wrongCount||0}次</span>${(w.frequencyWeight||1)>1?`<span>加權${w.frequencyWeight}x</span>`:''}</div>
        </div>
        <div class="db-word-actions">
          <button class="db-tts-btn" data-tts="${w.english}" title="播放發音"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></button>
          ${(!dm&&!acm)?`<button class="db-word-edit-btn" data-edit="${w.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`:''}
        </div>
      </div>`;
    }).join('');
    // Re-wire TTS and edit buttons
    listEl.querySelectorAll('.db-tts-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        TTS.speakWhenReady(btn.dataset.tts, 0.82);
        btn.classList.add('tts-playing');
        setTimeout(() => btn.classList.remove('tts-playing'), 1200);
      });
    });
    listEl.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const word = DB.getWords().find(w => w.id === btn.dataset.edit);
        if (word) this.showEditModal(word, container);
      });
    });
    listEl.querySelectorAll('.db-checkbox').forEach(cb => cb.addEventListener('click', () => {
      const id = cb.dataset.id;
      if (this.deleteMode) {
        this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
        cb.classList.toggle('checked', this.selectedIds.has(id));
        cb.classList.remove('ai-check');
        const btn = document.getElementById('delete-toggle-btn');
        if (btn) btn.innerHTML = svgTrash + (this.selectedIds.size > 0 ? `確認(${this.selectedIds.size})` : '確認');
      } else if (this.aiCorrectMode) {
        this.aiCorrectIds.has(id) ? this.aiCorrectIds.delete(id) : this.aiCorrectIds.add(id);
        cb.classList.toggle('checked', this.aiCorrectIds.has(id));
        cb.classList.toggle('ai-check', this.aiCorrectIds.has(id));
        const btn = document.getElementById('ai-correct-run-btn');
        if (btn) btn.textContent = this.aiCorrectIds.size > 0 ? `執行 AI 更正 (${this.aiCorrectIds.size})` : '執行 AI 更正';
      }
    }));
    // ── Background: auto-fill missing partOfSpeech from ECDICT ──
    // Handles words added/imported before the pos-fix (their partOfSpeech is empty in localStorage)
    const missingPosWords = words.filter(w => !w.partOfSpeech);
    if (missingPosWords.length > 0) {
      ECDICT.isLoaded().then(loaded => {
        if (!loaded) return;
        missingPosWords.forEach(async (w) => {
          try {
            const rec = await ECDICT.lookup(w.english); // _enrichPos is applied inside lookup
            if (!rec?.pos) return;
            // Persist to localStorage so next render has it ready
            DB.updateWord(w.id, { partOfSpeech: rec.pos });
            // Update DOM in-place (no full re-render needed)
            const enEl = listEl.querySelector(`.db-word-card[data-id="${w.id}"] .db-word-en`);
            if (enEl && !enEl.querySelector('.db-word-pos')) {
              const span = document.createElement('span');
              span.className = 'db-word-pos';
              span.textContent = rec.pos;
              // Insert before boost-badge if present, otherwise append
              const badge = enEl.querySelector('.boost-badge');
              enEl.insertBefore(span, badge || null);
            }
          } catch {}
        });
      });
    }
  },
  _sortWords(words) {
    const arr = [...words];
    if (this.sortMode === 'alpha') {
      arr.sort((a, b) => a.english.localeCompare(b.english));
    } else if (this.sortMode === 'wrongCount') {
      arr.sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
    } else {
      // createdAt: newest first (default)
      arr.sort((a, b) => {
        const ta = a.createdAt || ''; const tb = b.createdAt || '';
        if (ta === tb) return b.id.localeCompare(a.id);
        return tb.localeCompare(ta);
      });
    }
    return arr;
  },
  // Lightweight refresh: update only the word list + badge without destroying lookup card state
  _refreshWordList(container) {
    const rawWords = DB.getWords();
    const words    = this._sortWords(rawWords);
    const dm  = this.deleteMode;  const sel = this.selectedIds;
    const acm = this.aiCorrectMode; const acs = this.aiCorrectIds;
    // Update badge
    const badge = container.querySelector('.word-count-badge');
    if (badge) badge.textContent = words.length + ' 個單字';
    // Update list
    const listEl = container.querySelector('#db-list');
    if (!listEl) return;
    if (words.length === 0) {
      listEl.innerHTML = `<div class="db-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display:block;margin:auto"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg><div class="db-empty-title">資料庫是空的</div><div class="db-empty-sub">點選「新增」或從 ECDICT 搜尋加入單字</div></div>`;
      return;
    }
    listEl.innerHTML = words.map(w => {
      const boosted = DB.isBoosted(w.id);
      return `<div class="db-word-card ${dm?'delete-mode':acm?'ai-correct-mode':''}" data-id="${w.id}">
        <div class="db-checkbox ${dm&&sel.has(w.id)?'checked':acm&&acs.has(w.id)?'checked ai-check':''}" data-id="${w.id}"></div>
        <div class="db-word-main">
          <div class="db-word-en">${w.english}${w.partOfSpeech?`<span class="db-word-pos">${w.partOfSpeech}</span>`:''}${boosted?'<span class="boost-badge">⚡</span>':''}</div>
          ${w.phonetic?`<div class="db-word-phonetic">/${w.phonetic}/</div>`:''}
          <div class="db-word-zh">${w.chinese}</div>
          <div class="db-word-meta"><span>${w.createdAt||'—'}</span><span>答錯 ${w.wrongCount||0}次</span>${(w.frequencyWeight||1)>1?`<span>加權${w.frequencyWeight}x</span>`:''}</div>
        </div>
        <div class="db-word-actions">
          <button class="db-tts-btn" data-tts="${w.english}" title="播放發音"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></button>
          ${(!dm&&!acm)?`<button class="db-word-edit-btn" data-edit="${w.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`:''}
        </div>
      </div>`;
    }).join('');
    // Re-bind TTS and edit buttons on the refreshed list
    listEl.querySelectorAll('.db-tts-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        TTS.speakWhenReady(btn.dataset.tts, 0.82);
        btn.classList.add('tts-playing');
        setTimeout(() => btn.classList.remove('tts-playing'), 1200);
      });
    });
    listEl.querySelectorAll('.db-word-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = DB.getWords().find(x => x.id === btn.dataset.edit);
        if (w) this.showEditModal(w, container);
      });
    });
    listEl.querySelectorAll('.db-word-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (this.deleteMode) {
          this.selectedIds[this.selectedIds.has(id)?'delete':'add'](id);
          card.querySelector('.db-checkbox')?.classList.toggle('checked', this.selectedIds.has(id));
          const confBtn = container.querySelector('#delete-toggle-btn');
          if (confBtn) confBtn.textContent = this.selectedIds.size > 0 ? `確認(${this.selectedIds.size})` : '確認';
        } else if (this.aiCorrectMode) {
          this.aiCorrectIds[this.aiCorrectIds.has(id)?'delete':'add'](id);
          const cb = card.querySelector('.db-checkbox');
          if (cb) { cb.classList.toggle('checked', this.aiCorrectIds.has(id)); cb.classList.toggle('ai-check', this.aiCorrectIds.has(id)); }
        }
      });
    });
  },

  async renderList(container) {
    const rawWords = DB.getWords();
    const words = this._sortWords(rawWords);
    const dm = this.deleteMode; const sel = this.selectedIds;
    const acm = this.aiCorrectMode; const acs = this.aiCorrectIds;
    const ecdictMeta = await ECDICT.getMeta();
    const ecdictLoaded = ecdictMeta && ecdictMeta.count > 0;
    container.innerHTML = `
      <div class="section-header">
        <h1 class="section-title">資料庫</h1>
        <span class="word-count-badge">${words.length} 個單字</span>
      </div>
      <div class="lookup-card">
        <!-- Card header -->
        <div class="lookup-card-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <span>單字查詢</span>
        </div>
        <!-- Segmented tab control -->
        <div class="lookup-seg-wrap">
          <div class="lookup-seg">
            <button class="lookup-seg-btn" data-tab="ecdict">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <span class="lookup-seg-label">ECDICT</span>
              ${ecdictLoaded
                ? `<span class="lookup-seg-sub">${Math.round(ecdictMeta.count/10000)}萬字</span>`
                : `<span class="lookup-seg-sub unloaded">未載入</span>`}
            </button>
            <button class="lookup-seg-btn active" data-tab="ai">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
              <span class="lookup-seg-label">AI 查詢</span>
              <span class="lookup-seg-sub">${(Gemini.AVAILABLE_MODELS.find(m=>m.id===DB.getModel())?.id || DB.getModel()).replace('gemini-','').replace('-it','')}</span>
            </button>
          </div>
        </div>
        <!-- ECDICT pane -->
        <div class="lookup-pane" id="pane-ecdict" style="display:none">
          ${ecdictLoaded
            ? `<div class="ecdict-search-wrap">
                <div class="ecdict-search-row">
                  <input class="ecdict-search-input" id="ecdict-search" placeholder="搜尋 ECDICT 單字..." autocorrect="off" autocapitalize="off" spellcheck="false">
                  <button class="ecdict-clear-btn" id="ecdict-clear-btn" title="清除" style="display:none">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div class="ecdict-results" id="ecdict-results"></div>
               </div>
               <div class="ecdict-actions"><button class="btn-icon btn-ecdict-reload" id="ecdict-reload-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>重新載入 CSV</button></div>`
            : `<div class="ecdict-intro"><p>載入 ECDICT.csv 後可快速搜尋單字並新增至練習庫。<br>資料儲存於本機，無需網路。</p><button class="btn-ecdict-load" id="ecdict-load-btn"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 7C2 5.9 2.9 5 4 5H10L12 7H20C21.1 7 22 7.9 22 9V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V7Z" fill="#f5a623" stroke="#d4891a" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 10H22V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V10Z" fill="#ffc84a" stroke="#d4891a" stroke-width="1.5" stroke-linejoin="round"/></svg>選擇 ECDICT.csv 檔案</button></div>`}
          <div id="ecdict-progress" style="display:none"><div class="ecdict-progress-bar"><div class="ecdict-progress-fill" id="ecdict-progress-fill"></div></div><div class="ecdict-progress-text" id="ecdict-progress-text">準備中...</div></div>
        </div>
        <!-- AI pane -->
        <div class="lookup-pane" id="pane-ai">
          ${DB.getApiKey()
            ? `<div class="ai-search-wrap">
                <div class="ecdict-search-row">
                  <div class="ai-input-wrap">
                    <input class="ecdict-search-input" id="ai-word-input" placeholder="輸入英文單字查詢..." autocorrect="off" autocapitalize="off" spellcheck="false">
                    <button class="ecdict-clear-btn ai-clear-btn" id="ai-word-clear-btn" title="清除" style="display:none">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <button class="ai-search-btn" id="ai-search-btn" title="查詢">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </button>
                </div>
                <div id="ai-results"></div>
               </div>`
            : `<div class="ecdict-intro"><p>使用 Gemini AI 查詢單字，包含所有詞性與中文釋義。<br>請先在設定頁填入 Gemini API Key。</p><button class="btn-ecdict-load" id="ai-goto-settings-btn">前往設定</button></div>`}
        </div>
        <input type="file" id="ecdict-file-input" accept=".csv" style="display:none">
      </div>

      <div class="db-toolbar">
        <button class="btn-icon btn-add" id="add-word-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>新增</button>
        <button class="btn-icon btn-export" id="export-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="2" fill="#5b8dd9" stroke="#3a6bc4"/><rect x="6" y="2" width="12" height="8" rx="1" fill="#a8c4f0" stroke="#3a6bc4" stroke-width="1.5"/><rect x="9" y="3.5" width="4" height="5" rx="0.5" fill="#3a6bc4" stroke="none"/><rect x="4" y="13" width="16" height="7" rx="1" fill="#d6e8ff" stroke="#3a6bc4" stroke-width="1.5"/></svg>匯出</button>
        <button class="btn-icon btn-import" id="import-btn"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 7C2 5.9 2.9 5 4 5H10L12 7H20C21.1 7 22 7.9 22 9V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V7Z" fill="#f5a623" stroke="#d4891a" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 10H22V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V10Z" fill="#ffc84a" stroke="#d4891a" stroke-width="1.5" stroke-linejoin="round"/></svg>匯入</button>
        <button class="btn-icon ${dm?'btn-delete-confirm':'btn-delete-toggle'}" id="delete-toggle-btn"${words.length===0?' disabled style="opacity:0.4;cursor:not-allowed"':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>${dm?(sel.size>0?`確認(${sel.size})`:'確認'):'刪除'}</button>
        <button class="btn-icon ${acm?'btn-ai-correct-active':'btn-ai-correct'}" id="ai-correct-btn"${!DB.getApiKey()||words.length===0?' disabled style="opacity:0.4;cursor:not-allowed"':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/></svg>${acm?'取消更正':'AI 更正'}</button>
        ${acm?`<button class="btn-icon btn-ai-correct-run" id="ai-correct-run-btn" style="background:var(--primary);color:#fff">${acs.size>0?`執行 AI 更正 (${acs.size})`:'執行 AI 更正'}</button>`:''}
      </div>
      <input type="file" id="csv-file-input" accept=".csv" style="display:none">
      <!-- 排序列 -->
      <div class="db-sort-bar">
        <span class="db-sort-label">排序：</span>
        <button class="db-sort-chip ${this.sortMode==='createdAt'?'active':''}" data-sort="createdAt">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          建立時間
        </button>
        <button class="db-sort-chip ${this.sortMode==='alpha'?'active':''}" data-sort="alpha">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l8-3 8 3"/><path d="M4 10h16"/><path d="M4 14h16"/><path d="M4 18h16"/></svg>
          字首 A→Z
        </button>
        <button class="db-sort-chip ${this.sortMode==='wrongCount'?'active':''}" data-sort="wrongCount">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          錯誤次數
        </button>
      </div>
      ${dm ? `<button id="db-back-to-top" class="db-back-to-top" title="回到頂部"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg></button>` : ''}
      <div class="db-list-scroll"><div class="db-list" id="db-list">
        ${words.length === 0
          ? `<div class="db-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display:block;margin:auto"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg><div class="db-empty-title">資料庫是空的</div><div class="db-empty-sub">點選「新增」或從 ECDICT 搜尋加入單字</div></div>`
          : words.map(w => {
              const boosted = DB.isBoosted(w.id);
              return `<div class="db-word-card ${dm?'delete-mode':acm?'ai-correct-mode':''}" data-id="${w.id}">
                <div class="db-checkbox ${dm&&sel.has(w.id)?'checked':acm&&acs.has(w.id)?'checked ai-check':''}" data-id="${w.id}"></div>
                <div class="db-word-main">
                  <div class="db-word-en">${w.english}${w.partOfSpeech ? `<span class="db-word-pos">${w.partOfSpeech}</span>` : ''}${boosted?'<span class="boost-badge">⚡</span>':''}</div>
                  ${w.phonetic?`<div class="db-word-phonetic">/${w.phonetic}/</div>`:''}
                  <div class="db-word-zh">${w.chinese}</div>
                  <div class="db-word-meta"><span>${w.createdAt||'—'}</span><span>答錯 ${w.wrongCount||0}次</span>${(w.frequencyWeight||1)>1?`<span>加權${w.frequencyWeight}x</span>`:''}</div>
                </div>
                <div class="db-word-actions">
                  <button class="db-tts-btn" data-tts="${w.english}" title="播放發音"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></button>
                  ${(!dm&&!acm)?`<button class="db-word-edit-btn" data-edit="${w.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`:''}
                </div>
              </div>`;
            }).join('')}
      </div></div>
      <div style="height:20px"></div>
    `;
    // TTS buttons in word list
    container.querySelectorAll('.db-tts-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        TTS.speakWhenReady(btn.dataset.tts, 0.82);
        btn.classList.add('tts-playing');
        setTimeout(() => btn.classList.remove('tts-playing'), 1200);
      });
    });
    // ── Tab switching ──
    document.querySelectorAll('.lookup-seg-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.lookup-seg-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const pane = tab.dataset.tab;
        document.getElementById('pane-ecdict').style.display = pane === 'ecdict' ? '' : 'none';
        document.getElementById('pane-ai').style.display = pane === 'ai' ? '' : 'none';
        if (pane === 'ai') setTimeout(() => document.getElementById('ai-word-input')?.focus(), 50);
      });
    });

    // ── Go to settings (when no API key) ──
    document.getElementById('ai-goto-settings-btn')?.addEventListener('click', () => Router.navigate('settings'));

    // ── AI word lookup ──
    const aiWordInput = document.getElementById('ai-word-input');
    const aiSearchBtn = document.getElementById('ai-search-btn');
    const aiResults   = document.getElementById('ai-results');

    const existingWordsSet = () => new Set(DB.getWords().map(w => w.english.toLowerCase()));

    const renderAIResults = (entries) => {
      if (!aiResults) return;
      if (!entries.length) {
        aiResults.innerHTML = '<div class="ecdict-no-result">查無結果，請確認單字拼寫</div>';
        return;
      }
      const existing = existingWordsSet();
      aiResults.innerHTML = entries.map((e, idx) => {
        const alreadyIn = existing.has((e.english||'').toLowerCase());
        return `<div class="ai-result-card" data-idx="${idx}">
          <div class="ai-result-top">
            <span class="ai-result-word">${escapeHTML(e.english)}</span>
            ${e.phonetic ? `<span class="ai-result-phonetic">/${escapeHTML((e.phonetic||'').replace(/^\/+|\/+$/g,''))}/</span>` : ''}
            <span class="ai-result-pos-badge">${escapeHTML(e.pos||'')}</span>
          </div>
          <div class="ai-result-zh">${escapeHTML(e.chinese||'')}</div>
          ${e.example ? `<div class="ai-result-example">${escapeHTML(e.example)}</div>` : ''}
          ${alreadyIn
            ? `<button class="ecdict-add-btn added" disabled>✓ 已在詞庫</button>`
            : `<button class="ecdict-add-btn ai-add-btn" data-idx="${idx}">＋ 加入詞庫</button>`}
        </div>`;
      }).join('');

      // Bind add buttons
      aiResults.querySelectorAll('.ai-add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const entry = entries[parseInt(btn.dataset.idx)];
          DB.addWord({
            english:      entry.english,
            partOfSpeech: entry.pos || '',
            chinese:      entry.chinese || '',
            phonetic:     entry.phonetic || ''
          });
          btn.textContent = '✓ 已在詞庫';
          btn.classList.add('added');
          btn.disabled = true;
          showToast(`✓ 已加入「${entry.english}」${entry.pos ? ' ' + entry.pos : ''}`);
          // Clear the search input and hide ✕ button
          const _inp = document.getElementById('ai-word-input');
          const _clr = document.getElementById('ai-word-clear-btn');
          if (_inp) _inp.value = '';
          if (_clr) _clr.style.display = 'none';
          // Instantly update the word list below without re-rendering the whole page
          this._refreshWordList(container);
        });
      });
    };

    const doAISearch = async () => {
      const word = aiWordInput?.value.trim();
      if (!word) return;
      if (!aiResults) return;
      aiResults.innerHTML = '<div class="ai-loading"><span class="ai-spinner"></span>AI 查詢中...</div>';
      aiSearchBtn && (aiSearchBtn.disabled = true);
      try {
        const entries = await Gemini.lookupWord(word);
        renderAIResults(entries);
      } catch(err) {
        let msg = '查詢失敗，請稍後再試';
        const detail = String(err?.message || '');
        if (detail === 'NO_API_KEY') msg = '請先在設定頁填入 Gemini API Key';
        else if (detail === 'NETWORK_ERROR') msg = '網路錯誤，請確認連線';
        else if (/api key|apikey|invalid|permission|authentication/i.test(detail)) msg = 'API Key 無效或權限不足，請至設定頁確認';
        else if (/quota|rate limit/i.test(detail)) msg = '模型配額或速率限制已滿，請稍後再試或更換模型';
        else if (/user location is not supported|region|location|failed_precondition|REGION_UNSUPPORTED/i.test(detail)) msg = 'Gemini API 受目前網路/地區限制，已改用公開字典與翻譯備援；若仍失敗，請改用可支援 Gemini API 的網路或在設定頁更換 API Key';
        else if (/model|not found|not supported|deprecated/i.test(detail)) msg = '目前模型不可用，已嘗試 fallback；請到設定頁改選其他模型';
        aiResults.innerHTML = `<div class="ecdict-no-result">${msg}${detail && detail !== msg ? `<br><span style="font-size:11px;opacity:.65">${escapeHTML(detail)}</span>` : ''}</div>`;
      } finally {
        aiSearchBtn && (aiSearchBtn.disabled = false);
      }
    };

    aiSearchBtn?.addEventListener('click', doAISearch);
    aiWordInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doAISearch(); });

    // X clear button for ai-word-input
    const aiWordClearBtn = document.getElementById('ai-word-clear-btn');
    aiWordInput?.addEventListener('input', () => {
      if (aiWordClearBtn) aiWordClearBtn.style.display = aiWordInput.value ? '' : 'none';
    });
    aiWordClearBtn?.addEventListener('click', () => {
      if (aiWordInput) { aiWordInput.value = ''; aiWordInput.focus(); }
      if (aiResults)   aiResults.innerHTML = '';
      if (aiWordClearBtn) aiWordClearBtn.style.display = 'none';
    });

    // ECDICT events
    const ecdictFileInput = document.getElementById('ecdict-file-input');
    const handleEcdictFile = async (file) => {
      if (!file) return;
      const progressEl = document.getElementById('ecdict-progress');
      const progressFill = document.getElementById('ecdict-progress-fill');
      const progressText = document.getElementById('ecdict-progress-text');
      if (progressEl) progressEl.style.display = 'block';
      const text = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.onerror = reject; if(progressText) progressText.textContent='讀取檔案中...'; reader.readAsText(file, 'UTF-8'); });
      if(progressText) progressText.textContent = '解析中，請稍候...';
      try {
        const count = await ECDICT.importCSV(text, (loaded, total) => {
          const pct = Math.round((loaded/total)*100);
          if (progressFill) progressFill.style.width = pct+'%';
          if (progressText) progressText.textContent = `已處理 ${loaded.toLocaleString()} / ${total.toLocaleString()} 筆...`;
        });
        showToast(`✓ ECDICT 已載入 ${count.toLocaleString()} 個單字`, 3000);
        this.renderList(container);
      } catch(err) { console.error(err); showToast('載入失敗，請確認檔案格式'); if(progressEl) progressEl.style.display='none'; }
    };
    ecdictFileInput?.addEventListener('change', async (e) => { const file = e.target.files[0]; e.target.value=''; await handleEcdictFile(file); });
    document.getElementById('ecdict-load-btn')?.addEventListener('click', () => ecdictFileInput.click());
    document.getElementById('ecdict-reload-btn')?.addEventListener('click', () => ecdictFileInput.click());
    // ECDICT search
    const ecdictSearchInput = document.getElementById('ecdict-search');
    const ecdictResults = document.getElementById('ecdict-results');
    const ecdictClearBtn = document.getElementById('ecdict-clear-btn');
    const clearEcdictSearch = () => {
      if (ecdictSearchInput) { ecdictSearchInput.value = ''; ecdictSearchInput.focus(); }
      if (ecdictResults) ecdictResults.innerHTML = '';
      if (ecdictClearBtn) ecdictClearBtn.style.display = 'none';
    };
    ecdictClearBtn?.addEventListener('click', clearEcdictSearch);

    let searchTimer = null;
    ecdictSearchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = ecdictSearchInput.value.trim();
      if (ecdictClearBtn) ecdictClearBtn.style.display = ecdictSearchInput.value ? 'flex' : 'none';
      if (!q) { ecdictResults.innerHTML=''; return; }
      searchTimer = setTimeout(async () => {
        const results = await ECDICT.search(q, 15);
        if (!ecdictResults) return;
        if (!results.length) { ecdictResults.innerHTML=`<div class="ecdict-no-result">查無結果</div>`; return; }
        const existingWords = new Set(DB.getWords().map(w => w.english));
        ecdictResults.innerHTML = results.map(r => `
          <div class="ecdict-result-item" data-word="${escapeAttr(r.word)}" data-pos="${escapeAttr(r.pos)}" data-zh="${encodeURIComponent(r.chinese||'')}" data-phonetic="${escapeAttr(r.phonetic||'')}">
            <div class="ecdict-result-word">${escapeHTML(r.word)}${r.phonetic?`<span class="ecdict-result-phonetic">/${escapeHTML(r.phonetic)}/</span>`:''}</div>
            <div class="ecdict-result-zh">${escapeHTML(r.chinese)}</div>
            ${existingWords.has(r.word)?`<button class="ecdict-add-btn added" disabled>✓ 已在詞庫</button>`:`<button class="ecdict-add-btn" data-add="${escapeAttr(r.word)}">＋ 加入詞庫</button>`}
          </div>`).join('');
        const POS_OPTIONS = [
          { code:'n.',     label:'n.     名詞' },
          { code:'v.',     label:'v.     動詞' },
          { code:'adj.',   label:'adj.  形容詞' },
          { code:'adv.',   label:'adv.  副詞' },
          { code:'prep.',  label:'prep. 介系詞' },
          { code:'conj.',  label:'conj. 連接詞' },
          { code:'pron.',  label:'pron. 代名詞' },
          { code:'aux.',   label:'aux.  助動詞' },
          { code:'num.',   label:'num.  數詞' },
          { code:'interj.',label:'interj. 感嘆詞' },
          { code:'',       label:'（不設定）' },
        ];
        ecdictResults.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => {
          const item = btn.closest('.ecdict-result-item');
          // If picker already open, close it
          if (item.querySelector('.ecdict-pos-picker')) {
            item.querySelector('.ecdict-pos-picker').remove();
            btn.style.display = '';
            return;
          }
          // Hide the add button and show pos picker
          btn.style.display = 'none';
          const suggested = item.dataset.pos || '';
          const picker = document.createElement('div');
          picker.className = 'ecdict-pos-picker';
          picker.innerHTML = `
            <div class="ecdict-pos-picker-label">選擇詞性後加入詞庫：</div>
            <div class="ecdict-pos-chips">
              ${POS_OPTIONS.map(o => `<button class="ecdict-pos-chip${o.code === suggested ? ' suggested' : ''}" data-pos="${o.code}">${o.label}</button>`).join('')}
            </div>
            <button class="ecdict-pos-cancel">取消</button>
          `;
          item.appendChild(picker);
          // Cancel
          picker.querySelector('.ecdict-pos-cancel').addEventListener('click', () => {
            picker.remove();
            btn.style.display = '';
          });
          // Select pos and add
          picker.querySelectorAll('.ecdict-pos-chip').forEach(chip => {
            chip.addEventListener('click', () => {
              const chosenPos = chip.dataset.pos;
              DB.addWord({ english: item.dataset.word, partOfSpeech: chosenPos, chinese: decodeURIComponent(item.dataset.zh), phonetic: item.dataset.phonetic });
              // Update button to "已在詞庫"
              picker.remove();
              btn.style.display = '';
              btn.textContent = '✓ 已在詞庫'; btn.classList.add('added'); btn.disabled = true;
              showToast(`✓ 已加入「${item.dataset.word}」${chosenPos ? ' ' + chosenPos : ''}`);
              // 清除搜尋欄並隱藏結果
              const si = document.getElementById('ecdict-search');
              const cb = document.getElementById('ecdict-clear-btn');
              const er = document.getElementById('ecdict-results');
              if (si) si.value = '';
              if (cb) cb.style.display = 'none';
              if (er) er.innerHTML = '';
              this._refreshWordList(container);
            });
          });
        }));
      }, 300);
    });
    // Back-to-top button (delete mode)
    document.getElementById('db-back-to-top')?.addEventListener('click', () => {
      // Scroll the main content area to top
      const scroller = document.getElementById('view-container');
      if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
    });
    // Sort chips
    container.querySelectorAll('.db-sort-chip').forEach(btn => btn.addEventListener('click', () => {
      this.sortMode = btn.dataset.sort;
      localStorage.setItem('dbSortMode', this.sortMode);
      this.renderList(container);
    }));
    // Toolbar events
    document.getElementById('add-word-btn')?.addEventListener('click', () => this.showAddModal(container));
    document.getElementById('export-btn')?.addEventListener('click', () => {
      if (!words.length) { showToast('資料庫是空的'); return; }
      const blob = new Blob(['\uFEFF'+DB.exportCSV()], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href=url; a.download=`vocab_${todayStr().replace(/\//g,'-')}.csv`; a.click(); URL.revokeObjectURL(url);
      showToast('✓ CSV 已匯出');
    });
    document.getElementById('import-btn')?.addEventListener('click', () => document.getElementById('csv-file-input').click());
    document.getElementById('csv-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try { const result = DB.importCSV(ev.target.result); showToast(`✓ 已匯入 ${result.added} 個新單字${result.skipped>0?`，略過 ${result.skipped} 筆`:''}`); this.renderList(container); }
        catch(err) { showToast(err.message==='FORMAT_MISMATCH_VOCAB' ? '❌ 格式錯誤：請使用單字庫 CSV（可先匯出取得範本）' : '匯入失敗，請確認 CSV 格式', 3500); }
        e.target.value = '';
      };
      reader.readAsText(file, 'UTF-8');
    });
    const svgTrash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    document.getElementById('delete-toggle-btn')?.addEventListener('click', () => {
      if (dm && sel.size > 0) this.confirmDelete(container);
      else if (dm) { this.deleteMode=false; this.selectedIds.clear(); this.renderList(container); }
      else { this.deleteMode=true; this.aiCorrectMode=false; this.aiCorrectIds.clear(); this.renderList(container); }
    });
    document.getElementById('ai-correct-btn')?.addEventListener('click', () => {
      if (!DB.getApiKey()) { showToast('請先在設定頁填入 Gemini API Key'); return; }
      if (acm) { this.aiCorrectMode=false; this.aiCorrectIds.clear(); this.renderList(container); }
      else { this.aiCorrectMode=true; this.deleteMode=false; this.selectedIds.clear(); this.renderList(container); }
    });
    document.getElementById('ai-correct-run-btn')?.addEventListener('click', () => {
      if (this.aiCorrectIds.size === 0) { showToast('請先勾選要更正的單字'); return; }
      this.runAiCorrect(container);
    });
    container.querySelectorAll('.db-checkbox').forEach(cb => cb.addEventListener('click', () => {
      const id = cb.dataset.id;
      if (this.deleteMode) {
        this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
        cb.classList.toggle('checked', this.selectedIds.has(id));
        cb.classList.remove('ai-check');
        const btn = document.getElementById('delete-toggle-btn');
        if (btn) btn.innerHTML = svgTrash + (this.selectedIds.size > 0 ? `確認(${this.selectedIds.size})` : '確認');
      } else if (this.aiCorrectMode) {
        this.aiCorrectIds.has(id) ? this.aiCorrectIds.delete(id) : this.aiCorrectIds.add(id);
        cb.classList.toggle('checked', this.aiCorrectIds.has(id));
        cb.classList.toggle('ai-check', this.aiCorrectIds.has(id));
        const btn = document.getElementById('ai-correct-run-btn');
        if (btn) btn.textContent = this.aiCorrectIds.size > 0 ? `執行 AI 更正 (${this.aiCorrectIds.size})` : '執行 AI 更正';
      }
    }));
    container.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      const word = DB.getWords().find(w => w.id === btn.dataset.edit);
      if (word) this.showEditModal(word, container);
    }));
  },
  async runAiCorrect(container) {
    const ids = [...this.aiCorrectIds];
    const words = DB.getWords().filter(w => ids.includes(w.id));
    if (!words.length) return;

    // Show progress modal
    Modal.show(`<div class="modal-handle"></div>
      <div class="modal-title">AI 查詢中…</div>
      <div style="text-align:center;padding:20px 0">
        <span class="ai-spinner" style="width:32px;height:32px;border-width:3px;display:inline-block"></span>
        <div id="ai-correct-status" style="margin-top:12px;color:var(--text-secondary);font-size:14px">正在查詢 ${words.length} 個單字…</div>
      </div>`);

    const results = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const statusEl = document.getElementById('ai-correct-status');
      if (statusEl) statusEl.textContent = `查詢中 ${i+1} / ${words.length}：${w.english}`;
      try {
        const entries = await Gemini.lookupWord(w.english);
        results.push({ original: w, entries: (entries && entries.length) ? entries : null, error: null });
      } catch(e) {
        results.push({ original: w, entries: null, error: e.message || '查詢失敗' });
      }
    }
    Modal.hide();
    this.showAiCorrectConfirmModal(results, container);
  },

  showAiCorrectConfirmModal(results, container) {
    const hasData = results.filter(r => r.entries && r.entries.length);
    const noData  = results.filter(r => !r.entries);
    const POS_OPTS = ['n.','v.','adj.','adv.','prep.','conj.','pron.','aux.','num.','interj.'];

    Modal.show(`<div class="modal-handle"></div>
      <div class="modal-title">確認 AI 更正</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">
        取得 ${hasData.length} 筆建議${noData.length ? `，${noData.length} 筆查無結果` : ''}。
        可修改中文後按「確認修正」套用。
      </div>
      <div id="ai-correct-list" style="max-height:55vh;overflow-y:auto;display:flex;flex-direction:column;gap:10px">
        ${results.map(r => {
          if (!r.entries || !r.entries.length) {
            return `<div style="padding:10px;background:var(--surface);border-radius:8px;border:1px solid var(--border);opacity:0.6">
              <span style="font-weight:600;color:var(--text-primary)">${r.original.english}</span>
              <span style="margin-left:8px;font-size:12px;color:var(--danger)">❌ ${r.error || '查無結果'}</span>
            </div>`;
          }
          const rawPhonetic = (r.entries[0].phonetic || '').replace(/^\/+|\/+$/g, '');
          // Default to entry matching original pos, else first
          const defIdx = Math.max(0, r.entries.findIndex(e => e.pos === r.original.partOfSpeech));
          return `<div class="ai-correct-item" data-word-id="${r.original.id}" data-phonetic="${rawPhonetic}" style="padding:12px;background:var(--surface);border-radius:10px;border:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
              <span style="font-weight:700;font-size:15px;color:var(--text-primary)">${r.entries[0].english}</span>
              ${rawPhonetic ? `<span style="font-size:12px;color:var(--text-secondary)">/${rawPhonetic}/</span>` : ''}
              <span style="font-size:11px;color:var(--text-muted);margin-left:auto">原：${r.original.partOfSpeech||'—'} ${r.original.chinese}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
              <span style="font-size:12px;color:var(--text-secondary);white-space:nowrap">詞性</span>
              <select class="ai-correct-pos" style="flex:1;padding:5px 8px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-primary)"
                data-all-entries="${encodeURIComponent(JSON.stringify(r.entries))}">
                ${r.entries.map((e, i) => `<option value="${i}" ${i===defIdx?'selected':''}>${e.pos}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:12px;color:var(--text-secondary);white-space:nowrap">中文</span>
              <input class="ai-correct-zh" type="text"
                style="flex:1;padding:5px 8px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-primary)"
                value="${r.entries[defIdx].chinese.replace(/"/g,'&quot;')}">
            </div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="modal-btn-cancel" id="ai-cc-cancel" style="flex:1">取消</button>
        <button class="modal-btn-confirm" id="ai-cc-confirm" style="flex:2${!hasData.length?' opacity:0.4;pointer-events:none':''}">確認修正 ${hasData.length} 個</button>
      </div>`);

    // Wire: when pos changes, update chinese field
    document.querySelectorAll('.ai-correct-pos').forEach(sel => {
      sel.addEventListener('change', () => {
        const entries = JSON.parse(decodeURIComponent(sel.dataset.allEntries));
        const idx = parseInt(sel.value);
        const zhInput = sel.closest('.ai-correct-item').querySelector('.ai-correct-zh');
        if (zhInput && entries[idx]) zhInput.value = entries[idx].chinese;
      });
    });

    document.getElementById('ai-cc-cancel').addEventListener('click', () => {
      Modal.hide();
      this.aiCorrectMode = false; this.aiCorrectIds.clear();
      this.renderList(container);
    });

    document.getElementById('ai-cc-confirm').addEventListener('click', () => {
      let updated = 0;
      document.querySelectorAll('.ai-correct-item[data-word-id]').forEach(item => {
        const id = item.dataset.wordId;
        const phonetic = item.dataset.phonetic || '';
        const posSel = item.querySelector('.ai-correct-pos');
        const zhInput = item.querySelector('.ai-correct-zh');
        if (!posSel || !zhInput) return;
        const posText = posSel.options[posSel.selectedIndex]?.text || '';
        const chinese = zhInput.value.trim();
        if (!chinese) return;
        DB.updateWord(id, { phonetic, partOfSpeech: posText, chinese });
        updated++;
      });
      Modal.hide();
      this.aiCorrectMode = false; this.aiCorrectIds.clear();
      showToast(`✓ 已更正 ${updated} 個單字`);
      this.renderList(container);
    });
  },
  confirmDelete(container) {
    const count = this.selectedIds.size;
    Modal.show(`<div class="modal-handle"></div><div class="modal-title">確認刪除</div><p style="color:var(--text-muted);font-size:14px;margin-bottom:16px">確定要刪除這 <strong style="color:var(--danger)">${count}</strong> 個單字嗎？</p><div class="modal-actions"><button class="modal-btn-cancel" id="cancel-del">取消</button><button class="modal-btn-delete" id="confirm-del">確認刪除 ${count} 個</button></div>`);
    document.getElementById('cancel-del').addEventListener('click', () => Modal.hide());
    document.getElementById('confirm-del').addEventListener('click', () => {
      DB.deleteWords([...this.selectedIds]); this.deleteMode=false; this.selectedIds.clear();
      Modal.hide(); showToast(`已刪除 ${count} 個單字`); this.renderList(container);
    });
  },
  showAddModal(container) {
    const posOptions = ['n.','v.','adj.','adv.','prep.','conj.','pron.','interj.','phrase'];
    Modal.show(`<div class="modal-handle"></div><div class="modal-title">新增單字</div>
      <div class="form-group"><label class="form-label">英文單字 *</label><input class="form-input" id="new-en" placeholder="e.g. beautiful" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text"></div>
      <div class="form-group"><label class="form-label">詞性 *</label><select class="form-select" id="new-pos">${posOptions.map(p=>`<option>${p}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">中文意思 *</label><input class="form-input" id="new-zh" placeholder="e.g. 美麗的"></div>
      <div class="form-group"><label class="form-label">音標（可選）</label><input class="form-input" id="new-phonetic" placeholder="e.g. bjuːtɪfəl" autocorrect="off" autocapitalize="off"></div>
      <div class="modal-actions"><button class="modal-btn-cancel" id="cancel-add">取消</button><button class="modal-btn-confirm" id="confirm-add">新增</button></div>`);
    document.getElementById('cancel-add').addEventListener('click', () => Modal.hide());
    document.getElementById('confirm-add').addEventListener('click', () => {
      const en=document.getElementById('new-en').value.trim(); const pos=document.getElementById('new-pos').value;
      const zh=document.getElementById('new-zh').value.trim(); const phonetic=document.getElementById('new-phonetic').value.trim();
      if (!en||!zh) { showToast('請填入英文和中文'); return; }
      DB.addWord({english:en,partOfSpeech:pos,chinese:zh,phonetic}); Modal.hide(); showToast('✓ 單字已新增'); this.renderList(container);
    });
    setTimeout(() => document.getElementById('new-en')?.focus(), 100);
  },
  showEditModal(word, container) {
    const posOptions = ['n.','v.','adj.','adv.','prep.','conj.','pron.','interj.','phrase'];
    Modal.show(`<div class="modal-handle"></div><div class="modal-title">編輯單字</div>
      <div class="form-group"><label class="form-label">英文單字</label><input class="form-input" id="edit-en" value="${word.english}" autocorrect="off" autocapitalize="off" spellcheck="false"></div>
      <div class="form-group"><label class="form-label">詞性</label><select class="form-select" id="edit-pos">${posOptions.map(p=>`<option ${p===word.partOfSpeech?'selected':''}>${p}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">中文意思</label><input class="form-input" id="edit-zh" value="${word.chinese}"></div>
      <div class="form-group"><label class="form-label">音標（可選）</label><input class="form-input" id="edit-phonetic" value="${word.phonetic||''}" autocorrect="off" autocapitalize="off"></div>
      <div class="form-group"><label class="form-label">頻率加權</label><select class="form-select" id="edit-weight">${[1,2,3,5].map(n=>`<option value="${n}" ${n===(word.frequencyWeight||1)?'selected':''}>${n}x${n===1?' (預設)':''}</option>`).join('')}</select></div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">答錯次數：${word.wrongCount||0} 次</div>
      <div class="modal-actions"><button class="modal-btn-cancel" id="cancel-edit">取消</button><button class="modal-btn-confirm" id="confirm-edit">儲存</button></div>`);
    document.getElementById('cancel-edit').addEventListener('click', () => Modal.hide());
    document.getElementById('confirm-edit').addEventListener('click', () => {
      const en=document.getElementById('edit-en').value.trim(); const pos=document.getElementById('edit-pos').value;
      const zh=document.getElementById('edit-zh').value.trim(); const phonetic=document.getElementById('edit-phonetic').value.trim();
      const weight=parseInt(document.getElementById('edit-weight').value);
      if (!en||!zh) { showToast('請填入英文和中文'); return; }
      DB.updateWord(word.id,{english:en.toLowerCase(),partOfSpeech:pos,chinese:zh,phonetic,frequencyWeight:weight});
      Modal.hide(); showToast('✓ 已儲存'); this.renderList(container);
    });
  }
};

// ===========================
// STATS VIEW — statistics display; CSV export lives in Settings
// ===========================

// ===========================
// ESSAY VIEW
// ===========================
Views.essay = {
  _mode: 'vocab',   // 'vocab' | 'ai'
  _topic: '',       // topic string (English)
  _topicZh: '',     // topic string (Chinese)
  _pool: [],        // selected vocab words

  render(container, keepMode) {
    if (!keepMode) { this._mode = 'vocab'; this._topic = ''; }
    const words  = DB.getWords();
    const hasKey = !!DB.getApiKey();
    this._pool = [...words].sort(() => Math.random() - 0.5).slice(0, 3);

    const modeVocabActive = this._mode === 'vocab';

    container.innerHTML = `
      <div class="section-header">
        <button class="back-link" id="essay-back-btn">← 返回</button>
        <h1 class="section-title">文章撰寫</h1>
      </div>
      ${renderPracticeModeSelector('essay')}
      ${!hasKey ? '<div class="no-api-warning">請先在設定頁填入 Gemini API Key</div>' : ''}

      <div class="essay-mode-toggle">
        <button class="essay-mode-btn ${modeVocabActive?'active':''}" id="essay-mode-vocab">📚 單字題目</button>
        <button class="essay-mode-btn ${!modeVocabActive?'active':''}" id="essay-mode-ai">🤖 AI 出題</button>
      </div>

      <div id="essay-prompt-area">
        ${modeVocabActive ? this._buildVocabPrompt(words) : this._buildAiTopicArea()}
      </div>

      <div class="essay-input-card">
        <div class="essay-input-label">
          <span>撰寫文章</span>
          <span class="essay-char-count" id="essay-char-count">0 / 500</span>
        </div>
        <textarea class="essay-textarea" id="essay-textarea"
          placeholder="${modeVocabActive ? '請以上方 3 個單字為主題，撰寫一篇 500 字以內的英文文章...' : '請依照 AI 出題撰寫英文文章（500 字以內）...'}"
          maxlength="500"
          ${(modeVocabActive && words.length < 3) || !hasKey ? 'disabled' : ''}></textarea>
      </div>
      <button class="btn-primary" id="essay-submit-btn"
        ${(modeVocabActive && words.length < 3) || !hasKey || (!modeVocabActive && !this._topic) ? 'disabled' : ''}
        style="margin-top:12px">
        送出文章給 AI 批改
      </button>
      <div id="essay-result-area" style="margin-top:16px"></div>
      <div style="height:20px"></div>
    `;

    bindPracticeModeSelector(container, 'essay');

    // Mode toggle
    document.getElementById('essay-mode-vocab')?.addEventListener('click', () => {
      this._mode = 'vocab'; this._topic = ''; this._topicZh = '';
      Router.essayActive = false;
      this.render(container, true);
    });
    document.getElementById('essay-mode-ai')?.addEventListener('click', () => {
      this._mode = 'ai';
      Router.essayActive = false;
      this.render(container, true);
    });

    document.getElementById('essay-back-btn').addEventListener('click', () => { Router.essayActive = false; Views.practice.render(container); });

    // Vocab mode: reroll
    document.getElementById('essay-reroll')?.addEventListener('click', () => {
      Router.essayActive = false;
      this._mode = 'vocab'; this._topic = '';
      this.render(container, false);
    });

    // AI mode: generate topic
    document.getElementById('essay-gen-topic-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('essay-gen-topic-btn');
      const topicBox = document.getElementById('ai-topic-box');
      const submitBtn = document.getElementById('essay-submit-btn');
      const textarea = document.getElementById('essay-textarea');
      btn.disabled = true; btn.textContent = '⏳ 生成中...';
      if (topicBox) topicBox.textContent = '正在請 AI 出題...';
      // Use built-in curated bilingual topic list — no API call needed
      const _TOPICS = [
        {en:'What is one childhood memory that still makes you smile today?',zh:'哪一個童年記憶至今仍讓你微笑？'},
        {en:'If you could live in any country for a year, where would you go and why?',zh:'如果你可以在任何一個國家住一年，你會選哪裡？為什麼？'},
        {en:'How has technology changed the way people communicate with each other?',zh:'科技如何改變了人們互相溝通的方式？'},
        {en:'What is the most important lesson you have learned from a mistake?',zh:'你從一次錯誤中學到最重要的一課是什麼？'},
        {en:'Describe a food that reminds you of home or a special occasion.',zh:'描述一種讓你想起家鄉或特殊場合的食物。'},
        {en:'What does a perfect weekend look like to you?',zh:'你理想中的完美週末是什麼樣子？'},
        {en:'How do hobbies help people deal with stress in daily life?',zh:'嗜好如何幫助人們應對日常生活中的壓力？'},
        {en:'What is one skill you would like to learn, and how would it change your life?',zh:'你想學習哪項技能？它會如何改變你的生活？'},
        {en:'Do you think it is better to live in a big city or a small town? Why?',zh:'你認為住在大城市還是小鎮比較好？為什麼？'},
        {en:'Who is the most influential person in your life, and what have you learned from them?',zh:'誰是你生命中影響最深的人？你從他身上學到了什麼？'},
        {en:'How do you think the world will be different in 20 years from now?',zh:'你認為20年後的世界會有什麼不同？'},
        {en:'What is your favourite book, film, or TV show, and why does it matter to you?',zh:'你最喜歡的書、電影或電視節目是什麼？它對你有什麼意義？'},
        {en:'Is it more important to follow your passion or to earn a good salary?',zh:'追隨熱情更重要，還是賺取高薪更重要？'},
        {en:'Describe a place in nature that you love and explain why it is special to you.',zh:'描述一個你喜愛的大自然地點，並解釋為什麼它對你很特別。'},
        {en:'What does friendship mean to you, and what makes a good friend?',zh:'友誼對你意味著什麼？什麼樣的人才是好朋友？'},
        {en:'How can small daily habits lead to big changes over time?',zh:'微小的日常習慣如何隨著時間帶來重大改變？'},
        {en:'What is the best gift you have ever given or received, and why was it meaningful?',zh:'你送過或收過最好的禮物是什麼？為什麼它有意義？'},
        {en:'Would you prefer to travel alone or with others? What are the benefits of each?',zh:'你喜歡獨自旅行還是與他人同行？各有什麼好處？'},
        {en:'How important is it to learn from people who are different from you?',zh:'向與你不同的人學習有多重要？'},
        {en:'What is one tradition or celebration in your culture that you are proud of?',zh:'你文化中有哪個傳統或節日讓你感到自豪？'},
        {en:'If you could have dinner with anyone in history, who would you choose and what would you ask?',zh:'如果你可以與歷史上任何人共進晚餐，你會選誰？你會問什麼？'},
        {en:'How does music affect your mood and daily life?',zh:'音樂如何影響你的情緒和日常生活？'},
        {en:'What are the advantages and disadvantages of social media for young people?',zh:'社群媒體對年輕人有哪些優缺點？'},
        {en:'Describe a challenge you faced and how you overcame it.',zh:'描述一個你曾面對的挑戰，以及你如何克服它。'},
        {en:'What does success mean to you — and is it different from happiness?',zh:'成功對你意味著什麼——它和幸福有什麼不同嗎？'},
        {en:'How has learning English changed or helped you in your life?',zh:'學習英文如何改變或幫助了你的生活？'},
        {en:'What is one environmental issue you care about most, and what can individuals do to help?',zh:'你最關心哪個環境問題？個人可以做什麼來幫助？'},
        {en:'Do you think working from home is better than working in an office? Why?',zh:'你認為在家工作比在辦公室工作更好嗎？為什麼？'},
        {en:'What is something you believed as a child that you now know is not true?',zh:'你小時候相信的哪件事，現在才知道並不正確？'},
        {en:'How do animals or pets contribute to people\'s happiness and wellbeing?',zh:'動物或寵物如何為人們的快樂和健康做出貢獻？'},
        {en:'If you could change one thing about the education system, what would it be?',zh:'如果你可以改變教育制度中的一件事，那會是什麼？'},
        {en:'What does a healthy lifestyle look like to you, and how do you try to achieve it?',zh:'在你看來，健康的生活方式是什麼樣的？你如何努力實現它？'},
        {en:'Describe a moment when you felt truly proud of yourself.',zh:'描述一個讓你真正為自己感到驕傲的時刻。'},
        {en:'How do books and reading shape the way we think and understand the world?',zh:'書籍和閱讀如何塑造我們思考和理解世界的方式？'},
        {en:'What is the most interesting place you have ever visited, and what made it special?',zh:'你去過最有趣的地方是哪裡？是什麼讓它與眾不同？'},
        {en:'Is competition always healthy, or can it sometimes be harmful?',zh:'競爭是否總是健康的，還是有時可能有害？'},
        {en:'How can people maintain strong relationships with family and friends when they are busy?',zh:'忙碌的人如何維持與家人和朋友的緊密關係？'},
        {en:'What is one invention from the last 50 years that you think has helped people the most?',zh:'過去50年中，哪項發明你認為對人類最有幫助？'},
        {en:'How do you stay motivated when things get difficult or discouraging?',zh:'當事情變得困難或令人沮喪時，你如何保持動力？'},
        {en:'What role does creativity play in everyday life, and how do you express your own creativity?',zh:'創造力在日常生活中扮演什麼角色？你如何表達自己的創造力？'}
      ];
      // Pick a topic that hasn't been used recently (avoid repeats)
      if (!Views.essay._usedTopicIdxs) Views.essay._usedTopicIdxs = [];
      const available = _TOPICS.map((_,i)=>i).filter(i => !Views.essay._usedTopicIdxs.includes(i));
      if (available.length === 0) Views.essay._usedTopicIdxs = [];
      const pool2 = available.length > 0 ? available : _TOPICS.map((_,i)=>i);
      const idx = pool2[Math.floor(Math.random() * pool2.length)];
      Views.essay._usedTopicIdxs.push(idx);
      if (Views.essay._usedTopicIdxs.length > 10) Views.essay._usedTopicIdxs.shift();

      const picked = _TOPICS[idx];
      this._topic = picked.en;
      this._topicZh = picked.zh;
      if (topicBox) {
        topicBox.innerHTML =
          `<div style="font-weight:700;color:var(--text-primary);line-height:1.5;margin-bottom:5px">${escapeHTML(picked.en)}</div>` +
          `<div style="font-size:13px;color:var(--text-secondary);line-height:1.5">${escapeHTML(picked.zh)}</div>`;
      }
      if (textarea) textarea.disabled = false;
      if (submitBtn) submitBtn.disabled = false;
      btn.textContent = '🔄 換一題';
      btn.disabled = false;
    });

    const textarea = document.getElementById('essay-textarea');
    const charCount = document.getElementById('essay-char-count');
    textarea?.addEventListener('input', () => {
      const len = textarea.value.length;
      charCount.textContent = `${len} / 500`;
      charCount.style.color = len > 450 ? 'var(--danger)' : 'var(--text-muted)';
      Router.essayActive = len > 0;
    });

    document.getElementById('essay-submit-btn')?.addEventListener('click', async () => {
      const essay = textarea?.value.trim();
      if (!essay || essay.length < 30) { showToast('文章太短，請至少寫 30 個字元'); return; }
      const resultArea = document.getElementById('essay-result-area');
      const submitBtn = document.getElementById('essay-submit-btn');
      submitBtn.disabled = true; submitBtn.textContent = '⏳ AI 批改中...';
      resultArea.innerHTML = '<div class="essay-loading"><div class="loading-dots"><span></span><span></span><span></span></div><span>AI 正在批改您的文章，請稍候...</span></div>';

      const isAiMode = this._mode === 'ai';
      const topic    = this._topic;
      const pool     = isAiMode ? [] : this._pool;

      try {
        const feedback = isAiMode
          ? await Gemini.reviewEssayFree(essay, topic)
          : await Gemini.reviewEssay(essay, pool);
        Router.essayActive = false;
        this._renderFeedback(resultArea, feedback, essay, pool, container);
        const annotatedHtml = Views.essay._buildAnnotatedEssay(essay, (feedback.grammar||[]).map((g,i)=>({...g,idx:i})));
        DB.addEssaySession({ date: todayStr(), words: pool, essay, feedback: JSON.stringify(feedback), score: feedback.score, annotatedHtml, essayMode: isAiMode?'ai':'vocab', topic: isAiMode?topic:'' });
      } catch(e) {
        const raw = e.message || '';
        let msg = '❌ 批改失敗', detail = '';
        if (raw === 'NO_API_KEY')          msg = '🔑 請先在設定頁填入 Gemini API Key';
        else if (raw === 'NETWORK_ERROR')  msg = '🌐 網路連線失敗，請確認網路後重試';
        else if (raw.startsWith('PARSE_ERROR')) { msg = '⚠️ AI 回應格式無法解析'; detail = raw.replace('PARSE_ERROR: ',''); }
        else if (raw === 'EMPTY_RESPONSE') msg = '⚠️ AI 回傳空白回應，請重試';
        else if (raw.includes('quota') || raw.includes('RESOURCE_EXHAUSTED')) msg = '⏳ API 配額已用盡，請稍後再試';
        else if (raw.includes('API_KEY_INVALID') || raw.includes('invalid')) msg = '🔑 API Key 無效';
        else if (raw.includes('429')) msg = '⏳ 請求過於頻繁，請稍候再試';
        resultArea.innerHTML = `<div class="essay-error">${msg}${detail?`<div class="essay-error-detail">${detail}</div>`:''}<div class="essay-error-retry">請點下方按鈕重試</div></div>`;
        submitBtn.disabled = false; submitBtn.textContent = '重新送出';
      }
    });
  },

  _buildVocabPrompt(words) {
    if (words.length < 3) return '<div class="no-api-warning">單字庫需至少 3 個單字才能進行文章撰寫練習</div>';
    return `<div class="essay-words-card">
        <div class="essay-words-top">
          <div class="essay-words-label">請使用以下 3 個單字撰寫文章：</div>
          <button class="essay-reroll-inline" id="essay-reroll">🔀 換一組</button>
        </div>
        <div class="essay-chips-row">
          ${this._pool.map(w => `<div class="essay-chip-pill">
            <div class="essay-chip-top">
              <span class="essay-chip-en">${w.english}</span>
              ${w.partOfSpeech ? `<span class="essay-chip-pos">${w.partOfSpeech}</span>` : ''}
            </div>
            <div class="essay-chip-zh">${w.chinese}</div>
          </div>`).join('')}
        </div>
      </div>`;
  },

  _buildAiTopicArea() {
    const hasTopic = !!this._topic;
    return `<div class="essay-ai-topic-card">
        <div class="essay-ai-topic-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
          AI 出題
        </div>
        <div id="ai-topic-box" class="essay-ai-topic-box">
          ${hasTopic
            ? `<div style="font-weight:700;color:var(--text-primary);line-height:1.5;margin-bottom:5px">${escapeHTML(this._topic)}</div>`
              + (this._topicZh ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.5">${escapeHTML(this._topicZh)}</div>` : '')
            : '<span style="color:var(--text-muted)">點擊下方按鈕隨機出一道英文寫作題目</span>'}
        </div>
        <button class="btn-secondary" id="essay-gen-topic-btn" style="margin-top:8px;width:100%">
          ${hasTopic ? '🔄 換一題' : '🎲 隨機出題'}
        </button>
      </div>`;
  },

  _buildAnnotatedEssay(essay, grammar) {
    // Build annotated essay: replace each exact error with red-highlight + green correction
    // Process errors from longest to shortest to avoid overlap issues
    const errors = (grammar || []).filter(g => g.exact && essay.includes(g.exact));
    // Sort by position in essay (first occurrence)
    const sorted = errors.map((g, idx) => ({ ...g, idx, pos: essay.indexOf(g.exact) }))
                         .sort((a, b) => a.pos - b.pos);
    // Build HTML by scanning through essay
    let result = '';
    let cursor = 0;
    for (const g of sorted) {
      const pos = essay.indexOf(g.exact, cursor);
      if (pos < cursor) continue; // already consumed or not found
      // Plain text before this error
      result += this._escapeHtml(essay.slice(cursor, pos));
      // Annotated error
      result += `<a class="err-anchor" href="#err-detail-${g.idx}" id="err-text-${g.idx}">` +
        `<span class="err-orig">${this._escapeHtml(g.exact)}</span>` +
        `<span class="err-fix">${this._escapeHtml(g.corrected)}</span>` +
        `</a>`;
      cursor = pos + g.exact.length;
    }
    result += this._escapeHtml(essay.slice(cursor));
    return result;
  },

  _escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/\n/g,'<br>');
  },

  _renderFeedback(container, fb, essay, words, pageContainer) {
    const scoreColor = fb.score >= 8 ? 'var(--correct)' : fb.score >= 5 ? '#f5a623' : 'var(--danger)';
    const grammar = (fb.grammar || []).map((g, idx) => ({ ...g, idx }));

    // ── Word check badges ──
    const wordCheckHtml = (fb.wordCheck || words.map(w => ({ word: w.english, used: false, correct: false, note: '' }))).map(w =>
      `<span class="fb-badge ${w.used && w.correct ? 'fb-ok' : w.used ? 'fb-warn' : 'fb-missing'}">
        ${w.used && w.correct ? '✓' : w.used ? '△' : '✗'} ${this._escapeHtml(w.word || '')}
        ${w.note ? `<span class="fb-badge-note"> — ${this._escapeHtml(w.note)}</span>` : ''}
      </span>`).join('');

    // ── Annotated essay ──
    const annotatedEssay = this._buildAnnotatedEssay(essay, grammar);
    const hasErrors = grammar.filter(g => g.exact && essay.includes(g.exact)).length > 0;

    // ── Grammar detail cards (below essay) ──
    const grammarDetailHtml = grammar.length === 0
      ? '<div class="fb-ok-msg">✓ 未發現明顯文法錯誤</div>'
      : grammar.map(g => `
        <div class="err-detail-card" id="err-detail-${g.idx}">
          <div class="err-detail-header">
            <span class="err-detail-num">#${g.idx + 1}</span>
            <a class="err-back-link" href="#err-text-${g.idx}">↑ 回到文章</a>
          </div>
          <div class="err-detail-row">
            <span class="err-detail-label err-label-wrong">✗ 原文</span>
            <span class="err-detail-orig">${this._escapeHtml(g.exact || g.original || '')}</span>
          </div>
          <div class="err-detail-row">
            <span class="err-detail-label err-label-fix">✓ 修正</span>
            <span class="err-detail-fixed">${this._escapeHtml(g.corrected || '')}</span>
          </div>
          ${g.explanation ? `<div class="err-detail-exp">${this._escapeHtml(g.explanation)}</div>` : ''}
        </div>`).join('');

    // ── Suggestions ──
    const suggestHtml = (fb.suggestions || []).map(s => `<div class="essay-fb-suggest">💡 ${this._escapeHtml(s)}</div>`).join('');

    container.innerHTML = `
      <div class="essay-fb-card">
        <div class="essay-fb-score-row-top">
          <div class="essay-fb-score" style="color:${scoreColor}">${fb.score}<span class="essay-score-denom">/10</span></div>
          <div class="essay-fb-comment">${this._escapeHtml(fb.comment || '')}</div>
        </div>

        <div class="essay-fb-section-title">📋 單字使用</div>
        <div class="essay-fb-badges">${wordCheckHtml}</div>

        <div class="essay-fb-section-title">
          📄 批改文章
          ${hasErrors ? '<span class="err-legend"><span class="err-legend-r">紅字</span>=錯誤　<span class="err-legend-g">綠字</span>=修正（點紅字看詳解）</span>' : ''}
        </div>
        <div class="annotated-essay" id="annotated-essay">${annotatedEssay}</div>

        ${grammar.length > 0 ? `
        <div class="essay-fb-section-title" style="margin-top:20px">📝 文法詳解（${grammar.length} 處）</div>
        <div class="grammar-detail-list">${grammarDetailHtml}</div>` : `
        <div class="fb-ok-msg" style="margin-top:12px">✓ 未發現明顯文法錯誤</div>`}

        <div class="essay-fb-section-title" style="margin-top:20px">💬 文章建議</div>
        <div class="essay-fb-suggest-list">${suggestHtml}</div>

        <button class="btn-secondary" id="essay-retry-btn" style="margin-top:20px">再寫一篇</button>
      </div>
    `;
    document.getElementById('essay-retry-btn').addEventListener('click', () => { Router.essayActive = false; this.render(pageContainer, true); });

    // Smooth scroll for anchor links inside the feedback card
    container.querySelectorAll('a.err-anchor, a.err-back-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }
};

// ===========================
// AI ASK VIEW
// ===========================
Views.aiAsk = {
  // Generate YYMMDDHHMM id
  _makeId() {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0');
    const mn = String(d.getMinutes()).padStart(2,'0');
    return yy + mm + dd + hh + mn;
  },

  render(container) {
    const history = DB.getAiAskHistory();
    const hasKey  = !!DB.getApiKey();
    const model   = DB.getModel();
    const modelLabel = (Gemini.AVAILABLE_MODELS.find(m => m.id === model)?.label) || model;

    container.innerHTML = `
      <div class="section-header">
        <button class="back-link" id="aiask-back-btn">← 返回</button>
        <h1 class="section-title">AI 詢問</h1>
      </div>
      ${renderPracticeModeSelector('aiask')}

      ${!hasKey ? '<div class="no-api-warning">請先在設定頁填入 Gemini API Key 才能使用 AI 詢問</div>' : ''}

      <div class="settings-card" style="margin-bottom:14px">
        <div class="aiask-input-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          提問（英文文法、句子修改、單字用法…）
        </div>
        <div class="aiask-model-hint">模型：${escapeHTML(modelLabel)}</div>
        <textarea class="aiask-textarea" id="aiask-textarea"
          placeholder="e.g. How do I use 'however' correctly? &#10;Or: Please correct my sentence: I goed to the store yesterday."
          ${!hasKey ? 'disabled' : ''}></textarea>
        <div class="aiask-char-row">
          <span class="aiask-char-count" id="aiask-char-count">0 / 800</span>
          <button class="btn-primary" id="aiask-submit-btn" style="padding:8px 20px;font-size:13px" ${!hasKey ? 'disabled' : ''}>
            送出
          </button>
        </div>
        <div id="aiask-result-area" style="margin-top:10px"></div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 8px;padding:0 2px">
        <span style="font-size:13px;font-weight:700;color:var(--text-primary)">詢問記錄 <span style="font-weight:400;color:var(--text-muted)">${history.length} 筆</span></span>
        ${history.length > 1 ? `<button class="btn-sort-toggle" id="aiask-sort-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
          新→舊
        </button>` : ''}
      </div>
      <div id="aiask-history-list"></div>
      <div style="height:20px"></div>
    `;

    bindPracticeModeSelector(container, 'aiask');

    document.getElementById('aiask-back-btn')?.addEventListener('click', () => {
      Router.essayActive = false;
      Views.practice.render(container);
    });

    const textarea  = document.getElementById('aiask-textarea');
    const charCount = document.getElementById('aiask-char-count');
    const resultArea= document.getElementById('aiask-result-area');
    const submitBtn = document.getElementById('aiask-submit-btn');

    textarea?.addEventListener('input', () => {
      const len = textarea.value.length;
      charCount.textContent = `${len} / 800`;
      charCount.style.color = len > 720 ? 'var(--danger)' : 'var(--text-muted)';
    });

    submitBtn?.addEventListener('click', async () => {
      const q = (textarea?.value || '').trim();
      if (!q) { showToast('請輸入問題'); return; }
      if (q.length > 800) { showToast('問題最多 800 字'); return; }

      submitBtn.disabled = true;
      resultArea.innerHTML = '<div class="ai-loading"><span class="ai-spinner"></span>AI 回覆中...</div>';

      try {
        const systemPrompt = `You are an English language tutor. Answer the user's English-related questions clearly and helpfully in Traditional Chinese (繁體中文), unless the user asks in English, in which case reply in English. When correcting sentences, show the corrected version and explain why. Be concise but thorough.`;
        const apiKey = DB.getApiKey();
        if (!apiKey) throw new Error('NO_API_KEY');
        const fullPrompt = systemPrompt + '\n\nUser question:\n' + q;
        const body = JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 8192 }
        });
        let answer = ''; let lastErr = null;
        for (const model of Gemini._getModelList()) {
          try {
            const raw = await Gemini._callModel(model, body, apiKey);
            if (!raw) { lastErr = new Error('EMPTY_RESPONSE'); continue; }
            // Strip thinking tags if any
            answer = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
            break;
          } catch(err) {
            if (err.message === 'NETWORK_ERROR') throw err;
            if (err.fallback) { lastErr = err; continue; }
            throw err;
          }
        }
        if (!answer) throw (lastErr || new Error('API_ERROR'));
        const id = this._makeId();
        DB.addAiAskEntry({ id, question: q, answer, ts: Date.now() });

        resultArea.innerHTML = `
          <div class="aiask-answer-box">
            <div class="aiask-answer-label">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              AI 回覆
            </div>
            <div class="aiask-answer-text">${nl2br(answer)}</div>
          </div>`;

        if (textarea) textarea.value = '';
        if (charCount) { charCount.textContent = '0 / 800'; charCount.style.color = ''; }

        // Refresh history list
        this._renderHistoryList(container, DB.getAiAskHistory(), 'new');
      } catch(err) {
        let msg = 'AI 回覆失敗，請稍後再試';
        if (err.message === 'NO_API_KEY') msg = '請先在設定頁填入 API Key';
        else if (err.message?.includes('NETWORK_ERROR')) msg = '網路錯誤';
        resultArea.innerHTML = `<div class="ecdict-no-result">${escapeHTML(msg)}</div>`;
      } finally {
        submitBtn.disabled = false;
      }
    });

    // Sort button
    let sortOrder = 'new';
    document.getElementById('aiask-sort-btn')?.addEventListener('click', () => {
      const btn = document.getElementById('aiask-sort-btn');
      sortOrder = sortOrder === 'new' ? 'old' : 'new';
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M3 6h18M7 12h10M11 18h2"/></svg> ${sortOrder === 'new' ? '新→舊' : '舊→新'}`;
      this._renderHistoryList(container, DB.getAiAskHistory(), sortOrder);
    });

    this._renderHistoryList(container, history, sortOrder);
  },

  _renderHistoryList(container, history, sortOrder) {
    const listEl = document.getElementById('aiask-history-list');
    if (!listEl) return;
    if (!history.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:13px">尚無詢問記錄</div>';
      return;
    }
    const items = sortOrder === 'old' ? [...history].reverse() : [...history];
    listEl.innerHTML = items.map((e, i) => {
      const id = e.id || '';
      const dateStr = id.length >= 10
        ? `20${id.slice(0,2)}/${id.slice(2,4)}/${id.slice(4,6)} ${id.slice(6,8)}:${id.slice(8,10)}`
        : '—';
      const preview = (e.question||'').slice(0, 70) + ((e.question||'').length > 70 ? '...' : '');
      return `<div class="essay-session-card aiask-card" data-idx="${i}" style="cursor:pointer">
        <div class="essay-session-date">${dateStr}</div>
        <div style="margin-top:4px;font-size:13px;color:var(--text-primary);line-height:1.5">${escapeHTML(preview)}</div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.aiask-card').forEach((card, i) => {
      card.addEventListener('click', () => {
        const item = sortOrder === 'old' ? [...history].reverse()[i] : history[i];
        this._showDetail(container, item);
      });
    });
  },

  _showDetail(container, item) {
    const id = item.id || '';
    const dateStr = id.length >= 10
      ? `20${id.slice(0,2)}/${id.slice(2,4)}/${id.slice(4,6)} ${id.slice(6,8)}:${id.slice(8,10)}`
      : '—';
    container.innerHTML = `
      <div class="section-header">
        <button class="back-link" id="aiask-detail-back2">← 返回</button>
        <h1 class="section-title">AI 詢問記錄</h1>
      </div>
      <div style="margin-bottom:12px">
        <span style="font-size:13px;color:var(--text-muted)">📅 ${dateStr}</span>
      </div>
      <div class="settings-section-label" style="margin-top:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        問題
      </div>
      <div class="settings-card" style="white-space:pre-wrap;font-size:14px;line-height:1.7;margin-bottom:0">${escapeHTML(item.question||'')}</div>
      <div class="settings-section-label" style="margin-top:12px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        AI 回覆
      </div>
      <div class="settings-card" style="font-size:14px;line-height:1.8;margin-bottom:0">${nl2br(item.answer||'')}</div>
      <div style="height:20px"></div>`;
    document.getElementById('aiask-detail-back2')?.addEventListener('click', () => this.render(container));
  }
};

Views.stats = {
  period: 7, chartInstance: null, mode: 'quiz',
  render(container) { this.period = 7; this.mode = 'quiz'; this.renderStats(container); },
  renderStats(container) {
    const allHistory = DB.getHistory();
    const totalSessions = allHistory.length;
    const totalAnswered = allHistory.reduce((s,h)=>s+(h.total||0),0);
    const totalCorrect  = allHistory.reduce((s,h)=>s+(h.correct||0),0);
    const overallPct    = totalAnswered > 0 ? Math.round(totalCorrect/totalAnswered*100) : 0;

    container.innerHTML = `
      <div class="section-header"><h1 class="section-title">練習統計</h1></div>
      <div class="stats-mode-bar">
        <select class="stats-mode-select" id="stats-mode-select">
          <option value="quiz" ${this.mode==="quiz"?"selected":""}>📝 單字練習</option>
          <option value="essay" ${this.mode==="essay"?"selected":""}>✍️ 文章撰寫</option>
          <option value="aiask" ${this.mode==="aiask"?"selected":""}>💬 AI 詢問</option>
        </select>
      </div>
      <div class="stats-period-chips">${[7,14,21,30].map(d=>`<button class="chip ${d===this.period?'selected':''}" data-period="${d}">${d===30?'本月':d+'天'}</button>`).join('')}</div>
      <div class="chart-card"><div class="card-header">答題趨勢</div><div class="chart-wrapper"><canvas id="stats-chart"></canvas></div></div>
      <div class="stats-table-card">
        <div class="stats-table-hint">點擊錯誤數字可查看答錯單字</div>
        <div class="stats-table-scroll">
          <table class="stats-table"><thead><tr><th>日期</th><th>總題數</th><th>正確</th><th>錯誤</th><th>正確率</th></tr></thead><tbody id="stats-tbody"></tbody></table>
        </div>
      </div>

      <!-- ★ 統計摘要：CSV 匯出功能已移至設定頁 -->
      <div class="stats-summary-card">
        <div class="stats-export-summary">
          <div class="stats-export-item"><div class="stats-export-num">${totalSessions}</div><div class="stats-export-label">練習次數</div></div>
          <div class="stats-export-sep"></div>
          <div class="stats-export-item"><div class="stats-export-num">${totalAnswered}</div><div class="stats-export-label">總答題數</div></div>
          <div class="stats-export-sep"></div>
          <div class="stats-export-item"><div class="stats-export-num" style="color:var(--primary)">${overallPct}%</div><div class="stats-export-label">整體正確率</div></div>
        </div>
        <div class="stats-export-note">CSV 匯出請至「設定 → 匯出統計資料」。</div>
      </div>

      <div style="height:20px"></div>
    `;
    document.getElementById('stats-mode-select')?.addEventListener('change', (e) => {
      this.mode = e.target.value;
      if (this.mode === 'essay') this.renderEssayStats(container);
      else if (this.mode === 'aiask') this.renderAiAskStats(container);
      else this.renderStats(container);
    });
    // Hide period chips and chart when in essay mode (they'll be shown only for quiz)
    container.querySelectorAll('[data-period]').forEach(btn => btn.addEventListener('click', () => {
      this.period=parseInt(btn.dataset.period);
      container.querySelectorAll('[data-period]').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected'); this.updateChart(allHistory);
    }));
    this.updateChart(allHistory);

  },
  updateChart(allHistory) {
    const labels=[]; const now=new Date();
    for(let i=this.period-1;i>=0;i--){ const d=new Date(now); d.setDate(d.getDate()-i); labels.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`); }
    const dataMap={}; allHistory.forEach(h=>{dataMap[h.date]=h;});
    const totalData=labels.map(d=>dataMap[d]?.total||0); const correctData=labels.map(d=>dataMap[d]?.correct||0); const wrongData=labels.map(d=>dataMap[d]?.wrong||0);
    const accuracyData=labels.map((d,i)=>totalData[i]>0?Math.round((correctData[i]/totalData[i])*100):null);
    const shortLabels=labels.map(d=>d.slice(5));
    const tbody=document.getElementById('stats-tbody');
    if(tbody){
      // Reverse for display: newest date on top; chart keeps chronological order
      const revLabels=[...labels].reverse(); const revShort=revLabels.map(d=>d.slice(5));
      tbody.innerHTML=revLabels.map((d,i)=>{ const tot=dataMap[d]?.total||0; const cor=dataMap[d]?.correct||0; const wrg=dataMap[d]?.wrong||0; const pct=tot>0?Math.round((cor/tot)*100):'—'; const rec=dataMap[d]; const hasDetails=rec?.wrongWordDetails?.length>0; return `<tr><td class="date-cell">${revShort[i]}</td><td>${tot||'—'}</td><td class="correct-cell">${tot?cor:'—'}</td><td class="wrong-cell">${tot?(hasDetails?`<span class="wrong-clickable" data-date="${d}">${wrg} ▸</span>`:wrg):'—'}</td><td>${pct==='—'?'—':pct+'%'}</td></tr>`; }).join('');
      tbody.querySelectorAll('.wrong-clickable').forEach(el=>el.addEventListener('click',()=>{const rec=dataMap[el.dataset.date]; if(rec?.wrongWordDetails) this.showWrongModal(el.dataset.date,rec.wrongWordDetails);}));
    }
    if(this.chartInstance) this.chartInstance.destroy();
    const ctx=document.getElementById('stats-chart'); if(!ctx) return;
    this.chartInstance=new Chart(ctx,{
      data:{labels:shortLabels,datasets:[
        {type:'line',label:'正確率%',data:accuracyData,borderColor:'#f5a623',backgroundColor:'rgba(245,166,35,0.08)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:'#f5a623',fill:false,tension:0.3,yAxisID:'yPct',spanGaps:true},
        {type:'bar',label:'正確',data:correctData,backgroundColor:'rgba(26,122,74,0.7)',borderRadius:4,yAxisID:'y',stack:'answers'},
        {type:'bar',label:'錯誤',data:wrongData,backgroundColor:'rgba(229,57,53,0.7)',borderRadius:4,yAxisID:'y',stack:'answers'}
      ]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{labels:{font:{family:'Nunito',weight:'700',size:11},boxWidth:12,padding:12}},tooltip:{callbacks:{label(item){return item.dataset.label==='正確率%'?`正確率: ${item.raw??'—'}%`:`${item.dataset.label}: ${item.raw}`;}}}},
        scales:{x:{ticks:{font:{family:'Nunito',size:10},maxRotation:45},grid:{display:false}},y:{beginAtZero:true,position:'left',ticks:{font:{family:'Nunito',size:10},stepSize:1},grid:{color:'rgba(0,0,0,0.05)'},title:{display:true,text:'題數',font:{family:'Nunito',size:10},color:'#6b8070'}},yPct:{beginAtZero:true,max:100,position:'right',ticks:{font:{family:'Nunito',size:10},callback:v=>`${v}%`},grid:{display:false},title:{display:true,text:'正確率',font:{family:'Nunito',size:10},color:'#f5a623'}}}}
    });
  },
  renderEssayStats(container) {
    const history = DB.getEssayHistory();

    // Flatten all sessions into a single ordered list (newest first)
    const flatSessions = [];
    history.forEach(h => {
      (h.sessions || []).forEach((s, si) => {
        // Count how many sessions on the same date to label "1st / 2nd ..."
        const dayCount = (h.sessions||[]).length;
        flatSessions.push({ date: h.date, s, si, dayCount });
      });
    });
    // Sort oldest first (ascending by ts / date+si)
    flatSessions.sort((a, b) => {
      const ta = a.s.ts || 0, tb = b.s.ts || 0;
      if (ta !== tb) return tb - ta;
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.si - a.si;
    });

    const ordinals = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th'];
    const ord = n => ordinals[n] || `${n+1}th`;

    container.innerHTML = `
      <div class="section-header"><h1 class="section-title">練習統計</h1></div>
      <div class="stats-mode-bar">
        <select class="stats-mode-select" id="stats-mode-select">
          <option value="quiz">📝 單字練習</option>
          <option value="essay" selected>✍️ 文章撰寫</option>
          <option value="aiask">💬 AI 詢問</option>
        </select>
      </div>
      ${flatSessions.length > 0 ? `<div class="rec-header-styled">
        <div style="text-align:center">日期 / 時間</div>
        <div style="text-align:center">次序</div>
        <div class="rec-header-content" style="text-align:center">題目</div>
        <div class="rec-header-score" style="text-align:center">分數</div>
        <div></div>
      </div>` : ''}
      <div class="rec-list-scroll"><div class="rec-list">
        ${flatSessions.length === 0
          ? '<div class="essay-stats-empty">尚無文章撰寫記錄<br><span style="font-size:12px;opacity:0.6">前往練習 → 文章撰寫開始練習</span></div>'
          : flatSessions.map((item, fi) => {
              const { date, s, si } = item;
              let score = null;
              try { const f = s.feedback ? JSON.parse(s.feedback) : null; score = f?.score ?? null; } catch {}
              const scoreColor = score !== null ? (score>=8?'var(--correct)':score>=5?'#f5a623':'var(--danger)') : 'var(--text-muted)';
              const timeStr = s.ts ? new Date(s.ts).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
              const isAiMode  = (s.essayMode === 'ai');
              const wordList  = (s.words||[]).map(w=>w.english).join('、');
              // Build a meaningful display: show words + topic if available
              let promptStr, promptStyle;
              if (isAiMode) {
                const topicPart = s.topic ? s.topic.slice(0, 50) + (s.topic.length > 50 ? '…' : '') : '';
                const wordPart  = wordList ? `[${wordList}]` : '';
                promptStr = [topicPart, wordPart].filter(Boolean).join(' ') || '— AI 出題 —';
                promptStyle = 'font-style:italic;color:var(--primary)';
              } else {
                promptStr = wordList || '—';
                promptStyle = '';
              }
              const dateShort = date.replace(/\//g,'/');
              return `<div class="rec-row" data-fi="${fi}">
                <div class="rec-date">${dateShort}<br>${timeStr||'—'}</div>
                <div class="rec-ord">${ord(si)}${isAiMode?'<br><span class="essay-mode-tag">AI</span>':''}</div>
                <div class="rec-content" style="${promptStyle}">${promptStr}</div>
                <div class="rec-score" style="color:${scoreColor}">${score !== null ? score+'/10' : '—'}</div>
                <div class="rec-arrow">▸</div>
              </div>`;
            }).join('')}
      </div></div>
      <div style="height:20px"></div>
    `;

    document.getElementById('stats-mode-select')?.addEventListener('change', (e) => {
      this.mode = e.target.value;
      if (this.mode === 'quiz') this.renderStats(container);
      else if (this.mode === 'aiask') this.renderAiAskStats(container);
    });

    container.querySelectorAll('.rec-row').forEach(row => {
      row.addEventListener('click', () => {
        const item = flatSessions[parseInt(row.dataset.fi)];
        if (item) this.renderEssaySessionDetail(container, item, flatSessions);
      });
    });
  },

  renderEssaySessionDetail(container, item, flatSessions) {
    const { date, s, si } = item;
    const ordinals = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th'];
    const ord = n => ordinals[n] || `${n+1}th`;
    const wordList = (s.words||[]).map(w=>w.english).join('、');

    let fb = null; try { fb = s.feedback ? JSON.parse(s.feedback) : null; } catch {}
    const grammar = (fb?.grammar || []).map((g, i) => ({ ...g, idx: i }));
    const annotatedHtml = s.essay && grammar.length
      ? Views.essay._buildAnnotatedEssay(s.essay, grammar)
      : nl2br(s.essay || '');

    const scoreColor = fb?.score >= 8 ? 'var(--correct)' : fb?.score >= 5 ? '#f5a623' : 'var(--danger)';
    const wordCheckHtml = (fb?.wordCheck || (s.words||[]).map(w=>({word:w.english,used:false,correct:false}))).map(w =>
      `<span class="fb-badge ${w.used&&w.correct?'fb-ok':w.used?'fb-warn':'fb-missing'}">${w.used&&w.correct?'✓':'✗'} ${escapeHTML(w.word || '')}</span>`
    ).join('');
    const hasErrors = grammar.some(g => g.exact && (s.essay||'').includes(g.exact));
    const grammarHtml = grammar.length === 0
      ? '<div class="fb-ok-msg">✓ 未發現明顯文法錯誤</div>'
      : grammar.map(g => `
          <div class="err-detail-card" id="err-detail-${g.idx}">
            <div class="err-detail-header">
              <span class="err-detail-num">#${g.idx+1}</span>
              <a class="err-back-link" href="#err-text-${g.idx}">↑ 回到文章</a>
            </div>
            <div class="err-detail-row"><span class="err-detail-label err-label-wrong">✗ 原文</span><span class="err-detail-orig">${escapeHTML(g.exact||g.original||'')}</span></div>
            <div class="err-detail-row"><span class="err-detail-label err-label-fix">✓ 修正</span><span class="err-detail-fixed">${escapeHTML(g.corrected||'')}</span></div>
            ${g.explanation?`<div class="err-detail-exp">${nl2br(g.explanation)}</div>`:''}
          </div>`).join('');
    const suggestHtml = (fb?.suggestions||[]).map(sg => `<div class="essay-fb-suggest">💡 ${nl2br(sg)}</div>`).join('');
    const timeStr = s.ts ? new Date(s.ts).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';

    container.innerHTML = `
      <div class="section-header">
        <button class="back-link" id="essay-detail-back">← 返回列表</button>
        <h1 class="section-title" style="font-size:16px">${date} ${ord(si)}${timeStr ? ' · '+timeStr : ''}</h1>
      </div>
      <div class="essay-detail-card">
        ${s.essayMode === 'ai'
          ? '<div class="essay-detail-section-title">📌 題目</div>'
            + '<div style="font-size:14px;line-height:1.7;color:var(--text-primary);margin-bottom:4px;font-style:italic">'
            + escapeHTML(s.topic||'AI 出題') + '</div>'
            + (wordList ? '<div class="essay-detail-section-title">📖 使用單字</div>'
              + '<div class="essay-fb-badges">' + wordCheckHtml + '</div>' : '')
          : '<div class="essay-detail-section-title">📖 使用單字</div>'
            + '<div class="essay-fb-badges">' + wordCheckHtml + '</div>'}

        <div class="essay-detail-section-title">
          📝 撰寫的文章（含批改標注）
          ${hasErrors ? '<span class="err-legend"><span class="err-legend-r">紅字</span>=錯誤　<span class="err-legend-g">綠字</span>=修正（點紅字看詳解）</span>' : ''}
        </div>
        <div class="annotated-essay history-annotated">${annotatedHtml}</div>

        ${fb ? `
          <div class="essay-fb-score-row">
            <span>AI 評分</span>
            <span class="essay-detail-score" style="color:${scoreColor}">${fb.score}/10</span>
          </div>
          <div class="essay-fb-comment">${nl2br(fb.comment||'')}</div>
          ${grammar.length > 0 ? `
            <div class="essay-detail-section-title">📋 文法詳解（${grammar.length} 處）</div>
            <div class="grammar-detail-list">${grammarHtml}</div>` : '<div class="fb-ok-msg" style="margin-top:12px">✓ 未發現明顯文法錯誤</div>'}
          <div class="essay-detail-section-title">💬 文章建議</div>
          <div class="essay-fb-suggest-list">${suggestHtml}</div>
        ` : '<div class="essay-no-fb">無 AI 批改記錄</div>'}
      </div>
      <div style="height:20px"></div>
    `;

    document.getElementById('essay-detail-back').addEventListener('click', () => this.renderEssayStats(container));
    container.querySelectorAll('a.err-anchor, a.err-back-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  },

  renderAiAskStats(container) {
    const history = DB.getAiAskHistory();
    const statsModeSel = `
      <div class="stats-mode-bar">
        <select class="stats-mode-select" id="stats-mode-select">
          <option value="quiz">📝 單字練習</option>
          <option value="essay">✍️ 文章撰寫</option>
          <option value="aiask" selected>💬 AI 詢問</option>
        </select>
      </div>`;

    if (history.length === 0) {
      container.innerHTML = `
        <div class="section-header"><h1 class="section-title">練習統計</h1></div>
        ${statsModeSel}
        <div class="db-empty" style="margin-top:32px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display:block;margin:auto;width:40px;height:40px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <div class="db-empty-title" style="margin-top:10px">尚無 AI 詢問記錄</div>
          <div class="db-empty-sub">前往練習頁的「💬 AI 詢問」開始提問</div>
        </div>
        <div style="height:20px"></div>`;
      document.getElementById('stats-mode-select')?.addEventListener('change', (e) => {
        this.mode = e.target.value;
        if (this.mode === 'quiz') this.renderStats(container);
        else if (this.mode === 'essay') this.renderEssayStats(container);
      });
      return;
    }

    container.innerHTML = `
      <div class="section-header"><h1 class="section-title">練習統計</h1></div>
      ${statsModeSel}
      <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0 8px;padding:0 2px">
        <span style="font-size:13px;color:var(--text-secondary)">共 ${history.length} 筆詢問</span>
        <button class="btn-sort-toggle" id="aiask-sort-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
          新→舊
        </button>
      </div>
      <div class="rec-header-styled" id="aiask-list-header" style="display:none">
        <div style="text-align:center">日期 / 時間</div>
        <div style="text-align:center">次序</div>
        <div class="rec-header-content" style="text-align:center">問題</div>
        <div class="rec-header-score" style="text-align:center">類別</div>
        <div></div>
      </div>
      <div class="rec-list-scroll"><div id="aiask-list" class="rec-list"></div></div>
      <div style="height:20px"></div>`;

    document.getElementById('stats-mode-select')?.addEventListener('change', (e) => {
      this.mode = e.target.value;
      if (this.mode === 'quiz') this.renderStats(container);
      else if (this.mode === 'essay') this.renderEssayStats(container);
    });

    let sortOrder = 'new';
    const renderList = () => {
      const listEl = document.getElementById('aiask-list');
      const headerEl = document.getElementById('aiask-list-header');
      if (!listEl) return;
      const items = sortOrder === 'new' ? [...history] : [...history].reverse();
      listEl.innerHTML = items.map((e, i) => {
        const preview = (e.question||'').slice(0, 70) + ((e.question||'').length > 70 ? '...' : '');
        const id2 = e.id || '';
        const d2 = id2.length >= 10 ? '20' + id2.slice(0,2) + '/' + id2.slice(2,4) + '/' + id2.slice(4,6) : '—';
        const t2 = id2.length >= 10 ? id2.slice(6,8) + ':' + id2.slice(8,10) : '';
        return '<div class="rec-row aiask-card" data-idx="' + i + '">'
          + '<div class="rec-date">' + d2 + '<br>' + t2 + '</div>'
          + '<div class="rec-ord" style="color:var(--text-muted)">—</div>'
          + '<div class="rec-content">' + escapeHTML(preview) + '</div>'
          + '<div class="rec-score" style="color:var(--text-muted)">—</div>'
          + '<div class="rec-arrow">▸</div>'
          + '</div>';
      }).join('');

      if (headerEl) headerEl.style.display = items.length > 0 ? '' : 'none';
      listEl.querySelectorAll('.aiask-card').forEach((card, i) => {
        card.addEventListener('click', () => {
          const item = sortOrder === 'new' ? history[i] : [...history].reverse()[i];
          this.renderAiAskDetail(container, item);
        });
      });
    };

    document.getElementById('aiask-sort-btn')?.addEventListener('click', () => {
      const btn = document.getElementById('aiask-sort-btn');
      sortOrder = sortOrder === 'new' ? 'old' : 'new';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M3 6h18M7 12h10M11 18h2"/></svg> ' + (sortOrder === 'new' ? '新→舊' : '舊→新');
      renderList();
    });

    renderList();
  },

  renderAiAskDetail(container, item) {
    const id = item.id || '';
    const dateStr = id.length >= 10
      ? '20' + id.slice(0,2) + '/' + id.slice(2,4) + '/' + id.slice(4,6) + ' ' + id.slice(6,8) + ':' + id.slice(8,10)
      : '—';
    container.innerHTML = `
      <div class="section-header">
        <button class="back-link" id="aiask-detail-back">← 返回</button>
        <h1 class="section-title">AI 詢問記錄</h1>
      </div>
      <div style="margin-bottom:12px">
        <span style="font-size:13px;color:var(--text-muted)">📅 ${dateStr}</span>
      </div>
      <div class="settings-section-label" style="margin-top:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        問題
      </div>
      <div class="settings-card" style="white-space:pre-wrap;font-size:14px;line-height:1.7;margin-bottom:0">${escapeHTML(item.question||'')}</div>
      <div class="settings-section-label" style="margin-top:12px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        AI 回覆
      </div>
      <div class="settings-card" style="font-size:14px;line-height:1.8;margin-bottom:0">${nl2br(item.answer||'')}</div>
      <div style="height:20px"></div>`;
    document.getElementById('aiask-detail-back')?.addEventListener('click', () => this.renderAiAskStats(container));
  },

  showWrongModal(date, wrongWordDetails) {
    Modal.show(`<div class="modal-handle"></div><div class="modal-title">${date} 答錯的單字</div><div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">共 ${wrongWordDetails.length} 個</div><div style="max-height:55vh;overflow-y:auto;">${wrongWordDetails.map(w=>`<div class="wrong-word-card" style="margin-bottom:8px"><div class="wrong-word-en">${w.english}</div><div class="wrong-word-meta"><span class="wrong-word-pos">${w.partOfSpeech}</span><span class="wrong-word-zh">${w.chinese}</span></div></div>`).join('')}</div><div style="margin-top:16px"><button class="modal-btn-cancel" id="close-wrong-modal" style="width:100%">關閉</button></div>`);
    document.getElementById('close-wrong-modal').addEventListener('click', () => Modal.hide());
  }
};

// ===========================
// SETTINGS VIEW — v1.4 layout
// ===========================
Views.settings = {
  render(container) {
    const savedKey    = DB.getApiKey();
    const hasKey      = !!savedKey;
    const savedModel  = DB.getModel();
    const clientId    = DB.getGDriveClientId();
    const folderId    = DB.getGDriveFolderId();
    const signedIn    = GDrive.isSignedIn();
    const sessionStatus = GDrive.getSessionStatus();
    const remembered  = sessionStatus === 'remembered';
    const email       = GDrive.getUserEmail();
    const lastSync    = DB.getGDriveLastSync();
    const autoSync    = DB.getGDriveAutoSync();

    const svgG  = '<svg viewBox="0 0 24 24" width="16" height="16" style="flex-shrink:0"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
    const svgUp = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>';
    const svgDn = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>';

    const importedSentences = DB.getImportedSentences();
    const aiSentences       = DB.getSentenceLog();
    const totalSentences    = DB.getCombinedSentenceLog().length;
    const totalWords        = DB.getWords().length;
    const totalStats        = DB.getHistory().length;
    const essayHistoryAll   = DB.getEssayHistory();
    const totalEssay        = essayHistoryAll.reduce((s,h) => s + (h.sessions||[]).length, 0);
    const totalAiAsk        = DB.getAiAskHistory().length;
    const dateTag           = todayStr().replace(/\//g,'-');

    container.innerHTML = `
      <div class="section-header"><h1 class="section-title">設定</h1></div>
      <div class="settings-wrap">

        <!-- ★ 1. Google Drive 同步狀態（最上方） -->
        <div class="settings-section-label" style="margin-top:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Google Drive 雲端備份
        </div>
        <div class="settings-card">
          ${(signedIn || remembered) ? `
            <div class="fb-status-row">
              <div class="fb-status-dot ${signedIn ? 'connected' : 'disconnected'}"></div>
              <span class="fb-status-text">${signedIn ? '已登入' : '已記住帳號，待操作時自動續權'}：${email}</span>
            </div>
            ${lastSync ? '<div class="fb-last-sync" style="margin-bottom:10px">上次備份：' + lastSync + '</div>' : ''}
            <div class="settings-btn-row" style="margin-bottom:10px">
              <button class="btn-fb-upload" id="gd-upload-btn" style="flex:1">${svgUp} 上傳備份</button>
              <button class="btn-fb-download" id="gd-download-btn" style="flex:1">${svgDn} 還原備份</button>
            </div>
            <label class="fb-auto-sync-row">
              <input type="checkbox" id="gd-auto-sync"${autoSync ? ' checked' : ''}>
              <span>每次開啟 APP 自動備份</span>
            </label>
            ${remembered ? '<div class="settings-tip" style="margin-top:8px">iOS PWA 關閉後可能需要 Google 再確認一次授權；本程式會保留帳號並在上傳/還原時自動續權，不會清空登入設定。</div>' : ''}
            <button class="btn-fb-signout-bottom" id="gd-signout-btn" style="margin-top:10px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              登出 Google（${email}）
            </button>
          ` : `
            <div class="fb-status-row" style="margin-bottom:8px">
              <div class="fb-status-dot disconnected"></div>
              <span class="fb-status-text">${clientId ? '尚未登入 Google' : '請先在下方填入 OAuth Client ID'}</span>
            </div>
            ${clientId ? '<button class="btn-fb-signin" id="gd-signin-btn" style="width:100%;padding:9px 12px;font-size:13px">' + svgG + ' 使用 Google 帳號登入</button>' : ''}
            <div class="settings-tip" style="margin-top:8px;margin-bottom:0">登入後可將資料備份至 Google Drive。設定請見下方。</div>
          `}
        </div>

        <!-- 2. 一鍵匯出全部 -->
        <div class="settings-section-label" style="margin-top:16px">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:15px;height:15px"><rect x="2" y="2" width="20" height="20" rx="2" fill="#5b8dd9" stroke="#3a6bc4" stroke-width="1.5"/><rect x="6" y="2" width="12" height="8" rx="1" fill="#a8c4f0" stroke="#3a6bc4" stroke-width="1.2"/><rect x="9" y="3.5" width="4" height="5" rx="0.5" fill="#3a6bc4"/><rect x="4" y="13" width="16" height="7" rx="1" fill="#d6e8ff" stroke="#3a6bc4" stroke-width="1.2"/></svg>
          一鍵匯出全部
        </div>
        <div class="settings-card">
          <div class="one-click-export-desc">同時匯出單字庫、例句庫、統計資料、文章撰寫、AI 詢問記錄，方便備份或跨裝置移轉。</div>
          <div class="one-click-summary-grid one-click-summary-grid-compact">
            <div class="oc-stat-cell">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              <div class="oc-stat-num">${totalWords}</div><div class="oc-stat-label">單字</div>
            </div>
            <div class="oc-stat-cell">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div class="oc-stat-num">${totalSentences}</div><div class="oc-stat-label">例句</div>
            </div>
            <div class="oc-stat-cell">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <div class="oc-stat-num">${totalStats}</div><div class="oc-stat-label">統計</div>
            </div>
            <div class="oc-stat-cell">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/></svg>
              <div class="oc-stat-num">${totalEssay}</div><div class="oc-stat-label">文章</div>
            </div>
            <div class="oc-stat-cell">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <div class="oc-stat-num">${totalAiAsk}</div><div class="oc-stat-label">AI 詢問</div>
            </div>
          </div>
          <button class="btn-one-click-export" id="one-click-export-btn">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px"><rect x="2" y="2" width="20" height="20" rx="2" fill="#5b8dd9" stroke="#3a6bc4" stroke-width="1.5"/><rect x="6" y="2" width="12" height="8" rx="1" fill="#a8c4f0" stroke="#3a6bc4" stroke-width="1.2"/><rect x="9" y="3.5" width="4" height="5" rx="0.5" fill="#3a6bc4"/><rect x="4" y="13" width="16" height="7" rx="1" fill="#d6e8ff" stroke="#3a6bc4" stroke-width="1.2"/></svg>
            一鍵匯出全部資料
          </button>
          <div class="one-click-divider-h"></div>
          <button class="btn-one-click-import" id="one-click-import-btn">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px"><path d="M2 7C2 5.9 2.9 5 4 5H10L12 7H20C21.1 7 22 7.9 22 9V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V7Z" fill="#f5a623" stroke="#d4891a" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 10H22V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V10Z" fill="#ffc84a" stroke="#d4891a" stroke-width="1.5" stroke-linejoin="round"/></svg>
            一鍵匯入（最多 3 個 CSV）
          </button>
          <div class="one-click-import-hint">可選取單字/例句/統計 CSV，或直接選取備份 ZIP 檔一鍵還原</div>
        </div>

        <!-- 3. 折疊資訊：預設收合 -->
        <div class="settings-section-label settings-collapse-group-label" style="margin-top:16px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M3 4h18"/><path d="M3 10h18"/><path d="M3 16h18"/><path d="M3 22h18"/></svg>
          資料狀態與管理
        </div>

        <details class="settings-collapsible-card">
          <summary class="settings-collapse-summary">
            <span class="settings-collapse-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              單字資料庫
            </span>
            <span class="settings-collapse-count">${totalWords} 個</span>
            <span class="settings-collapse-chevron">⌄</span>
          </summary>
          <div class="settings-card settings-collapse-body">
            <div class="settings-stat-row">
              <div class="settings-stat-num">${totalWords}</div>
              <div class="settings-stat-label">個單字</div>
            </div>
            <div class="settings-btn-row">
              <button class="btn-icon btn-export" id="export-vocab-btn" style="flex:1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="2" fill="#5b8dd9" stroke="#3a6bc4"/><rect x="6" y="2" width="12" height="8" rx="1" fill="#a8c4f0" stroke="#3a6bc4" stroke-width="1.5"/><rect x="9" y="3.5" width="4" height="5" rx="0.5" fill="#3a6bc4" stroke="none"/><rect x="4" y="13" width="16" height="7" rx="1" fill="#d6e8ff" stroke="#3a6bc4" stroke-width="1.5"/></svg>匯出 CSV
              </button>
              <button class="btn-danger-sm" id="clear-vocab-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>清除全部
              </button>
            </div>
          </div>
        </details>

        <details class="settings-collapsible-card">
          <summary class="settings-collapse-summary">
            <span class="settings-collapse-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              每日例句
            </span>
            <span class="settings-collapse-count">${totalSentences} 筆</span>
            <span class="settings-collapse-chevron">⌄</span>
          </summary>
          <div class="settings-card settings-collapse-body">
            <div class="sentence-stats-row">
              <div class="sentence-stat-box">
                <div class="sentence-stat-num">${aiSentences.length}</div>
                <div class="sentence-stat-label">AI 生成</div>
              </div>
              <div class="sentence-stat-box">
                <div class="sentence-stat-num" style="color:#3366cc">${importedSentences.length}</div>
                <div class="sentence-stat-label">CSV 匯入</div>
              </div>
              <div class="sentence-stat-box">
                <div class="sentence-stat-num" style="color:#e67e00">${totalSentences}</div>
                <div class="sentence-stat-label">合計（去重）</div>
              </div>
            </div>
            <div class="settings-btn-row">
              <button class="btn-icon btn-export" id="export-sentences-btn" style="flex:1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="2" fill="#5b8dd9" stroke="#3a6bc4"/><rect x="6" y="2" width="12" height="8" rx="1" fill="#a8c4f0" stroke="#3a6bc4" stroke-width="1.5"/><rect x="9" y="3.5" width="4" height="5" rx="0.5" fill="#3a6bc4" stroke="none"/><rect x="4" y="13" width="16" height="7" rx="1" fill="#d6e8ff" stroke="#3a6bc4" stroke-width="1.5"/></svg>匯出 CSV
              </button>
              <button class="btn-danger-sm" id="clear-sentences-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>清除全部
              </button>
            </div>
          </div>
        </details>

        <details class="settings-collapsible-card">
          <summary class="settings-collapse-summary">
            <span class="settings-collapse-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              練習統計
            </span>
            <span class="settings-collapse-count">${totalStats} 筆</span>
            <span class="settings-collapse-chevron">⌄</span>
          </summary>
          <div class="settings-card settings-collapse-body">
            <div class="settings-stat-row">
              <div class="settings-stat-num">${totalStats}</div>
              <div class="settings-stat-label">筆練習記錄</div>
            </div>
            <div class="settings-btn-row">
              <button class="btn-icon btn-export" id="export-stats-settings-btn" style="flex:1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="2" fill="#5b8dd9" stroke="#3a6bc4"/><rect x="6" y="2" width="12" height="8" rx="1" fill="#a8c4f0" stroke="#3a6bc4" stroke-width="1.5"/><rect x="9" y="3.5" width="4" height="5" rx="0.5" fill="#3a6bc4" stroke="none"/><rect x="4" y="13" width="16" height="7" rx="1" fill="#d6e8ff" stroke="#3a6bc4" stroke-width="1.5"/></svg>匯出 CSV
              </button>
              <button class="btn-danger-sm" id="clear-stats-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>清除全部
              </button>
            </div>
          </div>
        </details>

        <details class="settings-collapsible-card">
          <summary class="settings-collapse-summary">
            <span class="settings-collapse-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/></svg>
              文章撰寫
            </span>
            <span class="settings-collapse-count">${totalEssay} 篇</span>
            <span class="settings-collapse-chevron">⌄</span>
          </summary>
          <div class="settings-card settings-collapse-body">
            <div class="settings-stat-row">
              <div class="settings-stat-num">${totalEssay}</div>
              <div class="settings-stat-label">篇練習記錄</div>
            </div>
            <div class="settings-btn-row">
              <button class="btn-icon btn-export" id="export-essay-btn" style="flex:1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="2" fill="#5b8dd9" stroke="#3a6bc4"/><rect x="6" y="2" width="12" height="8" rx="1" fill="#a8c4f0" stroke="#3a6bc4" stroke-width="1.5"/><rect x="9" y="3.5" width="4" height="5" rx="0.5" fill="#3a6bc4" stroke="none"/><rect x="4" y="13" width="16" height="7" rx="1" fill="#d6e8ff" stroke="#3a6bc4" stroke-width="1.5"/></svg>匯出 CSV
              </button>
              <button class="btn-danger-sm" id="clear-essay-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>清除全部
              </button>
            </div>
          </div>
        </details>

        <details class="settings-collapsible-card">
          <summary class="settings-collapse-summary">
            <span class="settings-collapse-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              AI 詢問
            </span>
            <span class="settings-collapse-count">${totalAiAsk} 筆</span>
            <span class="settings-collapse-chevron">⌄</span>
          </summary>
          <div class="settings-card settings-collapse-body">
            <div class="settings-stat-row">
              <div class="settings-stat-num">${totalAiAsk}</div>
              <div class="settings-stat-label">筆詢問記錄</div>
            </div>
            <div class="settings-btn-row">
              <button class="btn-icon btn-export" id="export-aiask-btn" style="flex:1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="2" fill="#5b8dd9" stroke="#3a6bc4"/><rect x="6" y="2" width="12" height="8" rx="1" fill="#a8c4f0" stroke="#3a6bc4" stroke-width="1.5"/><rect x="9" y="3.5" width="4" height="5" rx="0.5" fill="#3a6bc4" stroke="none"/><rect x="4" y="13" width="16" height="7" rx="1" fill="#d6e8ff" stroke="#3a6bc4" stroke-width="1.5"/></svg>匯出 CSV
              </button>
              <button class="btn-danger-sm" id="clear-aiask-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>清除全部
              </button>
            </div>
          </div>
        </details>

        <!-- 6. Google Drive 設定（Client ID / Folder ID） -->
        <div class="settings-section-label" style="margin-top:16px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          Google Drive 設定
        </div>
        <div class="settings-card">
          <div class="api-subsection-label" style="margin-bottom:4px">OAuth Client ID</div>
          <div class="form-group" style="margin-bottom:8px">
            <input type="text" class="form-input" id="gd-client-id-input" value="${clientId}" placeholder="xxxxxx.apps.googleusercontent.com" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          </div>
          <div class="api-subsection-label" style="margin-bottom:4px">Google Drive 資料夾 ID（選填）</div>
          <div class="form-group" style="margin-bottom:8px">
            <input type="text" class="form-input" id="gd-folder-id-input" value="${folderId}" placeholder="留空則儲存到 Drive 根目錄" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          </div>
          <div class="settings-btn-row">
            <button class="btn-primary" id="gd-save-cfg-btn" style="flex:1">儲存 Drive 設定</button>
          </div>
          <div class="settings-tip" style="margin-top:10px;margin-bottom:0">需在 Google Cloud Console 建立 OAuth 2.0 用戶端 ID（類型：網頁應用程式），並將本站網址加入授權來源。資料夾 ID 可從 Drive 資料夾網址中取得（/folders/ 後面的部分）。</div>
        </div>

        <!-- 7. Gemini API 金鑰設定 -->
        <div class="settings-section-label" style="margin-top:16px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          Gemini API 金鑰設定
        </div>
        <div class="settings-card">
          <div class="key-status" style="margin-bottom:6px">
            <div class="key-status-dot ${hasKey?'saved':'unsaved'}"></div>
            <span>${hasKey?'已儲存 Gemini Key':'尚未設定 Gemini Key'}</span>
          </div>
          <div class="form-group">
            <div class="input-with-toggle">
              <input type="password" class="form-input" id="api-key-input" value="${savedKey}" placeholder="AIza...（Google AI Studio）">
              <button class="toggle-visibility" id="toggle-vis"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
            </div>
          </div>
          <div class="settings-btn-row">
            <button class="btn-primary" id="save-key-btn" style="flex:1">儲存</button>
            ${hasKey?'<button class="btn-secondary" id="clear-key-btn" style="flex:1">清除</button>':''}
          </div>
          <div class="model-dropdown-row">
            <label class="model-dropdown-label">AI 模型</label>
            <select class="model-dropdown-select" id="gemini-model-select">
              ${Gemini.AVAILABLE_MODELS.map(m =>
                `<option value="${escapeHTML(m.id)}" ${savedModel===m.id?'selected':''}>${escapeHTML(m.label)}${m.tag ? '（' + escapeHTML(m.tag) + '）' : ''}</option>`
              ).join('')}
            </select>
          </div>
          <a class="api-link" href="https://aistudio.google.com/app/apikey" target="_blank">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            取得 Gemini Key（Google AI Studio）
          </a>
          <div class="settings-tip" style="margin-bottom:0">免費方案每天有配額限制，每日例句每天只生成一次以節省配額。所有 Key 僅儲存於本機裝置。</div>
        </div>

        <!-- 版本號 + 檢查更新 -->
        <div class="settings-section-label" style="margin-top:16px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          版本資訊
        </div>
        <div class="settings-card" style="text-align:center">
          <div style="color:var(--text-muted);font-size:13px;margin-bottom:12px">
            英文單字複習 PWA &nbsp;·&nbsp; <strong style="color:var(--text-primary)">${APP_VERSION}</strong>
          </div>
          <button class="btn-secondary" id="check-update-btn" style="width:100%;margin-bottom:8px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            檢查更新
          </button>
          <div id="update-status" style="font-size:12px;color:var(--text-muted);min-height:16px"></div>
        </div>

        <div style="height:12px"></div>
      </div>

      <input type="file" id="one-click-import-input" accept=".csv,.zip" multiple style="display:none">
    `;

    // ── 1. API Key ──
    const input = document.getElementById('api-key-input');
    document.getElementById('toggle-vis').addEventListener('click', () => { input.type = input.type==='password'?'text':'password'; });
    document.getElementById('save-key-btn').addEventListener('click', () => {
      const key = input.value.trim(); if (!key) { showToast('請輸入 API Key'); return; }
      DB.saveApiKey(key); showToast('✓ API Key 已儲存'); this.render(container);
    });
    document.getElementById('clear-key-btn')?.addEventListener('click', () => { DB.saveApiKey(''); showToast('已清除 API Key'); this.render(container); });

    // ── 模型選擇（下拉選單） ──
    document.getElementById('gemini-model-select')?.addEventListener('change', (e) => {
      DB.saveModel(e.target.value);
      showToast('✓ 模型：' + (Gemini.AVAILABLE_MODELS.find(m=>m.id===e.target.value)?.label || e.target.value));
    });

    // ── helper: confirm-clear modal ──
    const confirmClear = (title, desc, onConfirm) => {
      Modal.show(`<div class="modal-handle"></div><div class="modal-title">${title}</div><p style="color:var(--text-muted);font-size:14px;margin-bottom:16px">${desc}</p><div class="modal-actions"><button class="modal-btn-cancel" id="cc-cancel">取消</button><button class="modal-btn-delete" id="cc-confirm">確認清除</button></div>`);
      document.getElementById('cc-cancel').addEventListener('click', () => Modal.hide());
      document.getElementById('cc-confirm').addEventListener('click', () => { Modal.hide(); onConfirm(); });
    };

    // ── 2. 單字庫 ──
    document.getElementById('export-vocab-btn').addEventListener('click', () => {
      if (!DB.getWords().length) { showToast('資料庫是空的'); return; }
      downloadCSV(DB.exportCSV(), `vocab_${dateTag}.csv`);
      showToast('✓ 單字 CSV 已匯出');
    });
    document.getElementById('clear-vocab-btn')?.addEventListener('click', () => {
      confirmClear('清除單字資料庫',
        `確定要清除全部 ${totalWords} 個單字嗎？此操作無法復原，建議先匯出備份。`,
        () => { DB.saveWords([]); localStorage.removeItem('boostedWords'); showToast('已清除單字資料庫'); this.render(container); });
    });

    // ── 3. 例句 ──
    document.getElementById('export-sentences-btn').addEventListener('click', () => {
      const csv = DB.exportSentencesCSV();
      if (!csv.includes('\n')) { showToast('尚無例句可匯出'); return; }
      downloadCSV(csv, `sentences_${dateTag}.csv`);
      showToast('✓ 例句 CSV 已匯出');
    });
    document.getElementById('clear-sentences-btn')?.addEventListener('click', () => {
      confirmClear('清除所有例句',
        `確定要清除全部 ${totalSentences} 筆例句嗎（AI 生成 + CSV 匯入）？此操作無法復原。`,
        () => { DB.saveSentenceLog([]); DB.saveImportedSentences([]); showToast('已清除所有例句'); this.render(container); });
    });

    // ── 4. 練習統計 ──
    document.getElementById('export-stats-settings-btn').addEventListener('click', () => {
      if (!DB.getHistory().length) { showToast('尚無統計資料'); return; }
      downloadCSV(DB.exportStatsCSV(), `stats_${dateTag}.csv`);
      showToast('✓ 統計 CSV 已匯出');
    });
    document.getElementById('clear-stats-btn')?.addEventListener('click', () => {
      confirmClear('清除練習統計',
        `確定要清除全部 ${totalStats} 筆練習記錄嗎？此操作無法復原。`,
        () => { DB.saveHistory([]); showToast('已清除練習統計'); this.render(container); });
    });

    // ── 4b. 文章撰寫 ──
    document.getElementById('export-essay-btn')?.addEventListener('click', () => {
      if (!totalEssay) { showToast('尚無文章記錄'); return; }
      downloadCSV(DB.exportEssayCSV(), `essay_${dateTag}.csv`);
      showToast('✓ 文章 CSV 已匯出');
    });
    document.getElementById('clear-essay-btn')?.addEventListener('click', () => {
      confirmClear('清除文章撰寫記錄',
        `確定要清除全部 ${totalEssay} 篇文章記錄嗎？此操作無法復原。`,
        () => { DB.saveEssayHistory([]); showToast('已清除文章撰寫記錄'); this.render(container); });
    });

    // ── 4c. AI 詢問 ──
    document.getElementById('export-aiask-btn')?.addEventListener('click', () => {
      if (!totalAiAsk) { showToast('尚無詢問記錄'); return; }
      downloadCSV(DB.exportAiAskCSV(), `aiask_${dateTag}.csv`);
      showToast('✓ AI 詢問 CSV 已匯出');
    });
    document.getElementById('clear-aiask-btn')?.addEventListener('click', () => {
      confirmClear('清除 AI 詢問記錄',
        `確定要清除全部 ${totalAiAsk} 筆詢問記錄嗎？此操作無法復原。`,
        () => { DB.saveAiAskHistory([]); showToast('已清除 AI 詢問記錄'); this.render(container); });
    });

    // ── 5. 一鍵匯出：打包成單一 ZIP 一次下載 ──
    document.getElementById('one-click-export-btn').addEventListener('click', async () => {
      const words = DB.getWords(); const sentCsv = DB.exportSentencesCSV(); const statHistory = DB.getHistory();
      if (!words.length && !sentCsv.includes('\n') && !statHistory.length) { showToast('尚無資料可匯出'); return; }
      showToast('⏳ 正在打包...', 1800);
      try {
        const zip = new JSZip();
        if (words.length)           zip.file(`vocab_${dateTag}.csv`,     '\uFEFF' + DB.exportCSV());
        if (sentCsv.includes('\n')) zip.file(`sentences_${dateTag}.csv`, '\uFEFF' + sentCsv);
        if (statHistory.length)     zip.file(`stats_${dateTag}.csv`,     '\uFEFF' + DB.exportStatsCSV());
        const essayHistory = DB.getEssayHistory();
        if (essayHistory.length)    zip.file(`essay_${dateTag}.csv`,     '\uFEFF' + DB.exportEssayCSV());
        const aiAskHistory = DB.getAiAskHistory();
        if (aiAskHistory.length)    zip.file(`aiask_${dateTag}.csv`,     '\uFEFF' + DB.exportAiAskCSV());
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = `vocab-backup_${dateTag}.zip`; a.click(); URL.revokeObjectURL(url);
        const count = [words.length, sentCsv.includes('\n'), statHistory.length, essayHistory.length, aiAskHistory.length].filter(Boolean).length;
        showToast(`✓ 已匯出 ${count} 個檔案（ZIP）`, 3000);
      } catch(err) {
        showToast('匯出失敗，請重試');
      }
    });

    // ── 一鍵匯入（自動識別類型）──
    const oneClickImportInput = document.getElementById('one-click-import-input');
    document.getElementById('one-click-import-btn').addEventListener('click', () => oneClickImportInput.click());
    oneClickImportInput.addEventListener('change', async (e) => {
      const files = [...e.target.files]; e.target.value = '';
      if (!files.length) return;

      const results = []; const errors = []; const unknown = [];

      // Helper: process a single CSV text entry
      const processCSV = (name, text) => {
        const type = DB.detectCSVType(text);
        if (!type) { unknown.push(name); return; }
        try {
          if (type === 'vocab') {
            const r = DB.importCSV(text);
            results.push(`📚 單字庫（${name}）：新增 ${r.added} 個${r.skipped > 0 ? `，略過 ${r.skipped} 筆` : ''}`);
          } else if (type === 'sentences') {
            const r = DB.importSentencesCSV(text);
            results.push(`💬 例句（${name}）：新增 ${r.added} 筆`);
          } else if (type === 'stats') {
            const r = DB.importStatsCSV(text);
            results.push(`📊 統計（${name}）：新增 ${r.added} 筆，更新 ${r.updated} 筆`);
          } else if (type === 'essay') {
            const r = DB.importEssayCSV(text);
            results.push(`✍️ 文章記錄（${name}）：新增 ${r.added} 筆`);
          } else if (type === 'aiask') {
            const r = DB.importAiAskCSV(text);
            results.push(`💬 AI 詢問（${name}）：新增 ${r.added} 筆`);
          }
        } catch(err) {
          errors.push(`${name}（${err.message||'格式錯誤'}）`);
        }
      };

      // Helper: read file as text
      const readAsText = (file) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsText(file, 'UTF-8');
      });

      // Helper: read file as ArrayBuffer (for ZIP)
      const readAsBuffer = (file) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsArrayBuffer(file);
      });

      showToast('⏳ 正在匯入...', 2000);

      for (const file of files) {
        const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip';
        if (isZip) {
          // ── ZIP: extract all CSV files inside ──
          try {
            const buffer = await readAsBuffer(file);
            const zip = await JSZip.loadAsync(buffer);
            const csvFiles = Object.values(zip.files).filter(f => !f.dir && f.name.toLowerCase().endsWith('.csv'));
            if (csvFiles.length === 0) { unknown.push(file.name + '（ZIP 內無 CSV）'); continue; }
            for (const csvFile of csvFiles) {
              const text = await csvFile.async('text');
              // Strip BOM if present
              const clean = text.replace(/^\uFEFF/, '');
              processCSV(csvFile.name.split('/').pop(), clean);
            }
          } catch(err) {
            errors.push(`${file.name}（ZIP 解析失敗）`);
          }
        } else {
          // ── Single CSV file ──
          const text = await readAsText(file);
          processCSV(file.name, text.replace(/^\uFEFF/, ''));
        }
      }

      // Show result modal
      const lines = [
        ...results.map(r => `<div class="batch-result-ok">✓ ${r}</div>`),
        ...unknown.map(n => `<div class="batch-result-warn">⚠ 無法識別：${n}</div>`),
        ...errors.map(n => `<div class="batch-result-err">✗ 匯入失敗：${n}</div>`)
      ].join('');

      if (results.length === 0 && errors.length === 0 && unknown.length > 0) {
        showToast('無法識別檔案格式，請確認 CSV 標頭');
      } else {
        Modal.show(`
          <div class="modal-handle"></div>
          <div class="modal-title">一鍵匯入結果</div>
          <div class="batch-result-list">${lines || '<div style="color:var(--text-muted);font-size:13px">無資料被匯入</div>'}</div>
          ${unknown.length > 0 ? `<div class="batch-unknown-hint">無法識別的檔案請確認 CSV 標頭格式是否正確</div>` : ''}
          <div style="margin-top:16px"><button class="modal-btn-cancel" id="close-batch-modal" style="width:100%">完成</button></div>
        `);
        document.getElementById('close-batch-modal').addEventListener('click', () => {
          Modal.hide(); this.render(container);
        });
      }
      if (results.length > 0) this.render(container);
    });

    // ── Google Drive 設定儲存 ──
    document.getElementById('gd-save-cfg-btn')?.addEventListener('click', () => {
      const cid = document.getElementById('gd-client-id-input').value.trim();
      const fid = document.getElementById('gd-folder-id-input').value.trim();
      DB.setGDriveClientId(cid);
      DB.setGDriveFolderId(fid);
      showToast('✓ Google Drive 設定已儲存');
      // If signed in with old token, sign out since client ID may have changed
      if (GDrive.hasRememberedSession()) { GDrive.signOut(); this.render(container); }
    });

    // ── Google 登入 ──
    document.getElementById('gd-signin-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = '登入中…';
      try {
        await GDrive.signIn();
        showToast('✓ 已登入 ' + GDrive.getUserEmail());
        this.render(container);
      } catch(err) {
        let msg = '登入失敗，請稍後再試';
        if (err.message === 'NO_CLIENT_ID')    msg = '請先填入並儲存 OAuth Client ID';
        if (err.message === 'GIS_LOAD_FAILED') msg = 'GIS 載入失敗，請確認網路連線';
        if (err.message === 'popup_closed_by_user') msg = '登入視窗已關閉';
        if (err.message === 'access_denied')   msg = '授權被拒絕，請確認 Client ID 設定';
        showToast(msg, 3500);
        btn.disabled = false; btn.textContent = '使用 Google 帳號登入';
      }
    });

    // ── Google 登出 ──
    document.getElementById('gd-signout-btn')?.addEventListener('click', () => {
      GDrive.signOut();
      showToast('已登出 Google');
      this.render(container);
    });

    // ── 上傳備份 ──
    document.getElementById('gd-upload-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('gd-upload-btn');
      if (btn) btn.disabled = true;
      try {
        const ts = await GDrive.upload({ interactive: true });
        showToast('✓ 備份已上傳至 Google Drive（' + ts + '）');
        this.render(container);
      } catch(err) {
        if (err.message === 'NOT_SIGNED_IN')  showToast('請先登入 Google', 3000);
        else if (err.message === 'TOKEN_EXPIRED') { showToast('需要 Google 重新確認授權，請再按一次操作', 3500); this.render(container); }
        else showToast('上傳失敗：' + err.message, 3000);
      }
      if (btn) btn.disabled = false;
    });

    // ── 還原備份（選擇 10 個檔案之一） ──
    document.getElementById('gd-download-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('gd-download-btn');
      if (btn) btn.disabled = true;
      try {
        const files = await GDrive.listBackups({ interactive: true });
        if (!files.length) { showToast('雲端尚無備份，請先上傳', 3000); if (btn) btn.disabled=false; return; }
        const rows = files.map((f, i) => {
          const ts  = f.createdTime ? new Date(f.createdTime).toLocaleString('zh-TW') : '—';
          const tag = i === 0 ? '<span style="font-size:10px;font-weight:800;color:var(--primary);background:color-mix(in srgb,var(--primary) 12%,transparent);padding:1px 6px;border-radius:10px;margin-left:6px">最新</span>' : '';
          let meta = '';
          try {
            const sm = JSON.parse(f.description || '{}');
            const parts = [];
            if (sm.words     != null) parts.push('單字 ' + sm.words + ' 個');
            if (sm.sentences != null) parts.push('例句 ' + sm.sentences + ' 筆');
            if (sm.stats     != null) parts.push('統計 ' + sm.stats + ' 筆');
            if (sm.essay     != null) parts.push('文章 ' + sm.essay + ' 篇');
            meta = parts.join('・');
          } catch {}
          return `<button class="fb-slot-btn" data-fid="${f.id}" style="width:100%;text-align:left;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;margin-bottom:6px">
            <div style="font-weight:700;font-size:13px;color:var(--text-primary)">${ts}${tag}</div>
            ${meta ? '<div style="font-size:12px;color:var(--primary);margin-top:2px">' + meta + '</div>' : ''}
          </button>`;
        }).join('');
        Modal.show(`<div class="modal-handle"></div>
          <div class="modal-title">選擇備份版本</div>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">由新到舊，最多顯示 10 份。</p>
          <div id="gd-slot-list">${rows}</div>
          <button class="modal-btn-cancel" id="gd-dl-cancel" style="width:100%;margin-top:4px">取消</button>`);
        document.getElementById('gd-dl-cancel').addEventListener('click', () => Modal.hide());
        document.querySelectorAll('.fb-slot-btn').forEach(b => {
          b.addEventListener('click', async () => {
            const fileId = b.dataset.fid;
            document.querySelectorAll('.fb-slot-btn').forEach(x => x.disabled = true);
            try {
              const data = await GDrive.downloadFile(fileId, { interactive: true });
              Modal.show(`<div class="modal-handle"></div>
                <div class="modal-title">套用備份</div>
                <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px">
                  單字 ${(data.words||[]).length} 個・統計 ${(data.history||[]).length} 筆<br>
                  備份時間：${data.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-TW') : '—'}
                </p>
                <div style="display:flex;flex-direction:column;gap:8px">
                  <button class="btn-primary" id="gd-dl-overwrite" style="width:100%">覆蓋本機（以此備份為主）</button>
                  <button class="btn-secondary" id="gd-dl-merge" style="width:100%">合併（保留本機 + 備份全部）</button>
                  <button class="modal-btn-cancel" id="gd-dl-cancel2" style="width:100%;margin-top:4px">取消</button>
                </div>`);
              const apply = (mode) => { GDrive.applyDownload(data, mode); Modal.hide(); showToast('✓ 備份已還原至本機'); this.render(container); };
              document.getElementById('gd-dl-overwrite').addEventListener('click', () => apply('overwrite'));
              document.getElementById('gd-dl-merge').addEventListener('click',     () => apply('merge'));
              document.getElementById('gd-dl-cancel2').addEventListener('click',   () => Modal.hide());
            } catch(err) {
              if (err.message === 'TOKEN_EXPIRED') { Modal.hide(); showToast('需要 Google 重新確認授權，請再按一次操作', 3500); this.render(container); }
              else { showToast('下載失敗：' + err.message, 3000); Modal.hide(); }
            }
          });
        });
      } catch(err) {
        if (err.message === 'NOT_SIGNED_IN')   showToast('請先登入 Google');
        else if (err.message === 'TOKEN_EXPIRED') { showToast('需要 Google 重新確認授權，請再按一次操作', 3500); this.render(container); }
        else showToast('讀取失敗：' + err.message, 3000);
      }
      if (btn) btn.disabled = false;
    });

    // ── 自動備份開關 ──
    document.getElementById('gd-auto-sync')?.addEventListener('change', (e) => {
      DB.setGDriveAutoSync(e.target.checked);
      showToast(e.target.checked ? '✓ 已開啟自動備份' : '已關閉自動備份');
    });

    // ── 檢查更新 ──
    document.getElementById('check-update-btn')?.addEventListener('click', async () => {
      const btn    = document.getElementById('check-update-btn');
      const status = document.getElementById('update-status');
      if (!btn || !status) return;
      btn.disabled = true;
      status.textContent = '檢查中…';
      const LOCAL_VER = APP_VERSION;
      try {
        // Fetch version.json first; it is easier to maintain than parsing sw.js.
        const versionUrl = './version.json?t=' + Date.now();
        const r = await fetch(versionUrl, { cache: 'no-store' });
        if (!r.ok) throw new Error('fetch_failed');
        const remoteData = await r.json();
        const remoteVer = remoteData.version || remoteData.displayVersion || '';
        const remoteDisplay = remoteData.displayVersion || remoteVer;
        if (!remoteVer) throw new Error('parse_failed');
        if (remoteVer === LOCAL_VER) {
          status.textContent = '✓ 已是最新版本（' + APP_DISPLAY_VERSION + '）';
        } else {
          status.innerHTML = '發現新版本：<strong>' + escapeHTML(remoteDisplay) + '</strong>　<button id="do-update-btn" style="font-size:12px;padding:2px 10px;border-radius:8px;border:1.5px solid var(--primary);background:var(--primary);color:#fff;cursor:pointer">立即更新</button>';
          document.getElementById('do-update-btn')?.addEventListener('click', async () => {
            status.textContent = '更新中，請稍候…';
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const reg of regs) await reg.unregister();
            }
            if ('caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(k => caches.delete(k)));
            }
            showToast('✓ 更新完成，重新載入中…', 2000);
            setTimeout(() => location.reload(), 1800);
          });
        }
      } catch (e) {
        status.textContent = '檢查失敗，請確認網路連線';
      }
      btn.disabled = false;
    });
  }
};
// ===========================
// INIT
// ===========================
document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => Router.navigate(btn.dataset.view));
  });

  // ── Google Drive: restore token + auto-sync on startup ──
  try {
    const restored = await GDrive.tryRestoreToken();
    if (restored && DB.getGDriveAutoSync()) {
      showToast('☁️ 自動備份上傳中…', 1800);
      try {
        await GDrive.upload();
        showToast('✓ 自動備份完成', 2500);
      } catch(e) {
        console.warn('Auto-backup failed', e.message);
      }
    }
  } catch(e) { console.warn('[GDrive] init failed:', e); }

  // ── Global quick-scroll FABs (all pages except quiz / essay; bottom button is Settings-only) ──
  const _backTopBtn = document.getElementById('global-back-top');
  const _goBottomBtn = document.getElementById('global-go-bottom');
  const _scroller   = document.getElementById('view-container');
  if (_scroller) {
    const updateScrollFabs = () => {
      const inQuiz  = !!document.getElementById('letter-wrap');
      const inEssay = !!document.querySelector('.essay-textarea');
      const blocked = inQuiz || inEssay;
      const maxScroll = Math.max(0, _scroller.scrollHeight - _scroller.clientHeight);
      const nearBottom = (maxScroll - _scroller.scrollTop) < 220;
      if (_backTopBtn) {
        _backTopBtn.style.display = (!blocked && _scroller.scrollTop > 200) ? 'flex' : 'none';
      }
      if (_goBottomBtn) {
        _goBottomBtn.style.display = (!blocked && Router.currentView === 'settings' && maxScroll > 260 && !nearBottom) ? 'flex' : 'none';
      }
    };
    window.updateScrollFabs = updateScrollFabs;
    let _ticking = false;
    _scroller.addEventListener('scroll', () => {
      if (_ticking) return;
      _ticking = true;
      requestAnimationFrame(() => {
        updateScrollFabs();
        _ticking = false;
      });
    }, { passive: true });
    _backTopBtn?.addEventListener('click', () => {
      _scroller.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(updateScrollFabs, 320);
    });
    _goBottomBtn?.addEventListener('click', () => {
      _scroller.scrollTo({ top: _scroller.scrollHeight, behavior: 'smooth' });
      setTimeout(updateScrollFabs, 320);
    });
  }

  Router._doNavigate('home');
});
