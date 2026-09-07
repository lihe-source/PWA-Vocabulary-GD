# PWA Vocabulary GD V7.3.0

手機優先的英文單字複習 PWA，整合 IndexedDB、Google Drive 備份、Gemini、跨裝置練習天數與 Cloudflare Web Push。

## V7.3.0 架構

- 主畫面先顯示；Google GIS、OAuth 與 Drive 同步在背景執行。
- 有效的 session token 直接恢復；已記住帳號會在第一次一般操作時嘗試無介面續登入。
- Drive 按鈕可直接完成必要授權，不需先按另一個登入確認。
- 備份 checksum、JSON 解析與驗證改由 Web Worker 處理。
- Drive GET 有逾時與有限重試；POST 上傳不自動重送，避免重複檔案。
- 還原先建立本機 Recovery Snapshot，再以單一 IndexedDB transaction 寫入。
- 背景還原須確認雲端內容完整包含本機內容；資料衝突或處理中本機變更時停止覆蓋。
- IndexedDB 寫入失敗會回復記憶體狀態並顯示「重新儲存」。
- 練習及文章草稿、備份/還原、同步工作進行時，Service Worker 不會強制重載。
- 推播管理憑證復原會驗證 endpoint、p256dh 與 auth，避免只靠 endpoint 重設。

## 相容性

- IndexedDB：`pwa_vocabulary_v7`
- Backup Schema：V8
- 舊 V7 備份：可相容還原
- Service Worker Cache：`Voc-PWA-V7_3_0`
- Google Access Token：僅保存於 `sessionStorage`

## 驗證

```bash
npm run check
npm test
```

目前自動化測試：28/28 通過。部署步驟請見 `DEPLOY_V7_3_0.md`，變更內容請見 `CHANGELOG_V7_3_0.md`。
