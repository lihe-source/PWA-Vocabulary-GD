# V7.1.0 更新紀錄

## 每日系統通知

- 設定頁新增「每日學習提醒」。
- 使用者可選擇每天的提醒時間。
- 支援 iOS 主畫面 PWA 關閉、鎖定畫面或不在前景時接收 Web Push。
- 新增即時測試通知與關閉提醒按鈕。
- 顯示通知權限、PWA 安裝狀態、時區及下次預計提醒時間。
- 每台裝置使用獨立管理憑證，提醒設定不會錯誤移轉到其他裝置。

## 推播後端

- 新增 Cloudflare Worker Web Push API。
- 新增 D1 排程資料表與每分鐘 Cron Trigger。
- 支援使用者時區及跨日排程。
- 到期訂閱會自動移除；暫時性失敗會有限次重試。
- VAPID 私鑰只保存在 Cloudflare Secrets，不進入前端或 GitHub。
- API 使用允許來源限制與每台裝置的 Bearer 管理憑證。

## PWA 與更新

- Service Worker 新增 `push` 與 `notificationclick` 處理。
- 點擊通知可回到 PWA。
- 新增推播模組的離線快取。
- 版本與快取更新至 V7.1.0。
- 保留原有啟動自動檢查更新及設定頁手動檢查更新。

## 部署文件

- 新增 GitHub Pages、Cloudflare Worker、D1、VAPID 及 iPhone 啟用完整指南。
- 新增可手動觸發的 GitHub Actions Worker 部署流程。
- 新增環境檢查、驗收條件及常見錯誤排查。
