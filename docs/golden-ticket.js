(function(){
 'use strict';
 const locked=document.getElementById('locked'),ticket=document.getElementById('ticket'),form=document.getElementById('verify-form'),status=document.getElementById('verify-status'),list=document.getElementById('event-list'),eventForm=document.getElementById('events-form'),eventStatus=document.getElementById('events-status');
 let events=[];
 function message(target,text,error=false){target.textContent=text;target.dataset.error=String(error);target.hidden=false;target.focus({preventScroll:true})}
 function clearTicket(){ticket.hidden=true;locked.hidden=false;list.replaceChildren();document.getElementById('ticket-greeting').textContent='';events=[];eventStatus.hidden=true;}
 function node(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el}
 async function loadTicket(){
  const result=await InviteAPI.request('ticket',{},true);events=result.events||[];list.replaceChildren();
  const titles=events.map(e=>e.title).join(' & ');document.getElementById('ticket-greeting').textContent=result.name+', you’re also invited to '+(titles||'a little more celebrating')+'. ♡';
  for(const event of events){
   const card=node('section','','event-card');card.append(node('h2',event.title));
   const date=event.starts_at?new Intl.DateTimeFormat('en-IN',{dateStyle:'full',timeStyle:'short',timeZone:event.timezone||'Asia/Kolkata'}).format(new Date(event.starts_at))+' · India time':'Date and time to follow';card.append(node('p',date));card.append(node('p',event.venue||'Venue details to follow'));
   if(event.address)card.append(node('p',event.address));if(event.note)card.append(node('p',event.note));
   if(event.map_url){try{const u=new URL(event.map_url);if(u.protocol==='https:'){const link=node('a','Open directions ↗');link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';card.append(link)}}catch{}}
   const fieldset=document.createElement('fieldset');fieldset.append(node('legend','Will you join us?'));const options=node('div','','options');
   for(const [value,label] of [['yes','Yes, I’ll be there ♡'],['no','Sorry, I can’t make it']]){const item=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name=event.code;input.value=value;input.required=true;input.checked=event.attendance===value;item.append(input,node('span',label));options.append(item)}fieldset.append(options);card.append(fieldset);list.append(card);
  }
  if(!events.length)list.append(node('p','Your invitation is confirmed. The couple will share the event details here shortly.'));
  document.getElementById('save-events').hidden=!events.length;locked.hidden=true;ticket.hidden=false;status.hidden=true;form.reset();
 }
 form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('button[type="submit"]');button.disabled=true;status.hidden=true;try{const result=await InviteAPI.request('verify',{name:form.elements.name.value,phone:form.elements.phone.value,website:form.elements.website.value});if(!result.vip){InviteAPI.saveSession('');message(status,'We couldn’t open an extra invitation with those details. Check the name and number, or contact Prachi or Kuleen.',true);return}await loadTicket()}catch(error){message(status,error.message,true)}finally{button.disabled=false}});
 eventForm.addEventListener('submit',async e=>{e.preventDefault();if(!eventForm.reportValidity())return;const button=document.getElementById('save-events');button.disabled=true;eventStatus.hidden=true;try{const responses={};for(const event of events)responses[event.code]=eventForm.elements.namedItem(event.code).value;await InviteAPI.request('events',{responses},true);message(eventStatus,'Your answers are saved. Thank you — we can’t wait to celebrate. ♡')}catch(error){if(error.status===401){clearTicket();message(status,error.message,true)}else message(eventStatus,error.message,true)}finally{button.disabled=false}});
 document.getElementById('sign-out').addEventListener('click',async()=>{try{await InviteAPI.request('logout',{},true)}catch{}finally{InviteAPI.saveSession('');clearTicket();message(status,'Your private invitation is closed.')}});
 // Revalidate when a browser restores this page from its back/forward cache.
 window.addEventListener('pagehide',clearTicket);
 window.addEventListener('pageshow',async()=>{clearTicket();if(InviteAPI.session())try{await loadTicket()}catch(error){message(status,error.message,true)}});
})();
