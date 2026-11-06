import {board, axialToPixel, key} from './hex.js';

const NS='http://www.w3.org/2000/svg';
export const CAMERA_DEFAULT=()=>({angle:45,tilt:0.63,zoom:1,panX:0,panY:0});
const terrainLabels={ground:'',road:'',forest:'♣',water:'≈',city:'▥',mountain:'▲',bunker:'▣',rubble:'✦',reactor:'⚡'};
function svgEl(tag,props={},parent){const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(props))node.setAttribute(k,String(v));if(parent)parent.append(node);return node;}
function caption(x,y,label,cls,g){const node=svgEl('text',{x,y,'text-anchor':'middle',class:cls,'pointer-events':'none'},g);node.textContent=label;return node;}
export function rotateCamera(camera,diff=60){camera.angle=(camera.angle+diff+360)%360;}
export function drawHexMap(root,{radius=7,terrain={},bunkers=[],kaiju=null,humans=[],pings=[],camera=CAMERA_DEFAULT(),onClick=()=>{},onHover=()=>{},classFor=()=>'',mode='battle'}={}){
  if(!root)return;
  root.replaceChildren();root.setAttribute('viewBox','0 0 1240 800');
  const cells=board(radius),rad=camera.angle*Math.PI/180,cs=Math.cos(rad),sn=Math.sin(rad);
  const tilt=camera.tilt,zoom=camera.zoom||1;
  function raw(x,y){return {x:x*cs-y*sn,y:(x*sn+y*cs)*tilt};}
  const positions=cells.map(p=>{const c=axialToPixel(p,1),pt=raw(c.x,c.y);return {...p,...pt};});
  const minX=Math.min(...positions.map(p=>p.x))-1.5,maxX=Math.max(...positions.map(p=>p.x))+1.5;
  const minY=Math.min(...positions.map(p=>p.y))-1.5,maxY=Math.max(...positions.map(p=>p.y))+1.5;
  const s=Math.min(1100/(maxX-minX),660/(maxY-minY))*zoom;
  const midX=(minX+maxX)/2,midY=(minY+maxY)/2;
  const project=(x,y,height=0)=>{const point=raw(x,y);return {x:620+(point.x-midX)*s+(camera.panX||0),y:400+(point.y-midY)*s+(camera.panY||0)-height*s*.25};};
  const tileCenter=p=>{const c=axialToPixel(p,1);return project(c.x,c.y);};
  const corners=(p,h=0)=>{const c=axialToPixel(p,1);return Array.from({length:6},(_,i)=>{const a=(Math.PI/180)*(60*i-90);return project(c.x+Math.cos(a),c.y+Math.sin(a),h);});};
  const path=pts=>pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')+'Z';
  const layer=svgEl('g',{class:'tiles'},root);
  const ordered=positions.sort((a,b)=>a.y-b.y);
  for(const p of ordered){
    const k=key(p),type=terrain[k]||'ground';
    const polygon=svgEl('path',{d:path(corners(p)),class:`map-hex terrain-${type} ${classFor(p)||''}`.trim(),'data-hex':k,'aria-label':`Hex ${p.q}, ${p.r}: ${type}`,role:'button',tabindex:'0'},layer);
    polygon.addEventListener('mouseenter',()=>onHover(p));
    polygon.addEventListener('click',()=>onClick(p));
    polygon.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onClick(p);}});
    const c=tileCenter(p);
    if(type==='city'||type==='reactor'){
      const h=type==='reactor'?1.12:.84;
      const top=[{x:c.x-10*s/33,y:c.y-4*s/33-h*s*.25},{x:c.x+9*s/33,y:c.y-4*s/33-h*s*.25},{x:c.x+13*s/33,y:c.y+2*s/33-h*s*.25},{x:c.x-6*s/33,y:c.y+2*s/33-h*s*.25}];
      const bottom=top.map(v=>({...v,y:v.y+h*s*.25}));
      svgEl('path',{d:path([top[2],top[3],bottom[3],bottom[2]]),class:'building-wall','pointer-events':'none'},layer);
      svgEl('path',{d:path([top[1],top[2],bottom[2],bottom[1]]),class:'building-side','pointer-events':'none'},layer);
      svgEl('path',{d:path(top),class:'building-roof','pointer-events':'none'},layer);
      caption(c.x,c.y-h*s*.25-4,type==='reactor'?'⚡':'', 'terrain-icon',layer);
    }else if(terrainLabels[type])caption(c.x,c.y+5*s/33,terrainLabels[type],'terrain-icon',layer);
  }
  const tokens=svgEl('g',{class:'units'},root);
  for(const b of bunkers){const c=tileCenter(b);if(b.hp>0){
    svgEl('rect',{x:c.x-s*.27,y:c.y-s*.25,width:s*.54,height:s*.50,rx:3,class:'bunker-token','pointer-events':'none'},tokens);
    caption(c.x,c.y+s*.12,'▥','unit-icon',tokens);
    if(mode==='battle')caption(c.x,c.y+s*.45,String(b.hp)+' HP','unit-subtitle',tokens);
  }}
  for(const ping of pings){const c=tileCenter(ping);svgEl('ellipse',{cx:c.x,cy:c.y,rx:s*.6,ry:s*.42,class:'detection-ring','pointer-events':'none'},tokens);caption(c.x+s*.56,c.y-s*.33,'?','unit-icon',tokens);}
  if(kaiju?.deployed&&kaiju?.pos){const c=tileCenter(kaiju.pos);svgEl('ellipse',{cx:c.x,cy:c.y,rx:s*.48,ry:s*.34,class:'unit-kaiju','pointer-events':'none'},tokens);caption(c.x,c.y+s*.13,'K','unit-icon',tokens);}
  const classes={soldier:'soldier',scientist:'scientist',engineer:'engineer'};
  for(const h of humans){if(!h?.deployed||!h.pos)continue;const c=tileCenter(h.pos);svgEl('ellipse',{cx:c.x,cy:c.y,rx:s*.34,ry:s*.26,class:`unit-human ${classes[h.role]||'soldier'}`,'pointer-events':'none'},tokens);caption(c.x,c.y+s*.10,(h.role||'h').charAt(0).toUpperCase(),'unit-icon',tokens);if(mode==='battle')caption(c.x,c.y+s*.44,h.personnel+' active','unit-subtitle',tokens);}
  return {project,tileCenter,size:s};
}
