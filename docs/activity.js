/* Name-only attempts are separate from completed RSVPs. */
(()=>{
 const form=document.querySelector('form[name="wedding-rsvp"]');if(!form)return;
 const name=form.elements.namedItem('name'),phone=form.elements.namedItem('phone');
 let visitor;try{visitor=sessionStorage.getItem('pk-attempt-visitor');if(!visitor){visitor=crypto.randomUUID();sessionStorage.setItem('pk-attempt-visitor',visitor)}}catch{visitor=crypto.randomUUID()}
 const sent=new Set(),eventsSent=new Set();let timer;
 async function activity(event){if(eventsSent.has(event)||!window.InviteAPI)return;eventsSent.add(event);try{await InviteAPI.request('activity',{visitor,event,name:name.value.trim()})}catch{eventsSent.delete(event)}}
 activity('invitation_opened');
 document.querySelectorAll('.egg-button').forEach(button=>button.addEventListener('click',()=>{if([...document.querySelectorAll('.egg-button')].every(b=>b.getAttribute('aria-pressed')==='true'))activity('puzzle_completed')}));
 document.getElementById('movie-link')?.addEventListener('click',()=>activity('movie_clicked'));
 // YouTube does not expose iframe clicks to the parent page; log explicit watch-link clicks only.

 async function log(){
  const value=name.value.normalize('NFKC').trim().replace(/\s+/g,' ');
  if(phone.value.trim()||value.length<2||value.length>100||sent.has(value)||!window.InviteAPI)return;
  sent.add(value);try{await InviteAPI.request('activity',{visitor,event:'name_entered',name:value})}catch{sent.delete(value)}
 }
 name.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(log,1500)});
 name.addEventListener('blur',log);
 form.addEventListener('invalid',log,true);
})();
