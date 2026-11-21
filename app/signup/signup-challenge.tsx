'use client';

import Script from 'next/script';
import {useEffect,useRef,useState} from 'react';

type Turnstile={
 render:(container:HTMLElement,options:{
  sitekey:string;action:string;callback:(token:string)=>void;
  'expired-callback':()=>void;'error-callback':()=>void;
 })=>string;
 remove:(id:string)=>void;
};

export default function SignupChallenge({siteKey,onToken}:{siteKey:string;onToken:(token:string)=>void}){
 const container=useRef<HTMLDivElement>(null);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState(false);
 useEffect(()=>{
  const api=(window as Window&{turnstile?:Turnstile}).turnstile;
  if(!loaded||!api||!container.current)return;
  const id=api.render(container.current,{sitekey:siteKey,action:'signup',
   callback:token=>{setError(false);onToken(token);},
   'expired-callback':()=>onToken(''),
   'error-callback':()=>{onToken('');setError(true);},
  });
  return ()=>api.remove(id);
 },[loaded,onToken,siteKey]);
 return <>
  <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={()=>setLoaded(true)} onError={()=>setError(true)}/>
  <div ref={container}/>
  {error&&<p role="alert">The security check could not load. Reload the page and try again.</p>}
 </>;
}
