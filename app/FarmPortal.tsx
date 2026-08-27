'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Baby, BadgeDollarSign, Beef, BellRing, CalendarClock, ChartNoAxesCombined,
  CircleUserRound, LayoutDashboard, Milk, Scale,
  ShieldCheck, Sprout, Syringe, Tractor, UsersRound, WalletCards, Wheat, Wrench,
} from 'lucide-react';

type User = { id: string; name: string; phone: string; role: string; permissions: string[] };
type FarmRecord = { id: string; module: string; record_key: string | null; title: string; status: string; event_date: string; linked_id: string | null; data: Record<string, string | number>; created_by_name?: string };
type Field = { key: string; label: string; type?: 'text'|'number'|'date'|'select'|'textarea'; options?: string[]; required?: boolean; placeholder?: string };
type ModuleConfig = { label: string; singular: string; description: string; icon: string; fields: Field[]; keyField?: string; titleField: string; statusOptions?: string[] };

const animalTypes = ['Cow','Buffalo','Sheep','Goat','Chicken','Other'];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => `Rs ${Math.round(value).toLocaleString('en-PK')}`;

const navIcons: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  animals: Beef,
  sales: BadgeDollarSign,
  weights: Scale,
  health: Syringe,
  breeding: Baby,
  milk: Milk,
  fields: Sprout,
  gur: Wheat,
  labour: UsersRound,
  equipment: Tractor,
  maintenance: Wrench,
  finance: WalletCards,
  reminders: BellRing,
  reports: ChartNoAxesCombined,
  users: ShieldCheck,
};

function FarmIcon({name,size=17}:{name:string;size?:number}) {
  const Icon = navIcons[name] || CircleUserRound;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.9}/>;
}

function addReminderInterval(date: string, amount: number, unit: string) {
  const result = new Date(`${date || today()}T12:00:00Z`);
  if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(result.getTime())) return '';
  if (unit === 'days') result.setUTCDate(result.getUTCDate() + amount);
  else if (unit === 'weeks') result.setUTCDate(result.getUTCDate() + amount * 7);
  else {
    const day = result.getUTCDate();
    const monthIndex = result.getUTCFullYear() * 12 + result.getUTCMonth() + (unit === 'years' ? amount * 12 : amount);
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    result.setUTCFullYear(year, month, Math.min(day, lastDay));
  }
  return result.toISOString().slice(0, 10);
}

function getRecordDate(form: Record<string,string>) {
  return form.recordDate||form.exitDate||form.measurementDate||form.checkDate||form.matingDate||form.milkDate||form.sowingDate||form.crushingDate||form.paymentDate||form.transactionDate||form.nextDate||form.purchaseDate||today();
}

