# PWA Vocabulary GD - V6.0

## 本次重點

- 優化練習模式「單字拼寫」輸入效能，降低 key in 字母時的卡頓與延遲。
- 將輸入流程改為 `beforeinput` 快速處理 + `input` 備援，讓畫面可更快更新字母格。
- 保留 iOS 中文鍵盤/組字輸入防重複處理：忽略中間組字，只處理已提交字元。
- 字母格畫面改為增量更新，只更新變動字母與游標位置，避免每次輸入都重繪全部格子。
- 調整隱藏輸入框設定，降低 iOS 原生輸入框裝飾與捲動造成的延遲。
- 增加字母格 CSS containment，減少輸入時的 layout / paint 影響範圍。

## 版本

- App Version: V6_0
- Display Version: V6.0
- Service Worker Cache: Voc-PWA-V6_0
