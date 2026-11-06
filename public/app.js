import {distance,key,line} from './lib/hex.js';
import {drawHexMap,CAMERA_DEFAULT,rotateCamera} from './lib/map-display.js';
import {initCharacterSheets} from './characters.js';
import {initBoardMaker} from './board-maker.js';
const $=id=>document.getElementById(id);
let identity=null,view=null,selected='move',hover=null,socket=null,reconnectTimer=null,roomMode='create';
let camera=CAMERA_DEFAULT();
const sampleTerrain={
 '-2,1':'bunker','-3,0':'bunker','-1,3':'bunker','0,3':'bunker','2,1':'bunker',
 '-1,-1':'city','0,-1':'city','1,-1':'city','-1,0':'city','0,0':'city','1,0':'city',
 '-4,1':'forest','-4,2':'forest','-3,3':'forest','-2,3':'forest',
 '1,-4':'water','2,-4':'water','3,-4':'water','4,-4':'water','4,-3':'water',
 '-4,-1':'road','-3,-1':'road','-2,-1':'road','2,0':'reactor','3,2':'mountain','4,1':'mountain'
};
const fallbackMap={name:'Coastal Defence',radius:7,terrain:sampleTerrain};
try{const saved=sessionStorage.getItem('kaiju-command-session');identity=saved?JSON.parse(saved):null;}catch{}
function toast(message){$('toast').textContent=String(message);$('toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
async function api(route,{method='GET',data,token=identity?.token}={}){
  const response=await fetch(route,{method,headers:{...(data?{'content-type':'application/json'}:{}),...(token?{'authorization':'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
  const payload=await response.json().catch(()=>({}));if(!response.ok)throw Error(payload.error||'Network error');return payload;
}
function setIdentity(data){identity=data;sessionStorage.setItem('kaiju-command-session',JSON.stringify(data));}
function myUnit(){return view?.role==='kaiju'?view.kaiju:view?.humans.find(h=>h.id===view.myId);}
function acting(){return Boolean(view&&view.started&&!view.winner&&myUnit()?.deployed&&view.activeId===view.myId);}
function deployed(){return Boolean(myUnit()?.deployed);}
function resetView(){
  view=null;identity=null;sessionStorage.removeItem('kaiju-command-session');
  if(socket){const old=socket;socket=null;try{old.close();}catch{}}
  clearTimeout(reconnectTimer);$('connection').textContent='OFFLINE';$('connection').classList.remove('live');selected='move';render();
}
async function showRoom(){
  try{const data=await api(`/api/rooms/${identity.roomId}/state`);if(!data.view.mapSpec){toast('This is an older room. Create a new room to use the new map system.');resetView();return;}
    view=data.view;selected='deploy';setTab('map');render();connect();}
  catch(error){toast(error.message);resetView();}
}
async function connect(){
  if(!identity||document.hidden)return;
  clearTimeout(reconnectTimer);if(socket){const old=socket;socket=null;try{old.close();}catch{}}
  try{
    const {ticket}=await api(`/api/rooms/${identity.roomId}/ticket`,{method:'POST'});
    const wsURL=new URL(`/api/rooms/${identity.roomId}/socket?ticket=${encodeURIComponent(ticket)}`,location.origin);
    wsURL.protocol=location.protocol==='https:'?'wss:':'ws:';
    const ws=new WebSocket(wsURL);socket=ws;
    ws.onopen=()=>{$('connection').textContent='LIVE SESSION';$('connection').classList.add('live');};
    ws.onmessage=msg=>{if(msg.data==='pong')return;try{const parsed=JSON.parse(msg.data);if(parsed.type==='view'){view=parsed.data;render();}}catch{}};
    ws.onclose=()=>{if(socket!==ws||!identity)return;$('connection').textContent='RECONNECTING';$('connection').classList.remove('live');reconnectTimer=setTimeout(connect,2500);};
    ws.onerror=()=>{};
  }catch(error){
    $('connection').textContent='RECONNECTING';
    reconnectTimer=setTimeout(async()=>{if(!identity)return;try{const response=await api(`/api/rooms/${identity.roomId}/state`);view=response.view;render();}catch{}connect();},4000);
  }
}
async function send(type,target){
  if(!view||!identity)return toast('Create or join a room first.');
  if(type!=='deploy'&&!acting())return toast(view.started?'Wait for your turn.':'Both sides must deploy before combat.');
  try{const {view:newView}=await api(`/api/rooms/${identity.roomId}/command`,{method:'POST',data:{type,...(target?{target}: {})}});
    view=newView;if(type==='deploy')selected='move';render();
  }catch(error){toast(error.message);}
}
function actionButtons(){
  if(!acting())return [];
  if(view.role==='kaiju')return [
    ['move','Move · 2 hexes','target'],['claw','Claw · range 1','target'],
    ['breath','Plasma · range 5'+(view.kaiju.breathCooldown?' · CD '+view.kaiju.breathCooldown:''),'target'],['sniff','Sniff · radius 3','instant']
  ];
  const unit=myUnit();
  return [['move','Move · 2 hexes','target'],['fire','Fire · range 5','instant'],
    ...(unit?.role==='scientist'?[['scan','Scan · range 4','instant']]:[]),
    ...(unit?.role==='engineer'?[['repair','Repair · range 1','target']]:[])];
}
function classForHex(p){
  if(!view||view.winner)return '';
  if(!deployed()){
    const known=[...(view.humans||[]).filter(h=>h.deployed&&h.pos).map(h=>key(h.pos)),...(view.kaiju.deployed&&view.kaiju.pos?[key(view.kaiju.pos)]:[])];
    return known.includes(key(p))?'blocked':'deployable';
  }
  if(!acting())return '';
  const origin=myUnit()?.pos;if(!origin)return '';
  const d=distance(origin,p),max=selected==='move'?2:selected==='claw'||selected==='repair'?1:selected==='breath'?5:0;
  if(!max)return '';
  if(hover&&key(hover)===key(p))return d<=max?'aim':'out-of-range';
  if(selected==='breath'&&hover&&distance(origin,hover)<=5&&line(origin,hover).some(x=>key(x)===key(p)))return 'aim';
  return d<=max?'in-range':'out-of-range';
}
function refreshRange(){for(const path of document.querySelectorAll('#battlefield [data-hex]')){
  path.classList.remove('aim','in-range','out-of-range','deployable','blocked');const [q,r]=path.dataset.hex.split(',').map(Number);
  const c=classForHex({q,r});if(c)path.classList.add(c);
}}
function boardClick(p){
  if(!view)return toast('Choose Create room or Join room to play.');
  if(!deployed())return send('deploy',p);
  if(['move','claw','breath','repair'].includes(selected))return send(selected,p);
}
function renderBoard(){
  const map=view?.mapSpec||fallbackMap;
  drawHexMap($('battlefield'),{radius:map.radius,terrain:map.terrain,bunkers:view?.bunkers||[],kaiju:view?.kaiju||null,humans:view?.humans||[],pings:view?.pings||[],camera,
    classFor:classForHex,onClick:boardClick,onHover:p=>{hover=p;const origin=myUnit()?.pos;$('hover-info').textContent=`Hex (${p.q}, ${p.r}) · ${map.terrain[key(p)]||'ground'} · Range ${origin?distance(origin,p):'—'}`;refreshRange();}});
  $('view-toggle').textContent=camera.tilt===1?'Isometric':'Top-down';
  const angle=(camera.angle%360+360)%360;
  $('compass').textContent=camera.tilt===1&&angle===0?'N ↑':`N ${angle===45?'↗':'·'} · ${Math.round(angle)}°`;
}
function render(){
  $('session-strip').classList.toggle('hidden',!view);
  $('lobby-actions').classList.toggle('hidden',!!view);
  $('offline-card').classList.toggle('hidden',!!view);
  $('controls').classList.toggle('hidden',!view);
  $('log').replaceChildren();
  if(!view){$('log').textContent='Create a room to begin.';$('map-title').textContent='COASTAL DEFENCE ZONE';renderBoard();return;}
  $('session-name').textContent=view.name;
  $('room-id').textContent=identity.roomId;
  $('join-code-row').classList.toggle('hidden',!identity?.joinCode);
  $('join-code').textContent=identity?.joinCode||'';
  $('map-title').textContent=(view.mapSpec?.name||view.name).toUpperCase();
  $('scenario-title').textContent=view.name;
  $('role-label').textContent=view.role==='kaiju'?'TITAN':'COMMANDER';
  const unit=myUnit();
  const waitingForSpawn=!deployed();
  $('deployment-help').classList.toggle('hidden',!waitingForSpawn);
  $('combat-controls').classList.toggle('hidden',waitingForSpawn);
  $('turn-info').textContent=view.winner?`${view.winner.toUpperCase()} VICTORY`:waitingForSpawn?'DEPLOYMENT · Click any free hex':!view.started?'WAITING · Other side must join and deploy':acting()?'YOUR TURN · '+(view.use.action?'Action used':'Action ready'):`WAITING · ${view.activeId==='kaiju'?'Titan':(view.humans.find(h=>h.id===view.activeId)?.name||'Commander')}`;
  const actions=actionButtons();if(!actions.some(a=>a[0]===selected))selected='move';
  $('action-buttons').replaceChildren();
  for(const [action,label,mode] of actions){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.classList.toggle('active',selected===action);
    b.disabled=(action==='move'&&view.use.move)||(action!=='move'&&view.use.action)||(action==='breath'&&view.kaiju.breathCooldown>0);
    b.addEventListener('click',()=>{selected=action;if(mode==='instant')send(action);else{render();toast('Choose a target hex.');}});
    $('action-buttons').append(b);
  }
  $('end-turn').disabled=!acting();
  $('range-description').textContent=selected==='breath'?'Plasma affects every hex on its firing line, penetrating bunkers.':selected==='move'?'Move up to two hexes.':selected==='claw'?'Choose an adjacent hex.':selected==='repair'?'Choose an adjacent bunker.':'Select an action.';
  const stats=$('my-stats');stats.replaceChildren();
  const entries=[['Name',unit?.name||'—'],['Health',`${unit?.hp??'?'} / ${unit?.maxHp??'?'}`],...(view.role==='kaiju'?[['Breath cooldown',view.kaiju.breathCooldown+' Titan turns'],['Bunkers down',view.bunkers.filter(b=>b.hp===0).length]]:[['Personnel',unit?.deployed?`${unit?.personnel??0} active`:'Not deployed'],['Detachment',unit?.role||''],['Research',view.research]])];
  for(const [label,value] of entries){const row=document.createElement('div');row.className='stat';const left=document.createElement('span'),right=document.createElement('strong');left.textContent=label;right.textContent=String(value);row.append(left,right);stats.append(row);}
  for(const item of [...view.log].reverse()){const line=document.createElement('div');line.className='log-item';line.textContent=item.message;$('log').append(line);}
  renderBoard();
}
function setTab(tab){
  if(!['human','titan','map','maker'].includes(tab))return;
  document.querySelectorAll('#main-tabs [data-tab]').forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
  document.querySelectorAll('.tab-page').forEach(p=>p.classList.toggle('hidden',p.id!==tab+'-page'));
  if(tab==='map')renderBoard();
  if(tab==='maker')maker.render();
}
const sheets=initCharacterSheets({notify:toast,onChange:()=>{if($('room-dialog')?.open)populateProfiles();}});
const maker=initBoardMaker({notify:toast,onMapsChange:()=>{if($('room-dialog')?.open)populateMaps();}});
function populateProfiles(){
  const role=$('room-role').value==='kaiju'?'titan':'human';
  const select=$('room-profile'),old=select.value;
  select.replaceChildren();
  const profiles=sheets.getProfiles(role);
  for(const p of profiles)select.add(new Option(p.name||'Unnamed character',p.id));
  if(profiles.some(p=>p.id===old))select.value=old;
  else if(sheets.selected(role))select.value=sheets.selected(role).id;
  updateSheetInfo();
}
function updateSheetInfo(){const kind=$('room-role').value==='kaiju'?'titan':'human',p=sheets.getProfiles(kind).find(x=>x.id===$('room-profile').value);
  $('selected-sheet-info').textContent=p?kind==='titan'?`${p.name} · ${p.species||'reptilian'} · ${p.element||'plasma'} · Breath recharge ${p.recharge||3} Titan turns`:`${p.name} · ${p.title||'Commander'} · ${p.role||'soldier'} detachment`: 'Select or create a character sheet first.';
}
function populateMaps(){
  const input=$('room-map'),prev=input.value;
  input.replaceChildren();input.add(new Option('Coastal Defence · default','default'));
  for(const m of maker.getMaps())input.add(new Option(`${m.name} · radius ${m.radius}`,m.id));
  if([...input.options].some(o=>o.value===prev))input.value=prev;
}
function openDialog(mode){
  if(view)return toast('Exit your current battle view before joining another room.');
  roomMode=mode;
  $('dialog-title').textContent=mode==='create'?'Create a battle room':'Join an existing room';
  $('room-submit').textContent=mode==='create'?'Create room':'Join room';
  $('create-options').classList.toggle('hidden',mode!=='create');$('join-options').classList.toggle('hidden',mode!=='join');
  $('room-role').value=mode==='create'?'kaiju':'human';
  populateProfiles();populateMaps();
  $('dialog-hint').textContent=mode==='create'?'You can host as a Titan or a Human Commander. The other side joins using the room ID and code.': 'The Titan slot can only be claimed once. Human commanders can join with different saved sheets.';
  $('room-dialog').showModal();
}
$('room-role').addEventListener('change',populateProfiles);
$('room-profile').addEventListener('change',updateSheetInfo);
$('open-create').addEventListener('click',()=>openDialog('create'));
$('open-join').addEventListener('click',()=>openDialog('join'));
$('dialog-close').addEventListener('click',()=>$('room-dialog').close());
$('room-dialog').addEventListener('click',e=>{if(e.target===$('room-dialog'))$('room-dialog').close();});
$('room-form').addEventListener('submit',async event=>{
  event.preventDefault();const btn=$('room-submit');btn.disabled=true;
  const kind=$('room-role').value==='kaiju'?'titan':'human';
  const character=sheets.getProfiles(kind).find(p=>p.id===$('room-profile').value);
  if(!character){toast('Select a character sheet first.');btn.disabled=false;return;}
  try{
    if(roomMode==='create'){
      const mapId=$('room-map').value;
      const mapSpec=maker.getMaps().find(m=>m.id===mapId)||null;
      const args={name:$('room-form').elements.name.value.trim()||mapSpec?.name||'Coastal Defence',creatorRole:kind==='titan'?'kaiju':'human',character,
        commanderName:character.name,titanName:character.name,role:character.role||'soldier',breathRecharge:character.recharge||3,mapSpec};
      const response=await api('/api/rooms',{method:'POST',data:args,token:null});
      setIdentity({roomId:response.roomId,token:response.token,joinCode:response.humanJoinCode});
    }else{
      const roomId=$('room-form').elements.roomId.value.trim(),joinCode=$('room-form').elements.joinCode.value.trim().toUpperCase();
      const response=await api(`/api/rooms/${roomId}/join`,{method:'POST',token:null,data:{joinCode,joinAs:kind==='titan'?'kaiju':'human',name:character.name,role:character.role||'soldier',breathRecharge:character.recharge||3,character}});
      setIdentity({roomId,token:response.token});
    }
    $('room-dialog').close();await showRoom();toast('Connected. Click a free hex to deploy your character.');
  }catch(err){toast(err.message);}finally{btn.disabled=false;}
});
$('end-turn').addEventListener('click',()=>send('end-turn'));
$('leave-button').addEventListener('click',resetView);
$('copy-room').addEventListener('click',()=>navigator.clipboard.writeText(identity.roomId).then(()=>toast('Room ID copied.')).catch(()=>toast('Clipboard unavailable.')));
$('copy-invite').addEventListener('click',()=>navigator.clipboard.writeText(identity.joinCode||'').then(()=>toast('Join code copied.')).catch(()=>toast('Clipboard unavailable.')));
for(const b of document.querySelectorAll('#main-tabs [data-tab]'))b.addEventListener('click',()=>setTab(b.dataset.tab));
function bindCam(id,change){$(id).addEventListener('click',()=>{change();renderBoard();});}
bindCam('rotate-left',()=>rotateCamera(camera,-60));bindCam('rotate-right',()=>rotateCamera(camera,60));
bindCam('view-toggle',()=>{if(camera.tilt===1){camera.tilt=.63;camera.angle=45;}else{camera.tilt=1;camera.angle=0;}});
bindCam('zoom-in',()=>camera.zoom=Math.min(2.2,camera.zoom+.15));bindCam('zoom-out',()=>camera.zoom=Math.max(.65,camera.zoom-.15));
bindCam('camera-reset',()=>camera=CAMERA_DEFAULT());
$('battlefield').addEventListener('wheel',event=>{event.preventDefault();camera.zoom=Math.min(2.2,Math.max(.65,camera.zoom+(event.deltaY<0?.1:-.1)));renderBoard();},{passive:false});
$('battlefield').addEventListener('mouseleave',()=>{hover=null;$('hover-info').textContent='Hover over a hex for range';refreshRange();});
// Middle-button drag or Shift+left drag pans the camera without issuing gameplay commands.
let drag=null;
$('battlefield').addEventListener('pointerdown',e=>{if(e.button===1||(e.button===0&&e.shiftKey)){e.preventDefault();drag={x:e.clientX,y:e.clientY};$('battlefield').setPointerCapture(e.pointerId);}});
$('battlefield').addEventListener('pointermove',e=>{if(!drag)return;const bounds=$('battlefield').getBoundingClientRect();camera.panX+=(e.clientX-drag.x)*1240/bounds.width;camera.panY+=(e.clientY-drag.y)*800/bounds.height;drag={x:e.clientX,y:e.clientY};renderBoard();});
$('battlefield').addEventListener('pointerup',()=>{drag=null;});
$('battlefield').addEventListener('pointercancel',()=>{drag=null;});
setTab('map');
if(identity)showRoom();else render();