const configs: Record<string, ModuleConfig> = {
  animals: { label:'Animals', singular:'animal', icon:'AN', description:'One permanent profile from farm entry to sale or other exit.', keyField:'tag', titleField:'tag', statusOptions:['Active','Quarantine','Sick','Pregnant','Sold','Dead','Transferred'], fields:[
    {key:'tag',label:'Animal ID / tag number',required:true,placeholder:'AL-C-0001'}, {key:'animalType',label:'Animal type',type:'select',options:animalTypes,required:true}, {key:'breed',label:'Breed',required:true}, {key:'sex',label:'Sex',type:'select',options:['Female','Male','Unknown'],required:true}, {key:'dateOfBirth',label:'Date of birth',type:'date'}, {key:'ageAtEntry',label:'Age when entered',placeholder:'2 years 3 months'}, {key:'purchaseDate',label:'Purchase / entry date',type:'date',required:true}, {key:'purchasePrice',label:'Purchase price (Rs)',type:'number'}, {key:'entryWeight',label:'Weight when entered (kg)',type:'number'}, {key:'currentWeight',label:'Current / estimated weight (kg)',type:'number'}, {key:'seller',label:'Seller name / source'}, {key:'motherId',label:'Mother tag (if known)'}, {key:'fatherInfo',label:'Father / breed information'}, {key:'location',label:'Pen / location'}, {key:'markings',label:'Colour / identifying marks'}, {key:'notes',label:'General notes',type:'textarea'} ] },
  sales: { label:'Sales & Exits', singular:'animal sale or exit', icon:'SE', description:'A dated exit record that preserves entry facts and records the final weight, price and buyer.', keyField:'animalTag', titleField:'animalTag', statusOptions:['Sold','Dead','Transferred'], fields:[
    {key:'animalTag',label:'Animal ID / tag number',required:true,placeholder:'AL-C-0001'}, {key:'animalType',label:'Animal type',type:'select',options:animalTypes,required:true}, {key:'breed',label:'Breed'}, {key:'sex',label:'Sex',type:'select',options:['Female','Male','Unknown']}, {key:'purchaseDate',label:'Original entry / purchase date',type:'date'}, {key:'ageAtEntry',label:'Age when entered'}, {key:'purchasePrice',label:'Original purchase price (Rs)',type:'number'}, {key:'entryWeight',label:'Weight when entered (kg)',type:'number'}, {key:'exitDate',label:'Sale / exit date',type:'date',required:true}, {key:'ageAtExit',label:'Age when sold / exited',required:true}, {key:'exitWeight',label:'Weight when sold / exited (kg)',type:'number',required:true}, {key:'salePrice',label:'Sale price / value (Rs)',type:'number'}, {key:'buyer',label:'Buyer / destination'}, {key:'saleRatePerKg',label:'Sale rate per kg (Rs)',type:'number'}, {key:'transportCost',label:'Transport / commission cost (Rs)',type:'number'}, {key:'netResult',label:'Net profit / loss (Rs)',type:'number'}, {key:'reason',label:'Reason / cause'}, {key:'notes',label:'Sale, transfer or exit notes',type:'textarea'} ] },
  weights: { label:'Weight & Feed', singular:'weight record', icon:'WF', description:'Save dated growth measurements and estimate daily feed.', titleField:'animalTag', fields:[
    {key:'animalTag',label:'Animal tag',required:true}, {key:'animalType',label:'Animal type',type:'select',options:animalTypes,required:true}, {key:'measurementDate',label:'Measurement date',type:'date',required:true}, {key:'scaleWeight',label:'Scale weight, if available (kg)',type:'number'}, {key:'heartGirth',label:'Heart / chest girth (cm)',type:'number'}, {key:'bodyLength',label:'Body length (cm)',type:'number'}, {key:'height',label:'Optional height (cm)',type:'number'}, {key:'previousWeight',label:'Previous weight (kg)',type:'number'}, {key:'stage',label:'Age / stage',type:'select',options:['Calf / kid','Growing','Adult','Pregnant','Lactating']}, {key:'greenPercent',label:'Green fodder % of weight',type:'number',placeholder:'10'}, {key:'dryPercent',label:'Dry fodder % of weight',type:'number',placeholder:'2'}, {key:'concentratePercent',label:'Concentrate % of weight',type:'number',placeholder:'1'}, {key:'feedCost',label:'Estimated feed cost / day (Rs)',type:'number'}, {key:'notes',label:'Measurement / feed notes',type:'textarea'} ] },
  health: { label:'Health & Vaccination', singular:'health or vaccination record', icon:'HE', description:'Vaccines, medicines, deworming, treatment history and repeat reminders for every animal.', titleField:'animalTag', fields:[
    {key:'animalTag',label:'Animal tag',required:true}, {key:'healthType',label:'Record type',type:'select',options:['Vaccination','Deworming','Medicine course','Treatment','Routine check-up','Other'],required:true}, {key:'checkDate',label:'Given / treatment date',type:'date',required:true}, {key:'problem',label:'Problem / symptoms (if any)'}, {key:'diagnosis',label:'Diagnosis / purpose'}, {key:'medicine',label:'Vaccine / medicine name',required:true}, {key:'batchNumber',label:'Batch / lot number'}, {key:'dose',label:'Dose'}, {key:'administrationRoute',label:'How given',type:'select',options:['Injection','Oral','Topical','Feed / water','Other']}, {key:'givenBy',label:'Given by / vet name'}, {key:'cost',label:'Cost (Rs)',type:'number'}, {key:'nextDate',label:'Exact next dose date (optional)',type:'date'}, {key:'withdrawalUntil',label:'Milk / meat withdrawal until',type:'date'}, {key:'notes',label:'Additional notes',type:'textarea'} ] },
  breeding: { label:'Breeding & Gestation', singular:'breeding or gestation record', icon:'BR', description:'Heat, mating, pregnancy, gestation checks, expected delivery and linked offspring reminders.', titleField:'animalTag', fields:[
    {key:'animalTag',label:'Animal tag',required:true}, {key:'animalType',label:'Animal type',type:'select',options:animalTypes,required:true}, {key:'breedingEvent',label:'Record type',type:'select',options:['Heat observed','Natural mating','Artificial insemination','Pregnancy check','Gestation check','Calving / birth'],required:true}, {key:'heatDate',label:'Heat date',type:'date'}, {key:'matingDate',label:'Insemination / mating date',type:'date',required:true}, {key:'semenBreed',label:'Breed / semen used'}, {key:'bullDetails',label:'Bull / semen details'}, {key:'technician',label:'Technician / person'}, {key:'cost',label:'Cost (Rs)',type:'number'}, {key:'pregnancyCheckDate',label:'Pregnancy check date',type:'date'}, {key:'pregnancyResult',label:'Pregnancy result',type:'select',options:['Pending','Positive','Negative']}, {key:'gestationStage',label:'Gestation stage / days pregnant'}, {key:'expectedCalvingDate',label:'Expected birth / calving date',type:'date'}, {key:'actualCalvingDate',label:'Actual birth / calving date',type:'date'}, {key:'offspringTag',label:'Calf / kid / offspring tag'}, {key:'gestationNotes',label:'Gestation / birth notes',type:'textarea'} ] },
  milk: { label:'Milk Production', singular:'milk production record', icon:'MI', description:'Daily yield, calf consumption, milk sales, rate and quality by animal.', titleField:'animalTag', fields:[
    {key:'animalTag',label:'Cow / buffalo tag',required:true}, {key:'milkDate',label:'Record date',type:'date',required:true}, {key:'morningLitres',label:'Morning milk (litres)',type:'number',required:true}, {key:'eveningLitres',label:'Evening milk (litres)',type:'number'}, {key:'totalLitres',label:'Total milk (litres)',type:'number'}, {key:'calfConsumed',label:'Consumed by calf (litres)',type:'number'}, {key:'homeUsed',label:'Farm / home use (litres)',type:'number'}, {key:'soldLitres',label:'Milk sold (litres)',type:'number'}, {key:'ratePerLitre',label:'Sale rate per litre (Rs)',type:'number'}, {key:'saleIncome',label:'Milk sale income (Rs)',type:'number'}, {key:'fatPercent',label:'Fat percentage'}, {key:'buyer',label:'Buyer / milk collector'}, {key:'notes',label:'Quality or production notes',type:'textarea'} ] },
  fields: { label:'Fields & Crops', singular:'field crop record', icon:'FC', description:'Complete crop history and profit for every numbered field.', keyField:'fieldNumber', titleField:'fieldNumber', fields:[
    {key:'fieldNumber',label:'Field number / name',required:true}, {key:'area',label:'Area',required:true,placeholder:'12 acres'}, {key:'cropName',label:'Crop name',required:true}, {key:'variety',label:'Variety'}, {key:'nurseryDate',label:'Nursery / seedling date',type:'date'}, {key:'sowingDate',label:'Sowing / plantation date',type:'date'}, {key:'seedQuantity',label:'Seed quantity'}, {key:'seedCost',label:'Seed cost (Rs)',type:'number'}, {key:'cultivationCost',label:'Plough / cultivation cost',type:'number'}, {key:'fertilizer',label:'Fertilizer details'}, {key:'fertilizerCost',label:'Fertilizer cost',type:'number'}, {key:'spray',label:'Pesticide / spray details'}, {key:'sprayCost',label:'Spray cost',type:'number'}, {key:'irrigationCost',label:'Irrigation cost',type:'number'}, {key:'labourCost',label:'Labour cost',type:'number'}, {key:'otherCost',label:'Other cost',type:'number'}, {key:'harvestDate',label:'Harvest date',type:'date'}, {key:'totalYield',label:'Total yield'}, {key:'saleQuantity',label:'Sale quantity'}, {key:'saleRate',label:'Sale rate',type:'number'}, {key:'saleIncome',label:'Sale income (Rs)',type:'number'}, {key:'notes',label:'Field notes',type:'textarea'} ] },
  gur: { label:'Sugarcane & GUR', singular:'GUR production record', icon:'GU', description:'Daily crushing, production, sale and seasonal profit by source field.', titleField:'fieldNumber', fields:[
    {key:'fieldNumber',label:'Source field number',required:true}, {key:'sugarcaneVariety',label:'Sugarcane variety'}, {key:'crushingDate',label:'Harvest / crushing date',type:'date',required:true}, {key:'caneQuantity',label:'Sugarcane quantity used',type:'number'}, {key:'gurProduced',label:'Daily GUR produced',type:'number',required:true}, {key:'processingCost',label:'Fuel / bagasse / processing cost',type:'number'}, {key:'labourCost',label:'Labour cost',type:'number'}, {key:'otherCost',label:'Other making cost',type:'number'}, {key:'soldQuantity',label:'GUR sold quantity',type:'number'}, {key:'saleRate',label:'Sale rate',type:'number'}, {key:'saleIncome',label:'Sale income (Rs)',type:'number'}, {key:'notes',label:'Production notes',type:'textarea'} ] },
  labour: { label:'Labour', singular:'worker payment record', icon:'LA', description:'Worker details, salary, payments and advances without overwriting history.', titleField:'workerName', fields:[
    {key:'workerName',label:'Worker name',required:true}, {key:'contact',label:'Contact number'}, {key:'jobRole',label:'Job / role'}, {key:'payType',label:'Pay type',type:'select',options:['Monthly salary','Daily wage']}, {key:'rate',label:'Salary / daily wage (Rs)',type:'number'}, {key:'joiningDate',label:'Joining date',type:'date'}, {key:'transactionType',label:'Record type',type:'select',options:['Payment','Advance','Salary due','Attendance note']}, {key:'paymentDate',label:'Payment / record date',type:'date',required:true}, {key:'amount',label:'Amount (Rs)',type:'number'}, {key:'advanceReason',label:'Reason for advance'}, {key:'remainingBalance',label:'Remaining balance (Rs)',type:'number'}, {key:'notes',label:'Notes / receipt details',type:'textarea'} ] },
  equipment: { label:'Equipment', singular:'equipment record', icon:'EQ', description:'Machines, condition, repairs, bills and next maintenance.', titleField:'equipmentName', fields:[
    {key:'equipmentName',label:'Equipment name',required:true}, {key:'typeModel',label:'Type / model'}, {key:'purchaseDate',label:'Purchase date',type:'date'}, {key:'purchasePrice',label:'Purchase price (Rs)',type:'number'}, {key:'condition',label:'Current condition',type:'select',options:['Good','Needs attention','Under repair','Out of service']}, {key:'lastMaintenanceDate',label:'Last maintenance date',type:'date'}, {key:'workDone',label:'Maintenance work done'}, {key:'cost',label:'Maintenance cost (Rs)',type:'number'}, {key:'mechanic',label:'Mechanic / vendor'}, {key:'nextMaintenanceDate',label:'Next maintenance date',type:'date'}, {key:'notes',label:'Notes / bill details',type:'textarea'} ] },
  maintenance: { label:'Renovation & Maintenance', singular:'maintenance record', icon:'RM', description:'Dated tractor service, tuning, repairs, replaced parts and farm renovation expenses.', titleField:'assetName', fields:[
    {key:'assetType',label:'Asset / area type',type:'select',options:['Tractor','Vehicle','Tube well','Generator','Farm machinery','Building / room','Animal shed','Fence / gate','Water system','Electrical system','Other'],required:true}, {key:'assetName',label:'Asset name / identification',required:true,placeholder:'MF 240 Tractor'}, {key:'recordDate',label:'Service / work date',type:'date',required:true}, {key:'jobType',label:'Work type',type:'select',options:['Routine service','Tuning','Oil / filter change','Repair','Part replacement','Renovation','Inspection','Cleaning','Other'],required:true}, {key:'meterHours',label:'Meter hours / odometer'}, {key:'workDone',label:'Work performed',type:'textarea',required:true}, {key:'partReplaced',label:'Part replaced / material used'}, {key:'partBrandNumber',label:'Part brand / number'}, {key:'quantity',label:'Quantity'}, {key:'serviceProvider',label:'Mechanic / contractor / shop'}, {key:'partsCost',label:'Parts / materials cost (Rs)',type:'number'}, {key:'labourCost',label:'Labour cost (Rs)',type:'number'}, {key:'otherCost',label:'Other cost (Rs)',type:'number'}, {key:'totalCost',label:'Total expense (Rs)',type:'number',required:true}, {key:'invoiceNumber',label:'Invoice / receipt number'}, {key:'warrantyUntil',label:'Part / work warranty until',type:'date'}, {key:'conditionAfter',label:'Condition after work',type:'select',options:['Excellent','Good','Working','Needs more work','Out of service']}, {key:'nextServiceAt',label:'Next service at hours / km'}, {key:'notes',label:'Maintenance / renovation notes',type:'textarea'} ] },
  finance: { label:'Income & Expenses', singular:'money record', icon:'RS', description:'A simple linked record for all money coming in or going out.', titleField:'description', fields:[
    {key:'transactionDate',label:'Date',type:'date',required:true}, {key:'type',label:'Type',type:'select',options:['Expense','Income'],required:true}, {key:'category',label:'Category',type:'select',options:['Livestock','Crop','Labour','Equipment','GUR','Milk','Other'],required:true}, {key:'description',label:'Description',required:true}, {key:'amount',label:'Amount (Rs)',type:'number',required:true}, {key:'party',label:'Paid to / received from'}, {key:'paymentMethod',label:'Payment method',type:'select',options:['Cash','Bank transfer','EasyPaisa / JazzCash','Credit / due']}, {key:'linkedReference',label:'Linked animal / field / worker / equipment'}, {key:'notes',label:'Notes / bill details',type:'textarea'} ] },
  reminders: { label:'Reminders', singular:'reminder', icon:'RE', description:'Upcoming and overdue health, crop, salary and maintenance work.', titleField:'task', fields:[
    {key:'task',label:'Task / reminder',required:true}, {key:'nextDate',label:'Due date',type:'date',required:true}, {key:'category',label:'Category',type:'select',options:['Vaccination / medicine','Gestation / breeding','Maintenance / renovation','Crop','Equipment','Labour','Other']}, {key:'linkedReference',label:'Linked animal / asset / field / worker'}, {key:'notes',label:'Instructions',type:'textarea'} ] },
};

