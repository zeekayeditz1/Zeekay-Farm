'use client';

import { createContext, useContext, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Baby, BadgeDollarSign, Beef, BellRing, CalendarClock, ChartNoAxesCombined,
  CircleUserRound, LayoutDashboard, Milk, Scale,
  ShieldCheck, Sprout, Syringe, Tractor, UsersRound, WalletCards, Wheat, Wrench,
} from 'lucide-react';

type User = { id: string; name: string; phone: string; role: string; permissions: string[] };
type FarmRecord = { id: string; module: string; record_key: string | null; title: string; status: string; event_date: string; linked_id: string | null; data: Record<string, string | number>; created_by_name?: string };
const UserContext=createContext<User|null>(null);
function mayWrite(user:User|null, section:string){return Boolean(user&&(user.role==='owner'||user.permissions.includes('*')||user.permissions.includes((section==='dailyexpenses'?'finance':section)+':write')))}

type Field = { key: string; label: string; type?: 'text'|'number'|'date'|'select'|'textarea'; options?: string[]; required?: boolean; placeholder?: string };
type ModuleConfig = { label: string; singular: string; description: string; icon: string; fields: Field[]; keyField?: string; titleField: string; statusOptions?: string[] };

const animalTypes = ['Cow','Bull','Buffalo','Sheep','Goat','Hen','Chicken','Other'];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => `Rs ${Math.round(value).toLocaleString('en-PK')}`;

type LivestockGroupKey = 'cows'|'bulls'|'goats-female'|'goats-male'|'hens';
const livestockGroups: Array<{key:LivestockGroupKey;label:string;youngLabel:string}> = [
  {key:'cows',label:'Cows',youngLabel:'Female calves'},
  {key:'bulls',label:'Bulls',youngLabel:'Male calves'},
  {key:'goats-female',label:'Female goats',youngLabel:'Female kids'},
  {key:'goats-male',label:'Male goats',youngLabel:'Male kids'},
  {key:'hens',label:'Hens',youngLabel:'Female chicks'},
];
const isPresentAnimal=(record:FarmRecord)=>record.module==='animals'&&!['Sold','Dead','Transferred'].includes(record.status);
const isYoungAnimal=(record:FarmRecord)=>String(record.data.lifeStage||'Adult').toLowerCase().startsWith('young');
function livestockGroupOf(record:FarmRecord):LivestockGroupKey|null{
  const type=String(record.data.animalType||'').toLowerCase();
  const sex=String(record.data.sex||'').toLowerCase();
  if(type==='bull'||(type==='cow'&&sex==='male'))return 'bulls';
  if(type==='cow'&&sex!=='male')return 'cows';
  if(type==='goat'&&sex==='female')return 'goats-female';
  if(type==='goat'&&sex==='male')return 'goats-male';
  if(type==='hen'||(type==='chicken'&&sex==='female'))return 'hens';
  return null;
}
function animalWorth(record:FarmRecord){
  const current=String(record.data.currentWorth??'').trim();
  const value=Number(current!==''?current:record.data.purchasePrice||0);
  return Number.isFinite(value)?value:0;
}
function downloadLivestockSheet(records:FarmRecord[]){
  const animals=records.filter(record=>record.module==='animals');
  const present=animals.filter(isPresentAnimal);
  const summary=livestockGroups.map(group=>{
    const groupRecords=present.filter(record=>livestockGroupOf(record)===group.key);
    return [group.label,groupRecords.filter(record=>!isYoungAnimal(record)).length,groupRecords.filter(isYoungAnimal).length,groupRecords.length,groupRecords.reduce((sum,record)=>sum+animalWorth(record),0)];
  });
  const rows:Array<Array<string|number>>=[
    ['ALI DAIRIES LIVESTOCK WORTH SHEET'],
    ['Generated',today()],
    [],
    ['SECTION SUMMARY'],
    ['Section','Adults','Young / babies','Present total','Current worth (Rs)'],
    ...summary,
    ['Grand total',present.filter(record=>!isYoungAnimal(record)).length,present.filter(isYoungAnimal).length,present.length,present.reduce((sum,record)=>sum+animalWorth(record),0)],
    [],
    ['ANIMAL DETAILS'],
    ['Section','Tag','Animal type','Sex','Age class','Breed','Date of birth','Purchase / entry date','Purchase price (Rs)','Current worth (Rs)','Worth basis','Status','Mother tag','Location','Notes'],
    ...animals.map(record=>[
      livestockGroups.find(group=>group.key===livestockGroupOf(record))?.label||'Other livestock',
      record.record_key||record.title,
      String(record.data.animalType||''),
      String(record.data.sex||''),
      String(record.data.lifeStage||'Adult'),
      String(record.data.breed||''),
      String(record.data.dateOfBirth||''),
      String(record.data.purchaseDate||record.event_date||''),
      Number(record.data.purchasePrice||0),
      animalWorth(record),
      String(record.data.currentWorth??'').trim()?'Current worth':'Purchase price fallback',
      record.status,
      String(record.data.motherId||''),
      String(record.data.location||''),
      String(record.data.notes||''),
    ]),
  ];
  const escape=(cell:string|number)=>`"${String(cell).replaceAll('"','""')}"`;
  const text='\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\n');
  const href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=href;a.download=`ali-dairies-livestock-worth-${today()}.csv`;a.click();URL.revokeObjectURL(href);
}

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
  dailyexpenses: BadgeDollarSign,
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

