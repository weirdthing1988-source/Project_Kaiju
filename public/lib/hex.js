// Pointy-top axial hex coordinates (q,r), shared by browser and Worker.
export const DIRECTIONS = Object.freeze([[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]);
export const key = (h) => `${h.q},${h.r}`;
export const add = (a,b) => ({q:a.q+b[0],r:a.r+b[1]});
export const distance = (a,b) => {
  const q=a.q-b.q, r=a.r-b.r;
  return (Math.abs(q)+Math.abs(r)+Math.abs(q+r))/2;
};
export function board(radius=5){
  const out=[];
  for(let q=-radius;q<=radius;q++)for(let r=-radius;r<=radius;r++){
    if(distance({q,r},{q:0,r:0})<=radius)out.push({q,r});
  }
  return out;
}
function cubeRound(x,y,z){
  let rx=Math.round(x),ry=Math.round(y),rz=Math.round(z);
  const dx=Math.abs(rx-x),dy=Math.abs(ry-y),dz=Math.abs(rz-z);
  if(dx>dy&&dx>dz)rx=-ry-rz;
  else if(dy>dz)ry=-rx-rz;
  else rz=-rx-ry;
  return {q:rx,r:rz};
}
export function line(a,b){
  const steps=distance(a,b), out=[];
  if(steps===0)return [{...a}];
  for(let i=0;i<=steps;i++){
    const t=i/steps, epsilon=1e-6;
    const x=a.q+(b.q-a.q)*t+epsilon;
    const z=a.r+(b.r-a.r)*t-epsilon;
    out.push(cubeRound(x,-x-z,z));
  }
  return [...new Map(out.map(p=>[key(p),p])).values()];
}
export function reachable(start,budget,isPassable=()=>true){
  const dist=new Map([[key(start),0]]), queue=[start];
  while(queue.length){
    const p=queue.shift(), cost=dist.get(key(p));
    for(const direction of DIRECTIONS){
      const next=add(p,direction), k=key(next);
      if(cost+1>budget||dist.has(k)||!isPassable(next))continue;
      dist.set(k,cost+1); queue.push(next);
    }
  }
  return dist;
}
export function axialToPixel(p,size){
  return {x:size*Math.sqrt(3)*(p.q+p.r/2),y:size*1.5*p.r};
}
