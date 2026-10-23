import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./groupAudio.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
function setup(allowed=true) {
 const state={microphones:0,tracks:0,peers:0,closed:0,removed:0,signals:[],tick:null};
 const track={enabled:true,stop(){state.tracks++;}};
 const db={functions:{async invoke(_name,args){assert.equal(args.body.roomId,'room');return allowed?{data:{iceServers:[]}}:{error:true};}},async rpc(name,args){state.signals.push([name,args]);return {};},from(table){return {select(){return this;},eq(){return this;},order(){return this;},then(resolve){return Promise.resolve({data:table==='admin_call_members'?['a','b','c'].map(user_id=>({user_id,state:'joined'})):[]}).then(resolve);}};}};
 class Peer {constructor(){state.peers++;}addTrack(){}async createOffer(){return {type:'offer',sdp:'m=audio'};}async setLocalDescription(){}close(){state.closed++;}}
 const context=vm.createContext({supabase:db,navigator:{mediaDevices:{async getUserMedia(options){assert.equal(options.video,false);state.microphones++;return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}},window:{RTCPeerConnection:Peer},RTCPeerConnection:Peer,document:{createElement:()=>({play:async()=>{},remove(){state.removed++;}}),body:{appendChild(){}}},Map,Set,setInterval:fn=>{state.tick=fn;return 1;},clearInterval:()=>{state.tick=null;}});
 vm.runInContext(source+'\nthis.create=createGroupAudio;',context);
 return {state,create:()=>context.create({id:'room',host_id:'a'},'a',()=>{})};
}
test('group audio checks server membership before requesting microphone',async()=>{const w=setup(false);await assert.rejects(w.create(),/authorize/);assert.equal(w.state.microphones,0);});
test('group uses one microphone stream for peers and releases every audio resource',async()=>{const w=setup();const media=await w.create();await new Promise(resolve=>setImmediate(resolve));assert.equal(w.state.microphones,1);assert.equal(w.state.peers,2);assert.equal(w.state.signals.length,2);media.close();media.close();assert.equal(w.state.closed,2);assert.equal(w.state.tracks,1);assert.equal(w.state.removed,2);assert.equal(w.state.tick,null);});
