import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{BattleRoom} from '../src/worker.js';
class TestStorage{
  data=new Map();
  async get(key){return this.data.get(key);}
  async put(key,value){this.data.set(key,structuredClone(value));}
  async delete(key){this.data.delete(key);}
}
function fixture(){
  const rooms=new Map();
  const env={BATTLE_ROOMS:{getByName(id){
    if(!rooms.has(id)){const ctx={storage:new TestStorage(),getWebSockets:()=>[],acceptWebSocket(){throw Error('Not tested here');}};rooms.set(id,new BattleRoom(ctx,env));}
    return rooms.get(id);
  }},ASSETS:{fetch(){return new Response('Asset placeholder');}}};
  return {env,call(path,method='GET',value,token){return worker.fetch(new Request('https://example.com'+path,{method,headers:{...(value?{'content-type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:value?JSON.stringify(value):undefined}),env);}};
}
async function create(app,data={}){const r=await app.call('/api/rooms','POST',data);assert.equal(r.status,200);return r.json();}
async function join(app,id,code,data={}){const r=await app.call(`/api/rooms/${id}/join`,'POST',{joinCode:code,...data});assert.equal(r.status,200);return r.json();}
async function act(app,id,token,type,target){return app.call(`/api/rooms/${id}/command`,'POST',{type,...(target?{target}: {})},token);}
async function state(app,id,token){return (await (await app.call(`/api/rooms/${id}/state`,'GET',null,token)).json()).view;}
test('REST create as Titan, join as commander and deploy with role-filtered views',async()=>{
  const app=fixture(),info=await create(app,{name:'Reactor',creatorRole:'kaiju',breathRecharge:4,character:{name:'Goliath',species:'reptilian'}});
  assert.equal(info.creatorRole,'kaiju');
  const {roomId,token:kaijuToken,humanJoinCode}=info;
  const human=await join(app,roomId,humanJoinCode,{name:'Bravo',role:'scientist',character:{name:'Dr Bravo',role:'scientist'}});
  assert.equal((await act(app,roomId,kaijuToken,'deploy',{q:2,r:-2})).status,200);
  assert.equal((await act(app,roomId,human.token,'deploy',{q:-2,r:1})).status,200);
  const kaijuView=await state(app,roomId,kaijuToken);
  assert.equal(kaijuView.humans.length,0);
  assert.equal(kaijuView.kaiju.breathRecharge,4);
  assert.equal(kaijuView.kaiju.name,'Goliath');
  assert.equal(kaijuView.started,true);
  assert.equal(JSON.stringify(kaijuView).includes(human.token),false);
  assert.equal(JSON.stringify(kaijuView).includes(humanJoinCode),false);
  const humanView=await state(app,roomId,human.token);
  assert.equal(humanView.humans[0].name,'Dr Bravo');
  assert.equal(humanView.humans[0].role,'scientist');
  assert.equal((await app.call(`/api/rooms/${roomId}/state`)).status,401);
});
test('Human can host, a Titan can join only once, and both deploy',async()=>{
  const app=fixture(),info=await create(app,{name:'City Siege',creatorRole:'human',character:{name:'Ada',role:'engineer'}});
  const {roomId,token:humanToken,humanJoinCode}=info;
  let h=await state(app,roomId,humanToken);
  assert.equal(h.kaiju.claimed,false);assert.equal(h.humans[0].name,'Ada');
  assert.equal((await act(app,roomId,humanToken,'deploy',{q:0,r:1})).status,200);
  const titan=await join(app,roomId,humanJoinCode,{joinAs:'kaiju',character:{name:'Mothra-like',element:'electric'},breathRecharge:5});
  const conflict=await app.call(`/api/rooms/${roomId}/join`,'POST',{joinCode:humanJoinCode,joinAs:'kaiju',name:'Impostor'});
  assert.equal(conflict.status,409); // Titan slot is exclusive
  assert.match((await conflict.json()).error,/already occupied/);
  const blocked=await act(app,roomId,titan.token,'deploy',{q:0,r:1});assert.equal(blocked.status,400);
  assert.equal((await act(app,roomId,titan.token,'deploy',{q:0,r:-2})).status,200);
  h=await state(app,roomId,humanToken);
  assert.equal(h.started,true);
  assert.equal(h.kaiju.name,'Mothra-like');
  const action=await act(app,roomId,titan.token,'end-turn');assert.equal(action.status,200);
  assert.equal((await state(app,roomId,humanToken)).activeId,h.humans[0].id);
});
test('custom map travels to both clients without separate server and validates requests',async()=>{
  const app=fixture();
  const spec={name:'Custom testing zone',radius:6,terrain:{'0,0':'bunker','-1,1':'water','2,-1':'city'}};
  const {roomId,token,humanJoinCode}=await create(app,{creatorRole:'kaiju',mapSpec:spec});
  const guest=await join(app,roomId,humanJoinCode,{role:'soldier'});
  const a=await state(app,roomId,token),b=await state(app,roomId,guest.token);
  assert.deepEqual(a.mapSpec,spec);assert.deepEqual(b.mapSpec,spec);
  assert.equal(a.boardRadius,6);assert.equal(b.bunkers.length,1);
  const invalid=await app.call('/api/rooms','POST',{mapSpec:{radius:9,terrain:{'20,0':'bunker'}}});
  assert.equal(invalid.status,400);
});
test('REST rejects out-of-turn and unauthorised actions once both sides deploy',async()=>{
  const app=fixture(),{roomId,token:kaijuToken,humanJoinCode}=await create(app);
  const {token}=await join(app,roomId,humanJoinCode,{name:'Alpha'});
  await act(app,roomId,kaijuToken,'deploy',{q:2,r:-2});
  await act(app,roomId,token,'deploy',{q:-2,r:1});
  let response=await act(app,roomId,token,'fire');assert.equal(response.status,400);assert.match((await response.json()).error,/Not your turn/);
  response=await act(app,roomId,kaijuToken,'end-turn');assert.equal(response.status,200);
  response=await act(app,roomId,'wrong-token','fire');assert.equal(response.status,401);
  response=await act(app,roomId,token,'fire');assert.equal(response.status,200);
  const data=await state(app,roomId,kaijuToken);assert.equal(data.humans.length,0);assert.equal(data.pings.length,1);
});
