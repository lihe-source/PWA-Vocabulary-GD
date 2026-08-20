# V7.2.2 變更記錄

更新日期：2026-08-21

## 效能優化

- 首頁不再等待 Google silent OAuth、Drive 自動備份比對、跨裝置練習天數同步完成後才顯示。
- Google Identity Services 改為首頁可操作後預先載入，降低第一次使用 Google 功能時的等待。
- Google 登入取得 Access Token 後立即完成登入流程，帳號 Email 查詢改為背景更新。
- 已授權帳號不再每次強制 `consent`，只有必要時才進入互動式授權流程。
- Google TokenClient 加入單一 in-flight request 保護，避免啟動續權與使用者操作互相覆寫 callback。
- 上傳完整備份不再先等待跨裝置練習天數雙向驗證；備份本身已包含本機最新 `studyDays`，練習天數同步改為上傳完成後背景執行。
- 大型備份 checksum / collection hash 改為單次串流式穩定雜湊，維持既有 checksum 相容性並降低主執行緒負載。
- Multipart 上傳改用 Blob 組合，避免建立額外的大型串接字串。
- 還原備份改用批次 IndexedDB 寫入，減少多筆獨立 transaction。
- 合併單字由逐筆 `find()` 改為 `Set` 索引，避免大量單字時 O(n²) 搜尋。
- 還原流程在驗證、建立復原點、序列化、寫入階段主動讓出 UI 執行權，按鈕會顯示目前進度，不再呈現長時間無反應。
- IndexedDB 啟動讀取改為單次 `getAll()` transaction，減少 iOS PWA 冷啟動 transaction 次數。
- 多個練習天數檔案改為平行下載後合併。

## 相容性與資料安全

- IndexedDB 名稱維持 `pwa_vocabulary_v7`。
- 邏輯 Schema 維持 V8。
- Google Drive 完整備份格式維持 V8。
- V7 舊備份仍可還原。
- 完整備份 checksum 與 V7.2.1 演算法結果相容。
- 雲端覆蓋前仍會建立本機 Recovery Snapshot。
- Google OAuth Access Token 仍只存在 `sessionStorage`，不寫入 IndexedDB/localStorage。
- Cloudflare Worker、D1、GitHub Pages、VAPID 與既有通知設定維持原設定。

## 測試

- `npm run check`：通過。
- `npm test`：20/20 通過。
- Release 目錄維持完全扁平，沒有 `backup/` 子資料夾。
