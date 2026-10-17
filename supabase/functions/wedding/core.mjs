export class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function cleanName(value) {
  if (typeof value !== 'string') throw new RequestError('Please enter your name.');
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (name.length < 2 || name.length > 100 || /[\p{Cc}<>]/u.test(name)) throw new RequestError('Please enter your full name.');
  return name;
}
export function phoneNumber(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^\+?[\d\s().-]+$/.test(value.trim())) throw new RequestError('Please enter a valid WhatsApp number, including the country code.');
  let digits = value.replace(/\D/g, '');
  if (!value.trim().startsWith('+') && digits.length === 10) digits = '91' + digits;
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new RequestError('Please enter a valid WhatsApp number, including the country code.');
  return '+' + digits;
}
export async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function token() { return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join(''); }
function text(value, limit) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new RequestError('One of your answers is too long or contains unsupported characters.');
  return value.trim();
}
export function createHandler({ rpc, allowedOrigins, pepper }) {
  const origins = new Set(allowedOrigins);
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store, private', 'Vary':'Origin', 'X-Content-Type-Options':'nosniff' };
    if (origin && origins.has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'content-type, authorization';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    }
    const respond = (body, status=200) => new Response(JSON.stringify(body), {status, headers});
    try {
      if (!pepper || pepper.length < 32 || !origins.size) throw new RequestError('RSVPs are not open yet. Please check back shortly.',503);
      if (origin && !origins.has(origin)) throw new RequestError('Please open the official invitation link.',403);
      if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
      if (request.method !== 'POST') throw new RequestError('This request is not supported.',405);
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new RequestError('Please submit the invitation form.',415);
      // Bound the stream, including chunked requests without Content-Length.
      const reader = request.body?.getReader(); let length=0, chunks=[];
      if (!reader) throw new RequestError('Please submit the invitation form.');
      while (true) { const {value,done}=await reader.read(); if(done)break; length+=value.length; if(length>8192){await reader.cancel();throw new RequestError('The response is too large.',413)}chunks.push(value); }
      const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      let body;try{body=JSON.parse(new TextDecoder().decode(raw));}catch{throw new RequestError('Please try submitting again.');}
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new RequestError('Please try submitting again.');
      const action = body.action;
      if (!['submit','verify','ticket','events','logout'].includes(action)) throw new RequestError('This request is not supported.');
      // Phone and session limits remain effective even if a caller spoofs IP headers.
      const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const ipKey=await hash(pepper+'|ip|'+ip);
      if (!(await rpc('wedding_rate_limit',{p_key:ipKey,p_limit:80,p_seconds:900}))) throw new RequestError('Too many attempts. Please try again in 15 minutes.',429);
      if (action === 'submit' || action === 'verify') {
        if (body.website) return respond({ok:true,vip:false}); // honeypot
        const name=cleanName(body.name),phone=phoneNumber(body.phone);
        const phoneKey=await hash(pepper+'|phone|'+phone);
        if (!(await rpc('wedding_rate_limit',{p_key:phoneKey,p_limit:10,p_seconds:900}))) throw new RequestError('Too many attempts. Please try again in 15 minutes.',429);
        const payload={name,phone,identity_hash:await hash(pepper+'|identity|'+phone+'|'+name.toLowerCase())};
        if (action === 'submit') {
          if (!['yes','no'].includes(body.wedding)) throw new RequestError('Please tell us whether you can attend.');
          const count=Number(body.guest_count);
          if(!Number.isInteger(count)||count<0||count>10||(body.wedding==='yes'&&count<1)||(body.wedding==='no'&&count!==0))throw new RequestError('Please check the number of guests.');
          Object.assign(payload,{wedding:body.wedding,guest_count:count,plus_one:text(body.plus_one,100),note:text(body.note,1000)});
        }
        const session=token();payload.token_hash=await hash(session);
        const result=await rpc('wedding_api',{p_action:action,p_payload:payload});
        return respond({...result,...(result.vip?{token:session}:{})});
      }
      const bearer=request.headers.get('authorization')||'';
      if(!/^Bearer [a-f0-9]{64}$/.test(bearer))throw new RequestError('Please confirm your name and number again.',401);
      const tokenHash=await hash(bearer.slice(7));
      if (!(await rpc('wedding_rate_limit',{p_key:await hash(pepper+'|session|'+tokenHash),p_limit:100,p_seconds:900}))) throw new RequestError('Please wait a few minutes and try again.',429);
      const payload={token_hash:tokenHash};
      if(action==='events'){
        if(!body.responses||Array.isArray(body.responses)||typeof body.responses!=='object')throw new RequestError('Please select an answer for each event.');
        const entries=Object.entries(body.responses);
        if(!entries.length||entries.length>2||entries.some(([k,v])=>!['haldi','sangeet'].includes(k)||!['yes','no'].includes(v)))throw new RequestError('Please select an answer for each event.');
        payload.responses=body.responses;
      }
      return respond(await rpc('wedding_api',{p_action:action,p_payload:payload}));
    } catch(error) {
      if(error instanceof RequestError)return respond({error:error.message},error.status);
      if(error?.code==='28000')return respond({error:'Your invitation session has ended. Please confirm your name and number again.'},401);
      if(error?.code==='42501')return respond({error:'This invitation does not include that event.'},403);
      if(error?.code==='22023')return respond({error:'Please check your response and guest count, or contact Prachi or Kuleen.'},400);
      // Do not log guest data, tokens, database messages or request bodies.
      return respond({error:'We could not save that just now. Please try again shortly.'},503);
    }
  };
}
