import './jszip.min.js?v=3_10_1';
import {exportCsvFiles,importCsvFiles} from './data-operations.js?v=V7_5_0';
const MAX_SIZE=64*1024*1024,MAX_FILES=200;
self.onmessage=async({data})=>{
  const {id,action,payload}=data;
  const progress=message=>self.postMessage({id,progress:message});
  try{
    if(action==='pack'){
      progress('正在建立 CSV…');
      const files=exportCsvFiles(payload.collections,payload.dateTag,payload.compactDateTag);
      if(!files.length)throw new Error('NO_EXPORT_DATA');
      const zip=new self.JSZip();
      for(const file of files)zip.file(file.name,file.text);
      const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3}},
        meta=>progress('正在壓縮… '+Math.floor(meta.percent)+'%'));
      self.postMessage({id,ok:true,result:{bytes,count:files.length}},[bytes.buffer]);return;
    }
    if(action==='import'){
      const files=[];let expanded=0;
      for(const file of payload.files){
        if(file.bytes.byteLength>MAX_SIZE)throw new Error('IMPORT_TOO_LARGE');
        if(file.name.toLowerCase().endsWith('.zip')||file.type==='application/zip'){
          progress('正在讀取 ZIP…');
          const zip=await self.JSZip.loadAsync(file.bytes);
          const entries=Object.values(zip.files).filter(item=>!item.dir&&item.name.toLowerCase().endsWith('.csv'));
          if(entries.length+files.length>MAX_FILES)throw new Error('IMPORT_TOO_MANY_FILES');
          for(const entry of entries){
            if(expanded+Number(entry._data?.uncompressedSize||0)>MAX_SIZE)throw new Error('IMPORT_TOO_LARGE');
            const text=await entry.async('text');
            expanded+=new TextEncoder().encode(text).length;
            if(expanded>MAX_SIZE)throw new Error('IMPORT_TOO_LARGE');
            files.push({name:entry.name.split('/').pop(),text});
          }
        }else{
          expanded+=file.bytes.byteLength;if(expanded>MAX_SIZE)throw new Error('IMPORT_TOO_LARGE');
          files.push({name:file.name,text:new TextDecoder().decode(file.bytes)});
        }
      }
      if(files.length>MAX_FILES)throw new Error('IMPORT_TOO_MANY_FILES');
      progress('正在驗證與合併資料…');
      const result=importCsvFiles(payload.collections,files);
      self.postMessage({id,ok:true,result});return;
    }
    throw new Error('WORKER_ACTION_INVALID');
  }catch(error){self.postMessage({id,ok:false,error:error.message||'ZIP_ERROR'});}
};
