import {decryptSecret} from "@/lib/security/crypto";
export type PublishResult={ok:boolean;externalId?:string;code?:number;error?:string};
export async function publishToProvider(input:{platform:string;token:string;externalAccountId:string;caption:string;mediaUrl?:string|null}):Promise<PublishResult>{
 // Provider-specific official OAuth/publishing implementations plug in here.
 // Tokens must be decrypted server-side; never return them to the browser.
 if(!input.token)return {ok:false,error:"MISSING_TOKEN"};let token:string;try{token=decryptSecret(input.token)}catch{return {ok:false,error:"TOKEN_DECRYPT_FAILED"}};void token;
 return {ok:false,error:`${input.platform.toUpperCase()}_PROVIDER_NOT_CONFIGURED`};
}