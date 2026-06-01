# V5.5 更新紀錄

## 修復資料庫 AI 查詢翻譯仍失敗
- 修正 Gemini 回傳「User location is not supported for the API use」時，資料庫頁只顯示失敗、無法產生查詢結果的問題。
- 新增公開字典與公開翻譯備援流程：Gemini 因地區/網路限制失敗時，會自動嘗試 dictionaryapi.dev + MyMemory 翻譯，至少提供單字、詞性、音標、中文翻譯/定義。
- 資料庫頁會標示該筆結果是否使用備援來源，避免誤判為 Gemini 成功。
- 錯誤訊息改為明確說明「地區/網路限制」而不是只提示更換模型。

## AI 模型清單
- 保留 2026/05/31 前後 Gemini API / AI Studio 可用的文字模型選項。
- 移除已 deprecated 或已 shut down 的舊模型選項，降低查詢失敗率。

## 版本
- App 顯示版本更新為 V5_5 / V5.5。
- Service Worker cache 更新為 `Voc-PWA-V5_5`。
