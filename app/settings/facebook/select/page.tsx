import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import { tenantContext } from "@/lib/auth/context";
import { redirect } from "next/navigation";

export default async function FacebookPageSelector({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const ctx = await tenantContext();
  const params = await searchParams;
  const jobId = params.job;

  if (!jobId) {
    redirect("/settings?facebook=error&reason=missing_selection");
  }

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId: ctx.organizationId,
      type: "facebook_page_selection",
      status: "pending",
    },
  });

  if (!job) {
    redirect("/settings?facebook=error&reason=selection_expired");
  }

  const payload = job.payload as {
    encryptedPages?: string;
  };

  if (!payload.encryptedPages) {
    redirect("/settings?facebook=error&reason=selection_data");
  }

  const pages = JSON.parse(
    decryptSecret(payload.encryptedPages)
  ) as Array<{
    id: string;
    name: string;
    pictureUrl?: string;
  }>;

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

              <h3 style={{ margin: 0 }}>{page.name}</h3>
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
