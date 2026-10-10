"use client";
import { useState, FormEvent } from "react";
export default function ForgotPassword() {
  const [email,setEmail]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function submit(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);try{const response=await fetch("/api/auth/forgot-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});const data=await response.json();setMessage(data.error||data.message);}catch{setMessage("Unable to request a reset. Please try again.");}finally{setBusy(false);}}
  return <main className="loginwrap"><form className="loginbox" onSubmit={submit}><div className="eyebrow">RUMI SOCIAL AI</div><h1>Reset your password.</h1><p>Enter the email belonging to the account you want to recover. For master/admin access, use your administrator email.</p><label htmlFor="reset-email">Email</label><input id="reset-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/><button className="button" disabled={busy}>{busy?"Requesting…":"Send reset link"}</button>{message&&<p role="status">{message}</p>}<p><a href="/login">Back to sign in</a></p></form></main>;
}
