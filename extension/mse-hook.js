(() => {
  'use strict';
  if(!globalThis.SourceBuffer||globalThis.__AV1RepairMseInstalled)return;
  globalThis.__AV1RepairMseInstalled=true;
  const core=globalThis.__AV1RepairCore,states=new WeakMap(),native=SourceBuffer.prototype.appendBuffer;
  const stats={calls:0,initializations:0,codecs:[],segments:0,repaired:0,samples:0,processMs:0,errors:0,lastError:''};
  const seen=new Set();
  Object.defineProperty(globalThis,'__AV1RepairDiagnostics',{configurable:true,get:()=>({...stats,boxTypes:[...seen]})});
  Object.defineProperty(SourceBuffer.prototype,'appendBuffer',{configurable:true,writable:true,value:function(input){
    stats.calls++;let replacement=input,state=states.get(this);if(!state){state={init:null,pending:null};states.set(this,state);}
    try{const data=core.bytes(input);if(data.length>=8){const tag=String.fromCharCode(...data.subarray(4,8));seen.add(tag);if(['ftyp','moov','styp','sidx','moof','mdat','emsg','free','prft'].includes(tag)){
      const top=core.boxes(data);if(top.some(x=>x.type==='moov')){state.init=core.readInit(data);state.pending=null;stats.initializations++;stats.codecs=[...state.init.tracks.values()];}
      if(state.init&&[...state.init.tracks.values()].includes('av01')){
        const hasMoof=top.some(x=>x.type==='moof'),hasMdat=top.some(x=>x.type==='mdat');
        if(hasMoof&&!hasMdat){if(data.length>1024*1024)throw Error('Fragment header exceeds limit');state.pending=data.slice();}
        else if(hasMdat&&(hasMoof||state.pending)){
          let complete=data,offset=0;
          if(!hasMoof){offset=state.pending.length;complete=new Uint8Array(offset+data.length);complete.set(state.pending);complete.set(data,offset);}
          state.pending=null;
          const started=performance.now(),r=core.repairSegment(complete,state.init);stats.segments++;stats.samples+=r.samples;stats.repaired+=r.repaired;stats.processMs+=performance.now()-started;
          if(r.repaired)replacement=r.output.subarray(offset);
        }
      }
    }}}catch(e){stats.errors++;stats.lastError=String(e.message);}
    return Reflect.apply(native,this,[replacement]);
  }});
})();