function getRecordDate(form: Record<string,string>, fallback=today()) {
  return form.recordDate||form.expenseDate||form.exitDate||form.measurementDate||form.checkDate||form.matingDate||form.milkDate||form.sowingDate||form.crushingDate||form.paymentDate||form.transactionDate||form.nextDate||form.purchaseDate||fallback;
}

const configs: Record<string, ModuleConfig> = {
  animals: { label:'Animals', singular:'animal', icon:'AN', description:'One permanent profile from farm entry to sale or other exit.', keyField:'tag', titleField:'tag', statusOptions:['Active','Quarantine','Sick','Pregnant','Sold','Dead','Transferred'], fields:[
    {key:'tag',label:'Animal ID / tag number',required:true,placeholder:'AL-C-0001'}, {key:'animalType',label:'Animal type',type:'select',options:animalTypes,required:true}, {key:'breed',label:'Breed',required:true}, {key:'sex',label:'Sex',type:'select',options:['Female','Male','Unknown'],required:true}, {key:'lifeStage',label:'Age class',type:'select',options:['Adult','Young / baby'],required:true}, {key:'dateOfBirth',label:'Date of birth',type:'date'}, {key:'ageAtEntry',label:'Age when entered',placeholder:'2 years 3 months'}, {key:'purchaseDate',label:'Purchase / entry date',type:'date',required:true}, {key:'purchasePrice',label:'Purchase price (Rs)',type:'number'}, {key:'currentWorth',label:'Current worth / present value (Rs)',type:'number'}, {key:'entryWeight',label:'Weight when entered (kg)',type:'number'}, {key:'currentWeight',label:'Current / estimated weight (kg)',type:'number'}, {key:'seller',label:'Seller name / source'}, {key:'motherId',label:'Mother tag (if known)'}, {key:'fatherInfo',label:'Father / breed information'}, {key:'location',label:'Pen / location'}, {key:'markings',label:'Colour / identifying marks'}, {key:'notes',label:'General notes',type:'textarea'} ] },
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
  dailyexpenses: { label:'Daily Miscellaneous Expenses', singular:'daily expense', icon:'DE', description:'Save every small day-to-day farm expense with its date, amount and clear notes.', titleField:'expenseTitle', fields:[
    {key:'expenseDate',label:'Expense date',type:'date',required:true}, {key:'expenseTitle',label:'What was the expense?',required:true,placeholder:'Tea for labour, rope, puncture, diesel…'}, {key:'amount',label:'Amount (Rs)',type:'number',required:true}, {key:'category',label:'Small expense category',type:'select',options:['Farm supplies','Fuel / transport','Tea / food','Animal care','Feed / fodder','Repair item','Labour support','Cleaning','Office / mobile','Other']}, {key:'paidTo',label:'Paid to / shop name'}, {key:'paymentMethod',label:'Payment method',type:'select',options:['Cash','Bank transfer','EasyPaisa / JazzCash','Credit / due']}, {key:'notes',label:'Expense notes',type:'textarea',required:true,placeholder:'Write exactly where and why this amount was spent.'} ] },
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
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><b>AD</b></span><div><strong>Ali Dairies</strong><small>Farm management portal</small></div></div><span className="section-kicker">{setupRequired?'Secure first-time setup':'Private farm portal'}</span><h1>{setupRequired?'Create the first owner account':'Welcome back'}</h1><p>{setupRequired?'This account receives full access. Add the second owner and selected workers afterward from Users & Access.':'Sign in with your farm phone number and password.'}</p><form onSubmit={submit}>{setupRequired&&<label>Owner name<input value={name} onChange={e=>setName(e.target.value)} required /></label>}<label>Phone number<input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" required placeholder="03xx xxxxxxx" /></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={10} required placeholder="At least 10 characters" /></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="button primary full" disabled={busy}>{busy?'Please wait…':setupRequired?'Secure and open farm':'Sign in'}</button></form><small className="auth-foot">Chak No. 101 D.B · Tehsil Yazman · District Bahawalpur</small></section></main>;
}

