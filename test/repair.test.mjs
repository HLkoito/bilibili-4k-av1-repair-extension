import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const root = new URL('../', import.meta.url);
const source = await fs.readFile(new URL('extension/repair-core.js', root), 'utf8');
const hook = await fs.readFile(new URL('extension/mse-hook.js', root), 'utf8');
const context = vm.createContext({ Uint8Array, ArrayBuffer, DataView, Map, WeakMap, performance });
vm.runInContext(source, context);
const core = context.__AV1RepairCore;

function words(...values) { const b = Buffer.alloc(values.length * 4); values.forEach((v,i) => b.writeUInt32BE(v,i*4)); return b; }
function box(type,...parts) { const payload=Buffer.concat(parts); return Buffer.concat([words(payload.length+8),Buffer.from(type),payload]); }
function leb(value) { const out=[]; do { let b=value&127;value=Math.floor(value/128);if(value)b|=128;out.push(b); }while(value);return Buffer.from(out); }
function obu(type,payload) { return Buffer.concat([Buffer.from([(type<<3)|2]),leb(payload.length),payload]); }
function metadata(signature='TencentStreamSEI',tail=0x88) { return obu(5,Buffer.concat([Buffer.from([4,0x26]),Buffer.from(signature),Buffer.from([1,tail])])); }
const frame=obu(6,Buffer.from([0x22,0x33,0x44])); // Synthetic parser fixture, not playable video.
function init(codec='av01') {
  const tkhd=box('tkhd',words(0,0,0,1));
  const stsd=box('stsd',words(0,1),box(codec));
  const trak=box('trak',tkhd,box('mdia',box('minf',box('stbl',stsd))));
  return Buffer.concat([box('ftyp',Buffer.from('isom'),words(0)),box('moov',trak,box('mvex',box('trex',words(0,1,1,0,0,0))))]);
}
function fragment(samples) {
  const tfhd=box('tfhd',words(0x020000,1));
  const run=offset=>box('trun',words(0x000201,samples.length,offset,...samples.map(s=>s.length)));
  let moof=box('moof',box('traf',tfhd,run(0)));
  moof=box('moof',box('traf',tfhd,run(moof.length+8)));
  return Buffer.concat([moof,box('mdat',...samples)]);
}

test('only known malformed metadata is changed; image bytes and valid/unrelated metadata survive',()=>{
  const sample=Buffer.concat([metadata(),metadata('TencentStreamSEI',128),metadata('UnrelatedVendor',0x88),frame]);
  const input=fragment([sample]),before=Buffer.from(input),r=core.repairSegment(input,core.readInit(init()));
  assert.equal(r.repaired,1);assert.equal(r.metadata,3);assert.equal(r.output.length,input.length);
  assert.deepEqual(input,before,'input buffer must not be mutated');
  const expected=Buffer.from(input);
  for(const e of r.edits){expected[e.head]=(expected[e.head]&~0x78)|(15<<3);expected.fill(0,e.payload,e.end);expected[e.end-1]=128;}
  assert.deepEqual(Buffer.from(r.output),expected);
  assert.equal(core.repairSegment(r.output,core.readInit(init())).repaired,0);
  assert.deepEqual(Buffer.from(core.repairSegment(input,core.readInit(init()),false).output),input);
});

test('non-AV1 tracks are passed through without edits',()=>{
  const input=fragment([Buffer.concat([metadata(),frame])]);
  assert.deepEqual(Buffer.from(core.repairSegment(input,core.readInit(init('avc1'))).output),input);
});

test('truncated OBU and MP4 structures fail instead of making guessed edits',()=>{
  assert.throws(()=>core.inspectSample(Buffer.from([0x2a,100,4])));
  assert.throws(()=>core.readInit(Buffer.from([0,0,0,100,109,111,111,118])));
  const input=fragment([Buffer.concat([metadata(),frame])]);assert.throws(()=>core.repairSegment(input.subarray(0,input.length-1),core.readInit(init())));
});

test('MSE hook handles complete and separate moof/mdat appends and keeps append order',()=>{
  class SourceBuffer { received=[]; appendBuffer(data){this.received.push(data);} }
  const world=vm.createContext({ Uint8Array,ArrayBuffer,DataView,Map,WeakMap,SourceBuffer,performance });
  vm.runInContext(source+'\n'+hook,world);
  const initialization=init(),input=fragment([Buffer.concat([metadata(),frame]),Buffer.concat([metadata(),frame])]);
  const expected=Buffer.from(core.repairSegment(input,core.readInit(initialization)).output);
  const whole=new SourceBuffer();whole.appendBuffer(initialization);whole.appendBuffer(input);
  assert.equal(whole.received[0],initialization);assert.deepEqual(Buffer.from(whole.received[1]),expected);
  const split=new SourceBuffer();split.appendBuffer(initialization);
  for(const b of core.boxes(input))split.appendBuffer(input.subarray(b.start,b.end));
  assert.equal(split.received.length,3);assert.deepEqual(Buffer.concat(split.received.slice(1).map(x=>Buffer.from(x))),expected);
  assert.equal(world.__AV1RepairDiagnostics.repaired,4);assert.equal(world.__AV1RepairDiagnostics.errors,0);
  const broken=Buffer.from([0,0,0,100,109,111,111,118]);whole.appendBuffer(broken);assert.equal(whole.received.at(-1),broken);
});

test('manifest is standalone and page scripts do not add UI or make network requests',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('extension/manifest.json',root),'utf8'));
  assert.equal(manifest.version,'0.3.1');assert.equal(manifest.background,undefined);assert.equal(manifest.permissions,undefined);assert.equal(manifest.host_permissions,undefined);
  assert.equal(manifest.content_scripts.length,1);assert.equal(manifest.content_scripts[0].world,'MAIN');assert.equal(manifest.content_scripts[0].all_frames,true);
  for(const name of manifest.content_scripts[0].js)await fs.access(new URL('extension/'+name,root));
  assert.doesNotMatch(source+'\n'+hook,/\bdocument\b|\bfetch\s*\(|XMLHttpRequest|WebSocket|localhost|127\.0\.0\.1|17890|postMessage/);
});

test('popup opens only valid room URLs, without needing a local service',async()=>{
  let submit,closed=0;const opened=[];
  const nodes={'open-room':{addEventListener:(_,fn)=>submit=fn},url:{value:''},error:{hidden:true,textContent:''}};
  const world=vm.createContext({URL,document:{getElementById:id=>nodes[id]},chrome:{tabs:{create:async ({url})=>opened.push(url)}},window:{close:()=>closed++}});
  vm.runInContext(await fs.readFile(new URL('extension/popup.js',root),'utf8'),world);
  nodes.url.value='live.bilibili.com/100';await submit({preventDefault(){}});assert.deepEqual(opened,['https://live.bilibili.com/100']);assert.equal(closed,1);
  for(const value of ['https://live.bilibili.com.evil.example/100','javascript:alert(1)','https://live.bilibili.com:8443/100']){
    nodes.url.value=value;await submit({preventDefault(){}});assert.equal(opened.length,1);assert.equal(nodes.error.hidden,false);
  }
});
