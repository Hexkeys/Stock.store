const express=require("express");
const path=require("path");
const {Pool}=require("pg");

const app=express();
app.use(express.json({limit:"100kb"}));
const port=process.env.PORT||10000;
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;

const now=()=>new Date().toISOString();
const DEFAULT_STATE={
  companyName:"Hex Company",
  companyValue:1000,
  totalShares:1000,
  owners:[
    {name:"Hex Company",investment:990},
    {name:"Walter",investment:10}
  ],
  history:[{ts:now(),value:1000}]
};

async function initDb(){
  if(!pool)return;
  await pool.query("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const {rows}=await pool.query("SELECT data FROM app_state WHERE id=1");
  if(!rows.length){
    await pool.query("INSERT INTO app_state (id,data) VALUES (1,$1::jsonb)",[JSON.stringify(DEFAULT_STATE)]);
  }else{
    const data=rows[0].data||{};
    if(!Array.isArray(data.history)||!data.history.length){
      data.history=[{ts:now(),value:Number(data.companyValue)||0}];
      await pool.query("UPDATE app_state SET data=$1::jsonb,updated_at=NOW() WHERE id=1",[JSON.stringify(data)]);
    }
  }
}

async function getState(){
  if(!pool)return DEFAULT_STATE;
  const {rows}=await pool.query("SELECT data FROM app_state WHERE id=1");
  const data=rows[0]?.data||DEFAULT_STATE;
  if(!Array.isArray(data.history)||!data.history.length)data.history=[{ts:now(),value:Number(data.companyValue)||0}];
  return data;
}

async function saveState(data){
  if(!pool)return data;
  await pool.query(
    "INSERT INTO app_state (id,data,updated_at) VALUES (1,$1::jsonb,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",
    [JSON.stringify(data)]
  );
  return data;
}

function clean(input,current){
  if(!input||typeof input!=="object")throw new Error("Invalid state");
  const companyValue=Math.max(0,Number(input.companyValue)||0);
  const totalShares=Math.max(1,Number(input.totalShares)||1);
  const owners=Array.isArray(input.owners)
    ? input.owners.slice(0,100).map(o=>({
        name:String(o?.name||"Unnamed").slice(0,80),
        investment:Math.max(0,Number(o?.investment)||0)
      }))
    : [];
  const previous=Array.isArray(current?.history)?current.history:(
    Array.isArray(input.history)?input.history:[]
  );
  let history=previous
    .filter(p=>p&&Number.isFinite(Number(p.value))&&p.ts)
    .slice(-5000)
    .map(p=>({ts:new Date(p.ts).toISOString(),value:Math.max(0,Number(p.value)||0)}));
  const last=history[history.length-1];
  if(!last || Number(last.value)!==companyValue){
    history.push({ts:now(),value:companyValue});
  }
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
  catch(e){console.error(e);res.status(500).json({error:"Could not load saved data"})}
});
app.put("/api/state",async(req,res)=>{
  try{
    const current=await getState();
    const data=clean(req.body,current);
    res.json(await saveState(data));
  }catch(e){
    console.error(e);
    res.status(400).json({error:e.message});
  }
});
app.post("/api/history",async(req,res)=>{
  try{
    const current=await getState();
    const value=Math.max(0,Number(current.companyValue)||0);
    const entry={ts:now(),value};
    current.history=(Array.isArray(current.history)?current.history:[]).concat(entry).slice(-5000);
    res.json(await saveState(current));
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Could not record company value"});
  }
});
app.use(express.static(__dirname));
app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,"index.html")));

initDb()
  .then(()=>app.listen(port,"0.0.0.0",()=>console.log("Stock.store running on "+port)))
  .catch(e=>{console.error(e);process.exit(1)});
