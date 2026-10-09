export function createModal() {
  let previousFocus, listener;
  const overlay=()=>document.getElementById('modal-overlay');
  const controls=()=>[...overlay().querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
  const busy=()=>[...overlay().querySelectorAll('button')].some(button=>button.disabled);
  return {
    show(html) {
      this.hide();previousFocus=document.activeElement;
      const content=document.getElementById('modal-content');content.innerHTML=html;
      const title=content.querySelector('.modal-title');if(title){title.id='active-modal-title';overlay().setAttribute('aria-labelledby',title.id);}else overlay().setAttribute('aria-label','操作視窗');
      overlay().classList.remove('hidden');overlay().setAttribute('aria-hidden','false');
      document.getElementById('app').inert=true;
      listener=event=>{
        if(event.key==='Escape'){event.preventDefault();if(!busy()){this.hide();window.dispatchEvent(new Event('ui-modal-dismiss'));}}
        if(event.key==='Tab'){const items=controls();if(!items.length){event.preventDefault();return;}const index=items.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();items.at(-1).focus();}else if(!event.shiftKey&&(index===items.length-1||index<0)){event.preventDefault();items[0].focus();}}
      };
      document.addEventListener('keydown',listener);
      overlay().onclick=event=>{if(event.target===overlay()&&!busy()){this.hide();window.dispatchEvent(new Event('ui-modal-dismiss'));}};
      requestAnimationFrame(()=>controls()[0]?.focus());
    },
    hide() {
      if(listener)document.removeEventListener('keydown',listener);listener=null;
      overlay().classList.add('hidden');overlay().setAttribute('aria-hidden','true');overlay().removeAttribute('aria-labelledby');
      document.getElementById('app').inert=false;
      if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
    }
  };
}

export function initViewport() {
  const update=()=>{
    const viewport=window.visualViewport;
    document.documentElement.style.setProperty('--visible-height',(viewport?.height||window.innerHeight)+'px');
    const focused=document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]');
    const keyboard=!!focused&&window.innerHeight-(viewport?.height||window.innerHeight)>120;
    document.documentElement.classList.toggle('keyboard-open',keyboard);
    if(keyboard&&document.activeElement.id!=='quiz-ghost-input')requestAnimationFrame(()=>document.activeElement.scrollIntoView({block:'nearest'}));
  };
  window.visualViewport?.addEventListener('resize',update);window.addEventListener('resize',update);
  document.addEventListener('focusin',update);document.addEventListener('focusout',()=>requestAnimationFrame(update));update();
}

export function decorateControls(root) {
  root.querySelectorAll('.radio-option').forEach(option=>{
    option.tabIndex=0;option.setAttribute('role','radio');option.setAttribute('aria-checked',String(option.classList.contains('selected')));
    option.onkeydown=event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();option.click();}};
    option.addEventListener('click',()=>{option.parentElement.querySelectorAll('.radio-option').forEach(peer=>peer.setAttribute('aria-checked',String(peer.classList.contains('selected'))));});
    option.parentElement.setAttribute('role','radiogroup');
  });
}

export function groupSettings(container, storage) {
  const wrap=container.querySelector('.settings-wrap');if(!wrap||wrap.querySelector('.settings-group'))return;
  const specs=[['system','系統更新'],['account','帳號與同步'],['data','資料管理'],['appearance','外觀與音效'],['notifications','通知提醒']];
  const groups=new Map(specs.map(([id,title])=>{
    const group=document.createElement('details');group.className='settings-group';group.id='settings-'+id;
    group.open=storage.getItem('settingsGroup:'+id)==='open'||(storage.getItem('settingsGroup:'+id)==null&&['account','system'].includes(id));
    const summary=document.createElement('summary');summary.textContent=title;group.append(summary);
    const body=document.createElement('div');body.className='settings-group-body';group.append(body);
    group.addEventListener('toggle',()=>{const key='settingsGroup:'+id,value=group.open?'open':'closed';if(storage.getItem(key)!==value)storage.setItem(key,value);});
    return [id,{group,body}];
  }));
  let destination='account';
  for(const child of [...wrap.children]) {
    if(child.classList.contains('settings-section-label')) {
      const label=child.textContent.trim();
      destination=/版本資訊/.test(label)?'system':/主題|音效/.test(label)?'appearance':/提醒/.test(label)?'notifications':/匯出|資料狀態/.test(label)?'data':'account';
    }
    if(child.tagName==='INPUT'&&child.type==='file')wrap.append(child);
    else groups.get(destination).body.append(child);
  }
  const nav=document.createElement('nav');nav.className='settings-quick-nav';nav.setAttribute('aria-label','設定分類');
  for(const [id,title] of specs){const button=document.createElement('button');button.textContent=title;button.onclick=()=>{const group=groups.get(id).group;group.open=true;group.scrollIntoView({block:'start',behavior:'smooth'});};nav.append(button);}
  wrap.prepend(nav);for(const [id]of specs)wrap.append(groups.get(id).group);
  wrap.querySelectorAll('.settings-collapsible-card').forEach((group,index)=>{
    const key='settingsDataSection:'+index;group.open=storage.getItem(key)==='open';
    group.addEventListener('toggle',()=>{const value=group.open?'open':'closed';if(storage.getItem(key)!==value)storage.setItem(key,value);});
  });
}

let zipPromise;
export function loadZip() {
  if(window.JSZip)return Promise.resolve(window.JSZip);
  if(zipPromise)return zipPromise;
  zipPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='./jszip.min.js?v=3_10_1';
    const timer=setTimeout(()=>{script.remove();zipPromise=null;reject(new Error('ZIP_LOAD_TIMEOUT'));},12000);
    script.onload=()=>{clearTimeout(timer);if(window.JSZip)resolve(window.JSZip);else{zipPromise=null;reject(new Error('ZIP_LOAD_FAILED'));}};
    script.onerror=()=>{clearTimeout(timer);script.remove();zipPromise=null;reject(new Error('ZIP_LOAD_FAILED'));};document.head.append(script);
  });return zipPromise;
}

export function boundHistory(container, selector='.essay-session-card,.essay-flat-row,.rec-row') {
  const items=[...container.querySelectorAll(selector)];if(items.length<=40)return;
  let limit=40;const more=document.createElement('button');more.className='db-load-more';
  const update=()=>{items.forEach((item,index)=>item.hidden=index>=limit);more.textContent=`顯示更多記錄（${Math.min(limit,items.length)} / ${items.length}）`;more.hidden=limit>=items.length;};
  more.onclick=()=>{limit+=40;update();};items.at(-1).after(more);update();
}
