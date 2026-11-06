import {board, distance, key, line, reachable} from '../public/lib/hex.js';

export const TERRAIN = Object.freeze(['ground', 'road', 'forest', 'water', 'city', 'mountain', 'bunker', 'rubble', 'reactor']);
const MAX_LOG = 55;
const roles = {soldier:{size:10,hp:20,attack:2},scientist:{size:6,hp:12,attack:1},engineer:{size:8,hp:16,attack:1}};
const copyPoint = p => p ? {q:p.q,r:p.r} : null;
function fail(message){throw new Error(message);}
const defaultFeatures = [
  ['-2,1','bunker'], ['-3,0','bunker'], ['-1,3','bunker'], ['0,3','bunker'], ['2,1','bunker'],
  ['-4,1','forest'], ['-4,2','forest'], ['-3,3','forest'], ['-2,3','forest'],
  ['1,-4','water'], ['2,-4','water'], ['3,-4','water'], ['4,-4','water'], ['4,-3','water'],
  ['-1,-1','city'], ['0,-1','city'], ['1,-1','city'], ['-1,0','city'], ['0,0','city'], ['1,0','city'],
  ['3,2','mountain'], ['4,1','mountain'], ['-4,-1','road'], ['-3,-1','road'], ['-2,-1','road'], ['2,0','reactor']
];
export function validateMapSpec(raw) {
  if (!raw || typeof raw!=='object')return {name:'Coastal Defence',radius:7,terrain:Object.fromEntries(defaultFeatures)};
  const radius=Number(raw.radius);
  if(!Number.isInteger(radius)||radius<4||radius>9)fail('Map radius must be 4–9 hexes');
  const terrain={};const allowed=new Set(board(radius).map(key));
  const source=raw.terrain && typeof raw.terrain==='object' && !Array.isArray(raw.terrain)?raw.terrain:{};
  if(Object.keys(source).length>300)fail('Map contains too many painted hexes');
  for(const [spot,type] of Object.entries(source)){
    if(!allowed.has(spot)||!TERRAIN.includes(type))fail('Map includes invalid terrain or out-of-bounds hexes');
    if(type!=='ground')terrain[spot]=type;
  }
  return {name:String(raw.name||'Custom map').trim().slice(0,60)||'Custom map',radius,terrain};
}
function pushLog(room,message){room.log=[...room.log.slice(-(MAX_LOG-1)),{at:Date.now(),message}];}
function checkPoint(room,point){if(!point||!Number.isInteger(point.q)||!Number.isInteger(point.r)||distance(point,{q:0,r:0})>room.mapSpec.radius)fail('Target outside battlefield');return point;}
function bunkerAt(room,p){return room.bunkers.find(b=>p&&b.q===p.q&&b.r===p.r&&b.hp>0);}
function hidden(room,h){return h.deployed && (h.layer==='underground'||Boolean(bunkerAt(room,h.pos)));}
function living(h){return h.hp>0&&h.deployed;}
function activeHumans(room){return room.humans.filter(living);}
function available(room,p,selfId=''){
  const titan=room.kaiju;
  if(titan.deployed && selfId!=='kaiju' && key(titan.pos)===key(p))return false;
  return !room.humans.some(h=>h.id!==selfId && h.deployed && h.hp>0 && key(h.pos)===key(p));
}
function profile(raw,kind){
  if(!raw||typeof raw!=='object')return null;
  const abilities={};for(const k of ['str','dex','con','int','wis','cha']){
    const n=Number(raw.abilities?.[k]);abilities[k]=Number.isFinite(n)?Math.min(30,Math.max(1,Math.round(n))):10;
  }
  const out={name:String(raw.name||'').trim().slice(0,32),title:String(raw.title||'').slice(0,45),abilities};
  if(kind==='titan'){
    out.species=String(raw.species||'reptilian').slice(0,30);
    out.element=String(raw.element||'plasma').slice(0,30);
  } else out.role=String(raw.role||'soldier').slice(0,30);
  return out;
}
function checkVictory(room){
  if(!room.started || room.winner)return;
  if(room.kaiju.hp<=0){room.winner='humans';pushLog(room,'The Kaiju has fallen! Humans win.');}
  else if(room.bunkers.length>=1 && room.bunkers.filter(b=>b.hp<=0).length>=Math.min(3,room.bunkers.length)){
    room.winner='kaiju';pushLog(room,'The defence bunkers have fallen. Kaiju wins.');
  }else if(room.humans.length && room.humans.every(h=>h.hp<=0)){
    room.winner='kaiju';pushLog(room,'Every human detachment is incapacitated. Kaiju wins.');
  }
}
export function createRoom(name='Coastal Defence',recharge=3,titanName='Titan',mapRaw=null){
  const mapSpec=validateMapSpec(mapRaw), bunkers=[];
  for(const [coord,type] of Object.entries(mapSpec.terrain)){
    if(type==='bunker'){
      const [q,r]=coord.split(',').map(Number);bunkers.push({q,r,hp:18,maxHp:18});
    }
  }
  return {
    name:String(name||mapSpec.name).slice(0,60),createdAt:Date.now(),winner:null,turn:1,kaijuTurns:0,started:false,
    activeId:'kaiju',use:{move:false,action:false},mapSpec,
    humanJoinCode:'',kaijuToken:'',
    kaiju:{id:'kaiju',name:String(titanName||'Titan').slice(0,32),pos:null,deployed:false,claimed:false,hp:120,maxHp:120,breathRecharge:Math.max(2,Math.min(5,Math.trunc(recharge)||3)),breathCooldown:0,profile:null},
    bunkers,humans:[],pings:[],log:[],research:0
  };
}
export function claimKaiju(room,{token,name,recharge,character}={}){
  if(room.kaiju.claimed)fail('The Titan slot is already occupied');
  const p=profile(character,'titan');
  room.kaiju.claimed=true;room.kaijuToken=token;
  room.kaiju.profile=p;room.kaiju.name=String(p?.name||name||'Titan').slice(0,32);
  room.kaiju.breathRecharge=Math.max(2,Math.min(5,Math.trunc(Number(recharge))||3));
  pushLog(room,`${room.kaiju.name} has claimed the Titan slot.`);
  return {id:'kaiju',token};
}
export function joinHuman(room,{id,token,name,role='soldier',character}={}){
  const p=profile(character,'human');
  role=p?.role||role;
  if(!roles[role])fail('Unknown detachment type');
  if(room.humans.length>=6)fail('Room is full');
  const kind=roles[role];
  const h={id,token,name:String(p?.name||name||'Commander').slice(0,30),profile:p,role,rank:p?.title||'Commander',pos:null,deployed:false,layer:'surface',hp:kind.hp,maxHp:kind.hp,revealedUntil:-1};
  room.humans.push(h);
  pushLog(room,`${h.name} joined with ${kind.size} ${role} personnel.`);
  return h;
}
export function findActor(room,token){
  if(token&&room.kaiju.claimed&&token===room.kaijuToken)return {id:'kaiju',role:'kaiju'};
  const h=room.humans.find(p=>p.token===token);
  return h?{id:h.id,role:'human'}:null;
}
export function viewFor(room,actor){
  if(!actor)return null;
  const isKaiju=actor.role==='kaiju';
  const humans=room.humans.filter(h=>!isKaiju||(h.deployed&&(!hidden(room,h)||h.revealedUntil>=room.kaijuTurns))).map(h=>({
    id:h.id,name:h.name,role:h.role,pos:copyPoint(h.pos),deployed:h.deployed,layer:h.layer,
    hp:h.hp,maxHp:h.maxHp,personnel:Math.ceil(h.hp/2),profile:h.profile,
    detected:isKaiju&&hidden(room,h)?'sniffed':'visible'
  }));
  return {
    name:room.name,role:actor.role,myId:actor.id,turn:room.turn,activeId:room.activeId,started:room.started,
    use:{...room.use},winner:room.winner,
    kaiju:{...room.kaiju,pos:copyPoint(room.kaiju.pos),profile:room.kaiju.profile||null},
    humans, humanCount:room.humans.length,
    bunkers:room.bunkers.map(b=>({...b})),research:room.research,
    mapSpec:room.mapSpec,boardRadius:room.mapSpec.radius,
    pings:isKaiju?room.pings.filter(p=>p.until>=room.kaijuTurns).map(p=>({q:p.q,r:p.r,until:p.until})):[],
    log:room.log.slice(-22)
  };
}
function markPing(room,p){room.pings.push({...copyPoint(p),until:room.kaijuTurns+2});room.pings=room.pings.slice(-12);}
function hurtDetachment(room,h,damage){h.hp=Math.max(0,h.hp-damage);if(h.hp===0)pushLog(room,`${h.name}'s detachment was incapacitated.`);}
function nextTurn(room){
  const ids=['kaiju',...activeHumans(room).map(h=>h.id)];
  const ix=ids.indexOf(room.activeId);
  room.activeId=ids[(ix+1+ids.length)%ids.length];
  room.use={move:false,action:false};room.turn++;
  if(room.activeId==='kaiju'){
    room.kaijuTurns++;room.kaiju.breathCooldown=Math.max(0,room.kaiju.breathCooldown-1);
    room.pings=room.pings.filter(p=>p.until>=room.kaijuTurns);
  }
}
export function command(room,actor,input){
  if(!input||typeof input!=='object')fail('Invalid command');
  if(room.winner)fail('The scenario has ended');
  const kind=String(input.type||'');
  const human=actor.role==='human'?room.humans.find(h=>h.id===actor.id):null;
  const unit=human||room.kaiju;
  if(!unit)fail('Player not found');
  if(kind==='deploy'){
    if(unit.deployed)fail('You already deployed');
    const target=checkPoint(room,input.target);
    if(!available(room,target,actor.id))fail('Hex unavailable; choose a different location');
    unit.pos=copyPoint(target);unit.deployed=true;
    if(human)human.layer=bunkerAt(room,target)?'underground':'surface';
    pushLog(room,`${unit.name} entered the battlefield.`);
    if(!room.started && room.kaiju.deployed && activeHumans(room).length){
      room.started=true;room.activeId='kaiju';room.use={move:false,action:false};
      pushLog(room,'Both sides deployed. Battle begins — Titan acts first.');
    }
    return;
  }
  if(!room.started)fail('Waiting for both a Titan and a human detachment to deploy');
  if(!unit.deployed)fail('Choose a deployment hex first');
  if(actor.id!==room.activeId)fail('Not your turn');
  if(kind==='end-turn'){pushLog(room,`${unit.name} ended their turn.`);nextTurn(room);return;}
  if(kind==='move'){
    if(room.use.move)fail('Already moved this turn');
    const target=checkPoint(room,input.target);
    const possible=reachable(unit.pos,2,p=>distance(p,{q:0,r:0})<=room.mapSpec.radius&&available(room,p,actor.id));
    if(!possible.has(key(target)))fail('That hex cannot be reached');
    unit.pos=copyPoint(target);
    if(human)human.layer=bunkerAt(room,target)?'underground':'surface';
    room.use.move=true;pushLog(room,`${unit.name} moved.`);return;
  }
  if(room.use.action)fail('Action already used this turn');
  if(kind==='fire'){
    if(!human)fail('Only human detachments can fire');
    if(distance(human.pos,room.kaiju.pos)>5)fail('Kaiju out of range');
    const count=Math.ceil(human.hp/2),damage=count*roles[human.role].attack;
    room.kaiju.hp=Math.max(0,room.kaiju.hp-damage);
    if(hidden(room,human))markPing(room,human.pos);
    else human.revealedUntil=room.kaijuTurns+1;
    pushLog(room,`${human.name} fired at the Kaiju for ${damage} damage. A firing-origin clue appeared.`);
  }else if(kind==='scan'){
    if(!human||human.role!=='scientist')fail('Only scientists can scan');
    if(distance(human.pos,room.kaiju.pos)>4)fail('Kaiju too far to scan');
    room.research+=1;markPing(room,human.pos);pushLog(room,`${human.name} collected research data (${room.research}).`);
  }else if(kind==='repair'){
    if(!human||human.role!=='engineer')fail('Only engineers can repair');
    const target=checkPoint(room,input.target),b=bunkerAt(room,target);
    if(!b||distance(human.pos,b)>1)fail('No accessible intact bunker to repair');
    b.hp=Math.min(b.maxHp,b.hp+5);pushLog(room,`${human.name} reinforced a bunker.`);
  }else if(kind==='sniff'){
    if(human)fail('Only Kaiju can use Sniff');
    for(const h of activeHumans(room))if(distance(room.kaiju.pos,h.pos)<=3)h.revealedUntil=room.kaijuTurns+2;
    pushLog(room,'The Kaiju sniffed for nearby concealed units.');
  }else if(kind==='claw'||kind==='breath'){
    if(human)fail('Only Kaiju can attack with claws or breath');
    const target=checkPoint(room,input.target),breath=kind==='breath';
    if(breath&&room.kaiju.breathCooldown>0)fail('Plasma breath is recharging');
    if(distance(room.kaiju.pos,target)>(breath?5:1))fail('Attack target out of range');
    const affected=breath?line(room.kaiju.pos,target).slice(1):[target];
    for(const p of affected){
      const bunker=bunkerAt(room,p);
      if(bunker){bunker.hp=Math.max(0,bunker.hp-(breath?30:8));if(!bunker.hp){room.mapSpec.terrain[key(p)]='rubble';pushLog(room,'A fortified bunker collapsed into rubble.');}}
      else if(['city','reactor'].includes(room.mapSpec.terrain[key(p)])){room.mapSpec.terrain[key(p)]='rubble';pushLog(room,'A structure collapsed into rubble.');}
      for(const h of activeHumans(room))if(key(h.pos)===key(p)){
        hurtDetachment(room,h,breath?(bunker?10:12):8);
        h.revealedUntil=room.kaijuTurns+2;
      }
    }
    if(breath)room.kaiju.breathCooldown=room.kaiju.breathRecharge;
    pushLog(room,`${room.kaiju.name} used ${breath?'Plasma Breath':'Claw Strike'}!`);
  }else fail('Unknown action');
  room.use.action=true;checkVictory(room);
}
export function projectedTotals(room){return {bunkersDestroyed:room.bunkers.filter(b=>b.hp<=0).length,activeHumans:activeHumans(room).length};}
