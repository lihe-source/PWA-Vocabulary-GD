# PWA Vocabulary GD V7.4.3

以 V7.4.2 為基準，保留現有英文學習、Google Drive、Gemini、PWA 與 Web Push 功能。

## 本版改善

- 修正備份合併例句識別；同一天、同一單字的不同例句均保留。CSV 匯入匯出採相同識別方式。
- 合併前顯示新增、重複及衝突筆數。單字衝突保留本機；同日統計採較大總數並聯集錯字明細，避免重複累加。不同單字的 ID 撞號會修正，並保留加強單字關聯。
- 練習題數與出題順序保存於本機，畫面選項、實際出題與首頁提示使用相同狀態。
- 修正深色通知、選項、進度列和拼字格的前景／背景配色，增加卡片行距、按鈕尺寸與手機表單字級。
- 設定分為系統更新、帳號與同步、資料管理、外觀與音效、通知提醒；可快速跳轉並記住展開狀態。
- 電腦內容最大寬度 1200px；電腦操作視窗置中且最大寬度 640px，手機採底部視窗，支援 Escape、Tab 焦點循環與返回原按鈕。
- 首頁依有效 Google Token 顯示狀態；記住帳號與有效授權分開呈現。啟動及一般點擊不會要求 Google 授權。有效 session 直接恢復；授權到期時由登入或雲端操作按鈕啟動 Google 官方流程。
- 統計顯示「30天」，首頁顯示最長連續練習天數。
- 備份準備、檢查、合併、CSV 解析及 ZIP 壓縮在 Worker 執行。本機批次匯入先建立復原點，再一次寫入 IndexedDB；無法識別或失敗的檔案有明確結果。
- AI 相同請求共用工作；切換頁面／練習模式會取消舊請求，並提供取消按鈕。逾時涵蓋回應本文，舊請求完成後不能寫入新畫面。
- 單字庫每批 80 筆，AI、文章與閱讀歷史每批 40 筆；回到主要頁面保留捲動位置。
- 首頁先顯示；舊練習天數遷移在背景執行，已有遷移旗標時不重跑。移除外部字型等待，ZIP 函式庫依需求載入。
- 已安裝 PWA 優先開啟同版本快取頁面；推播公開設定的網路讀取最多等待 2.5 秒，再回到快取。新版 SW 必須完整安裝後才切換。
- 支援安全區域、畫面縮放、橫向顯示與 Visual Viewport 軟鍵盤調整；保留安全更新與更新前資料 flush。

## 模組

| 檔案 | 責任 |
| --- | --- |
| app.js | 頁面、練習互動、組裝與啟動 |
| data-store.js | 本機資料存取、CSV 格式與索引 |
| data-merge.js | 合併規則、資料識別及結果報告 |
| drive-service.js | Google Token、Drive 備份、還原與跨裝置同步 |
| gemini-service.js / request-coordinator.js | AI 呼叫、去重、取消與本文逾時 |
| backup-worker.js / backup-worker-client.js | 背景備份、合併、CSV 及 ZIP 處理 |
| ui-controller.js / ui.css | 視窗焦點、設定分組、鍵盤可及性與響應式顯示 |
| storage.js / backup-schema.js | IndexedDB、復原點、Schema 與 checksum |
| sw.js / version-manager.js | 離線快取與安全更新 |
| reminder-manager.js / worker.js | 原有推播前端與 Cloudflare 後端 |

## 相容性與驗證

IndexedDB 保持 `pwa_vocabulary_v7`／實體版本 1，備份保持 Schema V8，舊 V7 備份可還原。Google Access Token 僅保存於 sessionStorage。推播網址、D1、Cron 與 VAPID 設定保留。此版本不新增登入後端，也不需要重新部署 Cloudflare Worker。

```bash
npm run check
npm test
```

發布檢查涵蓋所有 JS／MJS 語法、模組版本、快取資源與扁平目錄。詳細測試紀錄見 VALIDATION_V7_4_3.md，部署說明見 DEPLOY_V7_4_3.md。
