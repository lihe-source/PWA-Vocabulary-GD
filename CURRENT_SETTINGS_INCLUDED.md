# 現行設定保留確認（V7.2.3）

本版本已逐項比對使用者提供的 `PWA-Vocabulary-GD-main (2).zip`，並保留以下部署設定。

## 已放入 ZIP 的設定檔

| 檔案 | 已保留設定 |
|---|---|
| `push-config.js` | Worker：`https://vocabulary-daily-reminder.rexchre.workers.dev`、預設提醒 `22:00`、通知標題與內容 |
| `wrangler.toml` | Worker 名稱 `vocabulary-daily-reminder`、每分鐘 Cron、GitHub Pages APP URL、允許來源、既有 D1 Database ID |
| `schema.sql` | 既有 reminders 資料表結構；使用 `IF NOT EXISTS`，不會清除遠端資料 |
| `reminder-manager.js` | 原有通知訂閱、測試通知、時間與時區同步流程 |
| `worker.js` | 原有 Worker 功能完整保留，只將服務版本更新為 `V7.2.3` |
| `push-config.js`、`wrangler.toml`、`schema.sql`、`reminder-manager.js` | 與附件對應檔案逐位元相同 |

## 更新後不會被清除的項目

| 項目 | 實際保存位置 | 保留方式 |
|---|---|---|
| 單字、測驗、例句、AI 紀錄、練習天數 | 瀏覽器 IndexedDB | V7.2.3 沿用 `pwa_vocabulary_v7` 與邏輯 Schema 8，不重新建立資料庫 |
| Gemini API Key | 瀏覽器 IndexedDB | 沿用原鍵名 `geminiApiKey` |
| Google Drive Client ID、資料夾 ID、自動同步設定 | 同一網站來源的本機儲存空間 | 上傳靜態檔不會清除瀏覽器儲存 |
| Google 帳號識別 | 同一網站來源的本機儲存空間 | 帳號 Email 會保留；Google Access Token 仍採安全的工作階段保存機制 |
| 每台裝置的通知訂閱與提醒時間 | Cloudflare D1 | `wrangler.toml` 沿用既有 Database ID，部署 Worker 不會建立新資料庫 |
| VAPID 公私鑰與 Cloudflare API Token | Cloudflare Secrets／GitHub Secrets | 不應放進 ZIP；重新部署同名 Worker 時會繼續使用遠端 Secrets |
| Google OAuth 授權來源 | Google Cloud Console | 屬於遠端專案設定，不會受到 GitHub 檔案更新影響 |

## 必要注意事項

- Repository、GitHub Pages 網址與 Worker 名稱不要改名。
- 不要在 Cloudflare 重新建立新的 D1 Database；本包已指定目前使用中的 Database ID。
- 不要執行會刪除瀏覽器網站資料的操作。一般 GitHub Pages 更新、Service Worker 更新或重新部署 Worker都不會清除學習資料。
- iOS 關閉 PWA 後，Google 基於安全機制仍可能要求再次確認授權，但 Client ID、Email 與本機資料不會因此消失。
