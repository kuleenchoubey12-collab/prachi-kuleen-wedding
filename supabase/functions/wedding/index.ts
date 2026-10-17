import { createHandler } from './core.mjs';

const url=Deno.env.get('SUPABASE_URL')||'';
let key='';try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||'';}catch{}
key=key||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const handler=createHandler({
  allowedOrigins:(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean),
  pepper:Deno.env.get('WEDDING_PEPPER')||'',
  async rpc(name:string,args:unknown){
    if(!url||!key)throw new Error('Server configuration missing');
    const headers:Record<string,string>={'Content-Type':'application/json',apikey:key};
    if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
    const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
    const data=await response.json();
    if(!response.ok)throw {code:data.code||'server_error'};
    return data;
  }
});
Deno.serve(handler);
