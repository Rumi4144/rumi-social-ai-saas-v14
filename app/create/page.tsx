"use client";

import { useState } from "react";

export default function Create() {
  const [brief, setBrief] = useState("");
  const [goal, setGoal] = useState("launch");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [photoSource, setPhotoSource] =
    useState<"website" | "ai">("website");
  const [productUrl, setProductUrl] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [websiteImages, setWebsiteImages] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  async function importWebsitePhotos() {
    if (!productUrl.trim()) return;

    setImporting(true);
    setImportError("");
    setWebsiteImages([]);
    setSelectedImages([]);

    try {
      const res = await fetch("/api/products/import-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: productUrl.trim(),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : JSON.stringify(result.error)
        );
      }

      setProductTitle(result.title || "");
      setWebsiteImages(result.images || []);

      if (result.images?.length) {
        setSelectedImages([]);
      }
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Could not import website photos"
      );
    } finally {
      setImporting(false);
    }
  }

  async function go() {
    if (brief.trim().length < 10 || busy) return;

    setBusy(true);
    setStatus("Preparing campaign...");

    try {
      const res = await fetch("/api/campaigns/create-everything", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          brief,
          goal,
          days: 14,
          photoSource,
          imageUrl:
            photoSource === "website"
              ? selectedImages[0] || undefined
              : undefined,
          imageUrls:
            photoSource === "website"
              ? selectedImages
              : undefined,
        }),
      });

      const created = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof created.error === "string"
            ? created.error
            : JSON.stringify(created.error || created)
        );
      }

      const campaignId = created.campaignId;
      const jobId = created.jobId;

      if (!campaignId) {
        throw new Error("CAMPAIGN_ID_MISSING");
      }

      if (!jobId) {
        throw new Error("JOB_ID_MISSING");
      }

      setStatus("Writing campaign...");

      for (let cycle = 0; cycle < 20; cycle++) {
        const processRes = await fetch("/api/campaigns/process", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ jobId }),
        });

        const processResult = await processRes.json();

        if (!processRes.ok) {
          throw new Error(
            typeof processResult.error === "string"
              ? processResult.error
              : "CAMPAIGN_PROCESS_FAILED"
          );
        }

        const jobsRes = await fetch("/api/jobs", {
          cache: "no-store",
        });

        const jobsData = await jobsRes.json();

        if (!jobsRes.ok) {
          throw new Error(
            typeof jobsData.error === "string"
              ? jobsData.error
              : "JOBS_LOAD_FAILED"
          );
        }

        const campaignJobs = (jobsData.jobs || []).filter(
          (job: any) =>
            job.payload &&
            typeof job.payload === "object" &&
            job.payload.campaignId === campaignId
        );

        const mainJob = campaignJobs.find(
          (job: any) => job.type === "CREATE_EVERYTHING"
        );

        const imageJobs = campaignJobs.filter(
          (job: any) => job.type === "GENERATE_IMAGE"
        );

        const failedJob = campaignJobs.find(
          (job: any) => job.status === "failed"
        );

        if (failedJob) {
          throw new Error(
            failedJob.error || "Campaign generation failed"
          );
        }

        const completedImages = imageJobs.filter(
          (job: any) => job.status === "succeeded"
        ).length;

        if (!mainJob || mainJob.status !== "succeeded") {
          setStatus("Writing campaign...");
        } else if (imageJobs.length === 0) {
          setStatus("Preparing images...");
        } else if (completedImages < imageJobs.length) {
          setStatus(
            `Generating images ${completedImages}/${imageJobs.length}...`
          );
        } else {
          setStatus("Applying Brand Brain...");

          await new Promise((resolve) =>
            setTimeout(resolve, 500)
          );

          setStatus("✓ Campaign ready");

          window.location.href = `/campaigns/${campaignId}`;
          return;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 700)
        );
      }

      throw new Error(
        "Campaign is taking longer than expected. Please check the campaign page."
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not create campaign"
      );
      setBusy(false);
    }
  }

  return (
    <>
      <div className="eyebrow">CREATE EVERYTHING · V3</div>

      <h1>One brief. A complete campaign.</h1>

      <div className="form">
        <label>What do you want to promote?</label>

        <textarea
          rows={6}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Launch our new product over the next 14 days..."
        />

        <div style={{ marginTop: 24, marginBottom: 24 }}>
          <label>Product imagery</label>

          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 8,
              marginBottom: 14,
            }}
          >
            <button
              type="button"
              onClick={() => setPhotoSource("website")}
              disabled={busy}
            >
              {photoSource === "website" ? "✓ " : ""}
              Website Photos
            </button>

            <button
              type="button"
              onClick={() => setPhotoSource("ai")}
              disabled={busy}
            >
              {photoSource === "ai" ? "✓ " : ""}
              Generate with AI
            </button>
          </div>

          {photoSource === "website" && (
            <>
              <label>Product URL</label>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <input
                  type="url"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder="https://rumiguitars.com/product/..."
                  disabled={busy || importing}
                  style={{ flex: 1 }}
                />

                <button
                  type="button"
                  onClick={importWebsitePhotos}
                  disabled={
                    busy ||
                    importing ||
                    !productUrl.trim()
                  }
                >
                  {importing ? "Importing..." : "Import Photos"}
                </button>
              </div>

              {importError && (
                <p className="status">{importError}</p>
              )}

              {productTitle && (
                <p style={{ marginTop: 12 }}>
                  <strong>{productTitle}</strong>
                </p>
              )}

              {websiteImages.length > 0 && (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <strong>
                      {selectedImages.length} photo{selectedImages.length === 1 ? "" : "s"} selected
                    </strong>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedImages([...websiteImages])
                        }
                        disabled={busy || websiteImages.length === 0}
                      >
                        Select All
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedImages([])}
                        disabled={busy || selectedImages.length === 0}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <p>
                    Select the photos to use in this campaign:
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(120px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {websiteImages.map((src) => (
                      <button
                        type="button"
                        key={src}
                        onClick={() =>
                          setSelectedImages((current) =>
                            current.includes(src)
                              ? current.filter((x) => x !== src)
                              : [...current, src]
                          )
                        }
                        disabled={busy}
                        style={{
                          padding: 4,
                          border:
                            selectedImages.includes(src)
                              ? "3px solid currentColor"
                              : "1px solid #ccc",
                          borderRadius: 12,
                          background: "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <img
                          src={src}
                          alt=""
                          style={{
                            width: "100%",
                            aspectRatio: "1 / 1",
                            objectFit: "contain",
                            display: "block",
                            borderRadius: 8,
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {photoSource === "ai" && (
            <p className="status">
              Rumi Social AI will generate clean campaign photography
              automatically.
            </p>
          )}
        </div>

        <label>Campaign goal</label>

        <select value={goal} onChange={(e) => setGoal(e.target.value)}>
          <option value="launch">Product launch</option>
          <option value="sales">Sales</option>
          <option value="awareness">Awareness</option>
          <option value="education">Education</option>
        </select>

        <div className="deliverables">
          <b>Campaign Director will prepare</b>
          <span>Strategy</span>
          <span>Static posts</span>
          <span>Carousel</span>
          <span>Stories</span>
          <span>Reel plan</span>
          <span>Voiceover</span>
          <span>Calendar</span>
          <span>Publishing queue</span>
        </div>

        <button
          className="button createbig"
          onClick={go}
          disabled={
            brief.trim().length < 10 ||
            busy ||
            (photoSource === "website" &&
              selectedImages.length === 0)
          }
        >
          {busy
  ? `✦ ${status || "Creating campaign..."}`
  : "✦ Create Everything"}
        </button>

        {status && <p className="status">{status}</p>}
      </div>
    </>
  );
}