export default function FarmPortal() {
  const [auth,setAuth] = useState<{loading:boolean;setupRequired:boolean;user:User|null}>({loading:true,setupRequired:false,user:null});
  const [section,setSection] = useState('dashboard'); const [records,setRecords] = useState<FarmRecord[]>([]); const [search,setSearch] = useState(''); const [showForm,setShowForm] = useState(false); const [message,setMessage] = useState(''); const [menuOpen,setMenuOpen] = useState(false);
  const loadAuth = useCallback(async()=>{ try{const data=await api<{setupRequired:boolean;user:User|null}>('/api/auth'); setAuth({loading:false,...data});}catch{setAuth({loading:false,setupRequired:false,user:null});}},[]);
  const loadRecords = useCallback(async()=>{ if(!auth.user)return; try{const data=await api<{records:FarmRecord[]}>('/api/records');setRecords(data.records);}catch(e){setMessage(e instanceof Error?e.message:'Unable to load records.');}},[auth.user]);
  // These effects load external server data; their state updates happen after the request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{loadAuth();},[loadAuth]); useEffect(()=>{loadRecords();},[loadRecords]);
  if(auth.loading) return <div className="loading-page"><span className="brand-mark"><b>AD</b></span><p>Opening Ali Dairies…</p></div>;
  if(!auth.user) return <AuthScreen setupRequired={auth.setupRequired} onDone={loadAuth}/>;
  const config=configs[section];
  const sectionRecords=records.filter(record=>record.module===section && (!search || `${record.title} ${record.record_key||''} ${JSON.stringify(record.data)}`.toLowerCase().includes(search.toLowerCase())));
  const dueReminderCount=records.filter(record=>record.module==='reminders'&&record.event_date<=today()).length;
  async function logout(){await api('/api/auth',{method:'POST',body:JSON.stringify({action:'logout'})});setAuth({loading:false,setupRequired:false,user:null});}
  return <UserContext.Provider value={auth.user}><main className="app-shell">
    <aside className={`sidebar ${menuOpen?'open':''}`}>
      <div className="brand"><span className="brand-mark"><b>AD</b></span><div><strong>Ali Dairies</strong><small>Farm management</small></div></div>
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
        {section==='animals'&&config&&<AnimalsPage records={sectionRecords} summaryRecords={records.filter(record=>record.module==='animals')} config={config} onAdd={()=>setShowForm(true)} refresh={loadRecords} notify={setMessage}/>}
        {config&&section!=='finance'&&section!=='animals'&&<ModulePage key={section} module={section} config={config} records={sectionRecords} onAdd={()=>setShowForm(true)} refresh={loadRecords} notify={setMessage}/>}
        {section==='finance'&&<FinancePage records={records} search={search} refresh={loadRecords} notify={setMessage}/>}
        {section==='reports'&&<Reports records={records}/>}
        {section==='users'&&<Users currentUser={auth.user} notify={setMessage}/>}
      </div>
    </section>
    {config&&showForm&&section!=='finance'&&<RecordForm module={section} config={config} onClose={()=>setShowForm(false)} onSaved={async()=>{setShowForm(false);await loadRecords();setMessage('Record and reminder saved successfully.')}}/>}
  </main></UserContext.Provider>;
}

