// Retry reads only. A timed-out upload can already exist remotely.
export async function request(url, options = {}, {timeout=30000, retries=1, responseType='json', signal} = {}) {
  const externalSignal=options.signal||signal;
  const method = (options.method || 'GET').toUpperCase();
  const retryable = method === 'GET' || method === 'HEAD';
  for (let attempt=0;;attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (externalSignal?.aborted) throw new Error('REQUEST_CANCELLED');
    externalSignal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(abort, timeout);
    let retryDelay = 500 * (2 ** attempt);
    try {
      const res = await fetch(url, {...options,signal:controller.signal});
      const header = res.headers.get('Retry-After');
      if (header) retryDelay = Math.min(10000, Math.max(500, Number(header)*1000 || Date.parse(header)-Date.now() || 500));
      if (!res.ok) {
        const err = new Error(res.status === 401 ? 'TOKEN_EXPIRED' : res.status === 403 ? 'PERMISSION_DENIED' : `HTTP_${res.status}`);
        let detail;try{detail=await res.json();}catch{}
        const message=typeof detail?.error==='string'?detail.error:detail?.error?.message;
        if(message && /^[A-Z_]+$/.test(message))err.message=message;
        else if(message)err.message=String(message).slice(0,500);
        err.status = res.status;
        err.retryable = [429,500,502,503,504].includes(res.status);
        throw err;
      }
      // Keep the timeout active while reading the response body, too.
      const data = responseType === 'text' ? await res.text() : responseType === 'none' ? null : await res.json();
      return {data,status:res.status,headers:res.headers};
    } catch (error) {
      if (externalSignal?.aborted) throw new Error('REQUEST_CANCELLED');
      const failure = error?.name === 'AbortError' ? new Error('REQUEST_TIMEOUT') : error;
      if (!retryable || attempt >= retries || !(error.retryable || error.name === 'AbortError' || error instanceof TypeError)) throw failure;
    } finally {
      clearTimeout(timer);externalSignal?.removeEventListener('abort',abort);
    }
    await new Promise(resolve=>setTimeout(resolve,retryDelay));
  }
}

export function readableError(error) {
  const key=error?.message || '';
  const messages={
    REQUEST_TIMEOUT:'連線逾時，請稍後重試。若正在上傳，請先檢查備份清單，避免重複上傳。',
    REQUEST_CANCELLED:'已取消操作',
    TOKEN_EXPIRED:'Google 授權已到期，請再次按下這個操作按鈕完成授權',
    PERMISSION_DENIED:'Google 拒絕存取，請確認 Drive 權限及資料夾設定',
    GIS_LOAD_FAILED:'Google 登入元件載入失敗，請確認網路後重試',
    AUTH_TIMEOUT:'Google 授權等待逾時，請再試一次',
    popup_closed:'已關閉 Google 授權視窗',
    popup_failed_to_open:'Google 授權視窗被阻擋，請允許此網站的彈出視窗',
    TASK_ALREADY_RUNNING:'目前有資料操作正在處理，請稍候再試',
    CLOUD_RECONNECT_REQUIRED:'Google 連線需要重新授權，請在設定頁按「連結 Google」',
    AUTH_NOT_CONFIGURED:'免彈窗登入服務尚未完成設定，請依部署說明設定 Cloudflare 後端',
    AUTH_CLIENT_MISMATCH:'後端 Client ID 與原設定不一致；請沿用原本的 Google Web Client ID',
    INVALID_AUTH_URL:'請填入正確的 HTTPS Worker 網址（只需網址，不含路徑）',
    INVALID_AUTH_SERVICE:'這個網址不是 Vocabulary Google Auth 服務',
    INVALID_FOLDER:'Google Drive 資料夾 ID 格式不正確，請確認設定',
    CSV_UNCLOSED_QUOTE:'CSV 引號未完整關閉，原始資料未變更',
    AUTH_ATTEMPT_EXPIRED:'授權流程已逾時，請重新按「連結 Google」',
    RETURN_TO_ORIGINAL_PWA:'請回到原本開啟的 PWA，程式會確認這次 Google 連結狀態',
    GOOGLE_TIMEOUT:'Google 回應逾時，請稍後重試',
    GOOGLE_TEMPORARILY_UNAVAILABLE:'Google 暫時無法連線，本機資料仍可使用',
    GOOGLE_AUTH_FAILED:'Google 授權未完成，請重新連結',
    API_TIMEOUT:'AI 回應逾時，草稿仍保留，請稍後重試',
    IMPORT_TOO_LARGE:'匯入檔案過大；ZIP 展開後上限為 64 MB',
    IMPORT_TOO_MANY_FILES:'匯入檔案數量過多，單次上限為 200 個 CSV',
    NO_EXPORT_DATA:'尚無資料可匯出',
    STORAGE_CONFLICT:'另一個分頁已修改資料，已停止覆蓋。請先重新開啟並確認資料。',
    LOCAL_DATA_CHANGED:'處理期間本機資料已變更，已停止還原，請重新選擇備份',
    SNAPSHOT_UNAVAILABLE:'無法建立復原點，已停止還原',
    WORKER_TIMEOUT:'資料處理逾時，原始資料未變更',
    WORKER_UNAVAILABLE:'背景資料處理無法啟動，請重新開啟程式後再試'
  };
  if (error?.name === 'QuotaExceededError') return '儲存空間不足，資料尚未成功寫入；請先匯出備份並釋放空間';
  return messages[key] || (key.startsWith('BACKUP_INVALID_') ? '備份格式或內容驗證失敗，原始資料未變更（'+key.replace('BACKUP_INVALID_','')+'）' : key || '操作失敗，請稍後重試');
}