const navOrder = ['dashboard','animals','sales','weights','health','breeding','milk','fields','gur','labour','equipment','maintenance','finance','reminders','reports','users'];
const navNames: Record<string,string> = { dashboard:'Dashboard', reports:'Reports', users:'Users & Access' };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { ...(options?.body instanceof FormData ? {} : { 'Content-Type':'application/json' }), ...options?.headers } });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}

function AuthScreen({ setupRequired, onDone }: { setupRequired: boolean; onDone: () => void }) {
  const [name,setName] = useState('Hassaan Ali'); const [phone,setPhone] = useState(''); const [password,setPassword] = useState(''); const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await api('/api/auth',{method:'POST',body:JSON.stringify({action:setupRequired?'setup':'login',name,phone,password})}); onDone(); } catch(e) { setError(e instanceof Error?e.message:'Unable to sign in.'); } finally { setBusy(false); } }
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><b>AL</b></span><div><strong>Ali Livestock</strong><small>Farm management portal</small></div></div><span className="section-kicker">{setupRequired?'Secure first-time setup':'Private farm portal'}</span><h1>{setupRequired?'Create the first owner account':'Welcome back'}</h1><p>{setupRequired?'This account receives full access. Add the second owner and selected workers afterward from Users & Access.':'Sign in with your farm phone number and password.'}</p><form onSubmit={submit}>{setupRequired&&<label>Owner name<input value={name} onChange={e=>setName(e.target.value)} required /></label>}<label>Phone number<input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" required placeholder="03xx xxxxxxx" /></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={10} required placeholder="At least 10 characters" /></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="button primary full" disabled={busy}>{busy?'Please wait…':setupRequired?'Secure and open farm':'Sign in'}</button></form><small className="auth-foot">Chak No. 101 D.B · Tehsil Yazman · District Bahawalpur</small></section></main>;
}

