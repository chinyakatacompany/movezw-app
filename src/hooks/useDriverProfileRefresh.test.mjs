import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./useDriverProfileRefresh.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
test('driver profile changes arrive without reload and errors retain last approved state',async()=>{
 let effect,cleanup,change,poll;
 let row={id:'profile',verification_status:'pending'},error=null;
 const seen=[];
 const channel={on(_type,filter,callback){assert.equal(filter.filter,'user_id=eq.driver');change=callback;return this;},subscribe(){return this;}};
 const query={select(){return this;},eq(){return this;},order(){return this;},async limit(){return {data:[row],error};}};
 const context=vm.createContext({useEffect:fn=>{effect=fn;},supabase:{from:()=>query,channel:()=>channel,removeChannel(){}},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},setInterval:fn=>{poll=fn;return 1;},clearInterval(){},Math,console});
 vm.runInContext(source+'\nuseDriverProfileRefresh("driver", value=>seen.push(value.verification_status));',vm.createContext({...context,seen}));
 cleanup=effect();await new Promise(resolve=>setImmediate(resolve));
 row={id:'profile',verification_status:'approved'};await change();
 assert.deepEqual(seen,['pending','approved']);
 error=new Error('Network failure');row=null;await poll();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(seen,['pending','approved']);cleanup();
});
