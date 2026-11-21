"use client";import {useEffect,useState} from "react";import {INDUSTRIES} from "@/lib/industries";
import SignupChallenge from "./signup-challenge";
export default function Signup(){
 const [protection,setProtection]=useState<{mode:'local'|'protected'|'unavailable';siteKey?:string}|null>(null);
 const [challenge,setChallenge]=useState('');
 const [attempt,setAttempt]=useState(0);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch('/api/auth/register',{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error();
   setProtection(await response.json());
  }).catch(error=>{if(error.name!=='AbortError')setProtection({mode:'unavailable'});});
  return ()=>controller.abort();
 },[]);
const [f,setF]=useState({name:"",email:"",password:"",organization:"",industry:""}),[msg,setMsg]=useState("");async function go(e:React.FormEvent<HTMLFormElement>){
 e.preventDefault();setBusy(true);setMsg("Creating your workspace…");
 try{
  const response=await fetch("/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...f,challenge})});
  const result=await response.json();
  if(!response.ok)throw Error(typeof result.error==="string"?result.error:"Please check your information.");
  location.href="/login?new=1";
 }catch(error){
  setMsg(error instanceof Error?error.message:"Could not create account.");
  setChallenge('');setAttempt(value=>value+1);
 }finally{setBusy(false);}
}
return <main className="loginwrap"><form className="loginbox" onSubmit={go}><div className="eyebrow">START FREE</div><h1>Build your AI creative department.</h1><p>Start with 100 trial credits. No publishing until you approve it.</p>{[["name","Your name"],["email","Email"],["organization","Business / agency name"],["password","Password"]].map(([k,l])=><label key={k}>{l}<input type={k==="password"?"password":k==="email"?"email":"text"} value={(f as any)[k]} onChange={e=>setF({...f,[k]:e.target.value})} minLength={k==="password"?8:undefined} required/></label>)}<label>Business industry<select value={f.industry} onChange={e=>setF({...f,industry:e.target.value})} required><option value="">Choose your industry</option>{INDUSTRIES.map(industry=><option key={industry} value={industry}>{industry}</option>)}</select></label><p>Your industry helps tailor your reel designs and music. You can change it later.</p>{protection?.mode==='protected'&&protection.siteKey&&<SignupChallenge key={attempt} siteKey={protection.siteKey} onToken={setChallenge}/>}
 {protection?.mode==='unavailable'&&<p role="alert">Signup is temporarily unavailable. Try again later.</p>}
 <button className="button" disabled={busy||!protection||protection.mode==='unavailable'||protection.mode==='protected'&&!challenge}>Create free workspace</button>{msg&&<p className="status">{msg}</p>}<small>By continuing, you agree to configure your own provider and billing settings before public launch.</small></form></main>}