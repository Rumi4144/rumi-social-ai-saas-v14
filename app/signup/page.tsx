"use client";import {useEffect,useState} from "react";import {INDUSTRIES} from "@/lib/industries";
import Link from "next/link";
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
 e.preventDefault();if(busy)return;setBusy(true);setMsg("Sending your verification email…");
 try{
  const response=await fetch("/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...f,challenge})});
  const result=await response.json();
  if(!response.ok)throw Error(typeof result.error==="string"?result.error:"Please check your information.");
  setMsg(result.message||"Check your inbox and spam folder for a verification link. Your workspace will be created after you confirm your email.");
  setF(value=>({...value,password:""}));
  setChallenge('');setAttempt(value=>value+1);
 }catch(error){
  setMsg(error instanceof Error?error.message:"Could not create account.");
  setChallenge('');setAttempt(value=>value+1);
 }finally{setBusy(false);}
}
return <main className="loginwrap"><form className="loginbox" onSubmit={go}><div className="eyebrow">START FREE</div><h1>Build your AI creative department.</h1><p>Start with 100 trial credits after verifying your email. No publishing until you approve it.</p>{[["name","Your name"],["email","Email"],["organization","Business / agency name"],["password","Password"]].map(([k,l])=><label key={k}>{l}<input type={k==="password"?"password":k==="email"?"email":"text"} autoComplete={k==="password"?"new-password":k==="email"?"email":k==="name"?"name":"organization"} value={(f as any)[k]} onChange={e=>setF({...f,[k]:e.target.value})} minLength={k==="password"?8:undefined} maxLength={k==="password"?72:k==="email"?254:k==="name"?100:150} required/></label>)}<label>Business industry<select value={f.industry} onChange={e=>setF({...f,industry:e.target.value})} required><option value="">Choose your industry</option>{INDUSTRIES.map(industry=><option key={industry} value={industry}>{industry}</option>)}</select></label><p>Your industry helps tailor your reel designs and music. You can change it later.</p>{protection?.mode==='protected'&&protection.siteKey&&<SignupChallenge key={attempt} siteKey={protection.siteKey} onToken={setChallenge}/>}
 {protection?.mode==='unavailable'&&<p role="alert">Signup is temporarily unavailable. Try again later.</p>}
 <button className="button" disabled={busy||!protection||protection.mode==='unavailable'||protection.mode==='protected'&&!challenge}>{busy?"Sending…":"Send verification email"}</button>{msg&&<p className="status" role="status" aria-live="polite">{msg}</p>}<p>Need another link? Check spam first, then submit this form again to resend. Links expire after 30 minutes.</p><small>By continuing, you agree to our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</small><p>Already registered? <Link href="/login">Sign in</Link>.</p></form></main>}
