# PWA Vocabulary GD V7.0.2（扁平部署版）

此版本專為手機直接上傳 GitHub 儲存庫設計。所有執行檔均位於根目錄，沒有任何子資料夾。

## V7.0.2 更新

- 恢復單字拼寫測驗答對音效、答錯音效。
- 恢復測驗結果依正確率播放的分級音效。
- 強化 iPhone／iOS PWA 的 Web Audio 解鎖與中斷後恢復。
- 答題完成時先停止單字發音，避免 TTS 與答題音效互相衝突。
- 單字輸入改由瀏覽器原生輸入流程處理，不再逐字攔截並回寫輸入框。
- 每次輸入只更新變動的字母框，減少 DOM、版面與鍵盤同步負擔。
- 使用 DocumentFragment 一次建立字母框，並在答案判定期間鎖定輸入，避免重複事件。

## 部署方式

將本資料夾內的所有檔案上傳到 GitHub Pages 使用的分支根目錄即可。請勿遺漏任何 `.js`、`.css`、`.json` 或圖示檔。

## 必須上傳的檔案

`.nojekyll`、`index.html`、`app.js`、`style.css`、`sw.js`、`manifest.json`、`version.json`、`storage.js`、`backup-schema.js`、`version-manager.js`、`chart-renderer.js`、`jszip.min.js`、`icon-192.png`、`icon-512.png`。

`README.md` 與 `JSZIP-LICENSE.md` 不影響程式執行，但建議一併保留。
