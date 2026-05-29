# V5.3 更新紀錄

## Google 登入持續性優化
- 改寫 Google Drive OAuth Session 管理。
- 保留已登入帳號 Email、Client ID、Scope、Token 到期時間與最後登入時間。
- App 重新開啟時會先復原仍有效的 access token。
- Token 過期時不再直接清空登入帳號，而是保留「已記住帳號」狀態。
- 使用者按「上傳備份」或「還原備份」時，會先嘗試靜默續權；若 iOS PWA / Safari 阻擋靜默續權，會在該次使用者操作中呼叫 Google 授權 UI 重新確認。
- 登出時才完整清除 Google 登入資訊。

## 版本更新
- App 顯示版本更新為 V5_3。
- Service Worker cache 更新為 Voc-PWA-V5_3。
- 新增 version.json，便於後續部署版本檢查。

## 注意
Google 前端 OAuth 無法在純前端 PWA 中取得長效 refresh token；因此 V5.3 採用「記住帳號 + 有效 token 復原 + 互動式自動續權」設計，已是無後端架構下較穩定的方案。
