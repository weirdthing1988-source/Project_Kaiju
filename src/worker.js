import {command, createRoom, findActor, joinHuman, claimKaiju, viewFor} from './rules.js';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
function secret(){return crypto.randomUUID()+'-'+crypto.randomUUID();}
function bearer(request){return (request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();}
async function body(request){try{return await request.json();}catch{return {};}}
export class BattleRoom {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async getRoom(){return this.ctx.storage.get('room');}
  async save(room){await this.ctx.storage.put('room',room);}
  async fetch(request){
    const u=new URL(request.url),path=u.pathname;
    try{
      if(path==='/init'&&request.method==='POST'){
        if(await this.getRoom())return json({error:'Room already exists'},409);
        const args=await body(request);
        let room;try{room=createRoom(args.name,args.breathRecharge,args.titanName,args.mapSpec);}catch(err){return json({error:String(err.message||err)},400);}
        const creatorRole=args.creatorRole==='human'?'human':'kaiju';
        room.humanJoinCode=crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase();
        const token=secret();
        try{
          if(creatorRole==='kaiju')claimKaiju(room,{token,name:args.titanName,recharge:args.breathRecharge,character:args.character});
          else joinHuman(room,{id:crypto.randomUUID(),token,name:args.commanderName,role:args.role,character:args.character});
        }catch(err){return json({error:String(err.message||err)},400);}
        await this.save(room);
        return json({token,creatorRole,humanJoinCode:room.humanJoinCode});
      }
      const room=await this.getRoom();
      if(!room)return json({error:'Room not found'},404);
      if(path==='/join'&&request.method==='POST'){
        const args=await body(request);
        if(String(args.joinCode||'').trim().toUpperCase()!==room.humanJoinCode)return json({error:'Invalid room join code'},403);
        if(room.winner)return json({error:'Scenario has ended'},409);
        let player;
        try{
          if(args.joinAs==='kaiju')player=claimKaiju(room,{token:secret(),name:args.name,recharge:args.breathRecharge,character:args.character});
          else player=joinHuman(room,{id:crypto.randomUUID(),token:secret(),name:args.name,role:args.role,character:args.character});
        }catch(err){
          const error=String(err.message||err);
          return json({error},/occupied|Room is full/i.test(error)?409:400);
        }
        await this.save(room);this.broadcast(room);
        return json({token:player.token,id:player.id,role:args.joinAs==='kaiju'?'kaiju':'human'});
      }
      if(path==='/socket'&&request.method==='GET'){
        const ticket=u.searchParams.get('ticket')||'';
        const record=ticket?await this.ctx.storage.get('ticket:'+ticket):null;
        if(!record||record.expires<Date.now())return json({error:'Ticket expired or invalid'},401);
        await this.ctx.storage.delete('ticket:'+ticket);
        const actor=findActor(room,record.token);
        if(!actor)return json({error:'Unauthorized'},401);
        if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket upgrade required'},426);
        const pair=new WebSocketPair(),[client,server]=Object.values(pair);
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({token:record.token});
        server.send(JSON.stringify({type:'view',data:viewFor(room,actor)}));
        return new Response(null,{status:101,webSocket:client});
      }
      const actor=findActor(room,bearer(request));
      if(!actor)return json({error:'Unauthorized'},401);
      if(path==='/ticket'&&request.method==='POST'){
        const ticket=secret();
        await this.ctx.storage.put('ticket:'+ticket,{token:bearer(request),expires:Date.now()+30_000});
        return json({ticket});
      }
      if(path==='/state'&&request.method==='GET')return json({view:viewFor(room,actor)});
      if(path==='/command'&&request.method==='POST'){
        const cmd=await body(request);
        try{command(room,actor,cmd);}catch(error){return json({error:String(error?.message||error)},400);}
        await this.save(room);this.broadcast(room);
        return json({view:viewFor(room,actor)});
      }
      return json({error:'Not found'},404);
    }catch(error){return json({error:String(error?.message||error)},500);}
  }
  broadcast(room){
    for(const ws of this.ctx.getWebSockets()){
      const token=ws.deserializeAttachment()?.token||'';
      const actor=findActor(room,token);
      if(!actor){try{ws.close(1008,'Session invalid');}catch{}continue;}
      try{ws.send(JSON.stringify({type:'view',data:viewFor(room,actor)}));}catch{}
    }
  }
  async webSocketMessage(ws,message){if(message==='ping')ws.send('pong');}
}
export default {
  async fetch(request,env){
    const url=new URL(request.url),route=url.pathname;
    if(route==='/api/rooms'&&request.method==='POST'){
      const id=crypto.randomUUID(),stub=env.BATTLE_ROOMS.getByName(id);
      const response=await stub.fetch(new Request('https://room.internal/init',{method:'POST',headers:request.headers,body:await request.text()}));
      const data=await response.json();
      if(!response.ok)return json(data,response.status);
      return json({roomId:id,...data});
    }
    const match=route.match(/^\/api\/rooms\/([a-f0-9-]{36})\/(join|state|command|ticket|socket)$/i);
    if(match){
      const stub=env.BATTLE_ROOMS.getByName(match[1]);
      const internal=new URL(request.url);internal.pathname='/'+match[2];
      return stub.fetch(new Request(internal,{method:request.method,headers:request.headers,body:request.method==='GET'?undefined:await request.text()}));
    }
    if(route.startsWith('/api/'))return json({error:'Unknown endpoint'},404);
    return env.ASSETS.fetch(request);
  }
};
