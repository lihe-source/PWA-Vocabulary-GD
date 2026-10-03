# 英文複習 PWA V7.5.0

以 `lihe-source/PWA-Vocabulary-GD` 的 main 分支 V7.4.2（commit `9e2327562fcbfdf5208f256b8b3211f11b389a55`）為基準。

本包包含完整前端、原有推播 Worker，以及新增的 Google 自動續登入 Worker。尚未部署至任何遠端服務。

## 更新後的使用方式

- 開啟 PWA 直接進入主畫面；啟動與一般點擊都不會要求 Google 登入。
- 本機練習與既有資料可直接使用。
- 完成 `SETUP_AUTO_LOGIN.md` 的後端設定，並在每台裝置首次按「連結 Google」授權一次後，重新開啟會背景恢復連線；短效 Google access token 由後端更新。
- 權限被撤銷、裝置連線憑證失效時，介面顯示重新連結提示，程式不會自行打開 Google 視窗。
- 若未設定新增後端，沿用原本的手動 Google Drive 授權方式；此模式只恢復有效的工作階段 token，不會在一般點擊時嘗試 OAuth。

## 主要改善

| 項目 | V7.5.0 行為 |
|---|---|
| 啟動 | 主畫面先顯示，Google、雲端同步與更新檢查在背景進行；不預載 ZIP 或 AI 主模組 |
| 解析與統計 | 資料解析、單字排序與統計摘要快取；資料改變時才重算 |
| 單字庫 | 每頁最多 80 個單字，上一頁／下一頁切換 |
| 備份與還原 | JSON、checksum、比對、合併及序列化由 Web Worker 處理；IndexedDB 批次提交 |
| CSV／ZIP | 一鍵匯出、匯入在 Worker 執行；匯入驗證失敗時整批不寫入，成功前建立本機復原點 |
| 資料合併 | 同一天、同一單字的不同例句均保留；修正 CSV 引號及跨行欄位處理 |
| 雲端檢查 | 先讀檔案中繼資料；已完成相同比對且本機內容沒改時，省略整份下載 |
| 背景工作 | 手動操作優先，背景比對只在提交資料時短暫鎖定；同步會保留過程中新增加的練習日期 |
| AI | 離開頁面取消請求；回覆有期限；最多兩個模型選項；可讀取並快取 Google 官方可用模型清單 |
| 離線與更新 | 預存完整模組；導覽使用同一版快取；弱網設定檔逾時回退，安全時才切換版本 |
| 介面 | 保留電腦寬版、手機間距與小尺寸設定圖示；允許縮放及橫向顯示 |

## 保留的資料與服務

IndexedDB 名稱 `pwa_vocabulary_v7`、實體版本 1、備份 Schema V8，以及 V7 舊備份讀取相容性均保留。更新不刪除瀏覽器資料，也不修改既有推播 D1。Gemini API Key、Google Client ID、Drive 資料夾、自動同步及主題設定仍沿用原鍵名。

原推播服務維持 `worker.js`、`wrangler.toml`、`schema.sql`。新增登入服務使用 `cloud-auth-worker.js`、`wrangler-auth.toml`、`cloud-auth-schema.sql`，兩者是分開的 Worker 與 D1。

## 本機檢查

需要 Node.js 24 以上；內建測試無須安裝 npm 套件。

```sh
npm run check
npm test
python3 -m http.server 8080
```

開啟 `http://localhost:8080/`。請透過 HTTP／HTTPS 開啟，避免 `file://` 無法使用 ES Modules、Worker 或 PWA。

## 手動更新 GitHub Pages

將本包根目錄內的檔案更新至原 repository 的根目錄，保留 Pages 網址、manifest ID 與 scope。勿把整個版本資料夾再嵌入 repository。不要清除網站資料、移除 PWA 後重新安裝或重建原推播資料庫。

新增自動登入服務需另外依 `SETUP_AUTO_LOGIN.md` 設定，單純上傳前端不會替你建立 Google refresh token。原推播設定及操作請見 `SETUP_PUSH_NOTIFICATIONS.md`。

本包不含 Google Client Secret、refresh token、VAPID 私鑰或 Cloudflare API Token。
