import CampaignReelWorkspace, { CampaignReelButton } from "@/components/CampaignReelWorkspace";
import { contentTypeLabel, requiresVideo } from "@/lib/campaign/content-plan";
import { campaignSummary } from "@/lib/campaign/summary";
import RestoreCalendarButton from "@/components/RestoreCalendarButton";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { notFound } from "next/navigation";
import RenderCreativeButton from "@/components/RenderCreativeButton";
import RegenerateImageButton from "@/components/RegenerateImageButton";
import RegenerateCaptionButton from "@/components/RegenerateCaptionButton";
import EditContentButton from "@/components/EditContentButton";
import ApproveContentButton from "@/components/ApproveContentButton";
import SchedulePostButton from "@/components/SchedulePostButton";
import CampaignImageProcessor from "@/components/CampaignImageProcessor";
import UseCampaignVideo from "@/components/UseCampaignVideo";
import CampaignVideoTools from "@/components/CampaignVideoTools";

export default async function Campaign({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const pageSize = 7;

  const pageStarted = Date.now();
  const tenantStarted = Date.now();
  const { organizationId } = await tenantContext();
  console.log("[CAMPAIGN PERF] tenantContext:", Date.now() - tenantStarted, "ms");

  const dataStarted = Date.now();
  const [campaign, assets, videoJobs, planningJob] = await Promise.all([
    prisma.campaign.findFirst({
      where: {
        id,
        brand: {
          organizationId,
        },
      },
      include: {
        items: true,
        brand: true,
      },
    }),

    prisma.mediaAsset.findMany({
      where: {
        organizationId,
        campaignId: id,
        status: "ready",
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.job.findMany({ where: { organizationId, type: "RUNWAY_VIDEO", status: { in: ["starting", "running", "saving", "uncertain"] }, payload: { path: ["campaignId"], equals: id } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, payload: true } }),
    prisma.job.findFirst({where:{organizationId,type:"CREATE_EVERYTHING",status:"succeeded",payload:{path:["campaignId"],equals:id}},orderBy:{createdAt:"desc"},select:{payload:true,result:true}}),
  ]);

  console.log(
    "[CAMPAIGN PERF] database queries:",
    Date.now() - dataStarted,
    "ms",
    "| items:",
    campaign?.items?.length ?? 0,
    "| assets:",
    assets.length,
    "| total so far:",
    Date.now() - pageStarted,
    "ms"
  );

  if (!campaign) notFound();

  const dailyItems = campaign.items.filter(
    (item: any) => item.type !== "story" && item.type !== "reel"
  ).sort((a,b)=>(a.scheduledFor?.getTime()||0)-(b.scheduledFor?.getTime()||0) || Number(a.type === "holiday_post")-Number(b.type === "holiday_post") || a.createdAt.getTime()-b.createdAt.getTime());
  const plannedPosts = (planningJob?.result as {posts?:Array<{headline:string;caption:string;type:string;day:number;planKey?:string;visualDirection?:string}>})?.posts || [];
  const contentSlots = (planningJob?.payload as {contentPlan?:Array<{planKey:string;occasion?:string;topics?:string[]}>})?.contentPlan || [];
  const calendarDates = [...new Set(dailyItems.filter(item=>item.type!=="holiday_post").map(item=>item.scheduledFor?.toISOString().slice(0,10)).filter(Boolean))];
  const summary=campaignSummary(planningJob?.payload,dailyItems);

  console.log(
    "[CAMPAIGN PERF] before JSX return:",
    Date.now() - pageStarted,
    "ms"
  );

  return (
    <>
      <div className="eyebrow">CAMPAIGN · {campaign.status.toUpperCase()}</div>

      <h1>{campaign.title}</h1>
      {campaign.items.some(item => item.status === "draft" && !item.scheduledFor) && <RestoreCalendarButton campaignId={campaign.id} />}

      <p>
        {campaign.brand.name} · Goal: {campaign.goal}
      </p>
      <section aria-label="Campaign plan summary" className="card" style={{marginBottom:20}}>
        <h2>{summary.days ? `${summary.days}-day campaign` : "Campaign drafts"}</h2>
        {summary.start && <p>{summary.start} to {summary.end}</p>}
        <p>{summary.formats.map(format=>`${format.count} ${format.label.toLowerCase()} draft${format.count===1?"":"s"}`).join(" · ")} · {summary.extras} extra special-day drafts</p>
        <p>{summary.total} drafts in total. Several drafts can share a date; the number of drafts is different from the campaign length.</p>
        {summary.formats.some(format=>(format.label==="Reel" || format.label==="Presenter video") && format.count>0) && <p>Reel and presenter drafts need a finished video before scheduling. Use the video links on each draft.</p>}
      </section>
      <p style={{ opacity: 0.65, fontSize: "14px" }}>
        Created {new Date(campaign.createdAt).toLocaleString()}
      </p>

      {/* CampaignImageProcessor temporarily disabled for performance test */}

      <CampaignReelWorkspace campaignId={campaign.id} campaignTitle={campaign.title} />
      <div className="campaignitems">
        {dailyItems
          .slice((page - 1) * pageSize, page * pageSize)
          .map((item: any, index: number) => {
          const itemAssets = assets
            .filter((asset) => asset.contentItemId === item.id && asset.url)
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );

          const originalImage =
            itemAssets.find(
              (asset) =>
                asset.kind === "ai_image" && asset.provider === "openai",
            ) ||
            itemAssets.find(
              (asset) =>
                asset.kind === "ai_image" &&
                (asset.provider === "internal" || asset.provider === "website"),
            );

          const brandedCreative =
            itemAssets.find(
              (asset) =>
                asset.kind === "social_creative" &&
                asset.provider === "internal-raster",
            ) ||
            itemAssets.find(
              (asset) =>
                asset.kind === "social_creative" &&
                asset.provider === "internal-svg",
            );

          const layoutSequence = ["top", "left", "right", "left"] as const;

          const metadata = brandedCreative?.metadata;

          const storedTextPosition =
            metadata &&
            typeof metadata === "object" &&
            !Array.isArray(metadata) &&
            "textPosition" in metadata
              ? metadata.textPosition
              : undefined;

          const textPosition =
            storedTextPosition === "left" ||
            storedTextPosition === "right" ||
            storedTextPosition === "top"
              ? storedTextPosition
              : layoutSequence[index % layoutSequence.length];

          const displayAsset = brandedCreative || originalImage;
          const videoAsset = itemAssets.find(asset => ["campaign_video", "ai_video"].includes(asset.kind));
          const pendingVideo = videoJobs.find(job => (job.payload as { contentItemId?: string }).contentItemId === item.id);

        const storyNumber =
          item.type === "story"
            ? campaign.items
                .filter((candidate: any) => candidate.type === "story")
                .findIndex((candidate: any) => candidate.id === item.id) + 1
            : null;

        const creativeStatus = brandedCreative
          ? "Branded AI Creative"
          : originalImage?.provider === "website"
            ? "Website Photo"
            : originalImage
              ? "AI Image"
              : "No Image";

          const plannedPost = plannedPosts.find(post=>post.headline===item.headline && post.caption===item.caption && post.type===item.type);
          const plannedSlot = contentSlots.find(slot=>slot.planKey===plannedPost?.planKey);
          const occasion = plannedSlot?.occasion;
          const calendarDay = plannedPost?.day || (item.scheduledFor ? calendarDates.indexOf(item.scheduledFor.toISOString().slice(0,10))+1 : (page-1)*pageSize+index+1);
          const needsVideo = requiresVideo(item.type) && !item.mediaUrl?.startsWith("/api/video/media/");
          return (
            <article className="card" key={item.id}>
              {videoAsset && <div style={{ marginBottom: 20 }}>
                <video controls playsInline preload="metadata" src={`/api/video/media/${videoAsset.id}`} style={{ width: "100%", maxHeight: 600 }} />
                <UseCampaignVideo assetId={videoAsset.id} contentItemId={item.id} selected={item.mediaUrl === `/api/video/media/${videoAsset.id}`} />
                <a href={`/api/video/media/${videoAsset.id}`} target="_blank" rel="noopener noreferrer">Open / download video draft</a>
                <p>Review this clip, then select it for Facebook publishing or YouTube upload. Download it for other platforms.</p>
              </div>}
              {displayAsset?.url && (
                <img
                  src={displayAsset.url}
                  alt={item.headline || "Campaign creative"}
                  style={{
                    width: "100%",
                    height: "auto",
                    objectFit: "contain",
                    borderRadius: "18px",
                    marginBottom: "20px",
                    display: "block",
                  }}
                />
              )}

              {originalImage?.url && (
                <RenderCreativeButton
                  campaignId={campaign.id}
                  contentItemId={item.id}
                  headline={item.headline || "Campaign Creative"}
                  caption={item.caption}
                  imageUrl={originalImage.url}
                  textPosition={textPosition}
                  format={item.type === "story_post" ? "story" : "portrait"}
                  existingCreative={!!brandedCreative}
                />
              )}

              <span className="eyebrow">
                {item.type === "holiday_post" ? "EXTRA SPECIAL DAY" : `DAY ${calendarDay}`} · {contentTypeLabel(item.type)} ·{" "}
              {item.platform
                .split(",")
                .map((platform: string) =>
                  platform === "google_business" ? "Google Business Profile" : platform.charAt(0).toUpperCase() + platform.slice(1)
                )
                .join(" · ")}
              </span>

              {storyNumber ? (
            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                marginBottom: "6px",
                opacity: 0.6,
              }}
            >
              Story {storyNumber}
            </div>
          ) : null}

          {plannedSlot?.topics?.length ? <p><strong>Topics:</strong> {plannedSlot.topics.join(" · ")}</p> : null}
          {occasion && <p><strong>{occasion}</strong> · extra draft alongside regular content</p>}
          <h3>{item.headline || "Creative"}</h3>
          {item.scheduledFor && <p>Planned date: {item.scheduledFor.toISOString().slice(0, 10)}</p>}

              <p>{item.caption}</p>
              {requiresVideo(item.type) && plannedPost?.visualDirection && <details><summary>Video draft plan</summary><p style={{whiteSpace:"pre-wrap"}}>{plannedPost.visualDirection}</p></details>}
              {item.type === "story_post" && <p>Vertical Story draft · review and download for manual Story publishing. {displayAsset?.url && <a href={displayAsset.url} download>Download Story creative</a>}</p>}
              {needsVideo && <p>Finish and select this video before scheduling it.</p>}
              <p><a href={`/studio/presenters?campaignId=${campaign.id}&contentItemId=${item.id}`}>Make a presenter video for this post</a></p>
              {item.type !== "story_post" && <CampaignReelButton campaignId={campaign.id} contentItemId={item.id} />}
              <CampaignVideoTools campaignId={campaign.id} contentItemId={item.id} sourceAssetId={originalImage?.id} pendingJobId={pendingVideo?.id} />

              <div className="approval">
                <ApproveContentButton
                  contentItemId={item.id}
                  headline={item.headline || "Creative"}
                  caption={item.caption}
                  initialStatus={item.status}
                />
                {!needsVideo && item.type !== "story_post" && <SchedulePostButton
                  isVideo={Boolean(item.mediaUrl?.includes("/api/video/media/"))}
                  contentItemId={item.id}
                  initialStatus={item.status}
                  initialScheduledFor={item.scheduledFor?.toISOString() || null}
                />}
                <EditContentButton
                  contentItemId={item.id}
                  campaignId={campaign.id}
                  headline={item.headline || "Creative"}
                  caption={item.caption}
                  imageUrl={originalImage?.url || undefined}
                  textPosition={textPosition}
                />
                <RegenerateCaptionButton contentItemId={item.id} />

            {brandedCreative?.id ? (
              <a
                href={`/api/media/${brandedCreative.id}/publish`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "8px 12px",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  textDecoration: "none",
                  color: "inherit",
                  background: "white",
                }}
              >
                Preview Published Image
              </a>
            ) : null}
                <RegenerateImageButton
                  campaignId={campaign.id}
                  contentItemId={item.id}
                  headline={item.headline || "Campaign Creative"}
                  format={item.type === "story_post" ? "story" : "portrait"}
                />
              </div>
            </article>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
          margin: "32px 0",
          flexWrap: "wrap",
        }}
      >
        {page > 1 && (
          <a className="button" href={`?page=${page - 1}`}>
            ← Previous 7
          </a>
        )}

        <strong>
          Showing {(page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, dailyItems.length)} of{" "}
          {dailyItems.length}
        </strong>

        {page * pageSize < dailyItems.length && (
          <a className="button" href={`?page=${page + 1}`}>
            Next 7 →
          </a>
        )}
      </div>
    </>
  );
}
