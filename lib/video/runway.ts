export async function createVideoTask(input:{imageUrl:string;prompt:string;duration?:5|10;ratio?:"720:1280"|"1280:720"}){
 if(!process.env.RUNWAY_API_KEY)throw new Error("RUNWAY_API_KEY_MISSING");
 const res=await fetch("https://api.dev.runwayml.com/v1/image_to_video",{method:"POST",headers:{"Authorization":`Bearer ${process.env.RUNWAY_API_KEY}`,"Content-Type":"application/json","X-Runway-Version":"2024-11-06"},body:JSON.stringify({model:process.env.RUNWAY_VIDEO_MODEL||"gen4.5",promptImage:input.imageUrl,promptText:input.prompt,duration:input.duration||5,ratio:input.ratio||"720:1280"})});
 if(!res.ok)throw new Error(`RUNWAY_${res.status}`);return res.json() as Promise<{id:string}>;
}