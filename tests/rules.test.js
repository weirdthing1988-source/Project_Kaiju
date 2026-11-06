import test from 'node:test';
import assert from 'node:assert/strict';
import {board,distance,line,reachable,key} from '../public/lib/hex.js';
import {createRoom,joinHuman,claimKaiju,command,viewFor,validateMapSpec} from '../src/rules.js';
function setup(role='soldier'){
  const r=createRoom('Test',3,'Titan Alpha');
  claimKaiju(r,{token:'kaiju-secret',name:'Titan Alpha',recharge:3});
  const h=joinHuman(r,{id:'human-1',token:'human-secret',name:'Alpha',role});
  const k={id:'kaiju',role:'kaiju'},a={id:'human-1',role:'human'};
  command(r,k,{type:'deploy',target:{q:-1,r:0}});
  command(r,a,{type:'deploy',target:{q:-2,r:1}});
  return {r,h,k,a};
}
test('hex movement remains axial and symmetrical',()=>{
  assert.equal(board(5).length,91);
  assert.equal(board(7).length,169);
  assert.equal(distance({q:2,r:-2},{q:-2,r:1}),4);
  assert.equal(line({q:0,r:0},{q:3,r:0}).length,4);
  assert.equal(reachable({q:0,r:0},2).size,19);
});
test('starting positions are selected by players, server validates occupancy',()=>{
  const r=createRoom();const k={id:'kaiju',role:'kaiju'};
  claimKaiju(r,{token:'k'});
  const h=joinHuman(r,{id:'h',token:'secret',name:'Alpha'}),a={id:'h',role:'human'};
  assert.equal(r.kaiju.pos,null);
  assert.equal(h.pos,null);
  assert.throws(()=>command(r,k,{type:'move',target:{q:0,r:0}}),/Waiting/);
  command(r,k,{type:'deploy',target:{q:1,r:0}});
  assert.throws(()=>command(r,a,{type:'deploy',target:{q:1,r:0}}),/unavailable/);
  assert.throws(()=>command(r,a,{type:'deploy',target:{q:8,r:8}}),/outside/);
  command(r,a,{type:'deploy',target:{q:-2,r:1}});
  assert.equal(r.started,true);
  assert.throws(()=>command(r,a,{type:'deploy',target:{q:0,r:0}}),/already deployed/);
});
test('hidden human coordinate not sent to Kaiju while friendly humans can see it',()=>{
  const {r,k,a,h}=setup();
  assert.equal(viewFor(r,k).humans.length,0);
  assert.equal(viewFor(r,a).humans[0].pos.q,h.pos.q);
  assert.equal(JSON.stringify(viewFor(r,k)).includes('human-secret'),false);
  assert.equal(JSON.stringify(viewFor(r,k)).includes('"q":-2,"r":1,"deployed"'),false);
});
test('firing from a concealed bunker gives away a clue, not a unit',()=>{
  const {r,k,a,h}=setup();
  command(r,k,{type:'end-turn'});
  command(r,a,{type:'fire'});
  assert.equal(r.kaiju.hp,100);
  const sight=viewFor(r,k);
  assert.equal(sight.humans.length,0);
  assert.equal(sight.pings[0].q,h.pos.q);
});
test('sniff finds concealed units and plasma destroys their bunker',()=>{
  const {r,k,h}=setup();
  command(r,k,{type:'sniff'});
  assert.equal(viewFor(r,k).humans.length,1);
  r.use.action=false;
  command(r,k,{type:'breath',target:h.pos});
  assert.equal(r.bunkers.find(b=>key(b)===key(h.pos)).hp,0);
  assert.equal(r.kaiju.breathCooldown,3);
  assert.equal(r.mapSpec.terrain[key(h.pos)],'rubble');
  assert.ok(h.hp<20);
});
test('breath recharges on Titan turns and turn order enforced',()=>{
  const {r,k,a}=setup();
  command(r,k,{type:'breath',target:{q:-2,r:1}});
  assert.throws(()=>command(r,k,{type:'breath',target:{q:-2,r:1}}),/Action already used/);
  command(r,k,{type:'end-turn'});
  assert.throws(()=>command(r,k,{type:'move',target:{q:1,r:-1}}),/Not your turn/);
  command(r,a,{type:'end-turn'});
  assert.equal(r.kaiju.breathCooldown,2);
  assert.throws(()=>command(r,k,{type:'breath',target:{q:-2,r:1}}),/recharging/);
});
test('custom maps validate radius and terrain and build bunker objects',()=>{
  const map={name:'Reactor City',radius:8,terrain:{'0,0':'bunker','1,0':'city','2,0':'reactor'}};
  assert.deepEqual(validateMapSpec(map),map);
  const r=createRoom('Reactor',4,'Titan',map);
  assert.equal(r.mapSpec.radius,8);
  assert.equal(r.bunkers.length,1);
  assert.equal(r.bunkers[0].hp,18);
  assert.throws(()=>validateMapSpec({radius:10,terrain:{}}),/radius/);
  assert.throws(()=>validateMapSpec({radius:8,terrain:{'9,0':'city'}}),/invalid/);
  assert.throws(()=>validateMapSpec({radius:8,terrain:{'0,0':'lava'}}),/invalid/);
});
test('human host and Titan join use chosen character sheets',()=>{
  const r=createRoom();
  const p=joinHuman(r,{id:'h',token:'human',character:{name:'Dr Vale',role:'scientist',title:'Lead Scientist',abilities:{int:16}}});
  assert.equal(p.role,'scientist');
  assert.equal(p.name,'Dr Vale');
  assert.equal(p.profile.abilities.int,16);
  assert.equal(r.kaiju.claimed,false);
  claimKaiju(r,{token:'kaiju',character:{name:'Thundra',species:'avian',element:'electric',abilities:{str:19}},recharge:5});
  assert.equal(r.kaiju.name,'Thundra');
  assert.equal(r.kaiju.breathRecharge,5);
});
