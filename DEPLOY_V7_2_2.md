# V7.2.2 GitHub Pages 部署

1. 將 `PWA-Vocabulary-GD-V7_2_2` 目錄內的檔案上傳到 GitHub Pages 專案根目錄。
2. 保留既有 `wrangler.toml`、`push-config.js`、Cloudflare D1 與 VAPID Secret 設定。
3. GitHub Pages 發布後，PWA 會透過 `version.json` 偵測 `V7_2_2`。
4. 新 Service Worker Cache 為 `Voc-PWA-V7_2_2`，啟用後會清理舊版 `Voc-PWA-*` Cache。
5. 更新前程式仍會執行 `AppStorage.flush()`；練習或文章操作進行中不會強制重新載入。
6. 更新後進入「設定」確認：目前版本 `V7.2.2`、資料儲存 `IndexedDB V8`、Google Drive 帳號與原資料仍存在。

本版本不需要重建 IndexedDB，也不需要重新建立 Cloudflare Worker/D1。若 Worker 本身沒有重新部署，現有 V7.2.1 Worker 邏輯仍與 V7.2.2 前端相容；重新部署 `worker.js` 則服務版本會顯示 V7.2.2。