function Dashboard({records,open}:{records:FarmRecord[];open:(section:string,add?:boolean)=>void}){
  const activeAnimals=records.filter(r=>r.module==='animals'&&!['Sold','Dead','Transferred'].includes(r.status)).length;
  const reminders=records.filter(r=>r.module==='reminders').sort((a,b)=>a.event_date.localeCompare(b.event_date));
  const overdue=reminders.filter(r=>r.event_date<today());
  const dueToday=reminders.filter(r=>r.event_date===today());
  const thirtyDays=new Date();thirtyDays.setDate(thirtyDays.getDate()+30);const soonDate=thirtyDays.toISOString().slice(0,10);
  const dueSoon=reminders.filter(r=>r.event_date>today()&&r.event_date<=soonDate);
  const finances=records.filter(r=>r.module==='finance'||r.module==='dailyexpenses');
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

function AnimalsPage({records,summaryRecords,config,onAdd,refresh,notify}:{records:FarmRecord[];summaryRecords:FarmRecord[];config:ModuleConfig;onAdd:()=>void;refresh:()=>Promise<void>;notify:(x:string)=>void}){
  const [selected,setSelected]=useState<'all'|LivestockGroupKey>('all');
  const user=useContext(UserContext);
  const canWrite=mayWrite(user,'animals');
  const present=summaryRecords.filter(isPresentAnimal);
  const totalWorth=present.reduce((sum,record)=>sum+animalWorth(record),0);
  const youngCount=present.filter(isYoungAnimal).length;
  const missingWorth=present.filter(record=>String(record.data.currentWorth??'').trim()==='').length;
  const goats=present.filter(record=>['goats-female','goats-male'].includes(String(livestockGroupOf(record))));
  const visible=selected==='all'?records:records.filter(record=>livestockGroupOf(record)===selected);
  const selectedLabel=selected==='all'?'All animal records':livestockGroups.find(group=>group.key===selected)?.label||'Animals';
  return <>
    <div className="page-heading"><div><span className="section-kicker section-icon"><FarmIcon name="animals" size={14}/> Livestock register</span><h1>Animals</h1><p>Cows, bulls, female goats, male goats and hens are separated below. Present worth and young stock totals update from the editable animal profiles.</p></div><div className="button-row"><button className="button" onClick={()=>downloadLivestockSheet(summaryRecords)}>Download worth sheet</button>{canWrite&&<button className="button primary" onClick={onAdd}>+ Add animal</button>}</div></div>
    <div className="metric-grid livestock-metrics"><article className="metric"><span>Present livestock</span><strong>{present.length}</strong><small>All animals currently on the farm</small></article><article className="metric"><span>Present livestock worth</span><strong>{money(totalWorth)}</strong><small>{missingWorth?`${missingWorth} record${missingWorth===1?'':'s'} still use purchase price until current worth is entered`:'Every present animal has a current worth'}</small></article><article className="metric"><span>Total goats</span><strong>{goats.length}</strong><small>{goats.filter(record=>livestockGroupOf(record)==='goats-female').length} female · {goats.filter(record=>livestockGroupOf(record)==='goats-male').length} male</small></article><article className="metric"><span>Young / babies</span><strong>{youngCount}</strong><small>Calves, kids and chicks marked as young</small></article></div>
    <section className="panel livestock-overview"><div className="panel-heading"><div><span className="section-kicker">Separate livestock sections</span><h2>Present stock & worth</h2><p>Click a section to show only those animal records. Sold, dead and transferred records stay in history but are excluded from present totals and worth.</p></div>{selected!=='all'&&<button onClick={()=>setSelected('all')}>Show all</button>}</div>
      <div className="livestock-cards">{livestockGroups.map(group=>{const grouped=present.filter(record=>livestockGroupOf(record)===group.key);const adults=grouped.filter(record=>!isYoungAnimal(record));const young=grouped.filter(isYoungAnimal);const worth=grouped.reduce((sum,record)=>sum+animalWorth(record),0);return <button type="button" className={selected===group.key?'livestock-card active':'livestock-card'} onClick={()=>setSelected(group.key)} key={group.key}><span>{group.label}</span><strong>{grouped.length}</strong><div><small>Adults<b>{adults.length}</b></small><small>{group.youngLabel}<b>{young.length}</b></small></div><em>{money(worth)}</em><i>Present worth</i></button>})}</div>
    </section>
    <div className="livestock-selected"><div><span className="section-kicker">Viewing</span><strong>{selectedLabel}</strong></div><span>{visible.length} saved record{visible.length===1?'':'s'}</span></div>
    <ModulePage key={selected} module="animals" config={config} records={visible} onAdd={onAdd} refresh={refresh} notify={notify} embedded/>
  </>;
}

function FinancePage({records,search,refresh,notify}:{records:FarmRecord[];search:string;refresh:()=>Promise<void>;notify:(x:string)=>void}){
  const [tab,setTab]=useState<'finance'|'dailyexpenses'>('finance');
  const [showForm,setShowForm]=useState(false);
  const user=useContext(UserContext);
  const config=configs[tab];
  const canWrite=mayWrite(user,tab);
  const filtered=records.filter(record=>record.module===tab&&(!search||`${record.title} ${JSON.stringify(record.data)}`.toLowerCase().includes(search.toLowerCase())));
  const dailyRecords=records.filter(record=>record.module==='dailyexpenses');
  const todayTotal=dailyRecords.filter(record=>record.event_date===today()).reduce((sum,record)=>sum+Number(record.data.amount||0),0);
  const currentMonth=today().slice(0,7);
  const monthTotal=dailyRecords.filter(record=>record.event_date.startsWith(currentMonth)).reduce((sum,record)=>sum+Number(record.data.amount||0),0);
  function switchTab(next:'finance'|'dailyexpenses'){setTab(next);setShowForm(false)}
  return <>
    <div className="page-heading"><div><span className="section-kicker section-icon"><FarmIcon name="finance" size={14}/> Farm accounts</span><h1>Income & Expenses</h1><p>Keep the main farm ledger and everyday small expenses together without mixing their dated histories.</p></div>{canWrite&&<button className="button primary" onClick={()=>setShowForm(true)}>+ Add {tab==='dailyexpenses'?'small expense':'money record'}</button>}</div>
    <div className="finance-subtabs" role="tablist" aria-label="Income and expense sections">
      <button className={tab==='finance'?'active':''} onClick={()=>switchTab('finance')} role="tab" aria-selected={tab==='finance'}><span><WalletCards size={18}/></span><div><strong>Income & expense ledger</strong><small>Regular income, purchases and major payments</small></div></button>
      <button className={tab==='dailyexpenses'?'active':''} onClick={()=>switchTab('dailyexpenses')} role="tab" aria-selected={tab==='dailyexpenses'}><span><BadgeDollarSign size={18}/></span><div><strong>Daily miscellaneous expenses</strong><small>Chota mota farm kharcha with date and notes</small></div><b>{dailyRecords.length}</b></button>
    </div>
    {tab==='dailyexpenses'&&<div className="daily-expense-summary"><span>Spent today<strong>{money(todayTotal)}</strong></span><span>This month<strong>{money(monthTotal)}</strong></span><span>Saved entries<strong>{dailyRecords.length}</strong></span></div>}
    <ModulePage key={tab} module={tab} config={config} records={filtered} onAdd={()=>setShowForm(true)} refresh={refresh} notify={notify} embedded/>
    {showForm&&<RecordForm module={tab} config={config} onClose={()=>setShowForm(false)} onSaved={async()=>{setShowForm(false);await refresh();notify(tab==='dailyexpenses'?'Daily miscellaneous expense saved.':'Income or expense record saved.')}}/>}
  </>;
}

function ModulePage({module,config,records,onAdd,refresh,notify,embedded=false}:{module:string;config:ModuleConfig;records:FarmRecord[];onAdd:()=>void;refresh:()=>Promise<void>;notify:(x:string)=>void;embedded?:boolean}){
  const [editing,setEditing]=useState<FarmRecord|null>(null);
  const [deleting,setDeleting]=useState<FarmRecord|null>(null);
  const [busy,setBusy]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const user=useContext(UserContext);
  const canWrite=mayWrite(user,module);
  async function remove(){if(!deleting||busy)return;setBusy(true);setDeleteError('');try{await api('/api/records',{method:'DELETE',body:JSON.stringify({id:deleting.id})});setDeleting(null);await refresh();notify('Record deleted.');}catch(e){setDeleteError(e instanceof Error?e.message:'Unable to delete.')}finally{setBusy(false)}}
  async function archive(id:string){if(!confirm('Archive this record? Its dated history will be preserved.'))return;try{await api('/api/records',{method:'PATCH',body:JSON.stringify({id,action:'archive'})});await refresh();notify('Record archived.');}catch(e){notify(e instanceof Error?e.message:'Unable to archive.')}}
  async function complete(id:string){try{const result=await api<{nextDate?:string}>('/api/records',{method:'PATCH',body:JSON.stringify({id,action:'complete'})});await refresh();notify(result.nextDate?`Completed. Next reminder scheduled for ${result.nextDate}.`:'Reminder completed.');}catch(e){notify(e instanceof Error?e.message:'Unable to complete reminder.')}}
  return <>
    {!embedded&&<div className="page-heading"><div><span className="section-kicker section-icon"><FarmIcon name={module} size={14}/> Farm records</span><h1>{config.label}</h1><p>{config.description}</p></div>{canWrite&&<button className="button primary" onClick={onAdd}>+ Add {config.singular}</button>}</div>}
    <section className="panel"><div className="panel-heading"><div><h2>{records.length} {records.length===1?'record':'records'}</h2><p>{module==='reminders'?'Complete a reminder to automatically create its next recurring date.':'Newest activity appears first. Archived records remain in the audit history.'}</p></div><button onClick={()=>window.print()}>Print</button></div>
      {records.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Details</th><th>Status</th><th>Entered by</th><th className="actions-cell">Actions</th></tr></thead><tbody>{records.map(r=>{
        const reminderState=module==='reminders'?(r.event_date<today()?'Overdue':r.event_date===today()?'Due today':'Upcoming'):r.status;
        return <tr key={r.id}><td className="nowrap">{r.event_date}</td><td><strong>{r.record_key||r.title}</strong></td><td><span className="record-detail">{module==='animals'?`${r.data.animalType||'Animal'} · ${r.data.sex||'Unknown'} · ${r.data.lifeStage||'Adult'} · ${r.data.breed||'Breed not set'} · Worth: ${money(animalWorth(r))}`:Object.entries(r.data).filter(([key,v])=>v&&!['reminderEnabled','reminderIntervalValue','reminderIntervalUnit'].includes(key)).slice(0,4).map(([k,v])=>`${k.replace(/([A-Z])/g,' $1')}: ${v}`).join(' · ')}</span></td><td><span className={`status-chip ${String(reminderState).toLowerCase().replace(' ','-')}`}>{reminderState}</span></td><td>{r.created_by_name||'Farm user'}</td><td className="actions-cell"><div className="row-actions">{canWrite&&<><button className="row-action edit" onClick={()=>setEditing(r)} aria-label={`Edit ${r.record_key||r.title}`}>Edit</button><button className="row-action danger" onClick={()=>{setDeleteError('');setDeleting(r)}} aria-label={`Delete ${r.record_key||r.title}`}>Delete</button>{module==='reminders'&&<button className="row-action complete" onClick={()=>complete(r.id)}>Done {(r.data.intervalValue||r.data.reminderIntervalValue)?'& next':''}</button>}{['owner','manager'].includes(user?.role||'')&&<button className="row-action" onClick={()=>archive(r.id)}>Archive</button>}</>}{!canWrite&&<span>View only</span>}</div></td></tr>;
      })}</tbody></table></div>:<Empty title={`No ${config.label.toLowerCase()} yet`} text={`Add the first ${config.singular} to start this farm history.`}/>}
    </section>
    {editing&&<RecordForm key={editing.id} module={module} config={config} record={editing} onClose={()=>setEditing(null)} onSaved={async()=>{setEditing(null);await refresh();notify('Changes saved.')}}/>}
    {deleting&&<div className="modal-backdrop"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description"><h2 id="delete-title">Delete {config.singular}?</h2><p id="delete-description"><strong>{deleting.record_key||deleting.title}</strong> · {deleting.event_date}<br/>This removes the entry from the portal and reports, along with its pending reminders. Other farm records stay intact. A private audit copy is kept.</p>{deleteError&&<p className="form-error" role="alert">{deleteError}</p>}<div className="button-row"><button autoFocus className="button" disabled={busy} onClick={()=>setDeleting(null)}>Cancel</button><button className="button danger-button" disabled={busy} onClick={remove}>{busy?'Deleting…':'Delete record'}</button></div></section></div>}
  </>;
}

function RecordForm({module,config,record,onClose,onSaved}:{module:string;config:ModuleConfig;record?:FarmRecord;onClose:()=>void;onSaved:()=>void}){
  const primaryDateKeys=new Set(['purchaseDate','exitDate','measurementDate','checkDate','matingDate','milkDate','sowingDate','crushingDate','paymentDate','transactionDate','expenseDate','recordDate','nextDate']);
  const initial=Object.fromEntries(config.fields.map(f=>[f.key,record?String(record.data[f.key]??(f.key===config.titleField?record.title:f.key==='nextDate'&&module==='reminders'?record.event_date:'')):f.type==='date'&&primaryDateKeys.has(f.key)?today():f.key==='greenPercent'?'10':f.key==='dryPercent'?'2':f.key==='concentratePercent'?'1':'']));
  const [form,setForm]=useState<Record<string,string>>(initial);
  const [status,setStatus]=useState(record?.status||config.statusOptions?.[0]||'Active');
  const [attachment,setAttachment]=useState<File|null>(null);
  const [reminderEnabled,setReminderEnabled]=useState(record?module==='reminders'?Number(record.data.intervalValue||record.data.reminderIntervalValue||0)>0:record.data.reminderEnabled==='yes'||(record.data.reminderEnabled!=='no'&&Boolean(record.data.nextDate||record.data.nextMaintenanceDate||record.data.expectedCalvingDate)):['health','breeding','equipment','maintenance','reminders'].includes(module));
  const [reminderTitle,setReminderTitle]=useState(String(record?.data.reminderTitle||''));
  const [reminderIntervalValue,setReminderIntervalValue]=useState(String(record?.data.intervalValue||record?.data.reminderIntervalValue||''));
  const [reminderIntervalUnit,setReminderIntervalUnit]=useState(String(record?.data.intervalUnit||record?.data.reminderIntervalUnit||'months'));
  const [reminderExactDate,setReminderExactDate]=useState(String(record?.data.reminderDate||''));
  const [savedId,setSavedId]=useState(record?.id||'');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const estimated=useMemo(()=>{if(module!=='weights')return null;const girth=Number(form.heartGirth),length=Number(form.bodyLength),scale=Number(form.scaleWeight);const weight=scale||(girth&&length?(girth*girth*length)/10840:0);return weight?{weight,green:weight*Number(form.greenPercent||10)/100,dry:weight*Number(form.dryPercent||2)/100,concentrate:weight*Number(form.concentratePercent||1)/100}:null},[module,form]);
  const eventDate=getRecordDate(form,record?.event_date||today());
  const builtInNextDate=form.nextDate||form.nextMaintenanceDate||form.expectedCalvingDate||form.pregnancyCheckDate||'';
  const computedReminderDate=reminderExactDate||builtInNextDate||addReminderInterval(eventDate,Number(reminderIntervalValue),reminderIntervalUnit);
  const suggestedReminderTitle=module==='health'?`${form.medicine||'Vaccination / medicine'} — ${form.animalTag||'animal'}`:module==='breeding'?`Gestation / breeding check — ${form.animalTag||'animal'}`:module==='maintenance'?`${form.jobType||'Maintenance'} — ${form.assetName||'farm asset'}`:module==='equipment'?`Equipment service — ${form.equipmentName||'equipment'}`:module==='reminders'?form.task||'Farm reminder':`${config.label} follow-up — ${form[config.titleField]||config.singular}`;
  function changeField(key:string,value:string){
    setForm(previous=>{
      const next={...previous,[key]:value};
      if(module==='animals'&&key==='animalType'&&value==='Bull')next.sex='Male';
      if(module==='animals'&&key==='animalType'&&value==='Hen')next.sex='Female';
      const days=({Cow:283,Buffalo:310,Goat:150,Sheep:147} as Record<string,number>)[next.animalType];
      if(module==='breeding'&&['matingDate','animalType'].includes(key)&&next.matingDate&&days&&!next.expectedCalvingDate){
        const date=new Date(next.matingDate+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);next.expectedCalvingDate=date.toISOString().slice(0,10);
      }
      return next;
    });
  }
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      if(reminderEnabled&&!computedReminderDate&&module!=='reminders')throw new Error('Choose an exact reminder date or enter a repeat interval.');
      const data={...record?.data,...form,...(module==='dailyexpenses'?{type:'Expense',expenseKind:'Daily miscellaneous'}:{}),reminderEnabled:reminderEnabled?'yes':'no',reminderTitle:reminderTitle||suggestedReminderTitle,reminderDate:computedReminderDate,reminderIntervalValue:reminderEnabled?reminderIntervalValue:'',reminderIntervalUnit,...(module==='reminders'?{intervalValue:reminderEnabled?reminderIntervalValue:'',intervalUnit:reminderIntervalUnit,recurrenceEnabled:reminderEnabled&&Number(reminderIntervalValue)>0?'yes':'no'}:{}),...(estimated?{estimatedWeight:estimated.weight.toFixed(1),dailyGreenFodder:estimated.green.toFixed(1),dailyDryFodder:estimated.dry.toFixed(1),dailyConcentrate:estimated.concentrate.toFixed(1),weightNotice:'Estimate only — verify with a scale when available.'}:module==='weights'?{estimatedWeight:'',dailyGreenFodder:'',dailyDryFodder:'',dailyConcentrate:'',weightNotice:''}:{})};
      const title=form[config.titleField]||config.singular;
      const saved=await api<{id:string}>('/api/records',{method:savedId?'PATCH':'POST',body:JSON.stringify({id:savedId||undefined,module,title,recordKey:config.keyField?form[config.keyField]:null,status,eventDate,data})});
      setSavedId(saved.id);
      if(attachment){const upload=new FormData();upload.append('recordId',saved.id);upload.append('file',attachment);await api('/api/upload',{method:'POST',body:upload});}
      onSaved();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{setBusy(false)}
  }
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section className="record-modal" role="dialog" aria-modal="true" aria-label={`${record?'Edit':'Add'} ${config.singular}`}>
    <header><div><span className="section-kicker section-icon"><FarmIcon name={module} size={14}/> {record?'Edit farm record':'New farm record'}</span><h2>{record?'Edit':'Add'} {config.singular}</h2><p>{config.description}</p></div><button disabled={busy} onClick={onClose} aria-label="Close">×</button></header>
    <form onSubmit={submit}>
      <div className="form-grid">{config.fields.map(field=><label className={field.type==='textarea'?'wide':''} key={field.key}>{field.label}{field.required&&<em>*</em>}{field.type==='select'?<select value={form[field.key]} onChange={e=>changeField(field.key,e.target.value)} required={field.required}><option value="">Choose…</option>{form[field.key]&&!field.options?.includes(form[field.key])&&<option value={form[field.key]}>{form[field.key]}</option>}{field.options?.map(o=><option key={o}>{o}</option>)}</select>:field.type==='textarea'?<textarea required={field.required} value={form[field.key]} onChange={e=>changeField(field.key,e.target.value)} rows={3}/>:<input step={field.type==='number'?'any':undefined} type={field.type||'text'} value={form[field.key]} onChange={e=>changeField(field.key,e.target.value)} required={field.required} placeholder={field.placeholder}/>}</label>)}{config.statusOptions&&<label>Current status<select value={status} onChange={e=>setStatus(e.target.value)}>{!config.statusOptions.includes(status)&&<option value={status}>{status}</option>}{config.statusOptions.map(o=><option key={o}>{o}</option>)}</select></label>}<label className="wide">Photo, bill, receipt or PDF (optional)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setAttachment(e.target.files?.[0]||null)}/><small>Use your phone camera or gallery. Maximum 8 MB.</small></label></div>
      {record&&<Attachments recordId={record.id}/>}
      {estimated&&<div className="calculator-result"><span>Estimated live weight<strong>{estimated.weight.toFixed(1)} kg</strong><small>Measurement estimate, not an exact scale weight</small></span><span>Green fodder<strong>{estimated.green.toFixed(1)} kg/day</strong></span><span>Dry fodder<strong>{estimated.dry.toFixed(1)} kg/day</strong></span><span>Concentrate<strong>{estimated.concentrate.toFixed(1)} kg/day</strong></span></div>}
      <section className={`reminder-builder ${reminderEnabled?'enabled':''}`}>
        <div className="reminder-builder-heading"><span><CalendarClock size={20}/></span><div><strong>{module==='reminders'?'Repeat this reminder':'Remind me when this is needed again'}</strong><small>Works for vaccination, medicine, gestation, service, renovation and every other record.</small></div><label className="toggle"><input type="checkbox" checked={reminderEnabled} onChange={e=>setReminderEnabled(e.target.checked)}/><i/></label></div>
        {reminderEnabled&&<><div className="reminder-grid"><label>Reminder title<input value={reminderTitle} onChange={e=>setReminderTitle(e.target.value)} placeholder={suggestedReminderTitle}/></label><label>Repeat after<input type="number" min="1" value={reminderIntervalValue} onChange={e=>setReminderIntervalValue(e.target.value)} placeholder="Example: 6"/></label><label>Days / months / years<select value={reminderIntervalUnit} onChange={e=>setReminderIntervalUnit(e.target.value)}><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option></select></label><label>Exact first reminder date<input type="date" value={reminderExactDate} onChange={e=>setReminderExactDate(e.target.value)}/></label></div><div className="reminder-preview"><BellRing size={16}/><span>{computedReminderDate?<>Next reminder: <strong>{computedReminderDate}</strong>{reminderIntervalValue&&<> · repeats every {reminderIntervalValue} {reminderIntervalUnit}</>}</>:<>Choose an exact date or a repeat interval.</>}</span></div></>}
      </section>
      {error&&<div className="form-error">{error}</div>}
      <footer><button type="button" className="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Saving…':record?'Save changes':'Save record'}</button></footer>
    </form>
  </section></div>;
}

