# PWA Vocabulary GD V7.2.3

英文單字複習 PWA，部署於 GitHub Pages，整合 Google Drive、Google OAuth、Gemini、IndexedDB、Cloudflare Worker/D1 Web Push 與跨裝置練習天數。

## V7.2.3 重點

本版主要改善 iOS/PWA 使用 Google 帳號、Drive 上傳備份與還原備份時的卡頓問題。

- 首頁先顯示，Google/Drive 初始化改為背景工作。
- GIS 預載，降低第一次 Google 操作延遲。
- 登入不再等待 userinfo 與跨裝置練習天數同步。
- 完整備份不再先等待 streak sync。
- checksum/hashes 改為單次串流計算，格式與舊版相容。
- 還原使用批次 IndexedDB transaction 與 UI yielding。
- 大型單字合併改用 Set 索引。
- IndexedDB 冷啟動改為單次批次讀取。

完整內容見 `CHANGELOG_V7_2_3.md`，部署方式見 `DEPLOY_V7_2_3.md`。

## 資料相容性

- IndexedDB：`pwa_vocabulary_v7`
- Schema：V8
- Service Worker Cache：`Voc-PWA-V7_2_3`
- 舊 V7 備份：可相容還原
- OAuth Access Token：僅 sessionStorage

## 驗證

```bash
npm run check
npm test
```

目前自動測試：20/20 通過。
