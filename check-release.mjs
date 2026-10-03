import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const files=readdirSync(new URL('.',import.meta.url));
for(const name of files.filter(name=>/\.(js|mjs)$/.test(name)))execFileSync(process.execPath,['--check',name],{stdio:'pipe'});
for(const name of files.filter(name=>/\.(js|mjs|html)$/.test(name))){
  const source=readFileSync(name,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\(?|src=)["'](\.\/[^"']+)["']/g)){
    if(!existsSync(match[1].split('?')[0]))throw new Error(`${name}: missing local dependency ${match[1]}`);
  }
}
const version=JSON.parse(readFileSync('version.json','utf8'));
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const sw=readFileSync('sw.js','utf8');
if(pkg.version!==version.displayVersion?.replace(/^V/,''))throw new Error('Package/display version mismatch');
if(!sw.includes('Voc-PWA-'+version.version))throw new Error('Service Worker cache version mismatch');
console.log(`Syntax and dependency checks passed (${files.filter(name=>/\.(js|mjs)$/.test(name)).length} files).`);