export default function FarmPortal() {
  const [auth,setAuth] = useState<{loading:boolean;setupRequired:boolean;user:User|null}>({loading:true,setupRequired:false,user:null});
  const [section,setSection] = useState('dashboard'); const [records,setRecords] = useState<FarmRecord[]>([]); const [search,setSearch] = useState(''); const [showForm,setShowForm] = useState(false); const [message,setMessage] = useState(''); const [menuOpen,setMenuOpen] = useState(false);
  const loadAuth = useCallback(async()=>{ try{const data=await api<{setupRequired:boolean;user:User|null}>('/api/auth'); setAuth({loading:false,...data});}catch{setAuth({loading:false,setupRequired:false,user:null});}},[]);
  const loadRecords = useCallback(async()=>{ if(!auth.user)return; try{const data=await api<{records:FarmRecord[]}>('/api/records');setRecords(data.records);}catch(e){setMessage(e instanceof Error?e.message:'Unable to load records.');}},[auth.user]);
  useEffect(()=>{loadAuth();},[loadAuth]); useEffect(()=>{loadRecords();},[loadRecords]);
  if(auth.loading) return <div className="loading-page"><span className="brand-mark"><b>AL</b></span><p>Opening Ali Livestock…</p></div>;
  if(!auth.user) return <AuthScreen setupRequired={auth.setupRequired} onDone={loadAuth}/>;
  const config=configs[section];
  const sectionRecords=records.filter(record=>record.module===section && (!search || `${record.title} ${record.record_key||''} ${JSON.stringify(record.data)}`.toLowerCase().includes(search.toLowerCase())));
  const dueReminderCount=records.filter(record=>record.module==='reminders'&&record.event_date<=today()).length;
  async function logout(){await api('/api/auth',{method:'POST',body:JSON.stringify({action:'logout'})});setAuth({loading:false,setupRequired:false,user:null});}
  return <main className="app-shell">
    <aside className={`sidebar ${menuOpen?'open':''}`}>
      <div className="brand"><span className="brand-mark"><b>AL</b></span><div><strong>Ali Livestock</strong><small>Farm management</small></div></div>
      <nav>{navOrder.map(item=>{
        const label=configs[item]?.label||navNames[item];
        return <button type="button" title={label} aria-label={label} className={section===item?'active':''} onClick={()=>{setSection(item);setMenuOpen(false);setShowForm(false)}} key={item}><span className="nav-symbol"><FarmIcon name={item}/></span><span>{label}</span>{item==='reminders'&&dueReminderCount>0&&<b className="nav-alert">{dueReminderCount}</b>}</button>;
      })}</nav>
      <div className="sidebar-bottom"><span>Chak No. 101 D.B</span><small>Yazman, Bahawalpur</small></div>
    </aside>
    <section className="workspace">
      <header className="topbar">
        <button className="menu-button" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Open navigation">☰</button>
        <div className="top-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search animals, tractors, vaccinations, fields…" /></div>
        <button className={`notification-button ${dueReminderCount?'has-alert':''}`} onClick={()=>setSection('reminders')} aria-label={`${dueReminderCount} due reminders`}><BellRing size={18}/>{dueReminderCount>0&&<b>{dueReminderCount}</b>}</button>
        <div className="account"><span className="avatar">{auth.user.name.split(' ').map(p=>p[0]).slice(0,2).join('')}</span><span><strong>{auth.user.name}</strong><small>{auth.user.role}</small></span><button type="button" onClick={logout}>Sign out</button></div>
      </header>
      <div className="page-body">
        {message&&<div className="toast" role="status">{message}<button onClick={()=>setMessage('')}>×</button></div>}
        {section==='dashboard'&&<Dashboard records={records} open={(target,add=true)=>{setSection(target);setShowForm(add)}}/>}
        {config&&<ModulePage module={section} config={config} records={sectionRecords} onAdd={()=>setShowForm(true)} refresh={loadRecords} notify={setMessage}/>}
        {section==='reports'&&<Reports records={records}/>}
        {section==='users'&&<Users currentUser={auth.user} notify={setMessage}/>}
      </div>
    </section>
    {config&&showForm&&<RecordForm module={section} config={config} onClose={()=>setShowForm(false)} onSaved={async()=>{setShowForm(false);await loadRecords();setMessage('Record and reminder saved successfully.')}}/>}
  </main>;
}

