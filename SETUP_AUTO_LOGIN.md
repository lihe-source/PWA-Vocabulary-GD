# Google 自動續登入設定 — V7.5.0

開啟主畫面不需要登入。若要在關閉 PWA、重新開啟之後仍自動恢復 Google Drive 連線，需部署本包新增的授權後端，並在每台裝置首次連結一次。原有純前端 access token 無法轉換成 refresh token，因此既有使用者升級後也需完成這次連結。

## 1. 沿用原本 Google Web Client

到原 Google Cloud 專案，確認已啟用 Google Drive API。沿用 PWA 已使用的 OAuth「Web application」Client ID，取出它的 Client Secret。勿改成 Desktop／Android Client，也不要新建不同 Client 後直接取代原設定；`drive.file` 可見的既有備份取決於原應用程式授權。

保留 JavaScript authorized origin：

```text
https://lihe-source.github.io
```

部署新 Worker 後，增加 authorized redirect URI（網址必須完全相同）：

```text
https://你的授權Worker.workers.dev/oauth/callback
```

使用範圍為 `openid`、`email`、`https://www.googleapis.com/auth/drive.file`。

Google consent screen 若處於 Testing，含 Drive scope 的 refresh token 通常七天到期；請依 Google Console 的要求完成正式發布或所需驗證。Google 仍可因撤權、安全事件等要求重新授權，程式會顯示提示而不自動打開登入頁。

## 2. 建立獨立授權 D1

在本包目錄使用 Node.js 24 以上：

```sh
npm ci
npx wrangler login
npx wrangler d1 create vocabulary-google-auth
```

將回傳的 Database ID 填入 `wrangler-auth.toml` 的 `database_id`，並填入原有 `GOOGLE_CLIENT_ID`。保留 `APP_URL` 與 `ALLOWED_ORIGINS`；若網站網址改變，需同步修改 Google Console 與 Worker 設定。

**這是新增的授權資料庫。不要修改原 `wrangler.toml` 的推播 Database ID，也不要在原 `vocabulary-reminders` 資料庫建立授權資料表。**

```sh
npm run auth:db:init
```

此指令只建立 `oauth_accounts`、`device_sessions`、`oauth_attempts` 等授權資料表，SQL 使用 `IF NOT EXISTS`。

## 3. 設定兩個 Worker Secrets

```sh
npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler-auth.toml
```

貼上 Google Web Client Secret。接著在自己電腦產生 32 位元組加密金鑰：

```sh
node --input-type=module -e "import {randomBytes} from 'node:crypto'; console.log(randomBytes(32).toString('base64'))"
npx wrangler secret put TOKEN_ENCRYPTION_KEY --config wrangler-auth.toml
```

把產生的 Base64 值貼到第二個指令。請自行安全保管這個金鑰；不可放進前端、GitHub、`cloud-config.json` 或 ZIP。任意更換金鑰會讓舊授權無法解密，需重新連結各裝置。

## 4. 部署新增 Worker

```sh
npm run auth:deploy
```

記下部署後的 HTTPS Worker origin，不含路徑。此指令使用 `wrangler-auth.toml`；不要使用推播的 `worker:deploy` 來部署授權服務。

在 Google Console 完成第 1 步的 redirect URI 設定。

## 5. 設定前端

可選其中一種方式：

1. 在每台 PWA 的「設定 → 自動續登入服務網址」填入 Worker 網址並儲存。程式會驗證服務及 Client ID 是否相符。
2. 編輯 `cloud-config.json` 的 `authWorkerUrl`，例如：

```json
{
  "authWorkerUrl": "https://你的授權Worker.workers.dev",
  "appUrl": "https://lihe-source.github.io/PWA-Vocabulary-GD/"
}
```

設定頁保存的網址優先於此公開設定檔。它只包含公開網址，不能填入 Client Secret。

## 6. 首次連結及確認

每台裝置在設定頁按一次「連結 Google」，程式會在目前頁面導向 Google 完成首次授權，再返回 PWA；不使用 GIS popup。之後關閉、重開時，主畫面先顯示，背景使用裝置連線憑證恢復服務，由後端靜默刷新 Google access token。

iPhone 可能把 OAuth 返回頁開在 Safari，與原安裝 PWA 的儲存空間不同。授權完成後請回到原 PWA；原 PWA 在恢復可見或重新開啟時會完成待處理連結。待處理授權有效十分鐘，不需把憑證從 Safari 複製到 PWA。

驗收順序：

1. 首次連結後，設定頁顯示「已連線」。
2. 上傳一份備份，能在備份清單找到；選擇還原前先確認本機復原點可用。
3. 完全關閉、重開 PWA，直接進入主畫面且背景恢復連線。
4. Google access token 到期後，Drive 操作由後端刷新，無需再次開啟 Google 頁面。
5. 離線時本機練習可用；回到網路後可恢復服務。
6. 撤銷 Google 授權後只顯示重新連結提示，不自動開啟視窗。

## 憑證與權限

- Google access／refresh token 只留在後端，以 AES-GCM 加密寫入授權 D1。
- PWA 在 IndexedDB 保存的是隨機裝置連線憑證，不是 Google token。後端只存它的 SHA-256 雜湊。
- 預設裝置憑證閒置 30 天失效，活躍時延長；可用 `SESSION_IDLE_DAYS` 調整為 7–90 天。
- OAuth 交換有 state、server PKCE、前端驗證碼及一次性兌換；返回 URL 只含流程 ID，不含 token。
- Drive gateway 限制在此 App 的 JSON 備份與練習天數檔案，禁止任意 API、刪除或其他文件操作。
- 一般 JSON 備份上傳／下載限制 40 MiB， multipart metadata 前綴最多 16 KiB。一鍵 CSV／ZIP 匯入展開合計上限 64 MiB、200 個 CSV。
- 「登出」撤銷此裝置的後端連線，不移除其他裝置的 Google 授權。
- Google token、Device token 與 Gemini API Key 不放入學習資料備份。

## 常見情況

| 介面訊息 | 處理方式 |
|---|---|
| 後端尚未設定 | 檢查 D1 binding、Client ID 與兩個 Secrets |
| Client ID 不一致 | 後端與原前端必須使用同一個 Google Web Client |
| Google `redirect_uri_mismatch` | 檢查授權 Worker 的 `/oauth/callback` 是否已列入 Google Console |
| 需要重新授權 | 在設定頁按「連結 Google」；Testing 七天期限及撤權都可能觸發 |
| 授權完成但 PWA 未連線 | 回到原 PWA，在十分鐘內重新開啟或切回前景 |
| 暫時無法連線 | 本機可繼續使用；恢復網路後重試，避免重複點擊上傳 |

此交付包只完成程式、模擬測試與本機瀏覽器驗證；Google 真實帳號授權、Cloudflare 遠端部署及 iPhone 實機驗收需於上述設定完成後執行。

官方文件：

- [Google Web Server OAuth 與 offline access](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google refresh token 到期條件](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Drive multipart upload](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
