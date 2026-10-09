import {COLLECTION_STORAGE} from './data-merge.js?v=V7_4_3';
export function createDriveService({AppStorage,BackupSchema,BackupWorker,StudyStreak,getStudyHistorySources,getOrCreateVocabularyDeviceId,mergeStudyDays,Tasks,netRequest,refreshStudyStreakUI,yieldForUI,DB,APP_DISPLAY_VERSION}) {
const service = {
  _token: null,
  _email: null,
  _client: null,
  _clientKey: '',
  _gisPromise: null,
  _tokenRequestPromise: null,
  _profilePromise: null,
  _streakSyncTimer: null,
  _streakSyncPromise: null,
  STUDY_STREAK_FILE: 'vocab_study_streak.json',
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
  getUserEmail() { return this._email || AppStorage.getItem(this.SESSION_KEYS.email) || ''; },
  getSessionStatus() {
    if (this.isSignedIn()) return 'active';
    return this.hasRememberedSession() ? 'remembered' : 'none';
  },

  _loadGIS() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (this._gisPromise) return this._gisPromise;

    this._gisPromise = new Promise((resolve, reject) => {
      let settled = false;
      const complete = (fn, value) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        clearTimeout(timeout);
        fn(value);
      };
      const finish = () => {
        if (window.google?.accounts?.oauth2) complete(resolve);
      };
      const poll = setInterval(finish, 75);
      const timeout = setTimeout(() => complete(reject, new Error('GIS_LOAD_FAILED')), 12000);
      const existing = document.querySelector('script[data-gis="1"]');
      if (existing) {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', () => complete(reject, new Error('GIS_LOAD_FAILED')), { once: true });
        finish();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.gis = '1';
      script.onload = finish;
      script.onerror = () => complete(reject, new Error('GIS_LOAD_FAILED'));
      document.head.appendChild(script);
    }).catch(error => {
      this._gisPromise = null;
      throw error;
    });

    return this._gisPromise;
  },

  preloadGIS() {
    if (!DB.getGDriveClientId() || !navigator.onLine) return Promise.resolve(false);
    return this._loadGIS()
      .then(() => true)
      .catch(error => {
        console.info('[GDrive] GIS preload skipped:', error.message);
        return false;
      });
  },

  _sessionClientId() { return AppStorage.getItem(this.SESSION_KEYS.clientId) || ''; },
  _sessionScope() { return AppStorage.getItem(this.SESSION_KEYS.scope) || ''; },
  _expiry() { return parseInt(sessionStorage.getItem(this.SESSION_KEYS.expiry) || '0', 10) || 0; },
  _isTokenExpired() { return !this._token || Date.now() > this._expiry() - this.EXPIRY_MARGIN_MS; },
  _hasSameClientAndScope(clientId) {
    return this._sessionClientId() === clientId && this._sessionScope() === this.SCOPE;
  },

  _saveSession(token, email, expiresIn, clientId) {
    queueMicrotask(()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('google-auth-state'));});
    const exp = Date.now() + (Number(expiresIn) || 3500) * 1000;
    this._token = token;
    this._email = email || this.getUserEmail();
    // Access tokens are intentionally session-only and never written to localStorage/IndexedDB.
    sessionStorage.setItem(this.SESSION_KEYS.token, token);
    sessionStorage.setItem(this.SESSION_KEYS.expiry, String(exp));
    AppStorage.setItem(this.SESSION_KEYS.email, this._email || '');
    AppStorage.setItem(this.SESSION_KEYS.clientId, clientId || DB.getGDriveClientId());
    AppStorage.setItem(this.SESSION_KEYS.scope, this.SCOPE);
    AppStorage.setItem(this.SESSION_KEYS.lastLogin, new Date().toISOString());
  },

  refreshUserEmail(token = this._token) {
    if (!token) return Promise.resolve(this.getUserEmail());
    if (this._profilePromise) return this._profilePromise;
    this._profilePromise = netRequest('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + token }
    }, { timeout: 12000, retries: 1 })
      .then(response => response.data)
      .then(info => {
        // Ignore a late profile response if another token has already replaced it.
        if (token !== this._token) return this.getUserEmail();
        const email = String(info?.email || '').trim();
        if (email) {
          this._email = email;
          AppStorage.setItem(this.SESSION_KEYS.email, email);
        }
        return this.getUserEmail();
      })
      .catch(() => this.getUserEmail())
      .finally(() => { this._profilePromise = null; });
    return this._profilePromise;
  },

  _clearTokenOnly() {
    queueMicrotask(()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('google-auth-state'));});
    this._token = null;
    sessionStorage.removeItem(this.SESSION_KEYS.token);
    sessionStorage.removeItem(this.SESSION_KEYS.expiry);
  },

  _clearSession() {
    queueMicrotask(()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('google-auth-state'));});
    this._token = null;
    this._email = null;
    sessionStorage.removeItem(this.SESSION_KEYS.token);
    sessionStorage.removeItem(this.SESSION_KEYS.expiry);
    [this.SESSION_KEYS.email, this.SESSION_KEYS.clientId, this.SESSION_KEYS.scope, this.SESSION_KEYS.lastLogin]
      .forEach(k => AppStorage.removeItem(k));
  },

  tryRestoreFromStorage() {
    const clientId = DB.getGDriveClientId();
    const token = sessionStorage.getItem(this.SESSION_KEYS.token);
    const email = AppStorage.getItem(this.SESSION_KEYS.email) || '';
    const exp = this._expiry();
    if (email) this._email = email;
    if (!token || !clientId || !this._hasSameClientAndScope(clientId)) return false;
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
    // Google TokenClient uses mutable callbacks. Share a single in-flight request
    // so startup refresh and a user action cannot overwrite each other's callback.
    if (this._tokenRequestPromise) return this._tokenRequestPromise;

    this._tokenRequestPromise = (async () => {
      const clientId = DB.getGDriveClientId();
      if (!clientId) throw new Error('NO_CLIENT_ID');
      const client = await this._getClient(clientId);
      const hint = accountHint || this.getUserEmail();
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => fail(new Error('AUTH_TIMEOUT')), 45000);
        const fail = (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err || 'AUTH_FAILED')));
        };
        client.callback = (resp) => {
          if (settled) return;
          if (resp.error) { fail(new Error(resp.error)); return; }
          settled = true;
          clearTimeout(timer);

          // Do not hold up sign-in for the extra userinfo HTTP request. Persist the
          // access token immediately; refresh the e-mail label in the background.
          this._saveSession(resp.access_token, this.getUserEmail(), resp.expires_in, clientId);
          void this.refreshUserEmail(resp.access_token);
          resolve(resp);
        };
        client.error_callback = (e) => fail(new Error(e?.type || e?.message || 'AUTH_FAILED'));
        const req = { prompt: promptMode };
        if (hint) {
          req.hint = hint;
          req.login_hint = hint;
        }
        client.requestAccessToken(req);
      });
    })();

    try { return await this._tokenRequestPromise; }
    finally { this._tokenRequestPromise = null; }
  },

  async silentRefresh({ noUi = false } = {}) {
    // V7.4.3: prompt:'none' is used only for best-effort reconnects that must
    // never interrupt the user with Google's account/consent dialog.
    await this._requestToken({
      promptMode: noUi ? 'none' : '',
      accountHint: this.getUserEmail()
    });
  },

  async signIn() {
    if (this.isSignedIn() || this.tryRestoreFromStorage()) return;
    const remembered = this.getUserEmail();
    // One user gesture, one Google flow. An empty prompt plus login_hint reuses
    // an existing grant/account when possible and only shows Google UI when
    // Google itself requires authentication or consent.
    await this._requestToken({ promptMode: '', accountHint: remembered });
  },

  async reconnect() {
    await this._requestToken({ promptMode: '', accountHint: this.getUserEmail() });
  },

  async ensureToken(options = {}) {
    const interactive = !!options.interactive;
    if (this.isSignedIn()) return;
    if (this.tryRestoreFromStorage()) return;

    this._clearTokenOnly();
    if (!interactive) throw new Error('TOKEN_EXPIRED');

    // Drive actions are already initiated by a real tap/click. Reuse that same
    // gesture instead of asking the user to press a separate Sign in button and
    // then confirming a second account-selection prompt.
    try {
      await this._requestToken({ promptMode: '', accountHint: this.getUserEmail() });
    } catch (error) {
      this._clearTokenOnly();
      throw error;
    }
  },

  async tryRestoreToken({ noUi = true } = {}) {
    if (this.tryRestoreFromStorage()) return true;
    if (!DB.getGDriveClientId() || !this.getUserEmail()) return false;
    try {
      await this.silentRefresh({ noUi });
      return true;
    } catch (e) {
      this._clearTokenOnly();
      return false;
    }
  },

  signOut() {
    if (this._token && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(this._token, () => {});
    }
    this._client = null;
    this._clientKey = '';
    this._tokenRequestPromise = null;
    this._profilePromise = null;
    clearTimeout(this._streakSyncTimer);
    this._streakSyncTimer = null;
    this._clearSession();
  },

  _getDeviceId() {
    return getOrCreateVocabularyDeviceId();
  },

  _buildCollections() {
    return {
      words: DB.getWords(),
      history: DB.getHistory(),
      sentences: DB.getSentenceLog(),
      imported: DB.getImportedSentences(),
      boosted: DB.getBoostedWords(),
      readingQuizHistory: DB.getReadingQuizHistory(),
      essayHistory: DB.getEssayHistory(),
      aiAskHistory: DB.getAiAskHistory(),
      studyDays: StudyStreak.getDays()
    };
  },

  _rawCollections() {return Object.fromEntries(Object.entries(COLLECTION_STORAGE).map(([name,key])=>[name,AppStorage.getItem(key)||'[]']));},
  async _buildPayload() {return (await BackupWorker.prepareRaw(this._rawCollections(),{appVersion:APP_DISPLAY_VERSION,deviceId:this._getDeviceId(),revision:Date.now()})).payload;},
  async _buildRecoveryPayload() {return this._buildPayload();},
  async previewMerge(data) {return BackupWorker.merge(this._rawCollections(),BackupSchema.normalize(data),'merge',Number(data.schemaVersion)||0,true);},

  _countPayloadItems(data = {}) {
    return BackupSchema.counts(data);
  },

  _comparePayloads(localData, cloudData) {
    return BackupSchema.compare(localData, cloudData);
  },

  _formatCounts(counts = {}) {
    return [
      '單字 ' + (counts.words || 0),
      '例句 ' + (counts.examples || 0),
      '練習 ' + (counts.practice || 0),
      '加強 ' + (counts.boosted || 0),
      '閱讀測驗 ' + (counts.reading || 0),
      '文章 ' + (counts.essay || 0),
      'AI詢問 ' + (counts.aiAsk || 0),
      '練習天數 ' + (counts.studyDays || 0)
    ].join('・');
  },

  async _listStudyStreakFiles() {
    const q = `name='${this.STUDY_STREAK_FILE}' and mimeType='application/json' and trashed=false`;
    const params = new URLSearchParams({ q, fields: 'files(id,name,createdTime,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '20' });
    const response = await netRequest('https://www.googleapis.com/drive/v3/files?' + params, {
      headers: { Authorization: 'Bearer ' + this._token }
    }, { timeout: 20000, retries: 1 }).catch(error => {
      if (error.message === 'TOKEN_EXPIRED') this._clearTokenOnly();
      throw error;
    });
    return response.data.files || [];
  },

  async _downloadStudyStreakFile(fileId) {
    const response = await netRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: 'Bearer ' + this._token }
    }, { timeout: 20000, retries: 1 }).catch(error => {
      if (error.message === 'TOKEN_EXPIRED') this._clearTokenOnly();
      throw error;
    });
    const data = response.data;
    if (!data || !Array.isArray(data.studyDays)) throw new Error('STREAK_FILE_INVALID');
    return data;
  },

  _buildStudyStreakPayload(studyDays) {
    return {
      dataType: 'vocabulary-study-streak',
      schemaVersion: 1,
      appVersion: APP_DISPLAY_VERSION,
      deviceId: this._getDeviceId(),
      userEmail: this.getUserEmail(),
      revision: Date.now(),
      updatedAt: new Date().toISOString(),
      studyDays: mergeStudyDays(studyDays)
    };
  },

  async _createStudyStreakFile(payload) {
    const boundary = 'streak_boundary_' + Date.now();
    const folderId = DB.getGDriveFolderId();
    const metadata = {
      name: this.STUDY_STREAK_FILE,
      mimeType: 'application/json',
      description: 'Vocabulary PWA cross-device study streak',
      appProperties: { dataType: 'vocabulary-study-streak' },
      ...(folderId ? { parents: [folderId] } : {})
    };
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n'
      + JSON.stringify(payload) + '\r\n--' + boundary + '--';
    const response = await netRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this._token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    }, { timeout: 30000, retries: 0 }).catch(error => {
      if (error.message === 'TOKEN_EXPIRED') this._clearTokenOnly();
      throw error;
    });
    return response.data;
  },

  async _updateStudyStreakFile(fileId, payload) {
    const response = await netRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + this._token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, { timeout: 30000, retries: 0 }).catch(error => {
      if (error.message === 'TOKEN_EXPIRED') this._clearTokenOnly();
      throw error;
    });
    return response.data;
  },

  async _readStudyStreakFiles(files) {
    const results = await Promise.all((files || []).map(async file => {
      try {
        const payload = await this._downloadStudyStreakFile(file.id);
        return payload.studyDays || [];
      } catch (error) {
        console.warn('[GDrive] Ignored unreadable streak file.', file.id, error.message);
        return [];
      }
    }));
    return mergeStudyDays(results.flat());
  },

  async syncStudyStreak(options = {}) {
    if (this._streakSyncPromise) return this._streakSyncPromise;
    this._streakSyncPromise = (async () => {
      await this.ensureToken(options);
      let merged = StudyStreak.getDays();
      let files = await this._listStudyStreakFiles();

      // Two union/write/read passes close the normal race where two devices add
      // different dates at nearly the same time. No side ever overwrites a date
      // that exists on the other side.
      for (let pass = 0; pass < 2; pass++) {
        const cloudDays = await this._readStudyStreakFiles(files);
        merged = mergeStudyDays(merged, cloudDays);
        const payload = this._buildStudyStreakPayload(merged);
        if (!files.length) {
          const created = await this._createStudyStreakFile(payload);
          files = [{ id: created.id, name: this.STUDY_STREAK_FILE }];
        } else {
          await Promise.all(files.map(file => this._updateStudyStreakFile(file.id, payload)));
        }
        const verifiedFiles = await this._listStudyStreakFiles();
        const verifiedDays = await this._readStudyStreakFiles(verifiedFiles);
        const verifiedMerge = mergeStudyDays(merged, verifiedDays);
        files = verifiedFiles;
        if (JSON.stringify(verifiedMerge) === JSON.stringify(merged)) break;
        merged = verifiedMerge;
      }

      StudyStreak.replace(merged, { markPending: false });
      const syncedAt = new Date().toISOString();
      StudyStreak.markSynced(syncedAt);
      refreshStudyStreakUI();
      return { studyDays: merged, summary: StudyStreak.getSummary(), syncedAt };
    })();
    try { return await this._streakSyncPromise; }
    finally { this._streakSyncPromise = null; }
  },

  scheduleStudyStreakSync(delay = 1200) {
    clearTimeout(this._streakSyncTimer);
    this._streakSyncTimer = null;
    if (!navigator.onLine || !this.hasRememberedSession() || !DB.getGDriveClientId()) return;
    this._streakSyncTimer = setTimeout(() => {
      this._streakSyncTimer = null;
      void Tasks.run('streak-sync', () => this.syncStudyStreak({ interactive: false }), { exclusive: true }).catch(error => {
        StudyStreak.markPending();
        refreshStudyStreakUI();
        console.warn('[GDrive] Study streak sync deferred.', error.message);
      });
    }, delay);
  },

  async upload(options = {}) {
    const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    clearTimeout(this._streakSyncTimer);
    this._streakSyncTimer = null;

    progress('正在確認 Google 登入…');
    await this.ensureToken(options);
    await yieldForUI();

    progress('正在準備備份資料…');
    await AppStorage.flush();
    await yieldForUI();
    const prepared = await BackupWorker.prepareRaw(this._rawCollections(), {
      appVersion: APP_DISPLAY_VERSION,
      deviceId: this._getDeviceId(),
      revision: Date.now()
    });
    const data = prepared.payload;
    await yieldForUI();

    const folderId = DB.getGDriveFolderId();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = 'vocab_backup_' + ts + '.json';
    const boundary = 'vocab_boundary_' + Date.now();
    const dataCounts = data.collectionCounts || this._countPayloadItems(data);
    const summary = {
      words: dataCounts.words,
      sentences: dataCounts.examples,
      stats: dataCounts.practice,
      boosted: dataCounts.boosted,
      reading: dataCounts.reading,
      essay: dataCounts.essay,
      aiAsk: dataCounts.aiAsk,
      studyDays: dataCounts.studyDays,
      total: dataCounts.total,
      version: APP_DISPLAY_VERSION
    };
    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      description: JSON.stringify(summary),
      ...(folderId ? { parents: [folderId] } : {})
    };

    progress('正在建立上傳檔案…');
    await yieldForUI();
    const json = prepared.json;
    const prefix = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n';
    const suffix = '\r\n--' + boundary + '--';
    // Blob keeps the multipart pieces separate and avoids constructing another
    // giant concatenated JavaScript string for large backups.
    const body = new Blob([prefix, json, suffix], { type: 'multipart/related; boundary=' + boundary });
    await yieldForUI();

    progress('正在上傳 Google Drive…');
    await netRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this._token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    }, { timeout: 45000, retries: 0 }).catch(error => {
      if (error.message === 'TOKEN_EXPIRED') this._clearTokenOnly();
      throw error;
    });
    const now = new Date().toLocaleString('zh-TW');
    DB.setGDriveLastSync(now);

    // The full backup already contains current local studyDays. Cross-device
    // streak reconciliation is useful but no longer blocks the backup upload.
    this.scheduleStudyStreakSync(900);
    progress('完成');
    return now;
  },

  async listBackups(options = {}) {
    const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    progress('正在確認 Google 登入…');
    await this.ensureToken(options);
    progress('正在讀取備份清單…');
    const folderId = DB.getGDriveFolderId();
    let q = "name contains 'vocab_backup_' and mimeType='application/json' and trashed=false";
    if (folderId) q += " and '" + folderId + "' in parents";
    const params = new URLSearchParams({ q, fields: 'files(id,name,createdTime,description)', orderBy: 'createdTime desc', pageSize: '10' });
    const r = await netRequest('https://www.googleapis.com/drive/v3/files?' + params, {
      headers: { Authorization: 'Bearer ' + this._token }
    }, { timeout: 20000, retries: 1 }).catch(error => {
      if (error.message === 'TOKEN_EXPIRED') this._clearTokenOnly();
      throw error;
    });
    return r.data.files || [];
  },

  async downloadFile(fileId, options = {}) {
    const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    progress('正在確認 Google 登入…');
    await this.ensureToken(options);
    progress('正在下載備份…');
    const r = await netRequest('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media', {
      headers: { Authorization: 'Bearer ' + this._token }
    }, { timeout: 30000, retries: 1, responseType: 'text' }).catch(error => {
      if (error.message === 'TOKEN_EXPIRED') this._clearTokenOnly();
      throw error;
    });
    progress('正在驗證備份…');
    const data = await BackupWorker.parse(r.data);
    await yieldForUI();
    return data;
  },

  async autoRestoreIfCloudHasMore(options = {}) {
    await AppStorage.flush();
    const expectedRevision = AppStorage.getStatus().revision;
    const files = await this.listBackups(options);
    const localPayload = await this._buildPayload();
    if (!files.length) {
      return { status: 'no_backup', localCounts: this._countPayloadItems(localPayload), cloudCounts: null, file: null };
    }
    const latestFile = files[0];
    const cloudData = await this.downloadFile(latestFile.id, options);
    const comparison = await BackupWorker.compare(localPayload, cloudData);

    if (comparison.same) {
      return { status: 'same', ...comparison, file: latestFile };
    }
    if (comparison.conflict) {
      return { status: 'conflict', ...comparison, file: latestFile };
    }
    if (!comparison.cloudIsStrictSuperset) {
      return { status: 'skipped', ...comparison, file: latestFile };
    }
    if (AppStorage.getStatus().mode !== 'indexeddb') {
      return { status: 'safety_blocked', ...comparison, file: latestFile };
    }

    await AppStorage.createRecoverySnapshot(await this._buildRecoveryPayload(), 'before-auto-cloud-restore');
    if (AppStorage.getStatus().revision !== expectedRevision) return { status: 'local_changed', ...comparison, file: latestFile };
    const syncedAt = await this.applyDownload(cloudData, 'overwrite', { skipSnapshot: true, prevalidated: true, expectedRevision });
    return { status: 'restored', syncedAt, ...comparison, file: latestFile };
  },

  async applyDownload(data, mode, options = {}) {
    const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    progress('正在驗證備份…');
    await yieldForUI();

    await AppStorage.flush();
    const expectedRevision = options.expectedRevision ?? AppStorage.getStatus().revision;
    const validation = options.prevalidated
      ? { valid: true, collections: BackupSchema.normalize(data), sourceSchemaVersion: Number(data?.schemaVersion) || 0 }
      : await BackupWorker.validate(data);
    if (!validation.valid) throw new Error('BACKUP_INVALID_' + validation.reason);

    if (!options.skipSnapshot) {
      progress('正在建立本機復原點…');
      await AppStorage.createRecoverySnapshot(await this._buildRecoveryPayload(), 'before-manual-cloud-restore');
      await yieldForUI();
    }

    progress(mode === 'overwrite' ? '正在準備寫入備份…' : '正在背景合併備份…');
    const merged=await BackupWorker.merge(this._rawCollections(),validation.collections,mode,validation.sourceSchemaVersion);
    const writes=merged.writes;
    await yieldForUI();
    await AppStorage.setItemsBatch(writes, { expectedRevision });

    if (validation.sourceSchemaVersion >= 8) {
      StudyStreak.markPending();
    } else {
      StudyStreak.migrateFromHistories(getStudyHistorySources(), { markPending: true });
    }

    await AppStorage.flush();
    const now = new Date().toLocaleString('zh-TW');
    DB.setGDriveLastSync(now);
    refreshStudyStreakUI();
    this.scheduleStudyStreakSync(700);
    progress('完成');
    return now;
  }

};
return service;
}
