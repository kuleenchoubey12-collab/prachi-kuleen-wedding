import { createHandler } from './core.mjs';
import { createSyncHandler } from './sync.mjs';

const url=Deno.env.get('SUPABASE_URL')||'';
let key='';try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||'';}catch{}
key=key||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
async function rpc(name:string,args:unknown){
    if(!url||!key)throw new Error('Server configuration missing');
    const headers:Record<string,string>={'Content-Type':'application/json',apikey:key};
    if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
    const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
    const data=await response.json();
    if(!response.ok)throw {code:data.code||'server_error'};
    return data;
}
const handler=createHandler({
  allowedOrigins:(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean),
  pepper:Deno.env.get('WEDDING_PEPPER')||'',rpc
});
const syncHandler=createSyncHandler({secret:Deno.env.get('WEDDING_SYNC_TOKEN')||'',rpc});
Deno.serve(request=>new URL(request.url).pathname.endsWith('/wedding/sync')?syncHandler(request):handler(request));
