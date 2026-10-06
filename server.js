const express=require("express");
const path=require("path");
const {Pool}=require("pg");

const app=express();
app.use(express.json({limit:"100kb"}));
const port=process.env.PORT||10000;
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;
const DEFAULT_STATE={companyName:"Hex Company",companyValue:1000,weeklyPool:0,totalShares:1000,owners:[{name:"Hex Company",investment:990},{name:"Walter",investment:10}]};

async function initDb(){
  if(!pool)return;
  await pool.query("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const {rows}=await pool.query("SELECT id FROM app_state WHERE id=1");
  if(!rows.length) await pool.query("INSERT INTO app_state (id,data) VALUES (1,$1::jsonb)",[JSON.stringify(DEFAULT_STATE)]);
}
async function getState(){
  if(!pool)return DEFAULT_STATE;
  const {rows}=await pool.query("SELECT data FROM app_state WHERE id=1");
  return rows[0]?.data||DEFAULT_STATE;
}
async function setState(data){
  if(!pool)return;
  await pool.query("INSERT INTO app_state (id,data,updated_at) VALUES (1,$1::jsonb,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[JSON.stringify(data)]);
}
function cleanState(input){
  if(!input||typeof input!=="object")throw new Error("Invalid state");
  const companyValue=Math.max(0,Number(input.companyValue)||0);
  const weeklyPool=Math.max(0,Number(input.weeklyPool)||0);
  const totalShares=Math.max(1,Number(input.totalShares)||1);
  const owners=Array.isArray(input.owners)?input.owners.slice(0,100).map(o=>({name:String(o?.name||"Unnamed").slice(0,80),investment:Math.max(0,Number(o?.investment)||0)})):[];
  return {companyName:String(input.companyName||"Hex Company").slice(0,100),companyValue,weeklyPool,totalShares,owners};
}
app.get("/api/health",(req,res)=>res.json({ok:true,database:!!pool}));
app.get("/api/state",async(req,res)=>{try{res.json(await getState())}catch(e){console.error(e);res.status(500).json({error:"Could not load saved data"})}});
app.put("/api/state",async(req,res)=>{try{const data=cleanState(req.body);await setState(data);res.json(data)}catch(e){console.error(e);res.status(400).json({error:e.message})}});
app.use(express.static(__dirname));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
initDb().then(()=>app.listen(port,"0.0.0.0",()=>console.log("Stock.store running on "+port))).catch(e=>{console.error(e);process.exit(1)});
