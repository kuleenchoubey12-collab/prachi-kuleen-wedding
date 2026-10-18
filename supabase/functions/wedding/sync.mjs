export function createSyncHandler({secret,rpc}) {
 return async request=>{
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(!secret||secret.length<40)return reply({error:'Sync is not configured.'},503);
  const supplied=request.headers.get('x-sync-key')||'';
  const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [a,b]=await Promise.all([digest(secret),digest(supplied)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  if(diff)return reply({error:'Unauthorised'},401);
  if(request.method!=='POST')return reply({error:'POST required'},405);
  try {
   const reader=request.body?.getReader();if(!reader)throw Error();let size=0,chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>500000){await reader.cancel();throw Error();}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
   const body=JSON.parse(new TextDecoder().decode(bytes));
   if(body.action==='reports')return reply(await rpc('wedding_reports',{}));
   const {rows}=body;
   if(!Array.isArray(rows)||!rows.length||rows.length>2000)throw Error();
   const ids=new Set(),identities=new Set();
   for(const r of rows){
    if(!/^[a-f0-9-]{36}$/.test(r.id)||ids.has(r.id)||typeof r.enabled!=='boolean')throw Error();ids.add(r.id);
    if(!r.enabled)continue;
    if(!Array.isArray(r.aliases)||r.aliases.length>30||r.aliases.some(a=>typeof a!=='string'||a.length<2||a.length>100||/[<>\u0000-\u001f]/.test(a))||typeof r.joke!=='string'||r.joke.length>1000)throw Error();
    if(typeof r.name!=='string'||r.name.trim().length<2||r.name.length>100||/[<>\u0000-\u001f]/.test(r.name)||!/^\+[1-9]\d{7,14}$/.test(r.phone)||!Number.isInteger(r.count)||r.count<1||r.count>10||typeof r.vip!=='boolean'||typeof r.group!=='string'||r.group.length>80)throw Error();
    const identity=r.name.toLowerCase().trim()+'|'+r.phone;if(identities.has(identity))throw Error();identities.add(identity);
   }
   return reply(await rpc('wedding_sync',{p_rows:rows}));
  }catch{return reply({error:'Sync validation failed. Previous guest list retained.'},400);}
 };
}
