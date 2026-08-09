# V7.2.0 練習天數架構

## 版本基準

| 項目 | 版本 |
|---|---|
| 顯示版本 | V7.2.0 |
| 內部版本 | V7_2_0 |
| IndexedDB 邏輯 Schema | 8 |
| 完整備份 Schema | 8 |
| Service Worker Cache | Voc-PWA-V7_2_0 |
| 專用雲端資料格式 | study-streak schema 1 |

## 模組責任

| 檔案 | 責任 |
|---|---|
| `study-streak.js` | 日期正規化、同日去重、目前／最久連續天數、歷史遷移、CSV、聯集合併 |
| `storage.js` | 將 `studyActivityDays` 儲存在既有 IndexedDB KV Store，離線可寫入 |
| `app.js` | 四種完成事件、主頁／設定頁 UI、Google Drive 同步與完整備份整合 |
| `backup-schema.js` | Schema V8 checksum、`studyDays` 計數及 Schema V7 相容驗證 |
| `sw.js` | 快取 V7.2.0 新模組並清除舊版本 Cache |

## 本機資料

`studyActivityDays` 是以日期為單位的陣列：

```json
{
  "date": "2026-08-09",
  "timezone": "Asia/Taipei",
  "activities": ["word_quiz", "reading_quiz"],
  "eventIds": ["device-id:event-id"],
  "sessionCount": 2,
  "firstActivityAt": "2026-08-09T01:00:00.000Z",
  "lastActivityAt": "2026-08-09T04:00:00.000Z"
}
```

`eventIds` 用於跨裝置去重；`activities` 只接受 `word_quiz`、`reading_quiz`、`essay_review`、`ai_ask`。

## 同步流程

1. 完成練習後先寫入本機，標記 `studyStreakSyncPending`。
2. 已登入且有網路時讀取 Google Drive 的 `vocab_study_streak.json`。
3. 依日期、活動與事件 ID 取本機和雲端聯集。
4. 寫回雲端並再次讀取驗證；正常競爭情況最多進行兩輪。
5. 將聯集結果存回本機並更新 `studyStreakLastSync`。

同步觸發點：完成練習、Google 登入、PWA 啟動、網路恢復、手動「立即同步」、上傳完整備份與還原備份。

## 備份流程

- Google Drive 完整 JSON：頂層新增 `studyDays`，Schema 8 checksum 包含此集合。
- 一鍵 ZIP：新增 `study_days_YYYYMMDD.csv`。
- Schema 7／V7.1.0：沿用舊 checksum 規則驗證，還原後從四類歷史自動推導練習日。
- 覆蓋還原前仍會建立既有的 IndexedDB 本機復原點。
