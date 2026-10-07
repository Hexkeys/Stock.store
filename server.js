const express=require("express");
const path=require("path");
const {Pool}=require("pg");

const app=express();
app.use(express.json({limit:"100kb"}));
const port=process.env.PORT||10000;
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;

const now=()=>new Date().toISOString();
const isProduction=process.env.NODE_ENV==="production";
const makeId=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);

const DEFAULT_STATE={
  companyName:"Hex Company",
  companyValue:1000,
  totalShares:1000,
  owners:[
    {id:makeId(),name:"Hex Company",investment:990,ownershipPct:99,investedAt:now(),investmentCompanyValue:1000},
    {id:makeId(),name:"Walter",investment:10,ownershipPct:1,investedAt:now(),investmentCompanyValue:1000}
  ],
  history:[{ts:now(),value:1000}]
};

function migrate(data){
  const result=data&&typeof data==="object"?data:{};
  const companyValue=Math.max(0,Number(result.companyValue)||0);
  if(!Array.isArray(result.owners))result.owners=[];
  result.owners=result.owners.slice(0,100).map(o=>{
    const owner={...o};
    owner.id=String(owner.id||makeId());
    owner.name=String(owner.name||"Unnamed").slice(0,80);
    owner.investment=Math.max(0,Number(owner.investment)||0);
    if(!Number.isFinite(Number(owner.ownershipPct))){
      owner.ownershipPct=companyValue>0?owner.investment/companyValue*100:0;
    }else{
      owner.ownershipPct=Math.max(0,Number(owner.ownershipPct)||0);
    }
    if(!owner.investedAt)owner.investedAt=now();
    if(!Number.isFinite(Number(owner.investmentCompanyValue)))owner.investmentCompanyValue=companyValue;
    owner.investmentCompanyValue=Math.max(0,Number(owner.investmentCompanyValue)||0);
    return {
      id:owner.id,
      name:owner.name,
      investment:owner.investment,
      ownershipPct:owner.ownershipPct,
      investedAt:owner.investedAt,
      investmentCompanyValue:owner.investmentCompanyValue
    };
  });
  if(!Array.isArray(result.history)||!result.history.length){
    result.history=[{ts:now(),value:companyValue}];
  }
  return result;
}

async function initDb(){
  if(!pool)return;
  await pool.query("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const {rows}=await pool.query("SELECT data FROM app_state WHERE id=1");
  if(!rows.length){
    await pool.query("INSERT INTO app_state (id,data) VALUES (1,$1::jsonb)",[JSON.stringify(DEFAULT_STATE)]);
  }else{
    const data=migrate(rows[0].data);
    await pool.query("UPDATE app_state SET data=$1::jsonb,updated_at=NOW() WHERE id=1",[JSON.stringify(data)]);
  }
}

async function getState(){
  if(!pool){if(isProduction)throw new Error("DATABASE_URL is not configured");return migrate(DEFAULT_STATE);}
  const {rows}=await pool.query("SELECT data FROM app_state WHERE id=1");
  const data=migrate(rows[0]?.data||DEFAULT_STATE);
  return data;
}

async function saveState(data){
  const migrated=migrate(data);
  migrated.updatedAt=now();
  if(!pool){if(isProduction)throw new Error("DATABASE_URL is not configured");return migrated;}
  await pool.query(
    "INSERT INTO app_state (id,data,updated_at) VALUES (1,$1::jsonb,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",
    [JSON.stringify(migrated)]
  );
  return migrated;
}

function clean(input,current){
  if(!input||typeof input!=="object")throw new Error("Invalid state");
  const currentById=new Map((current?.owners||[]).map(o=>[String(o.id),o]));
  const companyValue=Math.max(0,Number(input.companyValue)||0);
  const totalShares=Math.max(1,Number(input.totalShares)||1);

  const owners=Array.isArray(input.owners)?input.owners.slice(0,100).map(o=>{
    const id=String(o?.id||"");
    const existing=currentById.get(id);
    const investment=Math.max(0,Number(o?.investment)||0);
    const owner={
      id:id||makeId(),
      name:String(o?.name||"Unnamed").slice(0,80),
      investment,
      ownershipPct:0,
      investedAt:now(),
      investmentCompanyValue:companyValue
    };
    if(existing){
      owner.ownershipPct=Math.max(0,Number(existing.ownershipPct)||0);
      owner.investedAt=existing.investedAt||now();
      owner.investmentCompanyValue=Math.max(0,Number(existing.investmentCompanyValue)||0);
    }else if(Number.isFinite(Number(o?.ownershipPct))){
      owner.ownershipPct=Math.max(0,Number(o.ownershipPct)||0);
      owner.investedAt=o?.investedAt||now();
      owner.investmentCompanyValue=Math.max(0,Number(o?.investmentCompanyValue)||companyValue);
    }else if(investment>0){
      owner.ownershipPct=companyValue>0?investment/companyValue*100:0;
    }
    return owner;
  }):[];

  const previous=Array.isArray(current?.history)?current.history:[];
  let history=previous
    .filter(p=>p&&Number.isFinite(Number(p.value))&&p.ts)
    .slice(-5000)
    .map(p=>({ts:new Date(p.ts).toISOString(),value:Math.max(0,Number(p.value)||0)}));
  const last=history[history.length-1];
  if(!last||Number(last.value)!==companyValue)history.push({ts:now(),value:companyValue});

  return {
    companyName:String(input.companyName||"Hex Company").slice(0,100),
    companyValue,
    totalShares,
    owners,
    history:history.slice(-5000)
  };
}

app.get("/api/health",(req,res)=>res.json({ok:true,database:!!pool}));
app.get("/api/state",async(req,res)=>{
  try{res.json(await getState())}
  catch(e){console.error(e);res.status(503).json({error:"Database is not connected"})}
});
app.put("/api/state",async(req,res)=>{
  try{
    const current=await getState();
    const data=clean(req.body,current);
    res.json(await saveState(data));
  }catch(e){console.error(e);res.status(e.message==="DATABASE_URL is not configured"?503:400).json({error:e.message})}
});
app.post("/api/history",async(req,res)=>{
  try{
    const current=await getState();
    current.history=(Array.isArray(current.history)?current.history:[]).concat({ts:now(),value:Math.max(0,Number(current.companyValue)||0)}).slice(-5000);
    res.json(await saveState(current));
  }catch(e){console.error(e);res.status(500).json({error:"Could not record company value"})}
});
app.use(express.static(__dirname));
app.get("/api/state/beacon",(_,res)=>res.status(405).end());
app.post("/api/state/beacon",async(req,res)=>{
  try{const current=await getState();const data=clean(req.body,current);await saveState(data);res.status(204).end()}
  catch(e){console.error(e);res.status(503).end()}
});
app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,"index.html")));

initDb().then(()=>app.listen(port,"0.0.0.0",()=>console.log("Stock.store running on "+port))).catch(e=>{console.error(e);process.exit(1)});
