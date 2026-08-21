# V7.2.3 GitHub Pages 部署

1. 將 `PWA-Vocabulary-GD-V7_2_3` 目錄內全部檔案上傳至 GitHub Pages 專案根目錄。
2. 保留既有 Google OAuth Client ID、Drive Folder ID、Gemini Key、Push/Worker 設定；本版本不需要重建 IndexedDB。
3. GitHub Pages 發布後，PWA 會透過 `version.json` 偵測 `V7_2_3`。
4. 新 Service Worker Cache 為 `Voc-PWA-V7_2_3`，啟用後會清理舊版 `Voc-PWA-*` Cache。
5. 完全關閉並重新開啟 PWA 後，應直接進入主畫面，不應因 Google OAuth 彈窗而阻塞首頁。
6. 若同一 PWA session 仍有有效 access token，Google Drive 會直接恢復已登入狀態。
7. 若已記住 Google 帳號但 token 不在目前 session，第一次一般操作會以 `prompt:none` 嘗試無 UI 續權；失敗不會打斷使用者。
8. 使用者直接點「上傳備份／還原備份」時，該按鈕本身就是 OAuth user gesture，不需要先另外點「登入 Google」。

注意：Google GIS Token Model 的 access token 為短效 token。若 Google 判定需要重新驗證、重新同意 scope 或帳號 session 已失效，Google 官方授權畫面仍可能出現；純 GitHub Pages 前端無法合法繞過該安全流程。
