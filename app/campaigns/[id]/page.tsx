import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { notFound } from "next/navigation";
import RenderCreativeButton from "@/components/RenderCreativeButton";
import RegenerateImageButton from "@/components/RegenerateImageButton";
import RegenerateCaptionButton from "@/components/RegenerateCaptionButton";
import EditContentButton from "@/components/EditContentButton";

export default async function Campaign({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await tenantContext();

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

  if (!campaign) notFound();

  return (
    <>
      <div className="eyebrow">CAMPAIGN · {campaign.status.toUpperCase()}</div>

      <h1>{campaign.title}</h1>

      <p>
        {campaign.brand.name} · Goal: {campaign.goal}
      </p>

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

              <h3>{item.headline || "Creative"}</h3>

              <p>{item.caption}</p>

              <div className="approval">
                <button>Approve</button>
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
