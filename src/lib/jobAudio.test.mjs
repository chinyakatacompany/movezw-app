import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./jobAudio.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
function setup({denyIce=false,failOffer=false}={}) {
 const state={microphones:0,stopped:0,closed:0,sent:[],interval:null};
 const track={stop(){state.stopped++;},enabled:true};
 class Peer {
  constructor(){state.peer=this;}
  addTrack(){} async createOffer(){if(failOffer)throw Error('Offer failed');return {type:'offer',sdp:'m=audio'};}
  async setLocalDescription(){} close(){state.closed++;}
 }
 const db={functions:{invoke:async()=>denyIce?{error:true}:{data:{iceServers:[]}}},rpc:async(name,args)=>{state.sent.push([name,args]);return {};},from(){return {select(){return this;},eq(){return this;},neq(){return this;},order(){return this;},then(resolve){return Promise.resolve({data:[]}).then(resolve);}};}};
 const context=vm.createContext({supabase:db,navigator:{mediaDevices:{getUserMedia:async options=>{assert.equal(options.video,false);state.microphones++;return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}},window:{RTCPeerConnection:Peer},RTCPeerConnection:Peer,setInterval:callback=>{state.interval=callback;return 1;},clearInterval:()=>{state.interval=null;}});
 vm.runInContext(source+'\nthis.createJobAudio=createJobAudio;',context);
 return {state,create:()=>context.createJobAudio({id:'call',request_id:'accepted-job',caller_id:'caller'},'caller',()=>{},{srcObject:null})};
}
test('server acceptance authorization precedes microphone access',async()=>{const {state,create}=setup({denyIce:true});await assert.rejects(create(),/secure audio/);assert.equal(state.microphones,0);});
test('accepted call signals audio only and releases microphone on close',async()=>{const {state,create}=setup();const media=await create();assert.equal(state.sent[0][1].p_kind,'offer');assert.equal(state.sent[0][1].p_call,'call');media.close();assert.equal(state.stopped,1);assert.equal(state.closed,1);assert.equal(state.interval,null);});
test('offer preparation failure releases microphone and peer connection',async()=>{const {state,create}=setup({failOffer:true});await assert.rejects(create(),/Offer failed/);assert.equal(state.stopped,1);assert.equal(state.closed,1);});
