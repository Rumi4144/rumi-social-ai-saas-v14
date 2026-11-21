const canonicalHost='rumisocialai.com';

export function signupProtection(){
 const siteKey=process.env.TURNSTILE_SITE_KEY?.trim();
 const secret=process.env.TURNSTILE_SECRET_KEY?.trim();
 if(siteKey&&secret)return {mode:'protected' as const,siteKey,secret};
 if(siteKey||secret||process.env.VERCEL_ENV==='production')return {mode:'unavailable' as const};
 return {mode:'local' as const};
}

export async function verifySignupChallenge(secret:string,token:string|undefined){
 if(!token||token.length>2048)return false;
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
  method:'POST',body:new URLSearchParams({secret,response:token}),
  signal:AbortSignal.timeout(5000),cache:'no-store',
 });
 if(!response.ok)throw new Error('Turnstile unavailable');
 const result=await response.json();
 return result.success===true&&result.hostname===canonicalHost&&result.action==='signup';
}
