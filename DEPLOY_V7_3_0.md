# V7.3.0 部署方式

本交付包解壓後只有一層資料夾，資料夾內的部署檔案維持扁平結構，方便手機一次選取上傳。

## GitHub Pages

1. 解壓 `PWA-Vocabulary-GD-V7_3_0.zip`。
2. 進入同名資料夾並選取全部檔案。
3. 上傳到 `lihe-source/PWA-Vocabulary-GD` 的 `main` 分支根目錄。
4. 等候 GitHub Pages 完成部署。
5. 完全關閉舊 PWA 後重新開啟，在設定頁確認版本為 V7.3.0。

部署後請確認首頁、單字練習、設定頁與 Google Drive 備份清單可正常開啟。舊資料庫與備份格式保持相容，不需清除網站資料。

## Cloudflare Worker

V7.3.0 修改了推播訂閱的管理憑證驗證，因此應在專案資料夾執行：

```bash
npm install
npm run worker:deploy
```

沿用原有 Worker 名稱、D1 Database ID 與 VAPID Secrets，不需重建資料庫。完整初次設定方式見 `SETUP_PUSH_NOTIFICATIONS.md`。

## 本機驗證

```bash
npm run check
npm test
```