function Attachments({recordId}:{recordId:string}){
  const [files,setFiles]=useState<Array<{id:string;filename:string}>>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const load=useCallback(async()=>{try{setFiles((await api<{files:Array<{id:string;filename:string}>}>(`/api/upload?recordId=${encodeURIComponent(recordId)}`)).files)}catch(e){setError(e instanceof Error?e.message:'Unable to load attachments.')}},[recordId]);
  // Load external server data when the selected record or account changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{load()},[load]);
  async function remove(id:string){if(!confirm('Delete this attachment? You can upload a replacement using the file field above.'))return;setBusy(id);setError('');try{await api('/api/upload',{method:'DELETE',body:JSON.stringify({id})});await load()}catch(e){setError(e instanceof Error?e.message:'Unable to delete attachment.')}finally{setBusy('')}}
  return <section className="attachment-list"><h3>Saved attachments</h3>{files.length?files.map(file=><div key={file.id}><a href={`/api/upload?id=${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">{file.filename}</a><button type="button" className="row-action danger" disabled={Boolean(busy)} onClick={()=>remove(file.id)}>{busy===file.id?'Deleting…':'Delete attachment'}</button></div>):<p>No saved attachments.</p>}{error&&<p role="alert" className="form-error">{error}</p>}</section>;
}

function Reports({records}:{records:FarmRecord[]}){
  const finance=records.filter(r=>r.module==='finance'||r.module==='dailyexpenses'); const income=finance.filter(r=>r.data.type==='Income').reduce((s,r)=>s+Number(r.data.amount||0),0); const expense=finance.filter(r=>r.data.type==='Expense').reduce((s,r)=>s+Number(r.data.amount||0),0); const animals=records.filter(r=>r.module==='animals'); const sold=animals.filter(r=>r.status==='Sold').length;
  function csv(){const rows=[['Module','Date','Reference','Status','Data'],...records.map(r=>[r.module,r.event_date,r.record_key||r.title,r.status,JSON.stringify(r.data)])];const text=rows.map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));a.download=`ali-dairies-report-${today()}.csv`;a.click();URL.revokeObjectURL(a.href)}
  return <><div className="page-heading"><div><span className="section-kicker">Farm decisions</span><h1>Reports</h1><p>Essential farm summaries for owners, viewing, printing and download.</p></div><div className="button-row"><button className="button" onClick={()=>window.print()}>Print / PDF</button><button className="button primary" onClick={csv}>Download Excel CSV</button></div></div><div className="metric-grid"><article className="metric"><span>Total income</span><strong>{money(income)}</strong><small>All recorded farm income</small></article><article className="metric"><span>Total expenses</span><strong>{money(expense)}</strong><small>Includes daily miscellaneous expenses</small></article><article className="metric"><span>Net profit / loss</span><strong>{money(income-expense)}</strong><small>Income minus every recorded expense</small></article><article className="metric"><span>Animals sold</span><strong>{sold}</strong><small>Preserved in animal history</small></article></div><section className="panel report-list"><div className="panel-heading"><div><h2>Available reports</h2><p>Each report is calculated from the same connected daily records.</p></div></div>{[['Animals','Animal list, status and complete lifecycle history'],['Weight & growth','Measurement history, gain/loss and feed suggestions'],['Health & breeding','Medicine, vaccines, pregnancy and calving'],['Fields & crops','Field-wise costs, yield and profit/loss'],['Sugarcane & GUR','Daily output, seasonal production and profit'],['Labour','Salary, payments, advances and remaining balance'],['Equipment','Current equipment condition and ownership details'],['Renovation & maintenance','Dated service, tuning, repairs, replaced parts, vendors and costs'],['Daily miscellaneous expenses','Every small dated farm expense with amount and notes'],['Money','Monthly income, every expense and farm profit/loss']].map(([a,b])=><div key={a}><strong>{a}</strong><span>{b}</span></div>)}</section></>;
}

function Users({currentUser,notify}:{currentUser:User;notify:(s:string)=>void}){
  const [users,setUsers]=useState<Array<Record<string,unknown>>>([]);
  const [show,setShow]=useState(false);
  const [editing,setEditing]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [form,setForm]=useState({name:'',phone:'',password:'',role:'worker'});
  const load=useCallback(async()=>{if(currentUser.role!=='owner')return;try{setUsers((await api<{users:Array<Record<string,unknown>>}>('/api/users')).users)}catch(e){notify(e instanceof Error?e.message:'Unable to load users.')}},[currentUser.role,notify]);
  // Load external server data when the selected record or account changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{load()},[load]);
  function edit(user?:Record<string,unknown>){setEditing(user?String(user.id):'');setForm({name:String(user?.name||''),phone:String(user?.phone||''),password:'',role:String(user?.role||'worker')});setError('');setShow(true)}
  async function save(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      const sections=['animals','sales','weights','health','breeding','milk','fields','gur','labour','equipment','maintenance','finance','reminders'];
      const scoped=form.role==='accountant'?['finance','labour','sales']:form.role==='vet'?['animals','weights','health','breeding','reminders']:form.role==='worker'?['animals','weights','health','breeding','maintenance','reminders']:sections;
      const permissions=form.role==='owner'?['*']:scoped.flatMap(section=>form.role==='viewer'?[section+':read']:[section+':read',section+':write']);
      await api('/api/users',{method:editing?'PATCH':'POST',body:JSON.stringify({...form,id:editing||undefined,permissions})});setShow(false);await load();notify(editing?'User changes saved.':'Portal user added.');
    }catch(e){setError(e instanceof Error?e.message:'Unable to save user.')}finally{setBusy(false)}
  }
  async function remove(user:Record<string,unknown>){
    if(!confirm('Delete portal user '+String(user.name)+'? Their sign-in access will be removed. Records they entered will be preserved.'))return;
    setBusy(true);try{await api('/api/users',{method:'DELETE',body:JSON.stringify({id:user.id})});await load();notify('Portal user deleted.')}catch(e){notify(e instanceof Error?e.message:'Unable to delete user.')}finally{setBusy(false)}
  }
  if(currentUser.role!=='owner')return <Empty title="Owner access only" text="Only farm owners can manage user accounts and permissions."/>;
  return <>
    <div className="page-heading"><div><span className="section-kicker">Security</span><h1>Users & Access</h1><p>Owners have full access. Give workers only the sections they need.</p></div><div className="button-row"><a className="button" href="/api/backup">Download backup</a><button className="button primary" onClick={()=>edit()}>+ Add portal user</button></div></div>
    {show&&<section className="panel inline-form"><h2>{editing?'Edit portal user':'Add portal user'}</h2><form onSubmit={save}>
      <label>Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label>
      <label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} required/></label>
      <label>{editing?'New password (optional)':'Temporary password'}<input type="password" autoComplete="new-password" minLength={10} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required={!editing}/>{editing&&<small>Leave blank to keep the current password.</small>}</label>
      <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="owner">Owner - full access</option><option value="manager">Manager</option><option value="accountant">Accountant</option><option value="vet">Veterinarian</option><option value="worker">Farm worker</option><option value="viewer">View only</option></select></label>
      {error&&<p className="form-error" role="alert">{error}</p>}<div className="button-row"><button type="button" className="button" disabled={busy} onClick={()=>setShow(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Saving…':editing?'Save changes':'Add user'}</button></div>
    </form></section>}
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Last sign in</th><th className="actions-cell">Actions</th></tr></thead><tbody>{users.map(u=><tr key={String(u.id)}><td><strong>{String(u.name)}</strong></td><td>{String(u.phone)}</td><td>{String(u.role)}</td><td><span className="status-chip">{Number(u.active)?'Active':'Disabled'}</span></td><td>{u.last_login_at?String(u.last_login_at).slice(0,10):'Never'}</td><td className="actions-cell"><div className="row-actions"><button className="row-action edit" disabled={busy} onClick={()=>edit(u)}>Edit</button>{u.id!==currentUser.id&&<button className="row-action danger" disabled={busy} onClick={()=>remove(u)}>Delete</button>}</div></td></tr>)}</tbody></table></div></section>
  </>;
}

function Empty({title,text,compact=false}:{title:string;text:string;compact?:boolean}){return <div className={`empty ${compact?'compact':''}`}><span>✓</span><h3>{title}</h3><p>{text}</p></div>}
