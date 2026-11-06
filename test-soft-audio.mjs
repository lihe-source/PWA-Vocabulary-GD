import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('app.js',import.meta.url),'utf8');
function setup(){
  const nodes=[];
  const parameter=()=>({events:[],setValueAtTime(...v){this.events.push(['set',...v]);},linearRampToValueAtTime(...v){this.events.push(['linear',...v]);},exponentialRampToValueAtTime(...v){this.events.push(['exponential',...v]);}});
  const ctx={currentTime:10,state:'running',destination:{},createOscillator(){const n={type:'sine',frequency:parameter(),connect(){},disconnect(){this.disconnected=true;},start(t){this.started=t;},stop(t){this.stopped=t;}};nodes.push(n);return n;},createGain(){const n={gain:parameter(),connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;}};
  const sound=vm.runInNewContext(source.slice(source.indexOf('const Sound ='),source.indexOf('// Prime/resume'))+'\nSound;',{window:{AudioContext:class {constructor(){return ctx;}}}});
  sound._withCtx=(fn)=>fn(ctx);
  return {sound,ctx,nodes};
}
test('wrong cue uses a quiet low sine with smooth attack/release and cleans up nodes',()=>{
  const {sound,nodes}=setup();sound.playWrong();assert.equal(nodes.length,2);
  const [osc,gain]=nodes;assert.equal(osc.type,'sine');assert.equal(osc.frequency.events[0][1],220);assert.equal(osc.frequency.events[1][1],174.61);
  assert.equal(gain.gain.events[0][1],0);assert.equal(gain.gain.events.at(-1)[1],0);
  assert.ok(Math.max(...gain.gain.events.map(e=>e[1]))<=0.12);
  assert.ok(osc.stopped>osc.started);osc.onended();assert.ok(osc.disconnected&&gain.disconnected);
});
test('rapid wrong cues do not stack and a new context resets the guard',()=>{
  const {sound,ctx,nodes}=setup();sound.playWrong();ctx.currentTime+=0.1;sound.playWrong();assert.equal(nodes.length,2);
  ctx.currentTime+=0.3;sound.playWrong();assert.equal(nodes.length,4);
  ctx.currentTime=0;sound.ctx={state:'closed'};sound._getCtx();sound.playWrong();assert.equal(nodes.length,6);
});
test('all score bands and correct cues use bounded sine tones',()=>{
  for(const score of [0,20,40,60,80,100]){
    const {sound,nodes}=setup();sound.playResult(score);
    assert.ok(nodes.length>=4);
    for(const n of nodes){if(n.frequency){assert.equal(n.type,'sine');assert.ok(n.frequency.events.every(e=>e[1]<=784));}else{assert.ok(n.gain.events.every(e=>e[1]<=0.11));}}
  }
  const {sound,nodes}=setup();sound.playCorrect();assert.equal(nodes.length,4);assert.ok(nodes.filter(n=>n.frequency).every(n=>n.type==='sine'));
});
