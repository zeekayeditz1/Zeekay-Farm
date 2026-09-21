// Run against the local preview only: node tests/records.integration.mjs
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';

const origin='http://localhost:3000';
await fetch(origin+'/api/auth');
const dir='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const file=readdirSync(dir).find(name=>name.endsWith('.sqlite')&&name!=='metadata.sqlite');
assert.ok(file,'Start the local preview first');
const db=new DatabaseSync(dir+'/'+file);
const now=new Date().toISOString();
const testId=randomUUID();
const phone='099'+Date.now();
const password='local-test-password';
const salt='00112233445566778899aabbccddeeff00';
const hash=createHmac('sha256','local-edit-delete-test-only').update(salt+':'+password).digest('hex');
db.prepare('INSERT INTO users (id,name,phone,password_hash,salt,role,permissions,created_at) VALUES (?,?,?,?,?,?,?,?)').run(testId,'Local QA Owner',phone,hash,salt,'owner','["*"]',now);
let cookie='';
async function request(path,method='GET',body,expected=200,session=cookie){
  const response=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(session?{Cookie:session}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();
  assert.equal(response.status,expected,JSON.stringify(result));
  return {result,response};
}
const login=await request('/api/auth','POST',{action:'login',phone,password});
cookie=login.response.headers.get('set-cookie').split(';')[0];
const prefix='QA-'+Date.now();
const created=[];
async function add(module,data={},recordKey=null,status='Active'){
  const {result}=await request('/api/records','POST',{module,title:recordKey||prefix+' '+module,recordKey,status,eventDate:'2026-09-21',data:{...data,reminderEnabled:data.reminderEnabled||'no'}},201);
  created.push(result.id);return result.id;
}
async function records(){return (await request('/api/records')).result.records;}
async function get(id){return (await records()).find(record=>record.id===id);}
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
try {
  // eslint-disable-next-line @next/next/no-assign-module-variable -- Farm section name.
  for(const module of ['animals','sales','weights','health','breeding','milk','fields','gur','labour','equipment','maintenance','finance','dailyexpenses','reminders']){
    const id=await add(module,{notes:'Original',amount:'10',customMetadata:'preserve'});
    await request('/api/records','PATCH',{id,title:'Edited '+module,eventDate:'2026-09-20',data:{notes:'Edited',amount:'25'}});
    const edited=await get(id);
    check(edited.title==='Edited '+module&&edited.data.notes==='Edited'&&edited.data.amount==='25'&&edited.data.customMetadata==='preserve'&&edited.event_date==='2026-09-20',module+' edit persisted');
    await request('/api/records','DELETE',{id});
    check(!await get(id),module+' delete removed entry');
    await request('/api/records','PATCH',{id,title:'Should not resurrect'},404);
  }
  await request('/api/records','POST',{module:'finance',title:'Invalid date',status:'Active',eventDate:'2026-02-31',data:{amount:'1'}},400);
  const pageOne=(await request('/api/records?limit=1&offset=0')).result;
  check(pageOne.records.length===1&&pageOne.hasMore===true&&pageOne.nextOffset===1,'Record API pagination returns a safe next offset');
  const animal=await add('animals',{tag:prefix,animalType:'Cow',breed:'Sahiwal',sex:'Female',purchaseDate:'2026-09-21'},prefix,'Pregnant');
  const health=await add('health',{animalTag:prefix,medicine:'Test vaccine',checkDate:'2026-09-21',reminderEnabled:'yes',reminderDate:'2026-10-21',reminderIntervalValue:'1',reminderIntervalUnit:'months'});
  check((await records()).filter(r=>r.linked_id===health).length===1,'Automatic reminder created');
  await request('/api/records','PATCH',{id:health,data:{reminderDate:'2026-11-21',notes:'Updated schedule'}});
  let reminders=(await records()).filter(r=>r.linked_id===health);
  check(reminders.length===1&&reminders[0].event_date==='2026-11-21','Reschedule creates exactly one active reminder');
  await request('/api/records','PATCH',{id:reminders[0].id,title:'Edited follow-up',eventDate:'2026-12-01',data:{task:'Edited follow-up',nextDate:'2026-12-01',intervalValue:'',reminderIntervalValue:'',recurrenceEnabled:'no'}});
  await request('/api/records','PATCH',{id:reminders[0].id,action:'complete'});
  check(!(await records()).some(r=>r.linked_id===health),'Turning recurrence off stops the next reminder');
  await request('/api/records','PATCH',{id:reminders[0].id,action:'restore'},409);
  const weight=await add('weights',{animalTag:prefix,notes:'Linked history'});
  await request('/api/records','PATCH',{id:animal,recordKey:prefix+'-new',title:prefix+'-new',data:{tag:prefix+'-new'}});
  check((await get(weight)).data.animalTag===prefix+'-new','Animal tag correction updates linked history');
  const other=await add('animals',{tag:prefix+'-other'},prefix+'-other');
  await request('/api/records','POST',{module:'animals',title:prefix+'-other',recordKey:prefix+'-other',status:'Active',eventDate:'2026-09-21',data:{tag:prefix+'-other'}},409);
  await request('/api/records','PATCH',{id:animal,recordKey:prefix+'-other',data:{tag:prefix+'-other'}},409);
  check((await get(animal)).record_key===prefix+'-new','Duplicate tag edit is atomic');
  const sale=await add('sales',{animalTag:prefix+'-new'},prefix+'-new','Sold');
  check((await get(animal)).status==='Sold','Sale updates animal status');
  await request('/api/records','PATCH',{id:sale,recordKey:prefix+'-other',data:{animalTag:prefix+'-other'},status:'Transferred'});
  check((await get(animal)).status==='Pregnant'&&(await get(other)).status==='Transferred','Editing sale moves status to corrected animal and restores previous status');
  await request('/api/records','PATCH',{id:sale,action:'archive'});
  check((await get(other)).status==='Active','Archiving sale restores previous animal status');
  const archivedSales=(await request('/api/records?module=sales&archived=1&limit=500&offset=0')).result.records;
  check(archivedSales.some(record=>record.id===sale),'Archived records API exposes restorable history');
  await request('/api/records','PATCH',{id:sale,action:'restore'});
  check((await get(other)).status==='Transferred','Restoring sale reapplies its animal exit status');
  await request('/api/records','DELETE',{id:sale});
  check((await get(other)).status==='Active','Deleting sale restores previous animal status');
  await request('/api/records','PATCH',{id:health,data:{reminderEnabled:'yes',reminderDate:'2027-01-01'}});
  await request('/api/records','DELETE',{id:health});
  check(!(await records()).some(r=>r.linked_id===health),'Deleting source removes its pending reminder');
  const viewerPhone=phone+'1';
  await request('/api/users','POST',{name:'Bad Role',phone:phone+'9',password,role:'superadmin',permissions:['*']},400);
  const viewer=(await request('/api/users','POST',{name:'QA Viewer',phone:viewerPhone,password,role:'viewer',permissions:['animals:read']},201)).result.id;
  await request('/api/users','PATCH',{id:viewer,name:'QA Viewer',phone:viewerPhone,role:'viewer',permissions:['animals:read','health:read']});
  check((await request('/api/users')).result.users.some(u=>u.id===viewer&&u.permissions.includes('health:read')),'Same-role permission edits persist');
  const viewerLogin=await request('/api/auth','POST',{action:'login',phone:viewerPhone,password});
  const viewerCookie=viewerLogin.response.headers.get('set-cookie').split(';')[0];
  await request('/api/records','PATCH',{id:animal,title:'Forbidden'},403,viewerCookie);
  await request('/api/records','DELETE',{id:animal},403,viewerCookie);
  await request('/api/records','DELETE',{id:animal},401,'');
  await request('/api/users','PATCH',{id:viewer,name:'Updated QA Viewer',phone:viewerPhone,role:'viewer'});
  check((await request('/api/users')).result.users.some(u=>u.id===viewer&&u.name==='Updated QA Viewer'),'User edits persist');
  await request('/api/users','DELETE',{id:testId},400);
  await request('/api/users','DELETE',{id:viewer});
  check(!(await request('/api/users')).result.users.some(u=>u.id===viewer),'User deletion removes account from list');
  await request('/api/records','GET',undefined,401,viewerCookie);
  const form=new FormData();form.append('recordId',animal);form.append('file',new Blob(['%PDF-1.4\nlocal-test'],{type:'application/pdf'}),'qa-receipt.pdf');
  const uploaded=await fetch(origin+'/api/upload',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:form});assert.equal(uploaded.status,201);
  const fileId=(await uploaded.json()).id;
  check((await request('/api/upload?recordId='+animal)).result.files.some(f=>f.id===fileId),'Attachment list shows saved file');
  await request('/api/upload','DELETE',{id:fileId},401,viewerCookie);
  await request('/api/upload','DELETE',{id:fileId});
  check(!(await request('/api/upload?recordId='+animal)).result.files.length,'Attachment deletion persists');
  const fileRecord=await add('maintenance',{assetName:'QA attachment cleanup',recordDate:'2026-09-21',jobType:'Repair',workDone:'Delete record attachment cleanup',totalCost:'1'});
  const recordForm=new FormData();recordForm.append('recordId',fileRecord);recordForm.append('file',new Blob(['%PDF-1.4\ncleanup-test'],{type:'application/pdf'}),'cleanup.pdf');
  const recordUpload=await fetch(origin+'/api/upload',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:recordForm});assert.equal(recordUpload.status,201);
  const recordFileId=(await recordUpload.json()).id;
  check(Boolean(db.prepare('SELECT 1 FROM files WHERE id = ?').get(recordFileId)),'Record attachment metadata created');
  await request('/api/records','DELETE',{id:fileRecord});
  check(!db.prepare('SELECT 1 FROM files WHERE id = ?').get(recordFileId),'Deleting a record removes its attachment metadata');
  await request('/api/records','PATCH',{id:other,action:'archive'});
  await request('/api/records','PATCH',{id:other,action:'restore'});
  check(Boolean(await get(other)),'Existing archive and restore behavior still works');
  console.log('All 14 modules, linked history, reminders, accounts, attachments, and access checks passed.');
} catch(error) {
  console.error(error);process.exitCode=1;
} finally {
  console.log('Passed '+checks+' integration assertions.');
  db.close();
}
