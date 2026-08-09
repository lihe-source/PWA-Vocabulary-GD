# V7.2.1 部署與驗收

適用 Repository：`https://github.com/lihe-source/PWA-Vocabulary-GD/`

## 1. 部署 GitHub Pages 前端

1. 先下載並解壓 `PWA-Vocabulary-GD-V7_2_1-FLAT.zip`。
2. 開啟 GitHub Repository，切換到 `main` 分支。
3. 選擇 **Add file → Upload files**。
4. 此 ZIP 已是扁平結構；直接一次選取解壓後的全部檔案，上傳到 Repository 根目錄即可。
5. Commit message 可填 `Release V7.2.1`，按 **Commit changes**。
6. 到 **Actions** 等待 Pages 部署完成，再開啟 `https://lihe-source.github.io/PWA-Vocabulary-GD/`。

如果 GitHub Pages 尚未啟用：到 **Settings → Pages**，選擇 `Deploy from a branch`、`main`、`/(root)`。

上傳新檔不會刪除 Repository 內既有的其他檔案；若手機檔案選擇器看不到 `.nojekyll`，可略過它，既有 GitHub Pages 網站仍可更新。

## 2. Google Drive 跨裝置同步

沿用 V7.1.0 已設定的 OAuth Client ID，不需要新增 Google API 或 Secret。請確認 Google Cloud Console 的 OAuth 網頁用戶端仍包含以下授權來源：

```text
https://lihe-source.github.io
```

每台裝置更新後：

1. 從主畫面開啟 PWA。
2. 到 **設定 → Google Drive 雲端同步**。
3. 以同一個 Google 帳號登入。
4. 按 **立即同步**。
5. 設定頁應顯示相同累積天數；Google Drive 會建立 `vocab_study_streak.json`。

iOS/iPadOS 關閉 PWA 後可能要求 Google 再確認授權。此時進入設定頁按「立即同步」即可；尚未同步的練習日仍保存在裝置內，不會遺失。

## 3. 更新推播 Worker

本次介面修正不依賴 Cloudflare Worker，因此只上傳 GitHub Pages 檔案即可生效，現有提醒也會繼續運作。若希望 Worker 根網址同步顯示 `V7.2.1`，可在原本可執行 Wrangler 的終端機進入專案根目錄後執行：

```bash
npm install
npx wrangler login
npm run worker:deploy
```

`wrangler.toml` 已沿用目前的 Worker 名稱與 D1 Database ID，既有 D1 資料與 VAPID Secrets 不需重建。

## 4. 清除舊 PWA 快取

正常情況下 Service Worker 會自動切換到 `Voc-PWA-V7_2_1`。若仍顯示舊版本：

- 先完全關閉 PWA，再重新開啟。
- 到設定頁按 **檢查更新**。
- iPhone／iPad 若仍未更新，可刪除主畫面舊圖示、重新由 Safari 加入主畫面；刪除前先確認 Google Drive 備份已上傳。

## 5. 驗收項目

- 設定頁版本顯示 `V7.2.1`、資料儲存顯示 `IndexedDB V8`。
- 主頁「今日例句」上方可看到綠色主題的累積練習天數卡，左右留白與其他首頁卡片一致。
- 設定頁「跨裝置練習天數」文字正常橫排，狀態、時間與按鈕各自一列且沒有相互擠壓。
- 完成一次單字測驗後，今日狀態改為「今天已完成練習」。
- 同一天再完成其他練習，累積天數不重複增加。
- 另一台裝置使用同一 Google 帳號登入並按「立即同步」後，顯示相同天數。
- 一鍵匯出的 ZIP 內包含 `study_days_YYYYMMDD.csv`。
- 舊 V7.1.0 Drive 備份仍可選擇並還原。

## 6. 本機檢查（選用）

電腦已安裝 Node.js 20 以上時，可在專案根目錄執行：

```bash
npm install
npm run check
npm test
```
