# PWA Vocabulary GD V7.1.0

PWA 前端執行檔均位於根目錄，可直接部署到 GitHub Pages。V7.1.0 另包含 Cloudflare Worker＋D1 推播後端，讓 iPhone 在 PWA 關閉後仍可依使用者設定的每日時間收到通知。

## V7.1.0 更新

- 設定頁新增每日提醒時間、啟用、測試通知與關閉提醒。
- 支援 iOS 主畫面 PWA 的鎖定畫面、橫幅與通知中心 Web Push。
- 新增 Cloudflare Worker、D1 資料表及每分鐘 Cron 排程。
- 新增 VAPID Secrets、安全的裝置管理憑證、過期訂閱清理與有限次重試。
- Service Worker 新增背景推播與點擊通知返回 PWA。
- 版本更新至 V7.1.0，並保留開啟時自動檢查更新與設定頁手動更新。
- 完整設定請閱讀 `SETUP_PUSH_NOTIFICATIONS.md`。

## V7.0.4 更新

- 取消最後一字切換隱藏輸入框 `readOnly`，避免 iPhone 鍵盤重新同步或短暫停頓。
- 延遲發音加入題目識別與取消機制，舊題發音不再插入下一題或打字途中。
- 音效解鎖加入執行中防重與快速路徑，避免同一手勢或每題重建音訊節點。
- 答錯次數改為測驗結束／離場時一次寫入，重打期間不再解析與儲存整份單字庫。
- 最後一字的整題著色移到下一畫格，逐字輸入只保留差分字格更新。
- 修正顯示答案後立即重打可能掉字、舊計時器與 Enter 監聽器殘留的問題。
- 進度條改用 GPU transform，並移除每次按鍵都重啟的游標閃爍動畫。
- 更新 PWA 快取與 service worker 啟用流程，確保手機取得新版檔案且不在測驗中途重載。

## V7.0.3 更新

- 修正 iPhone PWA 單字測驗答對、答錯與總結音效未播放。
- 還原 V6.6 已驗證的同步 Web Audio 播放流程，避免非同步等待遺失使用者操作授權。
- 取消答題瞬間先停止 TTS 的處理，避免 iOS 重設共用音訊路由。
- 設定頁最下方新增答對、答錯、100% 總結音效測試及 AudioContext 狀態顯示。
- 每次進入題目及使用者觸控／按鍵時重新確認 AudioContext 狀態。


- 恢復單字拼寫測驗答對音效、答錯音效。
- 恢復測驗結果依正確率播放的分級音效。
- 強化 iPhone／iOS PWA 的 Web Audio 解鎖與中斷後恢復。
- 保留單字發音流程，答題音效直接播放，避免 iOS 因取消 TTS 而重設音訊路由。
- 單字輸入改由瀏覽器原生輸入流程處理，不再逐字攔截並回寫輸入框。
- 每次輸入只更新變動的字母框，減少 DOM、版面與鍵盤同步負擔。
- 使用 DocumentFragment 一次建立字母框，並在答案判定期間鎖定輸入，避免重複事件。

## 部署方式

將本資料夾內的檔案上傳到 GitHub Pages 使用的分支根目錄。前端部署後，必須另外完成 Cloudflare Worker、D1 與 VAPID 設定，PWA 關閉後的定時通知才會生效。

## 必須上傳的檔案

`.nojekyll`、`index.html`、`app.js`、`style.css`、`sw.js`、`manifest.json`、`version.json`、`storage.js`、`backup-schema.js`、`version-manager.js`、`chart-renderer.js`、`push-config.js`、`reminder-manager.js`、`jszip.min.js`、`icon-192.png`、`icon-512.png`。

推播後端使用 `worker.js`、`schema.sql`、`wrangler.toml`、`package.json`、`package-lock.json` 與 `.github/workflows/deploy-reminder-worker.yml`。`README.md`、`SETUP_PUSH_NOTIFICATIONS.md`、CHANGELOG 與 `JSZIP-LICENSE.md` 不影響前端執行，但建議保留。
