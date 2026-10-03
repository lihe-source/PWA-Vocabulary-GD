# V7.5.0 驗證紀錄

日期：2026-10-03。基準：GitHub main V7.4.2，commit `9e2327562fcbfdf5208f256b8b3211f11b389a55`。

## 自動化檢查

- `npm run check`：40 個 JS／MJS 檔案語法及本機依賴檢查通過，package、version.json 與 SW cache 版本一致。
- `npm test`：68 / 68 通過。包含既有回歸測試，以及新增 OAuth、資料合併、CSV、快取、請求取消與逾時測試。
- 授權後端測試使用真實 SQLite 執行 D1 相容 SQL，Google HTTP 回覆採模擬；驗證一次性兌換、server PKCE 與前端兌換驗證、加密及 AAD、裝置憑證雜湊、並行 refresh、限制 Drive 路徑、上傳只嘗試一次、取消授權及撤權狀態。
- 無內嵌正式 Google API Key 或私鑰區塊。授權後端設定保留待填值。

## 本機瀏覽器檢查

Chromium，桌面 1440 × 1000 與手機尺寸 390 × 844。

- 主頁、練習、單字庫、統計、設定可以切換；無 JavaScript 未捕捉錯誤。
- 啟動及一般操作沒有 Google authorization request，沒有 popup；Google SDK 與 ZIP library 不在啟動 HTML 載入。
- 主頁、設定頁沒有水平溢出；Google 服務網址欄與儲存按鈕均在卡片範圍內。
- 深色與淺色設定畫面可讀；設定圖示為正常小圖示。
- 合成 10,000 個單字與 201 筆不同例句：真實 Web Worker 備份驗證、ZIP 匯出／再匯入通過；處理過程主畫面仍可產生動畫影格。測試量不代表手機上的固定耗時承諾。
- 單字庫首頁及第二頁均只渲染 80 個單字；10,000 個單字可切換 125 頁。
- 復原點清單只回傳中繼資料，選擇後可讀出完整備份內容。
- 完整 SW cache 安裝後，切換離線並重新開啟：主畫面、設定、ZIP 匯出與統計圖表仍可用。
- 模擬授權服務：已保存裝置連線憑證可背景恢復帳號，不顯示連結按鈕；雲端較早備份可分頁讀取；popup 數為零。此模擬使用前端真實程式與 HTTP 回覆替身，未連結真實 Google 帳號。

## 交付與限制

ZIP 根資料夾為 `PWA-Vocabulary-GD-V7_5_0`，內部沒有子資料夾、舊版 ZIP、node_modules 或 git 控制檔。包含完整前端、推播後端、授權後端、SQL、設定文件與測試。

未部署至 GitHub 或 Cloudflare，未修改 Google Cloud Console。真實 Google 同意流程、過期後續權、跨裝置實際網路同步及 iPhone 安裝 PWA 的回跳行為，需完成 `SETUP_AUTO_LOGIN.md` 後實機驗收。