function Dashboard({records,open}:{records:FarmRecord[];open:(section:string,add?:boolean)=>void}){
  const activeAnimals=records.filter(r=>r.module==='animals'&&!['Sold','Dead','Transferred'].includes(r.status)).length;
  const reminders=records.filter(r=>r.module==='reminders').sort((a,b)=>a.event_date.localeCompare(b.event_date));
  const overdue=reminders.filter(r=>r.event_date<today());
  const dueToday=reminders.filter(r=>r.event_date===today());
  const thirtyDays=new Date();thirtyDays.setDate(thirtyDays.getDate()+30);const soonDate=thirtyDays.toISOString().slice(0,10);
  const dueSoon=reminders.filter(r=>r.event_date>today()&&r.event_date<=soonDate);
  const finances=records.filter(r=>r.module==='finance');
  const income=finances.filter(r=>r.data.type==='Income').reduce((sum,r)=>sum+Number(r.data.amount||0),0);
  const expense=finances.filter(r=>r.data.type==='Expense').reduce((sum,r)=>sum+Number(r.data.amount||0),0);
  const cards=[
    ['Active animals',String(activeAnimals),'Cows, buffaloes, sheep, goats and chickens'],
    ['Overdue / today',String(overdue.length+dueToday.length),overdue.length?`${overdue.length} overdue task${overdue.length===1?'':'s'}`:'Nothing overdue'],
    ['Next 30 days',String(dueSoon.length),'Vaccines, gestation, service and farm work'],
    ['Farm net result',money(income-expense),'Income minus expenses'],
  ];
  const recent=[...records].filter(r=>r.module!=='reminders').sort((a,b)=>b.event_date.localeCompare(a.event_date)).slice(0,7);
  const upcoming=reminders.slice(0,6);
  const urgent=[...overdue,...dueToday];
  return <>
    <div className="page-heading"><div><span className="section-kicker">Farm overview</span><h1>Good morning</h1><p>Vaccinations, gestation checks, tractor service and every repeat task appear here automatically.</p></div><button className="button primary" onClick={()=>open('animals')}>+ Add animal</button></div>
    {urgent.length>0&&<section className="dashboard-alert" role="status"><span><BellRing size={22}/></span><div><strong>{urgent.length} farm task{urgent.length===1?' needs':'s need'} attention</strong><p>{overdue.length?`${overdue.length} overdue. `:''}{dueToday.length?`${dueToday.length} due today.`:''} Open reminders to complete them and automatically schedule the next repeat.</p></div><button onClick={()=>open('reminders',false)}>Review reminders</button></section>}
    <div className="metric-grid">{cards.map(([label,value,note])=><article className="metric" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>
    <div className="content-grid">
      <section className="panel span-2"><div className="panel-heading"><div><span className="section-kicker">Daily work</span><h2>Recent farm activity</h2></div></div>{recent.length?<div className="activity-list">{recent.map(r=><div className="activity" key={r.id}><span className="activity-icon"><FarmIcon name={r.module} size={15}/></span><div><strong>{r.title}</strong><small>{configs[r.module]?.label||r.module} · {r.event_date}</small></div><span className="status-chip">{r.status}</span></div>)}</div>:<Empty title="You’re ready to begin" text="Add the first animal, field, worker, expense or maintenance record."/>}</section>
      <section className="panel"><div className="panel-heading"><div><span className="section-kicker">Next actions</span><h2>Reminders</h2></div><button onClick={()=>open('reminders',false)}>View all</button></div>{upcoming.length?<div>{upcoming.map(r=>{const state=r.event_date<today()?'overdue':r.event_date===today()?'today':'upcoming';return <div className={`reminder-row ${state}`} key={r.id}><span>{state==='overdue'?'Overdue':state==='today'?'Due today':r.event_date}</span><strong>{r.title}</strong><small>{String(r.data.linkedReference||r.data.sourceModule||'Farm task')}</small></div>})}</div>:<Empty title="No reminders" text="Add a repeat interval to any record and its next due date will appear here." compact/>}</section>
    </div>
    <div className="quick-grid">
      <button onClick={()=>open('health')}><b><Syringe size={16}/></b><span><strong>Vaccination</strong><small>Medicine, next dose and repeat</small></span></button>
      <button onClick={()=>open('breeding')}><b><Baby size={16}/></b><span><strong>Gestation check</strong><small>Pregnancy and expected calving</small></span></button>
      <button onClick={()=>open('maintenance')}><b><Wrench size={16}/></b><span><strong>Service / repair</strong><small>Tractor, parts, expense and next due</small></span></button>
      <button onClick={()=>open('weights')}><b><Scale size={16}/></b><span><strong>Estimate weight</strong><small>Girth, length and daily feed</small></span></button>
    </div>
  </>;
}

function ModulePage({module,config,records,onAdd,refresh,notify}:{module:string;config:ModuleConfig;records:FarmRecord[];onAdd:()=>void;refresh:()=>Promise<void>;notify:(x:string)=>void}){
  async function archive(id:string){if(!confirm('Archive this record? Its dated history will be preserved.'))return;try{await api('/api/records',{method:'PATCH',body:JSON.stringify({id,action:'archive'})});await refresh();notify('Record archived.');}catch(e){notify(e instanceof Error?e.message:'Unable to archive.')}}
  async function complete(id:string){try{const result=await api<{nextDate?:string}>('/api/records',{method:'PATCH',body:JSON.stringify({id,action:'complete'})});await refresh();notify(result.nextDate?`Completed. Next reminder scheduled for ${result.nextDate}.`:'Reminder completed.');}catch(e){notify(e instanceof Error?e.message:'Unable to complete reminder.')}}
  return <>
    <div className="page-heading"><div><span className="section-kicker section-icon"><FarmIcon name={module} size={14}/> Farm records</span><h1>{config.label}</h1><p>{config.description}</p></div><button className="button primary" onClick={onAdd}>+ Add {config.singular}</button></div>
    <section className="panel"><div className="panel-heading"><div><h2>{records.length} {records.length===1?'record':'records'}</h2><p>{module==='reminders'?'Complete a reminder to automatically create its next recurring date.':'Newest activity appears first. Archived records remain in the audit history.'}</p></div><button onClick={()=>window.print()}>Print</button></div>
      {records.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Details</th><th>Status</th><th>Entered by</th><th></th></tr></thead><tbody>{records.map(r=>{
        const reminderState=module==='reminders'?(r.event_date<today()?'Overdue':r.event_date===today()?'Due today':'Upcoming'):r.status;
        return <tr key={r.id}><td className="nowrap">{r.event_date}</td><td><strong>{r.record_key||r.title}</strong></td><td><span className="record-detail">{Object.entries(r.data).filter(([key,v])=>v&&!['reminderEnabled','reminderIntervalValue','reminderIntervalUnit'].includes(key)).slice(0,4).map(([k,v])=>`${k.replace(/([A-Z])/g,' $1')}: ${v}`).join(' · ')}</span></td><td><span className={`status-chip ${String(reminderState).toLowerCase().replace(' ','-')}`}>{reminderState}</span></td><td>{r.created_by_name||'Farm user'}</td><td><div className="row-actions">{module==='reminders'&&<button className="row-action complete" onClick={()=>complete(r.id)}>Done {(r.data.intervalValue||r.data.reminderIntervalValue)?'& next':''}</button>}<button className="row-action" onClick={()=>archive(r.id)}>Archive</button></div></td></tr>;
      })}</tbody></table></div>:<Empty title={`No ${config.label.toLowerCase()} yet`} text={`Add the first ${config.singular} to start this farm history.`}/>}
    </section>
  </>;
}

function RecordForm({module,config,onClose,onSaved}:{module:string;config:ModuleConfig;onClose:()=>void;onSaved:()=>void}){
  const primaryDateKeys=new Set(['purchaseDate','exitDate','measurementDate','checkDate','matingDate','milkDate','sowingDate','crushingDate','paymentDate','transactionDate','recordDate','nextDate']);
  const initial=Object.fromEntries(config.fields.map(f=>[f.key,f.type==='date'&&primaryDateKeys.has(f.key)?today():f.key==='greenPercent'?'10':f.key==='dryPercent'?'2':f.key==='concentratePercent'?'1':'']));
  const [form,setForm]=useState<Record<string,string>>(initial);
  const [status,setStatus]=useState(config.statusOptions?.[0]||'Active');
  const [attachment,setAttachment]=useState<File|null>(null);
  const [reminderEnabled,setReminderEnabled]=useState(['health','breeding','equipment','maintenance','reminders'].includes(module));
  const [reminderTitle,setReminderTitle]=useState('');
  const [reminderIntervalValue,setReminderIntervalValue]=useState('');
  const [reminderIntervalUnit,setReminderIntervalUnit]=useState('months');
  const [reminderExactDate,setReminderExactDate]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const estimated=useMemo(()=>{if(module!=='weights')return null;const girth=Number(form.heartGirth),length=Number(form.bodyLength),scale=Number(form.scaleWeight);const weight=scale||(girth&&length?(girth*girth*length)/10840:0);return weight?{weight,green:weight*Number(form.greenPercent||10)/100,dry:weight*Number(form.dryPercent||2)/100,concentrate:weight*Number(form.concentratePercent||1)/100}:null},[module,form]);
  const eventDate=getRecordDate(form);
  const builtInNextDate=form.nextDate||form.nextMaintenanceDate||form.expectedCalvingDate||form.pregnancyCheckDate||'';
  const computedReminderDate=reminderExactDate||builtInNextDate||addReminderInterval(eventDate,Number(reminderIntervalValue),reminderIntervalUnit);
  const suggestedReminderTitle=module==='health'?`${form.medicine||'Vaccination / medicine'} — ${form.animalTag||'animal'}`:module==='breeding'?`Gestation / breeding check — ${form.animalTag||'animal'}`:module==='maintenance'?`${form.jobType||'Maintenance'} — ${form.assetName||'farm asset'}`:module==='equipment'?`Equipment service — ${form.equipmentName||'equipment'}`:module==='reminders'?form.task||'Farm reminder':`${config.label} follow-up — ${form[config.titleField]||config.singular}`;
  useEffect(()=>{
    const gestationDays:Record<string,number>={Cow:283,Buffalo:310,Goat:150,Sheep:147};
    const days=gestationDays[form.animalType];
    if(module==='breeding'&&form.matingDate&&days&&!form.expectedCalvingDate){
      const d=new Date(`${form.matingDate}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);
      setForm(prev=>({...prev,expectedCalvingDate:d.toISOString().slice(0,10)}));
    }
  },[module,form.animalType,form.matingDate,form.expectedCalvingDate]);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      if(reminderEnabled&&!computedReminderDate&&module!=='reminders')throw new Error('Choose an exact reminder date or enter a repeat interval.');
      const data={...form,reminderEnabled:reminderEnabled?'yes':'no',reminderTitle:reminderTitle||suggestedReminderTitle,reminderDate:computedReminderDate,reminderIntervalValue,reminderIntervalUnit,...(estimated?{estimatedWeight:estimated.weight.toFixed(1),dailyGreenFodder:estimated.green.toFixed(1),dailyDryFodder:estimated.dry.toFixed(1),dailyConcentrate:estimated.concentrate.toFixed(1),weightNotice:'Estimate only — verify with a scale when available.'}:{})};
      const title=form[config.titleField]||config.singular;
      const saved=await api<{id:string}>('/api/records',{method:'POST',body:JSON.stringify({module,title,recordKey:config.keyField?form[config.keyField]:null,status,eventDate,data})});
      if(attachment){const upload=new FormData();upload.append('recordId',saved.id);upload.append('file',attachment);await api('/api/upload',{method:'POST',body:upload});}
      onSaved();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{setBusy(false)}
  }
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="record-modal" role="dialog" aria-modal="true" aria-label={`Add ${config.singular}`}>
    <header><div><span className="section-kicker section-icon"><FarmIcon name={module} size={14}/> New farm record</span><h2>Add {config.singular}</h2><p>{config.description}</p></div><button onClick={onClose} aria-label="Close">×</button></header>
    <form onSubmit={submit}>
      <div className="form-grid">{config.fields.map(field=><label className={field.type==='textarea'?'wide':''} key={field.key}>{field.label}{field.required&&<em>*</em>}{field.type==='select'?<select value={form[field.key]} onChange={e=>setForm({...form,[field.key]:e.target.value})} required={field.required}><option value="">Choose…</option>{field.options?.map(o=><option key={o}>{o}</option>)}</select>:field.type==='textarea'?<textarea value={form[field.key]} onChange={e=>setForm({...form,[field.key]:e.target.value})} rows={3}/>:<input type={field.type||'text'} value={form[field.key]} onChange={e=>setForm({...form,[field.key]:e.target.value})} required={field.required} placeholder={field.placeholder}/>}</label>)}{config.statusOptions&&<label>Current status<select value={status} onChange={e=>setStatus(e.target.value)}>{config.statusOptions.map(o=><option key={o}>{o}</option>)}</select></label>}<label className="wide">Photo, bill, receipt or PDF (optional)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setAttachment(e.target.files?.[0]||null)}/><small>Use your phone camera or gallery. Maximum 8 MB.</small></label></div>
      {estimated&&<div className="calculator-result"><span>Estimated live weight<strong>{estimated.weight.toFixed(1)} kg</strong><small>Measurement estimate, not an exact scale weight</small></span><span>Green fodder<strong>{estimated.green.toFixed(1)} kg/day</strong></span><span>Dry fodder<strong>{estimated.dry.toFixed(1)} kg/day</strong></span><span>Concentrate<strong>{estimated.concentrate.toFixed(1)} kg/day</strong></span></div>}
      <section className={`reminder-builder ${reminderEnabled?'enabled':''}`}>
        <div className="reminder-builder-heading"><span><CalendarClock size={20}/></span><div><strong>{module==='reminders'?'Repeat this reminder':'Remind me when this is needed again'}</strong><small>Works for vaccination, medicine, gestation, service, renovation and every other record.</small></div><label className="toggle"><input type="checkbox" checked={reminderEnabled} onChange={e=>setReminderEnabled(e.target.checked)}/><i/></label></div>
        {reminderEnabled&&<><div className="reminder-grid"><label>Reminder title<input value={reminderTitle} onChange={e=>setReminderTitle(e.target.value)} placeholder={suggestedReminderTitle}/></label><label>Repeat after<input type="number" min="1" value={reminderIntervalValue} onChange={e=>setReminderIntervalValue(e.target.value)} placeholder="Example: 6"/></label><label>Days / months / years<select value={reminderIntervalUnit} onChange={e=>setReminderIntervalUnit(e.target.value)}><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option></select></label><label>Exact first reminder date<input type="date" value={reminderExactDate} onChange={e=>setReminderExactDate(e.target.value)}/></label></div><div className="reminder-preview"><BellRing size={16}/><span>{computedReminderDate?<>Next reminder: <strong>{computedReminderDate}</strong>{reminderIntervalValue&&<> · repeats every {reminderIntervalValue} {reminderIntervalUnit}</>}</>:<>Choose an exact date or a repeat interval.</>}</span></div></>}
      </section>
      {error&&<div className="form-error">{error}</div>}
      <footer><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Saving…':'Save record'}</button></footer>
    </form>
  </section></div>;
}

function Reports({records}:{records:FarmRecord[]}){
  const finance=records.filter(r=>r.module==='finance'); const income=finance.filter(r=>r.data.type==='Income').reduce((s,r)=>s+Number(r.data.amount||0),0); const expense=finance.filter(r=>r.data.type==='Expense').reduce((s,r)=>s+Number(r.data.amount||0),0); const animals=records.filter(r=>r.module==='animals'); const sold=animals.filter(r=>r.status==='Sold').length;
  function csv(){const rows=[['Module','Date','Reference','Status','Data'],...records.map(r=>[r.module,r.event_date,r.record_key||r.title,r.status,JSON.stringify(r.data)])];const text=rows.map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));a.download=`ali-livestock-report-${today()}.csv`;a.click();URL.revokeObjectURL(a.href)}
  return <><div className="page-heading"><div><span className="section-kicker">Farm decisions</span><h1>Reports</h1><p>Essential farm summaries for owners, viewing, printing and download.</p></div><div className="button-row"><button className="button" onClick={()=>window.print()}>Print / PDF</button><button className="button primary" onClick={csv}>Download Excel CSV</button></div></div><div className="metric-grid"><article className="metric"><span>Total income</span><strong>{money(income)}</strong><small>All recorded farm income</small></article><article className="metric"><span>Total expenses</span><strong>{money(expense)}</strong><small>All recorded farm costs</small></article><article className="metric"><span>Net profit / loss</span><strong>{money(income-expense)}</strong><small>Income minus expenses</small></article><article className="metric"><span>Animals sold</span><strong>{sold}</strong><small>Preserved in animal history</small></article></div><section className="panel report-list"><div className="panel-heading"><div><h2>Available reports</h2><p>Each report is calculated from the same connected daily records.</p></div></div>{[['Animals','Animal list, status and complete lifecycle history'],['Weight & growth','Measurement history, gain/loss and feed suggestions'],['Health & breeding','Medicine, vaccines, pregnancy and calving'],['Fields & crops','Field-wise costs, yield and profit/loss'],['Sugarcane & GUR','Daily output, seasonal production and profit'],['Labour','Salary, payments, advances and remaining balance'],['Equipment','Current equipment condition and ownership details'],['Renovation & maintenance','Dated service, tuning, repairs, replaced parts, vendors and costs'],['Money','Monthly income, expense and farm profit/loss']].map(([a,b])=><div key={a}><strong>{a}</strong><span>{b}</span></div>)}</section></>;
}

function Users({currentUser,notify}:{currentUser:User;notify:(s:string)=>void}){
  const [users,setUsers]=useState<Array<Record<string,unknown>>>([]); const [show,setShow]=useState(false); const [form,setForm]=useState({name:'Wasim Ali',phone:'',password:'',role:'owner'});
  const load=useCallback(async()=>{if(currentUser.role!=='owner')return;try{setUsers((await api<{users:Array<Record<string,unknown>>}>('/api/users')).users)}catch(e){notify(e instanceof Error?e.message:'Unable to load users.')}},[currentUser.role,notify]);useEffect(()=>{load()},[load]);
  async function add(e:FormEvent){e.preventDefault();try{const permissions=form.role==='owner'?['*']:['animals:read','animals:write','weights:read','weights:write','health:read','health:write','breeding:read','breeding:write','maintenance:read','maintenance:write','reminders:read','reminders:write'];await api('/api/users',{method:'POST',body:JSON.stringify({...form,permissions})});setShow(false);setForm({name:'',phone:'',password:'',role:'worker'});await load();notify('Portal user added.')}catch(e){notify(e instanceof Error?e.message:'Unable to add user.')}}
  if(currentUser.role!=='owner')return <Empty title="Owner access only" text="Only farm owners can manage user accounts and permissions."/>;
  return <><div className="page-heading"><div><span className="section-kicker">Security</span><h1>Users & Access</h1><p>Owners have full access. Give workers only the sections they need.</p></div><div className="button-row"><a className="button" href="/api/backup">Download backup</a><button className="button primary" onClick={()=>setShow(!show)}>+ Add portal user</button></div></div>{show&&<section className="panel inline-form"><h2>Add owner or worker</h2><form onSubmit={add}><label>Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} required/></label><label>Temporary password<input type="password" minLength={10} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/></label><label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="owner">Owner - full access</option><option value="manager">Manager</option><option value="accountant">Accountant</option><option value="vet">Veterinarian</option><option value="worker">Farm worker</option><option value="viewer">View only</option></select></label><button className="button primary">Add user</button></form></section>}<section className="panel"><div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Last sign in</th></tr></thead><tbody>{users.map(u=><tr key={String(u.id)}><td><strong>{String(u.name)}</strong></td><td>{String(u.phone)}</td><td>{String(u.role)}</td><td><span className="status-chip">{Number(u.active)?'Active':'Disabled'}</span></td><td>{u.last_login_at?String(u.last_login_at).slice(0,10):'Never'}</td></tr>)}</tbody></table></div></section></>;
}

function Empty({title,text,compact=false}:{title:string;text:string;compact?:boolean}){return <div className={`empty ${compact?'compact':''}`}><span>✓</span><h3>{title}</h3><p>{text}</p></div>}
