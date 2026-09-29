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

export default async function Campaign({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const pageStarted = Date.now();
  const tenantStarted = Date.now();
  const { organizationId } = await tenantContext();
  console.log("[CAMPAIGN PERF] tenantContext:", Date.now() - tenantStarted, "ms");

  const dataStarted = Date.now();
  const [campaign, assets] = await Promise.all([
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

  return (
    <>
      <div className="eyebrow">CAMPAIGN · {campaign.status.toUpperCase()}</div>

      <h1>{campaign.title}</h1>

      <p>
        {campaign.brand.name} · Goal: {campaign.goal}
      </p>
      <p style={{ opacity: 0.65, fontSize: "14px" }}>
        Created {new Date(campaign.createdAt).toLocaleString()}
      </p>

      <CampaignImageProcessor campaignId={campaign.id} />

      <div className="campaignitems">
        {campaign.items.map((item: any, index: number) => {
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

          const brandedCreative = itemAssets.find(
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

          return (
            <article className="card" key={item.id}>
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
                  existingCreative={!!brandedCreative}
                />
              )}

              <span className="eyebrow">
                {item.platform} · {item.type}
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

          <h3>{item.headline || "Creative"}</h3>

              <p>{item.caption}</p>

              <div className="approval">
                <ApproveContentButton
                  contentItemId={item.id}
                  headline={item.headline || "Creative"}
                  caption={item.caption}
                  initialStatus={item.status}
                />
                <SchedulePostButton
                  contentItemId={item.id}
                  initialStatus={item.status}
                  initialScheduledFor={item.scheduledFor?.toISOString() || null}
                />
                <EditContentButton
                  contentItemId={item.id}
                  campaignId={campaign.id}
                  headline={item.headline || "Creative"}
                  caption={item.caption}
                  imageUrl={originalImage?.url || undefined}
                  textPosition={textPosition}
                />
                <RegenerateCaptionButton contentItemId={item.id} />
                <RegenerateImageButton
                  campaignId={campaign.id}
                  contentItemId={item.id}
                  headline={item.headline || "Campaign Creative"}
                />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
