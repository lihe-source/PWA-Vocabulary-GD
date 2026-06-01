# V5.4 更新紀錄

## 修復
- 修復資料庫頁面 AI 查詢/翻譯容易失敗的問題。
- 強化 Gemini 回傳 JSON 解析，支援 markdown fence、thinking 文字與不完整格式干擾。
- AI 查詢錯誤訊息改為可讀原因，包含 API Key、模型不可用、配額與網路錯誤。

## AI 模型清單更新
- 依 2026/05/31 前後 Gemini API / AI Studio 可用狀態更新文字模型選項。
- 移除已進入 2026/06/01 下線邊緣的 Gemini 2.0 Flash / Flash-Lite。
- 修正 Gemini 3.1 Pro 使用 `gemini-3.1-pro-preview`。
- 預設推薦模型改為 `gemini-3.5-flash`。

## 版本
- App 顯示版本更新為 V5_4 / V5.4。
- Service Worker cache 更新為 `Voc-PWA-V5_4`。
