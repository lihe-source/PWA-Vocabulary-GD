import {request} from './network.js?v=V7_5_0';
export function createGeminiService(DB,policy,catalog){
const Gemini = {
  // All selectable models (display name -> API id)
  AVAILABLE_MODELS: catalog,
  _policy: policy,
  async _fetch(url,options={}) {return fetch(url,{...options,signal:policy.signal});},

  // Production fallback stays on stable endpoints. Preview models are tried only when explicitly selected.
  _getModelList() {
    const selected=DB.getModel();
    const available=this.AVAILABLE_MODELS;
    const stable=available.filter(model=>model.tier!=='preview').map(model=>model.id);
    const primary=available.some(model=>model.id===selected)?selected:(stable[0]||selected);
    return [...new Set([primary,...stable])].filter(Boolean).slice(0,2);
  },

  // Extract the actual response text, skipping "thought" parts from thinking models
  _extractText(data) {
    const parts = data.candidates?.[0]?.content?.parts || [];
    if (!parts.length) return '';
    // Thinking / preview models may split the final answer across multiple non-thought text parts.
    // Join every visible text part so long translations are not cut off after the first segment.
    const visibleText = parts
      .filter(p => !p.thought && typeof p.text === 'string')
      .map(p => p.text)
      .join('');
    if (visibleText.trim()) return visibleText;
    return parts
      .filter(p => typeof p.text === 'string')
      .map(p => p.text)
      .join('');
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

  async _callModel(model,body,apiKey,attempt=0) {
    if(policy.signal?.aborted)throw new Error('REQUEST_CANCELLED');
    const remaining=Math.max(1,policy.deadline-Date.now());
    try {
      const result=await request('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(apiKey),
        {method:'POST',headers:{'Content-Type':'application/json'},body,signal:policy.signal},
        {timeout:Math.min(30000,remaining),retries:0});
      return this._extractText(result.data);
    }catch(error){
      if(policy.signal?.aborted||error.message==='REQUEST_CANCELLED')throw new Error('REQUEST_CANCELLED');
      if(error.message==='REQUEST_TIMEOUT')throw new Error('API_TIMEOUT');
      if(!error.status)throw new Error('NETWORK_ERROR');
      if(attempt<1&&[429,503].includes(error.status)&&policy.deadline-Date.now()>2000){
        await new Promise(resolve=>setTimeout(resolve,900));return this._callModel(model,body,apiKey,attempt+1);
      }
      error.fallback=[404,429,503].includes(error.status);
      throw error;
    }
  },
  async answerQuestion(q){
    const apiKey=DB.getApiKey();if(!apiKey)throw new Error('NO_API_KEY');
    const prompt='You are an English tutor. Answer clearly and helpfully in Traditional Chinese unless asked in English. Correct sentences with explanations. Be concise.\n\nUser question: '+q;
    const body=JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.5,maxOutputTokens:8192}});
    let lastError;
    for(const model of this._getModelList()){
      try{const answer=await this._callModel(model,body,apiKey);if(answer.trim())return answer.replace(/<thinking>[\s\S]*?<\/thinking>/gi,'').trim();}
      catch(error){if(!error.fallback)throw error;lastError=error;}
    }
    throw lastError||new Error('EMPTY_RESPONSE');
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


  async translateReadingArticle(article, words) {
    const apiKey = DB.getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');
    const cleanArticle = String(article || '').trim();
    if (!cleanArticle) throw new Error('NO_ARTICLE');
    const wordList = (Array.isArray(words) ? words : []).slice(0, 5).map((w, i) => {
      const en = String(w.english || w.word || '').trim();
      const zh = String(w.chinese || '').trim();
      return `${i + 1}. ${en}: ${zh || '請依文章脈絡翻譯'}`;
    }).filter(Boolean).join('\n');
    const prompt = `Translate the full English reading passage into natural Traditional Chinese for Taiwan learners.

English passage:
${cleanArticle}

Target vocabulary and preferred Chinese meanings:
${wordList}

Requirements:
- Translate EVERY sentence from beginning to end. Do not summarize, shorten, skip, or stop early.
- Keep the original sentence order and meaning.
- Use the preferred Chinese meanings for the target vocabulary when they fit the passage.
- Output ONLY the complete Traditional Chinese translation.
- Do not add explanations, markdown, title, bullet points, or extra notes.`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 2400 }
    });

    let lastErr = null;
    for (const model of this._getModelList()) {
      try {
        const raw = await this._callModel(model, body, apiKey);
        const zh = String(raw || '')
          .replace(/^\s*```(?:text|markdown)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .replace(/^\s*(?:ZH|Chinese|Translation|中文翻譯|翻譯)\s*[:：]\s*/i, '')
          .trim();
        if (zh) return zh;
        lastErr = new Error('PARSE_ERROR');
      } catch (err) {
        if (err.message === 'NETWORK_ERROR') throw err;
        if (err.fallback) { lastErr = err; continue; }
        throw err;
      }
    }
    throw lastErr || new Error('API_ERROR');
  },


  async generateReadingQuiz(words) {
    const apiKey = DB.getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');
    const cleanWords = (Array.isArray(words) ? words : []).slice(0, 5).map((w, i) => ({
      index: i + 1,
      english: String(w.english || '').trim().toLowerCase(),
      partOfSpeech: String(w.partOfSpeech || '').trim(),
      chinese: String(w.chinese || '').trim()
    })).filter(w => w.english);
    if (cleanWords.length < 5) throw new Error('NOT_ENOUGH_WORDS');

    const wordList = cleanWords.map(w => `${w.index}. "${w.english}" (${w.partOfSpeech || 'word'}: ${w.chinese || 'no Chinese definition'})`).join('\n');
    const prompt = `You are an English reading-test generator for Traditional Chinese learners.

Selected vocabulary words:
${wordList}

Create a short, natural English reading passage and a synonym multiple-choice quiz.

Respond ONLY with a single valid JSON object. No markdown fences, no explanation, no text before or after JSON.
Required JSON format:
{
  "article": "English passage under 200 words. Use every selected vocabulary word exactly as written at least once.",
  "questions": [
    {"word":"selected vocabulary word", "correctSynonym":"one correct English synonym", "options":["option A", "option B", "option C"]}
  ]
}

Rules:
- article must be under 200 English words.
- questions must contain exactly 5 items, one item for each selected vocabulary word.
- options must contain exactly 3 English options.
- exactly one option must be the correct synonym, and it must equal correctSynonym.
- the other two options must be plausible English distractors but NOT synonyms.
- Do not translate the article.
- Keep the article suitable for CEFR A2-B1 learners.`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.55, maxOutputTokens: 1800 }
    });

    const extractJSON = (raw) => {
      let text = String(raw || '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) return null;
      return text.slice(start, end + 1);
    };
    const normalizeQuestion = (q, wordObj, idx) => {
      const correct = String(q?.correctSynonym || '').trim();
      let options = Array.isArray(q?.options) ? q.options.map(o => String(o || '').trim()).filter(Boolean) : [];
      if (correct && !options.some(o => o.toLowerCase() === correct.toLowerCase())) options.unshift(correct);
      options = [...new Set(options)].slice(0, 3);
      while (options.length < 3) options.push(['meaning', 'opposite', 'example'][options.length] + ' ' + (idx + 1));
      return {
        word: wordObj.english,
        wordId: wordObj.id || '',
        chinese: wordObj.chinese || '',
        partOfSpeech: wordObj.partOfSpeech || '',
        correctSynonym: correct || options[0],
        options: options.sort(() => Math.random() - 0.5).slice(0, 3)
      };
    };

    let lastErr = null;
    for (const model of this._getModelList()) {
      try {
        const raw = await this._callModel(model, body, apiKey);
        const jsonStr = extractJSON(raw);
        if (!jsonStr) { lastErr = new Error('PARSE_ERROR: no JSON'); continue; }
        const parsed = JSON.parse(jsonStr);
        const article = String(parsed.article || '').trim();
        const articleWordCount = (article.match(/\b[\w'-]+\b/g) || []).length;
        const missingWords = cleanWords.filter(w => !(new RegExp(`\\b${escapeRegex(w.english)}\\b`, 'i')).test(article));
        const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
        if (!article || articleWordCount > 200 || missingWords.length || rawQuestions.length < 5) {
          lastErr = new Error('PARSE_ERROR: article or quiz does not meet requirements');
          continue;
        }
        const questions = cleanWords.map((cw, i) => {
          const originalWord = words.find(w => String(w.english || '').trim().toLowerCase() === cw.english) || cw;
          const match = rawQuestions.find(q => String(q?.word || '').trim().toLowerCase() === cw.english) || rawQuestions[i] || {};
          return normalizeQuestion(match, originalWord, i);
        });
        if (questions.every(q => q.correctSynonym && q.options.length === 3)) return { article, questions };
        lastErr = new Error('PARSE_ERROR: invalid questions');
      } catch(err) {
        if (err.message === 'NETWORK_ERROR') throw err;
        if (err.fallback) { lastErr = err; continue; }
        if (err instanceof SyntaxError) { lastErr = new Error('PARSE_ERROR: ' + err.message); continue; }
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
        const res = await this._fetch(url, { method: 'GET' });
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
      const res = await this._fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
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
return Gemini;
}
