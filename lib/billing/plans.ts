export const PLANS={
 starter:{name:"Starter",monthlyCredits:150,brands:1,team:1,clients:0,socialAccounts:2,scheduledPosts:30,video:true,whiteLabel:false},
 creator:{name:"Creator",monthlyCredits:500,brands:3,team:2,clients:0,socialAccounts:5,scheduledPosts:100,video:true,whiteLabel:false},
 business:{name:"Business",monthlyCredits:1500,brands:10,team:5,clients:0,socialAccounts:15,scheduledPosts:500,video:true,whiteLabel:false},
 agency:{name:"Agency",monthlyCredits:5000,brands:50,team:15,clients:25,socialAccounts:75,scheduledPosts:2500,video:true,whiteLabel:true}
} as const;export type PlanKey=keyof typeof PLANS;
export function planFor(key?:string|null){return PLANS[(key&&key in PLANS?key:"starter") as PlanKey]}
export const TOPUPS={small:{credits:250},medium:{credits:750},large:{credits:2000}} as const;