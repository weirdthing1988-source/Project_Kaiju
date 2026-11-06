import {board, key} from './lib/hex.js';
import {drawHexMap,CAMERA_DEFAULT,rotateCamera} from './lib/map-display.js';
const KEY='kaiju-command-custom-maps-v1';
const TYPES=[['ground','Ground'],['road','Road'],['forest','Forest'],['water','Water'],['city','Buildings'],['mountain','Mountain'],['bunker','Bunker'],['rubble','Rubble'],['reactor','Reactor']];
const $=id=>document.getElementById(id);
function newDraft(){return {id:crypto.randomUUID(),name:'Untitled battlefield',radius:7,terrain:{}};}
function verify(raw){
  if(!raw||typeof raw!=='object')throw Error('Invalid map file');
  const radius=Number(raw.radius);
  if(!Number.isInteger(radius)||radius<4||radius>9)throw Error('Board radius must be between 4 and 9');
  if(!raw.terrain||typeof raw.terrain!=='object'||Array.isArray(raw.terrain))throw Error('Invalid terrain data');
  const available=new Set(board(radius).map(key)),terrain={};
  if(Object.keys(raw.terrain).length>300)throw Error('Too many terrain cells');
  for(const [cell,type] of Object.entries(raw.terrain)){
    if(!available.has(cell)||!TYPES.some(t=>t[0]===type))throw Error('Invalid hex or terrain type');
    if(type!=='ground')terrain[cell]=type;
  }
  return {id:String(raw.id||crypto.randomUUID()).slice(0,100),name:String(raw.name||'Imported battlefield').slice(0,60),radius,terrain};
}
export function getSavedMaps(){try{const maps=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(maps)?maps.filter(x=>x&&typeof x==='object').slice(0,45):[];}catch{return [];}}
export function initBoardMaker({notify=()=>{},onMapsChange=()=>{}}={}){
  let maps=getSavedMaps(),draft=maps.length?structuredClone(maps[0]):newDraft(),brush='bunker',camera=CAMERA_DEFAULT();
  const brushPanel=$('bm-brushes');
  for(const [type,label] of TYPES){const b=document.createElement('button');b.type='button';b.dataset.brush=type;b.textContent=label;b.addEventListener('click',()=>{brush=type;updateBrush();});brushPanel.append(b);}
  function updateBrush(){for(const b of brushPanel.querySelectorAll('button'))b.classList.toggle('active',b.dataset.brush===brush);$('bm-brush-label').textContent='Brush: '+(TYPES.find(t=>t[0]===brush)?.[1]||brush);}
  function syncInputs(){
    $('bm-name').value=draft.name;$('bm-radius').value=String(draft.radius);
    $('bm-board-title').textContent=(draft.name||'UNTITLED BATTLEFIELD').toUpperCase();
    $('bm-saved').replaceChildren();
    if(!maps.length){const o=new Option('No saved maps','');$('bm-saved').add(o);}else{
      for(const map of maps){const o=new Option(map.name,map.id,false,map.id===draft.id);$('bm-saved').add(o);}
      if(!maps.some(m=>m.id===draft.id))$('bm-saved').selectedIndex=-1;
    }
  }
  function paint(p){const k=key(p);if(brush==='ground')delete draft.terrain[k];else draft.terrain[k]=brush;render();}
  function render(){
    drawHexMap($('maker-field'),{radius:draft.radius,terrain:draft.terrain,camera,onClick:paint,onHover:p=>{$('bm-hover').textContent=`Hex (${p.q}, ${p.r}) · ${draft.terrain[key(p)]||'ground'}`;},mode:'maker'});
    $('bm-view-toggle').textContent=camera.tilt===1?'Isometric':'Top-down';
  }
  function save(){
    draft.name=$('bm-name').value.trim().slice(0,60)||'Untitled battlefield';
    draft=verify(draft);
    const existing=maps.findIndex(m=>m.id===draft.id);
    if(existing>=0)maps[existing]=structuredClone(draft);
    else if(maps.length>=45){notify('Maximum 45 saved maps.');return;}
    else maps.push(structuredClone(draft));
    try{localStorage.setItem(KEY,JSON.stringify(maps));}catch{notify('Saving failed. Export your map to JSON to retain it.');return;}
    syncInputs();onMapsChange();notify('Board saved. It is now selectable when creating a room.');
  }
  $('bm-save').addEventListener('click',save);
  $('bm-new').addEventListener('click',()=>{draft=newDraft();syncInputs();render();});
  $('bm-name').addEventListener('input',e=>{draft.name=e.target.value.slice(0,60);$('bm-board-title').textContent=draft.name.toUpperCase();});
  $('bm-radius').addEventListener('change',e=>{
    const radius=Number(e.target.value);draft.radius=radius;
    const allowed=new Set(board(radius).map(key));
    for(const k of Object.keys(draft.terrain))if(!allowed.has(k))delete draft.terrain[k];
    render();
  });
  $('bm-saved').addEventListener('change',e=>{const map=maps.find(m=>m.id===e.target.value);if(!map)return;draft=structuredClone(map);syncInputs();render();});
  $('bm-delete').addEventListener('click',()=>{
    if(!maps.some(m=>m.id===draft.id))return notify('Save the board first.');
    if(!confirm('Delete this saved board?'))return;
    maps=maps.filter(m=>m.id!==draft.id);localStorage.setItem(KEY,JSON.stringify(maps));draft=maps.length?structuredClone(maps[0]):newDraft();syncInputs();render();onMapsChange();notify('Saved map deleted.');
  });
  $('bm-export').addEventListener('click',()=>{
    try{
      const v=verify({...draft,name:$('bm-name').value});
      const blob=new Blob([JSON.stringify({format:'project-kaiju-map-v1',...v},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='kaiju-map-'+(v.name||'map').toLowerCase().replace(/[^a-z0-9-]+/g,'-')+'.json';a.click();URL.revokeObjectURL(url);
      notify('Exported current board.');
    }catch(err){notify(err.message);}
  });
  $('bm-import').addEventListener('click',()=>$('bm-file').click());
  $('bm-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{if(file.size>100_000)throw Error('Map JSON exceeds 100 KB');const imported=verify(JSON.parse(await file.text()));imported.id=crypto.randomUUID();draft=imported;syncInputs();render();save();}catch(err){notify('Import failed: '+err.message);}finally{e.target.value='';}
  });
  function bindCamera(id,fn){$(id).addEventListener('click',()=>{fn();render();});}
  bindCamera('bm-rotate-left',()=>rotateCamera(camera,-60));
  bindCamera('bm-rotate-right',()=>rotateCamera(camera,60));
  bindCamera('bm-view-toggle',()=>{if(camera.tilt===1){camera.tilt=.63;camera.angle=45;}else{camera.tilt=1;camera.angle=0;}});
  bindCamera('bm-zoom-out',()=>{camera.zoom=Math.max(.65,camera.zoom-.15);});
  bindCamera('bm-zoom-in',()=>{camera.zoom=Math.min(2.2,camera.zoom+.15);});
  bindCamera('bm-reset',()=>{camera=CAMERA_DEFAULT();});
  $('maker-field').addEventListener('wheel',event=>{event.preventDefault();camera.zoom=Math.max(.65,Math.min(2.2,camera.zoom+(event.deltaY<0?.1:-.1)));render();},{passive:false});
  updateBrush();syncInputs();render();
  return {getMaps:()=>maps.map(m=>structuredClone(m)),render};
}
