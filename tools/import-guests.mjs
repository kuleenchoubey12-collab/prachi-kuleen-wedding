// Run locally. Output is private and must NEVER be uploaded to GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanName,phoneNumber} from '../supabase/functions/wedding/core.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node tools/import-guests.mjs PRIVATE_GUESTS.csv PRIVATE_OUTPUT.sql');
const out=path.resolve(output),root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
if(out.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('Choose a private output folder outside the entire website repository.');
function parse(csv){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=c}if(quoted)throw Error('Unclosed CSV quote');row.push(cell.replace(/\r$/,''));if(row.some(x=>x.trim()))rows.push(row);return rows}
const [headers,...rows]=parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
const expected=['name','phone','aliases','max_guests','haldi','sangeet'];if(!headers||expected.some(k=>!headers.includes(k)))throw Error('Required CSV columns: '+expected.join(','));
const q=value=>"'"+value.replaceAll("'","''")+"'";const boolean=(value)=>{if(['yes','true','1',''].includes(value.trim().toLowerCase()))return 'true';if(['no','false','0'].includes(value.trim().toLowerCase()))return 'false';throw Error('Use yes/no for event eligibility')};
let sql='-- PRIVATE GUEST DATA. Run only in your Supabase SQL Editor.\nbegin;\n';const seen=new Set();
for(const row of rows){const item=Object.fromEntries(headers.map((h,i)=>[h,row[i]||'']));const name=cleanName(item.name),phone=phoneNumber(item.phone),aliases=item.aliases.split('|').map(x=>x.trim()).filter(Boolean).map(cleanName);const max=Number(item.max_guests||2);if(!Number.isInteger(max)||max<1||max>10)throw Error('max_guests must be 1–10');for(const n of [name,...aliases]){const key=phone+'|'+n.toLowerCase();if(seen.has(key))throw Error('Duplicate name/alias for the same phone number; use unique guest entries.');seen.add(key)}sql+=`insert into wedding_private.guests(name,phone,aliases,max_guests,haldi,sangeet) values(${q(name)},${q(phone)},array[${aliases.map(q).join(',')}]::text[],${max},${boolean(item.haldi)},${boolean(item.sangeet)}) on conflict(name,phone) do update set aliases=excluded.aliases,max_guests=excluded.max_guests,haldi=excluded.haldi,sangeet=excluded.sangeet,active=true;\n`;}
sql+='commit;\n';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,sql,{mode:0o600});console.log(`Prepared ${rows.length} private guest entries. Import this file only in Supabase; never in GitHub.`);
