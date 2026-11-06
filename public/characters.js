// Teamuki-inspired character rosters, Play/Edit views, 4d6-drop-lowest rolls.
// Existing v0.2 localStorage profile records remain compatible.
const STORAGE='kaiju-command-profiles-v1';
const STATS=[['str','Strength'],['dex','Dexterity'],['con','Constitution'],['int','Intelligence'],['wis','Wisdom'],['cha','Charisma']];
const ROLES=[['soldier','Infantry Officer'],['scientist','Research Scientist'],['engineer','Combat Engineer']];
const SPECIES=[['reptilian','Reptilian'],['insectoid','Insectoid'],['aquatic','Aquatic'],['avian','Avian'],['mammalian','Mammalian'],['other','Other']];
const ELEMENTS=[['plasma','Plasma'],['fire','Fire'],['ice','Ice'],['electric','Electricity'],['radiation','Radiation'],['other','Other']];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,low,hi,def)=>Number.isFinite(Number(v))?Math.max(low,Math.min(hi,Math.round(Number(v)))):def;
const mod=v=>Math.floor((v-10)/2);
const modText=v=>((mod(v)>=0)?'+':'')+mod(v);
const uuid=()=>crypto.randomUUID();
function newProfile(kind,i=1){return {id:uuid(),name:kind==='human'?'Commander '+i:'Titan '+i,title:kind==='human'?'Field Officer':'Colossal Creature',role:'soldier',species:'reptilian',element:'plasma',recharge:3,description:'',abilities:Object.fromEntries(STATS.map(([k])=>[k,10])),rolled:false,rollNotes:''};}
function dice(){const a=new Uint32Array(1);crypto.getRandomValues(a);return 1+(a[0]%6);}
function roll(){const values=Array.from({length:4},dice);return {sum:values.reduce((t,v)=>t+v,0)-Math.min(...values),values};}
function opts(entries,value){return entries.map(([v,label])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(label)}</option>`).join('');}
function load(){try{const v=JSON.parse(localStorage.getItem(STORAGE));if(v&&typeof v==='object')return v;}catch{}return {};}
export function initCharacterSheets({notify=()=>{},onChange=()=>{}}={}){
  const raw=load(),model={human:Array.isArray(raw.human)?raw.human.slice(0,40):[],titan:Array.isArray(raw.titan)?raw.titan.slice(0,40):[],selected:raw.selected||{}};
  const modes={human:'edit',titan:'edit'};
  for(const kind of ['human','titan']){
    if(!model[kind].length)model[kind]=[newProfile(kind)];
    if(!model[kind].some(p=>p.id===model.selected[kind]))model.selected[kind]=model[kind][0].id;
  }
  const getProfiles=kind=>model[kind]||[];
  const selected=kind=>getProfiles(kind).find(p=>p.id===model.selected[kind])||getProfiles(kind)[0];
  function save(){try{localStorage.setItem(STORAGE,JSON.stringify(model));}catch{notify('Local storage is unavailable; export your sheet to keep it.');}onChange();}
  const field=(name,key,value,max=80)=>`<label class="sheet-field"><span>${name}</span><input data-field="${key}" maxlength="${max}" value="${esc(value||'')}"></label>`;
  const select=(name,key,entries,value)=>`<label class="sheet-field"><span>${name}</span><select data-field="${key}">${opts(entries,value)}</select></label>`;
  function render(kind){
    const root=$(kind+'-sheet');if(!root)return;
    const p=selected(kind),editing=modes[kind]==='edit';
    const title=kind==='human'?'Human Commander':'Titan';
    const roster=getProfiles(kind).map(x=>`<button type="button" data-action="select" data-id="${esc(x.id)}" class="roster-chip ${x.id===p.id?'chosen':''}" aria-pressed="${x.id===p.id}">${esc(x.name)}</button>`).join('');
    const description=kind==='human'?(ROLES.find(x=>x[0]===p.role)?.[1]||'Infantry Officer'):(SPECIES.find(x=>x[0]===p.species)?.[1]||'Creature')+' · '+(ELEMENTS.find(x=>x[0]===p.element)?.[1]||'Plasma');
    const fields=editing?(kind==='human'?field('Name','name',p.name,30)+field('Rank / title','title',p.title,45)+select('Detachment','role',ROLES,p.role)
      :field('Name','name',p.name,32)+field('Designation','title',p.title,45)+select('Body type','species',SPECIES,p.species)+select('Element','element',ELEMENTS,p.element)+select('Breath recharge','recharge',[[2,'2 turns'],[3,'3 turns'],[4,'4 turns'],[5,'5 turns']],p.recharge))
      :`<div class="sheet-summary"><div><small>Designation</small><strong>${esc(p.title)}</strong></div><div><small>Specialisation</small><strong>${esc(description)}</strong></div></div>`;
    root.innerHTML=`<div class="sheet-heading"><div><span class="eyebrow">${kind==='human'?'COMMAND DOSSIER':'MONSTER DOSSIER'}</span><h2>${title}</h2><p class="muted">Choose a saved character, edit its details or review it in Play mode.</p></div><div class="mode-controls"><button type="button" data-action="mode-edit" class="${editing?'active':''}">Edit</button><button type="button" data-action="mode-play" class="${editing?'':'active'}">Play</button></div></div>
      <div class="roster"><div class="roster-list">${roster}</div><button type="button" data-action="add">+ New ${title}</button></div>
      <div class="sheet-layout"><section class="sheet-panel"><div class="sheet-identity"><div class="sheet-avatar">${kind==='human'?'★':'◆'}</div><div><div class="eyebrow">${esc(p.title)}</div><h3>${esc(p.name)}</h3><p class="muted">${esc(description)}</p></div></div><div class="sheet-fields">${fields}</div><label class="sheet-field description"><span>Background / notes</span>${editing?`<textarea data-field="description" rows="6" maxlength="2000" placeholder="Origins, personality, equipment…">${esc(p.description||'')}</textarea>`:`<div class="sheet-notes">${esc(p.description||'No notes yet.')}</div>`}</label>
      ${editing?'<div class="sheet-tools"><button type="button" data-action="duplicate" class="secondary">Duplicate</button><button type="button" data-action="export" class="secondary">Export JSON</button><button type="button" data-action="delete" class="danger-button">Delete</button></div>':''}</section>
      <section class="sheet-panel"><div class="section-title"><div><span class="eyebrow">D&D-STYLE STATS</span><h3>Attributes</h3></div>${editing?'<button type="button" data-action="roll">Roll all · 4d6 drop lowest</button>':''}</div><div class="abilities">${STATS.map(([k,label])=>{const n=clamp(p.abilities?.[k],1,30,10);return `<div class="ability"><span>${label}</span>${editing?`<input data-stat="${k}" aria-label="${label}" type="number" min="1" max="30" value="${n}">`:`<strong>${n}</strong>`}<em data-mod="${k}">${modText(n)}</em></div>`;}).join('')}</div><p class="roll-notes">${esc(p.rollNotes||'Default scores are 10. Roll or edit them to prepare your character.')}</p><div class="sheet-info"><strong>Prototype rules</strong><p>Character choices feed into multiplayer names, detachments and Titan recharge. Rolled attributes are preserved with the character sheet but do not yet modify damage or movement.</p></div></section></div>`;
  }
  function download(kind,p){const blob=new Blob([JSON.stringify({format:'kaiju-command-sheet-v1',kind,character:p},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kaiju-'+kind+'-'+p.name.toLowerCase().replace(/[^a-z0-9-]+/g,'-')+'.json';a.click();URL.revokeObjectURL(url);}
  for(const kind of ['human','titan']){
    const root=$(kind+'-sheet');
    root.addEventListener('click',event=>{
      const b=event.target.closest('button[data-action]');if(!b)return;
      const p=selected(kind),action=b.dataset.action;
      if(action==='select')model.selected[kind]=b.dataset.id;
      if(action==='mode-edit')modes[kind]='edit';
      if(action==='mode-play')modes[kind]='play';
      if(action==='add'){
        if(model[kind].length>=40){notify('Maximum of 40 profiles.');return;}
        const next=newProfile(kind,model[kind].length+1);model[kind].push(next);model.selected[kind]=next.id;modes[kind]='edit';
      }
      if(action==='duplicate'){
        if(model[kind].length>=40){notify('Maximum of 40 profiles.');return;}
        const clone=structuredClone(p);clone.id=uuid();clone.name=p.name.slice(0,25)+' (copy)';model[kind].push(clone);model.selected[kind]=clone.id;
      }
      if(action==='delete'){
        if(!confirm('Delete this saved character?'))return;
        model[kind]=model[kind].filter(x=>x.id!==p.id);if(!model[kind].length)model[kind].push(newProfile(kind));model.selected[kind]=model[kind][0].id;
      }
      if(action==='roll'){
        const rolls=STATS.map(([k])=>[k,roll()]);p.abilities=Object.fromEntries(rolls.map(([k,d])=>[k,d.sum]));p.rollNotes='4d6 drop lowest · '+rolls.map(([k,d])=>k.toUpperCase()+' '+d.sum+' ('+d.values.join(', ')+')').join(' · ');notify('Rolled and saved all six abilities.');
      }
      if(action==='export')download(kind,p);
      save();render(kind);
    });
    root.addEventListener('input',event=>{
      const input=event.target,p=selected(kind),field=input.dataset.field,stat=input.dataset.stat;
      if(field){p[field]=field==='recharge'?clamp(input.value,2,5,3):String(input.value).slice(0,field==='description'?2000:80);}
      if(stat){p.abilities=p.abilities||{};p.abilities[stat]=clamp(input.value,1,30,10);const tag=root.querySelector(`[data-mod="${stat}"]`);if(tag)tag.textContent=modText(p.abilities[stat]);}
      save();
    });
    root.addEventListener('change',()=>render(kind));
  }
  save();render('human');render('titan');
  return {getProfiles,selected,render};
}
