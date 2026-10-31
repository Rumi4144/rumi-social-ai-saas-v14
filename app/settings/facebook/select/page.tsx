import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import { tenantContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { canManageFacebook, FACEBOOK_SELECTION_TYPE, validFacebookAttempt, type FacebookAttempt, type FacebookPage } from "@/lib/social/facebook-connection";

export const dynamic = "force-dynamic";

export default async function FacebookPageSelector({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const ctx = await tenantContext();
  const params = await searchParams;
  const jobId = params.job;

  if (!canManageFacebook(ctx.role)) redirect("/settings?facebook=error&reason=workspace");

  if (!jobId) {
    redirect("/settings?facebook=error&reason=session");
  }

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId: ctx.organizationId,
      type: FACEBOOK_SELECTION_TYPE,
      status: "pending",
    },
  });

  if (!job) {
    redirect("/settings?facebook=error&reason=session");
  }

  const payload = job.payload as FacebookAttempt | null;
  if (!validFacebookAttempt(payload, ctx.userId) || !payload?.encryptedPages) {
    redirect("/settings?facebook=error&reason=session");
  }
  let pages: Pick<FacebookPage, "id" | "name" | "pictureUrl">[];
  try {
    // Only display fields reach the rendered page; credentials remain on the server.
    pages = (JSON.parse(decryptSecret(payload.encryptedPages)) as FacebookPage[])
      .map(({ id, name, pictureUrl }) => ({ id, name, pictureUrl }));
  } catch { redirect("/settings?facebook=error&reason=session"); }

  return (
    <>
      <div className="eyebrow">FACEBOOK</div>
      <h1>Choose your Facebook Page.</h1>

      <p>
        Select the Facebook Page that belongs to this business workspace.
      </p>

      <div className="settingsgrid">
        {pages.map((page) => (
          <div key={page.id} className="card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                marginBottom: "18px",
              }}
            >
              {page.pictureUrl ? (
                <img
                  src={page.pictureUrl}
                  alt=""
                  width={56}
                  height={56}
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : null}

              <div>
                <h3 style={{ margin: 0 }}>{page.name}</h3>

                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    opacity: 0.65,
                  }}
                >
                  Page ID: {page.id}
                </div>

                <a
                  href={`https://www.facebook.com/${page.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: "6px",
                    fontSize: "14px",
                  }}
                >
                  View on Facebook ↗
                </a>
              </div>
            </div>

            <form
              action="/api/social/facebook/select"
              method="POST"
            >
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="pageId" value={page.id} />

              <button type="submit">
                Connect this Page
              </button>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
