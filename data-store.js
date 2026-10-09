import {sentenceIdentity} from './data-merge.js?v=V7_4_3';
export function createDataStore({AppStorage,getGemini,getStudyStreak,recordStudyActivity,STUDY_ACTIVITY_TYPES,STUDY_DAYS_CSV_HEADER,todayStr}) {
  const StudyStreak=new Proxy({}, {get(_target,key){const value=getStudyStreak()[key];return typeof value==='function'?value.bind(getStudyStreak()):value;}});
  const Gemini=new Proxy({}, {get(_target,key){return getGemini()[key];}});
  const cache=new Map();
  function readArray(key) {
    const raw=AppStorage.getItem(key)||'[]';let entry=cache.get(key);
    if(!entry||entry.raw!==raw){const value=JSON.parse(raw);entry={raw,value:Array.isArray(value)?value:[]};cache.set(key,entry);}
    // Callers edit arrays before saving; never leak a mutable cached reference.
    return structuredClone(entry.value);
  }
const store = {
  getWords() { try { return readArray('vocabWords'); } catch { return []; } },
  saveWords(words) { AppStorage.setItem('vocabWords', JSON.stringify(words)); },
  addWord(word) {
    const words = this.getWords();
    const newWord = { id: Date.now().toString(), english: word.english.trim().toLowerCase(), partOfSpeech: word.partOfSpeech || '', chinese: word.chinese.trim(), phonetic: word.phonetic || '', wrongCount: 0, createdAt: todayStr(), frequencyWeight: 1 };
    words.push(newWord); this.saveWords(words); return newWord;
  },
  updateWord(id, data) {
    const words = this.getWords(); const idx = words.findIndex(w => w.id === id);
    if (idx !== -1) { words[idx] = { ...words[idx], ...data }; this.saveWords(words); return words[idx]; }
  },
  incrementWrongCounts(ids) {
    const pending = new Set((ids || []).map(id => String(id)));
    if (!pending.size) return 0;
    const words = this.getWords();
    let changed = 0;
    words.forEach(word => {
      if (!pending.has(String(word.id))) return;
      word.wrongCount = (Number(word.wrongCount) || 0) + 1;
      changed++;
    });
    if (changed) this.saveWords(words);
    return changed;
  },
  deleteWords(ids) { this.saveWords(this.getWords().filter(w => !ids.includes(w.id))); },
  getHistory() { try { return readArray('practiceHistory'); } catch { return []; } },
  saveHistory(h) { AppStorage.setItem('practiceHistory', JSON.stringify(h)); },
  // ── Reading Quiz History ──
  getReadingQuizHistory() { try { return readArray('readingQuizHistory'); } catch { return []; } },
  saveReadingQuizHistory(arr) { AppStorage.setItem('readingQuizHistory', JSON.stringify(arr)); },
  addReadingQuizSession(entry) {
    const history = this.getReadingQuizHistory();
    const date = entry.date || todayStr();
    const session = {
      id: entry.id || String(Date.now()),
      article: entry.article || '',
      articleZh: entry.articleZh || '',
      words: Array.isArray(entry.words) ? entry.words : [],
      questions: Array.isArray(entry.questions) ? entry.questions : [],
      answers: entry.answers || {},
      score: Number(entry.score) || 0,
      correct: Number(entry.correct) || 0,
      total: Number(entry.total) || 5,
      ts: entry.ts || Date.now()
    };
    const idx = history.findIndex(h => h.date === date);
    if (idx >= 0) history[idx].sessions = [...(history[idx].sessions || []), session];
    else history.unshift({ date, sessions: [session] });
    if (history.length > 180) history.length = 180;
    this.saveReadingQuizHistory(history);
    recordStudyActivity(STUDY_ACTIVITY_TYPES.READING_QUIZ, `reading:${session.id}`);
    return session;
  },
  exportReadingQuizCSV() {
    const history = this.getReadingQuizHistory();
    const header = ['日期','分數','正確題數','總題數','使用單字','文章','題目結果','時間戳'];
    const rows = [];
    history.forEach(h => {
      (h.sessions || []).forEach(s => {
        const words = (s.words || []).map(w => w.english || w.word || '').filter(Boolean).join(';');
        const qa = JSON.stringify({ questions: s.questions || [], answers: s.answers || {}, articleZh: s.articleZh || '' });
        rows.push([h.date, s.score || 0, s.correct || 0, s.total || 5, words, s.article || '', qa, s.ts || ''].map(v => `"${String(v).replace(/"/g,'""')}"`));
      });
    });
    return [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  },
  importReadingQuizCSV(text) {
    const records = this._splitCSVRecords(text.replace(/^\uFEFF/, '').trim());
    if (records.length < 2) return { added: 0 };
    const headerLine = records[0].replace(/"/g, '').trim();
    if (headerLine !== this.CSV_HEADERS.reading) throw new Error('FORMAT_MISMATCH_READING');
    const history = this.getReadingQuizHistory();
    let added = 0;
    const seen = new Set();
    history.forEach(h => (h.sessions || []).forEach(s => seen.add(String(s.ts || s.id || '') + '|' + (s.article || '').slice(0, 40))));
    for (let i = 1; i < records.length; i++) {
      const cols = this._parseCSVLine(records[i]);
      if (cols.length < 6) continue;
      const date = (cols[0] || '').trim();
      const score = parseInt(cols[1]) || 0;
      const correct = parseInt(cols[2]) || 0;
      const total = parseInt(cols[3]) || 5;
      const wordsStr = (cols[4] || '').trim();
      const article = (cols[5] || '').trim();
      const qaRaw = (cols[6] || '').trim();
      const ts = parseInt(cols[7] || '0') || (Date.now() + i);
      if (!date || !article) continue;
      let qa = {}; try { qa = qaRaw ? JSON.parse(qaRaw) : {}; } catch { qa = {}; }
      const words = wordsStr ? wordsStr.split(';').map(w => ({ english: w.trim(), chinese: '', partOfSpeech: '' })).filter(w => w.english) : [];
      const key = String(ts) + '|' + article.slice(0, 40);
      if (seen.has(key)) continue;
      const session = { id: String(ts), article, articleZh: qa.articleZh || '', words, questions: qa.questions || [], answers: qa.answers || {}, score, correct, total, ts };
      const idx = history.findIndex(h => h.date === date);
      if (idx >= 0) history[idx].sessions = [...(history[idx].sessions || []), session];
      else history.unshift({ date, sessions: [session] });
      seen.add(key); added++;
    }
    this.saveReadingQuizHistory(history);
    return { added };
  },
  // ── Essay Writing History ──
  getEssayHistory() { try { return readArray('essayHistory'); } catch { return []; } },
  saveEssayHistory(arr) { AppStorage.setItem('essayHistory', JSON.stringify(arr)); },
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
    recordStudyActivity(STUDY_ACTIVITY_TYPES.ESSAY_REVIEW, `essay:${newSession.ts}`);
    return newSession;
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
  getAiAskHistory()         { try { return readArray('aiAskHistory'); } catch { return []; } },
  saveAiAskHistory(arr)     { AppStorage.setItem('aiAskHistory', JSON.stringify(arr)); },
  addAiAskEntry(entry) {
    // entry: { id (YYMMDDHHMM), question, answer, ts }
    const history = this.getAiAskHistory();
    history.unshift(entry);
    if (history.length > 300) history.length = 300;
    this.saveAiAskHistory(history);
    recordStudyActivity(STUDY_ACTIVITY_TYPES.AI_ASK, `aiask:${entry.id || 'entry'}:${entry.ts || Date.now()}`);
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
    const ids=new Set(history.map(entry=>entry.id));
    let added = 0;
    for (let i = 1; i < records.length; i++) {
      const cols = this._parseCSVLine(records[i]);
      if (cols.length < 2) continue;
      const id = (cols[0]||'').trim(); const question = (cols[1]||'').trim();
      const answer = (cols[2]||'').trim(); const ts = parseInt(cols[3]||'0') || Date.now();
      if (!id || !question) continue;
      if (!ids.has(id)) { history.unshift({ id, question, answer, ts });ids.add(id);added++; }
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
    recordStudyActivity(STUDY_ACTIVITY_TYPES.WORD_QUIZ, `word:${date}:${Date.now()}`);
  },
  getApiKey() { return AppStorage.getItem('geminiApiKey') || ''; },
  saveApiKey(key) { AppStorage.setItem('geminiApiKey', key); },
  getModel() {
    const saved = AppStorage.getItem('geminiModel') || '';
    const validModels = (typeof Gemini !== 'undefined' && Gemini.AVAILABLE_MODELS)
      ? Gemini.AVAILABLE_MODELS.map(m => m.id)
      : [];
    if (saved && (!validModels.length || validModels.includes(saved))) return saved;
    const fallback = 'gemini-3.5-flash';
    if (saved && validModels.length && !validModels.includes(saved)) AppStorage.setItem('geminiModel', fallback);
    return fallback;
  },
  saveModel(m) { AppStorage.setItem('geminiModel', m); },
  // ── Google Drive config ──
  getGDriveClientId()  { return AppStorage.getItem('gdriveClientId') || ''; },
  setGDriveClientId(v) { AppStorage.setItem('gdriveClientId', v); },
  getGDriveFolderId()  { return AppStorage.getItem('gdriveFolderId') || ''; },
  setGDriveFolderId(v) { AppStorage.setItem('gdriveFolderId', v); },
  getGDriveAutoSync()  { return AppStorage.getItem('gdriveAutoSync') === '1'; },
  setGDriveAutoSync(v) { AppStorage.setItem('gdriveAutoSync', v ? '1' : '0'); },
  getGDriveLastSync()  { return AppStorage.getItem('gdriveLastSync') || ''; },
  setGDriveLastSync(v) { AppStorage.setItem('gdriveLastSync', v); },
  getBoostedWords() { try { return readArray('boostedWords'); } catch { return []; } },
  saveBoostedWords(ids) { AppStorage.setItem('boostedWords', JSON.stringify(ids)); },
  getTtsDelay()    { return parseInt(AppStorage.getItem('ttsDelay') || '300'); },
  saveTtsDelay(ms) { AppStorage.setItem('ttsDelay', String(ms)); },
  toggleBoost(id) {
    const b = this.getBoostedWords(); const idx = b.indexOf(id);
    if (idx === -1) b.push(id); else b.splice(idx, 1);
    this.saveBoostedWords(b); return idx === -1;
  },
  isBoosted(id) { return this.getBoostedWords().includes(id); },
  getTodaySentence() {
    try { const s = JSON.parse(AppStorage.getItem('todaySentence') || 'null'); return (s && s.date === todayStr()) ? s : null; }
    catch { return null; }
  },
  saveTodaySentence(data) { AppStorage.setItem('todaySentence', JSON.stringify({ ...data, date: todayStr() })); },
  // AI-generated sentence log
  getSentenceLog() { try { return readArray('sentenceLog'); } catch { return []; } },
  saveSentenceToLog(entry) {
    const log = this.getSentenceLog();
    log.unshift({ ...entry, id: Date.now().toString() });
    if (log.length > 120) log.length = 120;
    AppStorage.setItem('sentenceLog', JSON.stringify(log));
  },
  // Imported sentence bank (CSV)
  getImportedSentences() { try { return readArray('importedSentences'); } catch { return []; } },
  saveImportedSentences(arr) { AppStorage.setItem('importedSentences', JSON.stringify(arr)); },
  importSentencesCSV(text) {
    const records = this._splitCSVRecords(text.replace(/^\uFEFF/, '').trim());
    if (records.length < 2) return { added: 0, total: 0 };
    // ── 格式驗證 ──
    const headerLine = records[0].replace(/\r/,'').trim().replace(/^\uFEFF/,'').replace(/"/g,'');
    if (headerLine !== this.CSV_HEADERS.sentences) throw new Error('FORMAT_MISMATCH_SENTENCES');
    const existing = this.getImportedSentences();
    const existingKeys = new Set(existing.map(sentenceIdentity));
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
      const key = sentenceIdentity({date,wordEn,en,zh});
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
    const seen = new Set(); const unique = all.filter(e => { const k = sentenceIdentity(e); if (seen.has(k)) return false; seen.add(k); return true; });
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
      const k = sentenceIdentity(e);
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
    reading:   '日期,分數,正確題數,總題數,使用單字,文章,題目結果,時間戳',
    aiask:     'ID,問題,回覆,時間戳',
    studyDays: STUDY_DAYS_CSV_HEADER
  },
  // 自動偵測 CSV 類型，回傳 'vocab' | 'sentences' | 'stats' | null
  detectCSVType(text) {
    const firstLine = text.trim().split('\n')[0].replace(/\r/,'').trim();
    // 去除 BOM 和引號比對
    const clean = firstLine.replace(/^\uFEFF/,'').replace(/"/g,'');
    if (clean === this.CSV_HEADERS.vocab)     return 'vocab';
    if (clean === this.CSV_HEADERS.sentences)  return 'sentences';
    if (clean === this.CSV_HEADERS.stats)      return 'stats';
    if (clean === this.CSV_HEADERS.reading)    return 'reading';
    if (clean === this.CSV_HEADERS.essay)      return 'essay';
    if (clean === this.CSV_HEADERS.aiask)      return 'aiask';
    if (clean === this.CSV_HEADERS.studyDays)  return 'studyDays';
    return null;
  },
  exportStudyDaysCSV() { return StudyStreak.exportCSV(); },
  importStudyDaysCSV(text) { return StudyStreak.importCSV(text); },
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
    const words = this.getWords(); const wordIndex=new Map(words.map(w=>[String(w.english).toLowerCase(),w])); let added = 0, skipped = 0;
    for (let i = 1; i < records.length; i++) {
      const cols = this._parseCSVLine(records[i]);
      if (cols.length < 3) { skipped++; continue; }
      const english = (cols[0] || '').trim().toLowerCase();
      const partOfSpeech = (cols[1] || '').trim();
      const chinese = (cols[2] || '').trim();
      if (!english || !chinese) { skipped++; continue; }
      const existing = wordIndex.get(english);
      if (existing) {
        existing.partOfSpeech = partOfSpeech; existing.chinese = chinese;
        if (cols[3]) existing.phonetic = cols[3];
        if (cols[4]) existing.wrongCount = parseInt(cols[4]) || 0;
        if (cols[6]) existing.frequencyWeight = parseInt(cols[6]) || 1;
      } else {
        words.push({ id: (Date.now() + i).toString(), english, partOfSpeech, chinese, phonetic: (cols[3]||'').trim(), wrongCount: parseInt(cols[4])||0, createdAt: (cols[5]||'').trim()||todayStr(), frequencyWeight: parseInt(cols[6])||1 });
        wordIndex.set(english,words[words.length-1]); added++;
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
        if (inQuote && src[i + 1] === '"') { current += '""'; i++; }
        else { inQuote = !inQuote; current += ch; }
      } else if (ch === '\n' && !inQuote) {
        records.push(current); current = '';
      } else {
        current += ch;
      }
    }
    if (inQuote) throw new Error('CSV_UNTERMINATED_QUOTE');
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
return store;
}
