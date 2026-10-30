import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import { deliveryUrl } from "@/lib/publishing/eligibility";

export const HISTORY_PAGE_SIZE = 25;

export async function adminCustomerSelection(organizationId?: string, search = "") {
  await superAdminContext();
  const organizations = await prisma.organization.findMany({
    where: search ? { name: { contains: search.slice(0, 100), mode: "insensitive" } } : {},
    select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 100,
  });
  const organization = organizationId
    ? await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } })
    : organizations[0] || null;
  return { organizations, organization };
}

export async function publishedCustomerHistory(organizationId: string, after?: string) {
  await superAdminContext();
  // Scope the cursor as well as every data lookup; changing customers cannot reuse another customer's cursor.
  const cursor = after ? await prisma.contentItem.findFirst({
    where: { id: after, campaign: { brand: { organizationId } } }, select: { id: true, createdAt: true },
  }) : null;
  if (after && !cursor) return { items: [], nextCursor: null, deliverySummaryLimited: false };
  const before = cursor ? Prisma.sql`AND (i."createdAt" < ${cursor.createdAt} OR (i."createdAt" = ${cursor.createdAt} AND i.id < ${cursor.id}))` : Prisma.empty;
  // Some older delivery workers did not update ContentItem.status. Include their successful delivery records too.
  const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT i.id FROM "ContentItem" i
    JOIN "Campaign" c ON c.id = i."campaignId"
    JOIN "Brand" b ON b.id = c."brandId"
    WHERE b."organizationId" = ${organizationId}
      AND (i.status = 'published' OR EXISTS (
        SELECT 1 FROM "PublishJob" p WHERE p."contentItemId" = i.id
          AND p."organizationId" = ${organizationId} AND p.status = 'published'
      )) ${before}
    ORDER BY i."createdAt" DESC, i.id DESC LIMIT ${HISTORY_PAGE_SIZE + 1}
  `);
  const pageIds = ids.slice(0, HISTORY_PAGE_SIZE).map(row => row.id);
  const items = await prisma.contentItem.findMany({
    where: { id: { in: pageIds }, campaign: { brand: { organizationId } } },
    select: { id: true, headline: true, caption: true, type: true, platform: true, status: true, createdAt: true,
      campaign: { select: { id: true, title: true, brand: { select: { name: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: HISTORY_PAGE_SIZE,
  });
  const deliveries = await prisma.publishJob.findMany({
    where: { organizationId, contentItemId: { in: pageIds } },
    select: { id: true, contentItemId: true, platform: true, status: true, externalPostId: true, publishedAt: true, scheduledFor: true, lastError: true, socialConnectionId: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 501,
  });
  const connections = await prisma.socialConnection.findMany({
    where: { organizationId, id: { in: [...new Set(deliveries.map(row => row.socialConnectionId))] } },
    select: { id: true, accountName: true },
  });
  const accounts = new Map(connections.map(row => [row.id, row.accountName]));
  return {
    deliverySummaryLimited: deliveries.length > 500,
    items: items.map(item => ({ ...item, deliveries: deliveries.slice(0, 500).filter(row => row.contentItemId === item.id).map(row => ({
      ...row, accountName: accounts.get(row.socialConnectionId) || "Previously connected account", link: deliveryUrl(row.platform, row.externalPostId),
    })) })),
    nextCursor: ids.length > HISTORY_PAGE_SIZE ? pageIds[pageIds.length - 1] : null,
  };
}

export async function customerDeliveryHistory(organizationId: string, contentItemId: string, after?: string) {
  await superAdminContext();
  const item = await prisma.contentItem.findFirst({ where: { id: contentItemId, campaign: { brand: { organizationId } } },
    select: { id: true, headline: true, campaign: { select: { id: true, title: true } } } });
  if (!item) return null;
  const cursor = after ? await prisma.publishJob.findFirst({ where: { id: after, organizationId, contentItemId }, select: { id: true, createdAt: true } }) : null;
  if (after && !cursor) return { item, deliveries: [], nextCursor: null };
  const rows = await prisma.publishJob.findMany({ where: { organizationId, contentItemId,
    ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
    select: { id: true, contentItemId: true, platform: true, status: true, externalPostId: true, publishedAt: true, scheduledFor: true, lastError: true, socialConnectionId: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: HISTORY_PAGE_SIZE + 1 });
  const page = rows.slice(0, HISTORY_PAGE_SIZE);
  const connections = await prisma.socialConnection.findMany({ where: { organizationId, id: { in: [...new Set(page.map(row => row.socialConnectionId))] } }, select: { id: true, accountName: true }, take: HISTORY_PAGE_SIZE });
  return { item, deliveries: page.map(row => ({ ...row, accountName: connections.find(account => account.id === row.socialConnectionId)?.accountName || "Previously connected account", link: deliveryUrl(row.platform, row.externalPostId) })),
    nextCursor: rows.length > HISTORY_PAGE_SIZE ? page[page.length - 1].id : null };
}

export async function customerChangeRequests(organizationId: string, after?: string, completed = false) {
  await superAdminContext();
  const cursor = after ? await prisma.job.findFirst({ where: { id: after, organizationId, type: "CONTENT_CHANGE_REQUEST" }, select: { id: true, createdAt: true } }) : null;
  if (after && !cursor) return { requests: [], nextCursor: null };
  const jobs = await prisma.job.findMany({
    where: { organizationId, type: "CONTENT_CHANGE_REQUEST", status: completed ? "succeeded" : "pending",
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: HISTORY_PAGE_SIZE + 1,
  });
  const page = jobs.slice(0, HISTORY_PAGE_SIZE);
  const ids = page.map(job => (job.payload as { contentItemId?: string })?.contentItemId).filter((id): id is string => typeof id === "string");
  const items = await prisma.contentItem.findMany({ where: { id: { in: ids }, campaign: { brand: { organizationId } } },
    select: { id: true, headline: true, status: true, campaign: { select: { id: true, title: true } } }, take: HISTORY_PAGE_SIZE });
  return { requests: page.map(job => ({ ...job, comment: String((job.payload as { comment?: string })?.comment || ""),
    item: items.find(item => item.id === (job.payload as { contentItemId?: string })?.contentItemId) || null })),
    nextCursor: jobs.length > HISTORY_PAGE_SIZE ? page[page.length - 1].id : null };
}
