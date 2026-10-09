"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export default function RestoreCalendarButton({campaignId}:{campaignId:string}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function restore(){setBusy(true);setMessage("");try{const response=await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/restore-calendar`,{method:"POST"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not restore calendar dates.");setMessage(`${data.restored} draft dates restored. ${data.skipped} items left unchanged. Review the dates before scheduling.`);router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"Could not restore calendar dates.");}finally{setBusy(false);}}
 return <div><button type="button" disabled={busy} onClick={restore}>{busy?"Restoring dates…":"Restore planned calendar dates"}</button>{message&&<p role="status">{message}</p>}</div>;
}
