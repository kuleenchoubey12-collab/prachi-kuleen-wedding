(function(){
 'use strict';
 const key='pk-invitation-session-v1';let inMemory='';
 function session(){try{return sessionStorage.getItem(key)||inMemory}catch{return inMemory}}
 function saveSession(token){inMemory=token||'';try{if(token)sessionStorage.setItem(key,token);else sessionStorage.removeItem(key)}catch{}}
 function endpoint(){const raw=window.WEDDING_CONFIG?.apiUrl||'';if(!raw)return '';try{const u=new URL(raw);return u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))?u.href:''}catch{return ''}}
 async function request(action,payload={},withSession=false){
  const url=endpoint();if(!url)throw new Error('RSVPs will open soon. Please contact Prachi or Kuleen if you need to confirm now.');
  const headers={'Content-Type':'application/json'};if(withSession){const token=session();if(!token){const error=new Error('Please confirm your name and WhatsApp number.');error.status=401;throw error}headers.Authorization='Bearer '+token}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
  try{
   const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({...payload,action}),signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'strict-origin-when-cross-origin'});
   let result;try{result=await response.json()}catch{throw new Error('We could not read the response. Please try again shortly.')}
   if(!response.ok){const error=new Error(result.error||'We could not save your response. Please try again.');error.status=response.status;if(response.status===401)saveSession('');throw error}
   if(result.token)saveSession(result.token);return result;
  }catch(error){if(error.name==='AbortError')throw new Error('That took too long. Please try again. Repeating your response will not create a duplicate.');if(error instanceof TypeError)throw new Error('Please check your connection and try again.');throw error}
  finally{clearTimeout(timeout)}
 }
 window.InviteAPI={request,session,saveSession,configured:()=>Boolean(endpoint())};
})();
