import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { extrasView, prepareExtra, extraSummary } from "@/lib/extras/service";
import { advancePresenter } from "@/lib/extras/presenter";
import { PRESENTER_SCRIPT_LIMIT, PRESENTER_WORD_LIMIT } from "@/lib/extras/catalog";
import { WeeklyError } from "@/lib/weekly/service";
import { apiError } from "@/lib/http/errors";
export const maxDuration=180;
const headers={"Cache-Control":"private, no-store"};
const create=z.object({action:z.literal("create"),requestId:z.string().uuid(),brandId:z.string().min(1).max(100),kind:z.enum(["ad","reel","presenter"]),brief:z.string().trim().min(3).max(1000),productId:z.string().min(1).max(100).optional(),presenter:z.enum(["alex","morgan"]).optional(),expectedCredits:z.number().int().positive()}).strict().superRefine((v,ctx)=>{
  if(v.kind==="presenter" && (v.brief.length>PRESENTER_SCRIPT_LIMIT || v.brief.split(/\s+/).length>PRESENTER_WORD_LIMIT || v.productId))ctx.addIssue({code:z.ZodIssueCode.custom,message:`Use a presenter script up to ${PRESENTER_SCRIPT_LIMIT} characters and ${PRESENTER_WORD_LIMIT} words.`});
});
const advance=z.object({action:z.literal("advance"),id:z.string().regex(/^extra-[a-f0-9]{40}$/)}).strict();
function failure(error:unknown){return error instanceof WeeklyError?NextResponse.json({error:error.message},{status:error.status,headers}):apiError(error,"Could not complete that request. Your saved creations are preserved.");}
export async function GET(req:Request){try{const ctx=await tenantContext();const id=new URL(req.url).searchParams.get("id");return NextResponse.json(id?await extraSummary(ctx,id):await extrasView(ctx),{headers});}catch(error){return failure(error);}}
export async function POST(req:Request){try{
  const ctx=await tenantContext();
  if(ctx.role==="viewer")throw new WeeklyError("Your access is read-only.",403);
  if(req.headers.get("origin")!==new URL(req.url).origin)throw new WeeklyError("Request origin is not allowed.",403);
  const body=await req.json().catch(()=>null),next=advance.safeParse(body);
  if(next.success){await advancePresenter(ctx.organizationId,next.data.id);return NextResponse.json(await extraSummary(ctx,next.data.id),{headers});}
  const parsed=create.safeParse(body);
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message || "Review your creation and credit cost."},{status:400,headers});
  return NextResponse.json(await prepareExtra(ctx,parsed.data),{headers});
}catch(error){return failure(error);}}
