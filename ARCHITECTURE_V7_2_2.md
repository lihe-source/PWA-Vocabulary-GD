# V7.2.2 效能架構

## 啟動

`DOMContentLoaded -> AppStorage.init -> Service Worker register -> 本機 token 即時還原 -> 首頁 render`

首頁完成後才開始：

`GIS preload -> silent OAuth -> 可選 Drive auto-sync -> 背景 study streak sync`

因此 Google/Drive 網路延遲不再阻塞首屏。

## Google 登入

1. 預先載入 GIS。
2. TokenClient 同時間只允許一個 token request。
3. 取得 access token 後立即保存 session 並結束登入等待。
4. `/userinfo` Email 查詢背景執行。
5. 跨裝置練習天數同步背景執行。

## Google Drive 上傳

`ensureToken -> build V8 payload -> streaming stable hash -> JSON stringify -> Blob multipart -> Drive upload`

完整備份內直接包含本機最新 `studyDays`，不再把練習天數多次 Drive 驗證放在上傳前。

## Google Drive 還原

`download -> checksum validate -> recovery snapshot -> chunk/yield -> batch serialize -> one IndexedDB batch transaction -> flush`

合併單字與重複判斷使用 `Set`/Map 索引，避免大量資料時重複線性掃描。
