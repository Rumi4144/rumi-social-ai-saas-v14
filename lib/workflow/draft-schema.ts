import {z} from "zod";
const text = z.string().max(160000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const campaignPhoto = z.object({id:z.string(),label:z.string(),src:z.string()});
export type CampaignPhoto = z.infer<typeof campaignPhoto>;
export const campaignDraftSchema = z.object({
  step:z.number().int().min(0).max(3),brief:text,goal:z.string(),days:z.number().int().min(1).max(30),
  appliedTopics:z.array(z.string()),mixTopics:z.boolean(),selectedTopics:z.array(z.string()).nullable(),
  quantities:z.object({post:z.number().int().min(0).max(30),reel_post:z.number().int().min(0).max(30),story_post:z.number().int().min(0).max(30),presenter_post:z.number().int().min(0).max(30)}),
  includeSpecialDays:z.boolean(),excludedSpecialDays:z.array(z.string()),customSpecialDays:z.array(z.object({date,label:z.string()})),
  campaignStartDate:date,dailyPlatforms:z.record(z.array(z.string())),
  photoSource:z.enum(["website","ai","none","saved","upload"]),photos:z.array(campaignPhoto).max(20),
  productUrl:text,productTitle:text,websiteImages:z.array(z.string()).max(60),selectedImages:z.array(z.string()).max(60),photoReceipt:text,
  createdCampaign:z.string().optional()
});
export const presenterDraftSchema = z.object({
  newPresenter:z.boolean(),step:z.number().int().min(0).max(3),campaignId:z.string(),itemId:z.string(),productId:z.string(),productImage:z.string().max(2000000),
  name:z.string().max(180),details:z.string().max(8000),characterImage:z.string().max(2000000),
  selectedPortrait:z.number().int().min(0).max(24).nullable(),look:z.enum(["neutral","woman","man"]),
  delivery:z.enum(["natural","spanish","relaxed","british","australian","french","persian","cowboy","newyork"]),
  script:z.string().max(500),duration:z.union([z.literal(5),z.literal(10),z.literal(15)]),requestId:z.string(),requestKey:z.string()
});
