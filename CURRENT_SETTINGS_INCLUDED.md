# V7.5.0 相容性與設定

基準為 GitHub main 的 V7.4.2，commit `9e2327562fcbfdf5208f256b8b3211f11b389a55`。

| 項目 | V7.5.0 |
|---|---|
| Pages | 保留 `https://lihe-source.github.io/PWA-Vocabulary-GD/` |
| 本機資料庫 | 保留 `pwa_vocabulary_v7`，實體版本 1 |
| 備份 | Schema V8；接受 V7 checksum 舊備份 |
| 原推播 Worker | 保留 `vocabulary-daily-reminder`、公開網址、每分鐘 Cron 與原 D1 ID |
| 推播 Secrets | 未讀取或修改；VAPID 私鑰不在交付包 |
| Google 舊模式 | token 仍僅存於 sessionStorage；普通點擊不觸發續權 |
| Google 新模式 | 獨立授權 Worker／D1，PWA 保存不含 Google token 的裝置憑證 |
| Recovery | 原 snapshots store 保留；加入 KV 中繼資料索引；最多五份 |
| API key／偏好 | 原 IndexedDB／localStorage 鍵名保留 |
| Manifest | ID、start_url、scope 保留，orientation 放寬為 any |
| 遠端操作 | 未部署、未 push、未變更 Google 或 Cloudflare 設定 |

新增授權設定檔使用明確的待填值；不會自行建立 D1、讀取 Google Client Secret，或把登入後端套用到原推播服務。
