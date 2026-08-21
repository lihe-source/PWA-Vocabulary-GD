# V7.2.3 無阻塞 Google Drive 登入架構

## 啟動順序

1. 載入 IndexedDB / 本機設定。
2. `Router._doNavigate('home')` 直接 render 主畫面。
3. 背景 preload Google Identity Services。
4. 僅從目前 PWA session 的 `sessionStorage` 恢復仍有效 access token。
5. 不在 page-load 階段呼叫互動式 `requestAccessToken()`。
6. 已記住帳號時，第一次一般 pointer/keyboard 操作才嘗試 `prompt:'none'` 無 UI reconnect。
7. 成功後才執行 Drive auto-sync / streak sync；失敗則保持本機功能可用。

## Drive 操作

使用者按上傳、下載或同步時，該按鈕 click 即為 OAuth user gesture。`ensureToken({interactive:true})` 直接用 `prompt:''` 與已記住的 `login_hint` 取得 token，不再先要求獨立的 Google 登入按鈕，也不再自動追加 `select_account` 第二輪流程。

## 安全界線

Google GIS Token Model 不提供瀏覽器 SPA 可長期保存的 refresh token。Access token 過期且 Google session 需要重新驗證時，Google 官方授權 UI 可能仍需出現。若要真正做到跨 PWA 關閉後完全無互動取得 Drive token，需要改為 Authorization Code flow，並由可信任後端安全保存 refresh token；V7.2.3 不引入此安全面較大的架構變更。
