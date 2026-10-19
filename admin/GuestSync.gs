/** @OnlyCurrentDoc */
const SYNC_URL='https://locszphzrfsbyqgpkafj.supabase.co/functions/v1/wedding/sync';
function onOpen(){SpreadsheetApp.getUi().createMenu('Wedding sync').addItem('Sync now ? update website','syncNow').addItem('Restore original guest order','restoreGuestOrder').addItem('Enable five-minute sync','enableSync').addToUi();}
function prepareSync(){
 const p=PropertiesService.getScriptProperties();
 if(!p.getProperty('SYNC_KEY'))p.setProperty('SYNC_KEY',Utilities.getUuid()+Utilities.getUuid());
 p.setProperty('SPREADSHEET_ID',SpreadsheetApp.getActiveSpreadsheet().getId());
 SpreadsheetApp.getUi().alert('Private setup key', 'Copy this into the Supabase WEDDING_SYNC_TOKEN secret. Keep it private.\n\n'+p.getProperty('SYNC_KEY'),SpreadsheetApp.getUi().ButtonSet.OK);
}
function enableSync(){
 syncGuests();
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='syncGuests'))ScriptApp.newTrigger('syncGuests').timeBased().everyMinutes(5).create();
 SpreadsheetApp.getActiveSpreadsheet().toast('Automatic sync enabled: every five minutes.','Wedding sync');
}
function syncGuests(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw Error('A sync is already running. Please try again in a few seconds.');
 let status;
 try{
  const p=PropertiesService.getScriptProperties();const book=SpreadsheetApp.getActiveSpreadsheet();
  const sheet=book.getSheetByName('Guest numbers');if(!sheet)throw Error('Guest numbers tab is missing.');
  status=book.getSheetByName('Sync status')||book.insertSheet('Sync status');
  const data=sheet.getDataRange().getDisplayValues();
  const headings=['Name','WhatsApp number','Invitation','Total people','Notes','Group','Aliases','Personalised joke','Sync ID'];
  const headerRow=data.findIndex(row=>headings.slice(0,6).every(h=>row.includes(h)));
  if(headerRow<0)throw Error('Guest column headings are missing. Restore the header row before syncing.');
  const positions=headings.map(h=>data[headerRow].indexOf(h));
  if(positions.some(i=>i<0)||headings.some(h=>data[headerRow].filter(v=>v===h).length!==1))throw Error('Keep one of each guest column heading.');
  if(headerRow!==0)throw Error('Keep the headings in row 1. Sort guest rows only.');
  const rows=[],ids=[];
  for(let i=1;i<data.length;i++){
   const v=positions.map(col=>data[i][col]||''), name=(v[0]||'').normalize('NFKC').trim().replace(/\s+/g,' '), id=v[8]||Utilities.getUuid();ids.push([name?id:'']);
   if(!name)continue;
   const raw=(v[1]||'').trim(), invitation=(v[2]||'').trim();
   if(!raw||!invitation||invitation==='Confirm invitation'){rows.push({id,enabled:false});continue;}
   if(!['2 days','1 day','Confirm invitation'].includes(invitation))throw Error('Check invitation type on row '+(i+1));
   if(!raw||invitation==='Confirm invitation'){rows.push({id,enabled:false});continue;}
   if(!/^\+?[\d\s().-]+$/.test(raw))throw Error('Check phone number on row '+(i+1));
   let phone=raw.replace(/\D/g,'');if(!raw.startsWith('+')&&phone.length===10)phone='91'+phone;phone='+'+phone;
   const count=Number(v[3]);if(!/^\+[1-9]\d{7,14}$/.test(phone)||!Number.isInteger(count)||count<1||count>10)throw Error('Check phone or total people on row '+(i+1));
   rows.push({id,enabled:true,name,phone,count,vip:invitation==='2 days',group:v[5]||'',aliases:(v[6]||'').split('|').map(a=>a.trim()).filter(Boolean),joke:v[7]||''});
  }
  if(!rows.length)throw Error('Empty guest list: sync stopped to protect existing access.');
  sheet.getRange(2,positions[8]+1,ids.length,1).setValues(ids);sheet.hideColumns(positions[8]+1);SpreadsheetApp.flush();
  const key=p.getProperty('SYNC_KEY');if(!key)throw Error('Run prepareSync first.');
  const response=UrlFetchApp.fetch(SYNC_URL,{method:'post',contentType:'application/json',headers:{'x-sync-key':key},payload:JSON.stringify({rows}),muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw Error('Server rejected sync. Check setup and duplicate names/numbers.');
  const result=JSON.parse(response.getContentText());
  status.getRange('A1:B4').setValues([['Wedding sync','Status'],['Last successful sync',new Date()],['Guests ready',result.active],['Waiting for numbers / confirmation',rows.length-result.active]]);
  status.getRange('B2').setNumberFormat('dd MM yy HH:mm:ss');
  status.getRange('A6:B6').setValues([['Last error','']]);status.autoResizeColumns(1,2);
  try{refreshReports(book,p.getProperty('SYNC_KEY'));status.getRange('A8:B9').setValues([['Reports refreshed',new Date()],['Report error','']]);status.getRange('B8').setNumberFormat('dd MM yy HH:mm:ss');}catch(reportError){status.getRange('A9:B9').setValues([['Report error',String(reportError.message)]]);}
 }catch(e){if(status)status.getRange('A6:B6').setValues([['Last error',String(e.message)]]);throw e;}finally{lock.releaseLock();}
}



function refreshReports(book,key){
 if(!key)throw Error('Sync key missing.');
 const response=UrlFetchApp.fetch(SYNC_URL,{method:'post',contentType:'application/json',headers:{'x-sync-key':key},payload:JSON.stringify({action:'reports'}),muteHttpExceptions:true});
 if(response.getResponseCode()!==200)throw Error('Could not refresh reports.');
 const data=JSON.parse(response.getContentText());
 updateRsvpChecklist(book,data.rsvps);
 const specs=[['RSVPs',['Name','WhatsApp','Wedding','Guests attending','Plus one','Notes','Haldi','Sangeet','Updated (India time)'],data.rsvps.map(r=>[r.name,r.phone,r.wedding,r.guest_count,r.plus_one,r.note,r.haldi,r.sangeet,r.updated])],
 ['Unmatched attempts',['Name entered','WhatsApp','Type','Time (India time)'],data.attempts.map(r=>[r.name,r.phone,r.action,r.attempted])],
 ['Incomplete attempts',['Name entered (unverified)','Type','Time (India time)'],data.activity.filter(r=>r.event==='name_entered').map(r=>[r.name,'Name only; not an RSVP',r.occurred])],
 ['Activity',['Visitor session','Name (self-entered, unverified)','Activity','Time (India time)'],data.activity.map(r=>[r.visitor,r.name,r.event,r.occurred])]];
 for(const [title,headers,rows] of specs){
  const sheet=book.getSheetByName(title)||book.insertSheet(title);
  const values=[headers,...rows].map(row=>row.map(v=>typeof v==='string'?"'"+v:v));
  if(sheet.getMaxRows()<values.length)sheet.insertRowsAfter(sheet.getMaxRows(),values.length-sheet.getMaxRows());
  const previous=sheet.getLastRow();sheet.getRange(1,1,values.length,headers.length).setValues(values);
  if(previous>values.length)sheet.getRange(values.length+1,1,previous-values.length,headers.length).clearContent();
  sheet.setFrozenRows(1);sheet.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#e9dfc7');
  sheet.setColumnWidths(1,headers.length,170);sheet.getRange(1,1,values.length,headers.length).setWrap(true);
  sheet.getRange('A1').setNote('Automatically refreshed every five minutes. Latest 10,000 records per report. Edit invitations in Guest numbers, not these reports.');
 }
}

function syncNow(){syncGuests();SpreadsheetApp.getActiveSpreadsheet().toast("Guest list saved. The website can use your changes now. Check Sync status for report updates.","Wedding sync complete",10);}

function restoreGuestOrder(){
 const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Guest numbers');
 const headings=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
 const serial=headings.indexOf('Serial no.');if(serial<0)throw Error('Serial no. column is missing.');
 const count=sheet.getLastRow()-1;if(count>0)sheet.getRange(2,1,count,sheet.getLastColumn()).sort({column:serial+1,ascending:true});
 sheet.setFrozenRows(1);SpreadsheetApp.getActiveSpreadsheet().toast('Original guest order restored.','Wedding sync');
}

function updateRsvpChecklist(book,responses){
 const sheet=book.getSheetByName('Guest numbers');
 const data=sheet.getDataRange().getDisplayValues(),head=data[0];
 const nameCol=head.indexOf('Name'),phoneCol=head.indexOf('WhatsApp number');
 function column(title){let i=head.indexOf(title);if(i<0){i=head.length;head.push(title);sheet.getRange(1,i+1).setValue(title)}return i+1;}
 const checkedCol=column('RSVP received'),responseCol=column('Wedding response');
 const canonical=value=>{let n=String(value||'').replace(/\D/g,'');return n.length===10?'91'+n:n;};
 const counts=new Map();for(const row of data.slice(1)){if(row[nameCol]){const p=canonical(row[phoneCol]);if(p)counts.set(p,(counts.get(p)||0)+1)}}
 const byPhone=new Map();for(const r of responses){const p=canonical(r.phone);if(!byPhone.has(p))byPhone.set(p,r)}
 let total=0,replied=0,yes=0,no=0,people=0;
 const checks=[],answers=[];
 for(const row of data.slice(1)){
  if(!row[nameCol]){checks.push(['']);answers.push(['']);continue}total++;
  const p=canonical(row[phoneCol]),r=counts.get(p)===1?byPhone.get(p):null;
  checks.push([Boolean(r)]);answers.push([r?(r.wedding==='yes'?'Attending':'Not attending'):'Awaiting reply']);
  if(r){replied++;if(r.wedding==='yes'){yes++;people+=Number(r.guest_count)||0}else no++}
 }
 if(checks.length){sheet.getRange(2,checkedCol,checks.length,1).insertCheckboxes().setValues(checks);sheet.getRange(2,responseCol,answers.length,1).setValues(answers);}
 sheet.getRange(1,checkedCol).setFontWeight('bold');sheet.getRange(1,responseCol).setFontWeight('bold');sheet.setColumnWidth(checkedCol,130);sheet.setColumnWidth(responseCol,160);
 const summary=book.getSheetByName('RSVP summary')||book.insertSheet('RSVP summary');
 summary.getRange('A1:B8').setValues([['RSVP checklist','Count'],['Guests listed',total],['Replies received',replied],['Awaiting reply',total-replied],['Attending (guest entries)',yes],['Declined (guest entries)',no],['People attending (including plus ones)',people],['Last refreshed',new Date()]]);
 summary.getRange('B8').setNumberFormat('dd MM yy HH:mm:ss');summary.getRange('A1:B1').setFontWeight('bold').setBackground('#e9dfc7');summary.autoResizeColumns(1,2);summary.setFrozenRows(1);
 const filter=sheet.getFilter();if(filter){filter.remove();sheet.getRange(1,1,Math.max(2,data.length),sheet.getLastColumn()).createFilter();}
}
