(function(){
 'use strict';
 const form=document.querySelector('form[name="wedding-rsvp"]');if(!form)return;
 const submit=form.querySelector('[type="submit"]'),status=document.getElementById('rsvp-status'),reveal=document.getElementById('golden-reveal');
 const attendance=()=>form.querySelector('[name="attendance"]:checked')?.value;
 const count=form.elements.namedItem('guest_count'),plus=form.elements.namedItem('plus_one_name');
 function update(){const no=attendance()==='No, sorry';count.disabled=no;plus.disabled=no||Number(count.value)<2;plus.closest('.field').hidden=plus.disabled;}
 form.addEventListener('change',update);form.addEventListener('reset',()=>{setTimeout(update,0);status.hidden=true;reveal.hidden=true});update();
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(submit.disabled||!form.reportValidity())return;submit.disabled=true;submit.textContent='Saving your RSVP…';status.hidden=true;reveal.hidden=true;
  try{
   const yes=attendance()==='Yes, save me a seat';
   const result=await InviteAPI.request('submit',{name:form.elements.namedItem('name').value,phone:form.elements.namedItem('phone').value,wedding:yes?'yes':'no',guest_count:yes?Number(count.value):0,plus_one:plus.disabled?'':plus.value,note:form.elements.namedItem('plus_one_backstory').value,website:form.elements.namedItem('bot-field').value});
   status.dataset.error='false';status.textContent=yes?'Your wedding RSVP is saved. We can’t wait to celebrate with you. ♡':'Your wedding RSVP is saved. We’ll miss you — thank you for letting us know. ♡';status.hidden=false;
   if(result.vip){reveal.hidden=false;reveal.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});reveal.focus({preventScroll:true})}else{InviteAPI.saveSession('');status.focus({preventScroll:true})}
  }catch(error){status.dataset.error='true';status.textContent=error.message;status.hidden=false;status.focus({preventScroll:true})}
  finally{submit.disabled=false;submit.textContent='Make it official ↗'}
 });
})();
