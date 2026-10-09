import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root=new URL('.',import.meta.url),entries=await readdir(root,{withFileTypes:true});
assert.equal(entries.some(entry=>entry.isDirectory()),false,'Release must be flat');
for(const entry of entries.filter(entry=>/\.(?:js|mjs)$/.test(entry.name))){const result=spawnSync(process.execPath,['--check',new URL(entry.name,root).pathname],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
const version=JSON.parse(await readFile(new URL('version.json',root),'utf8')),sw=await readFile(new URL('sw.js',root),'utf8');
const assets=[...sw.matchAll(/'\.\/([^']+)'/g)].map(match=>match[1]).filter(name=>name!=='');
for(const asset of assets){const [file]=asset.split('?');await readFile(new URL(file,root));}
for(const entry of entries.filter(entry=>/\.(?:js|html)$/.test(entry.name)&&!entry.name.startsWith('test-')&&entry.name!=='jszip.min.js')){
  const text=await readFile(new URL(entry.name,root),'utf8');
  for(const match of text.matchAll(/(?:from\s+|import\()(['"])\.\/([^'"]+)\1/g)){
    const path=match[2];await readFile(new URL(path.split('?')[0],root));
    if(path.includes('?v=V'))assert.equal(path.split('?v=')[1],version.version,'Mixed module versions');
    assert.ok(sw.includes('./'+path),'Module missing from SW shell: '+path);
  }
}
assert.equal(JSON.parse(await readFile(new URL('package.json',root),'utf8')).version,version.displayVersion.slice(1));
console.log(`All scripts valid; ${version.displayVersion} module imports and cache assets are consistent; release is flat.`);
