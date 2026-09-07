# V7.3.0 變更紀錄

更新日期：2026-09-07

## 登入與啟動

- 首頁不等待 Google OAuth 或 Drive API。
- 保留仍有效的 session token，不再由儲存層於啟動時刪除。
- Google Identity Services 非阻塞預載。
- 已記住帳號以 `prompt: none` 和 `login_hint` 嘗試無介面續登入。
- 使用上傳、還原或同步時直接處理授權，移除第二次選擇帳號流程。

## 備份與還原

- checksum、序列化、解析與驗證移至 Web Worker。
- 網路請求加入逾時、取消與可讀錯誤；只重試安全的讀取請求。
- 上傳前不再等待練習天數雲端同步。
- V8 備份嚴格檢查所有集合、checksum 與未來版本。
- 自動還原由內容包含關係決定，避免只看筆數而誤覆蓋。
- 還原採單一 IndexedDB transaction，並在本機資料已改變時中止。

## 資料與更新安全

- IndexedDB 寫入序列化並追蹤失敗，錯誤時可重新儲存。
- 跨分頁寫入使用 revision 衝突檢查。
- 文章與 AI 問題草稿自動保存。
- 前景工作或未完成寫入存在時延後 PWA 更新。
- 推播憑證復原增加訂閱金鑰驗證。

## 相容性

- 保留 `pwa_vocabulary_v7` 與 Schema V8。
- 保留 V7 舊備份還原、Google Drive 設定、Cloudflare Worker/D1 與學習紀錄。
