/* Name-only attempts are separate from completed RSVPs. */
(()=>{
 const form=document.querySelector('form[name="wedding-rsvp"]');if(!form)return;
 const name=form.elements.namedItem('name'),phone=form.elements.namedItem('phone');
 let visitor;try{visitor=sessionStorage.getItem('pk-attempt-visitor');if(!visitor){visitor=crypto.randomUUID();sessionStorage.setItem('pk-attempt-visitor',visitor)}}catch{visitor=crypto.randomUUID()}
 const sent=new Set();let timer;
 async function log(){
  const value=name.value.normalize('NFKC').trim().replace(/\s+/g,' ');
  if(phone.value.trim()||value.length<2||value.length>100||sent.has(value)||!window.InviteAPI)return;
  sent.add(value);try{await InviteAPI.request('activity',{visitor,event:'name_entered',name:value})}catch{sent.delete(value)}
 }
 name.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(log,1500)});
 name.addEventListener('blur',log);
 form.addEventListener('invalid',log,true);
})();
