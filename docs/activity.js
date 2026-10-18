(function(){
 'use strict';
 let visitor;try{visitor=sessionStorage.getItem('pk-visit');if(!visitor){visitor=crypto.randomUUID();sessionStorage.setItem('pk-visit',visitor)}}catch{visitor=crypto.randomUUID()}
 let name='',lastName='';const sent=new Set();
 function track(event){if(event!=='name_entered'&&sent.has(event))return;sent.add(event);InviteAPI.request('activity',{event,visitor,name}).catch(()=>{});}
 const input=document.querySelector('form[name="wedding-rsvp"] [name="name"]');
 input?.addEventListener('blur',()=>{const value=input.value.trim().replace(/\s+/g,' ');if(value.length<2||value===lastName)return;name=value;lastName=value;track('name_entered');});
 document.getElementById('movie-link')?.addEventListener('click',()=>track('movie_clicked'));
 const reward=document.getElementById('movie-reward');if(reward)new MutationObserver(()=>{if(!reward.hidden)track('puzzle_completed')}).observe(reward,{attributes:true,attributeFilter:['hidden']});
 track('invitation_opened');
})();
