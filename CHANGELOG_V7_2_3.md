# V7.2.3 變更記錄

## Google 登入流程

- APP 啟動後立即顯示主畫面，不再於 startup 呼叫會觸發 Google OAuth UI 的 token flow。
- 有效 `sessionStorage` access token 仍會同步恢復。
- 已記住帳號但無有效 token 時，第一次一般操作使用 `prompt: none` + `login_hint` 嘗試無畫面續權。
- silent reconnect 失敗時不顯示登入 modal、不阻塞畫面、不要求使用者確認。
- 「上傳備份／還原備份／練習天數同步」直接使用該次按鈕點擊作為 OAuth user gesture，不再要求先完成額外登入步驟。
- 互動式 token flow 改成單一 `prompt: ''` + `login_hint`，移除失敗後再強制 `select_account` 的第二段確認流程。
- 避免第一次點擊 Drive 按鈕時，capture-phase silent reconnect 與 Drive OAuth 同時執行造成 token callback race。

## 相容性

- IndexedDB：`pwa_vocabulary_v7`
- Backup Schema：V8
- Google Drive 備份格式與 checksum 規則不變
- Cloudflare Worker / D1 / Web Push 架構不變
- PWA Cache：`Voc-PWA-V7_2_3`
