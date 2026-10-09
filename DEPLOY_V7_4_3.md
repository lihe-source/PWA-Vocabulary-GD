# V7.4.3 部署說明

ZIP 只有一個根資料夾 `PWA-Vocabulary-GD-V7_4_3`，其內所有檔案都在同一層。

1. 解壓 `PWA-Vocabulary-GD-V7_4_3.zip`。
2. 將同名資料夾內的全部檔案上傳至 `lihe-source/PWA-Vocabulary-GD` 的 `main` 分支根目錄。包含新增模組與 `ui.css`，避免遺漏。
3. 等候 GitHub Pages 完成部署，再重新開啟 PWA。
4. 在設定頁「系統更新」確認目前版本為 V7.4.3；也可按「檢查更新」。練習、草稿、背景工作或資料寫入尚未安全完成時，更新會等待。

不需要清除網站資料、重建 IndexedDB、重新申請 OAuth Client ID 或重新設定 Gemini Key。

本版沒有修改推播 API／D1 結構，不需要重新部署 Cloudflare Worker。原有 Worker、Cron、D1 與 VAPID Secrets 可繼續使用；前端和推播服務的顯示版本可以不同。

已安裝 PWA 先啟動完整同版本快取，再背景檢查新版，因此更新剛發布時仍可能先看到舊版，待安全切換後才顯示新版。

## 本機檢查

```bash
npm run check
npm test
```

正式 PWA 需要 HTTPS（本機測試可用 localhost）。本次僅交付 ZIP，沒有執行 GitHub 推送或部署。
