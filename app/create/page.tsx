"use client";

import { useState } from "react";

export default function Create() {
  const [brief, setBrief] = useState("");
  const [goal, setGoal] = useState("launch");
  const [days, setDays] = useState(14);

  const platforms = [
    "facebook",
    "instagram",
    "threads",
    "linkedin",
    "tiktok",
    "youtube",
  ] as const;

  const [dailyPlatforms, setDailyPlatforms] = useState<
    Record<number, string[]>
  >({});

  const [campaignStartDate, setCampaignStartDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  function dateForDay(day: number) {
    const date = new Date(`${campaignStartDate}T12:00:00`);
    date.setDate(date.getDate() + day - 1);
    return date;
  }

  function formatCampaignDate(day: number) {
    return dateForDay(day).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function specialDayForDate(date: Date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();

    const fixed: Record<string, string> = {
      "1-1": "New Year's Day",
      "2-14": "Valentine's Day",
      "7-4": "Independence Day",
      "10-31": "Halloween",
      "11-11": "Veterans Day",
      "12-24": "Christmas Eve",
      "12-25": "Christmas Day",
      "12-31": "New Year's Eve",
    };

    const fixedName = fixed[`${month}-${day}`];
    if (fixedName) return fixedName;

    function nthWeekday(
      targetMonth: number,
      weekday: number,
      occurrence: number
    ) {
      const first = new Date(year, targetMonth - 1, 1);
      const offset = (7 + weekday - first.getDay()) % 7;

      return new Date(
        year,
        targetMonth - 1,
        1 + offset + (occurrence - 1) * 7
      );
    }

    function lastWeekday(targetMonth: number, weekday: number) {
      const last = new Date(year, targetMonth, 0);
      const offset = (7 + last.getDay() - weekday) % 7;

      return new Date(
        year,
        targetMonth - 1,
        last.getDate() - offset
      );
    }

    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (sameDay(date, nthWeekday(1, 1, 3)))
      return "Martin Luther King Jr. Day";

    if (sameDay(date, nthWeekday(2, 1, 3)))
      return "Presidents Day";

    if (sameDay(date, nthWeekday(5, 0, 2)))
      return "Mother's Day";

    if (sameDay(date, lastWeekday(5, 1)))
      return "Memorial Day";

    if (sameDay(date, nthWeekday(6, 0, 3)))
      return "Father's Day";

    if (sameDay(date, nthWeekday(9, 1, 1)))
      return "Labor Day";

    if (sameDay(date, nthWeekday(11, 4, 4)))
      return "Thanksgiving";

    const thanksgiving = nthWeekday(11, 4, 4);
    const blackFriday = new Date(thanksgiving);
    blackFriday.setDate(blackFriday.getDate() + 1);

    if (sameDay(date, blackFriday))
      return "Black Friday";

    const smallBusinessSaturday = new Date(thanksgiving);
    smallBusinessSaturday.setDate(
      smallBusinessSaturday.getDate() + 2
    );

    if (sameDay(date, smallBusinessSaturday))
      return "Small Business Saturday";

    const cyberMonday = new Date(thanksgiving);
    cyberMonday.setDate(cyberMonday.getDate() + 4);

    if (sameDay(date, cyberMonday))
      return "Cyber Monday";

    return null;
  }

  function platformsForDay(day: number) {
    return dailyPlatforms[day] ?? ["facebook", "instagram"];
  }

  function togglePlatform(day: number, platform: string) {
    setDailyPlatforms((current) => {
      const selected =
        current[day] ?? ["facebook", "instagram"];

      return {
        ...current,
        [day]: selected.includes(platform)
          ? selected.filter((value) => value !== platform)
          : [...selected, platform],
      };
    });
  }

  function selectAllForDay(day: number) {
    setDailyPlatforms((current) => ({
      ...current,
      [day]: [...platforms],
    }));
  }

  function clearDay(day: number) {
    setDailyPlatforms((current) => ({
      ...current,
      [day]: [],
    }));
  }

  function applyDayToAll(day: number) {
    const selected = [...platformsForDay(day)];
    const next: Record<number, string[]> = {};

    for (let index = 1; index <= days; index++) {
      next[index] = [...selected];
    }

    setDailyPlatforms(next);
  }
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
          days,
          dailyPlan: Array.from({ length: days }, (_, index) => ({
            day: index + 1,
            date: dateForDay(index + 1).toISOString().slice(0, 10),
            specialDay: specialDayForDate(dateForDay(index + 1)),
            platforms: platformsForDay(index + 1),
          })),
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

        const jobsRes = await fetch(
          `/api/jobs?campaignId=${encodeURIComponent(campaignId)}`,
          {
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

      if (!mainJob || mainJob.status !== "succeeded") {
        setStatus("Writing campaign...");
      } else {
        setStatus(
          "Opening campaign — creatives will continue generating..."
        );

        await new Promise((resolve) =>
          setTimeout(resolve, 300)
        );

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

        <div style={{ marginTop: 22 }}>
          <label>Campaign duration</label>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 10,
              alignItems: "center",
            }}
          >
            {[7, 14, 30].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                disabled={busy}
                style={{
                  padding: "10px 16px",
                  borderRadius: "999px",
                  border: "1px solid #d8d3ca",
                  cursor: "pointer",
                  fontWeight: days === option ? 700 : 500,
                  background: days === option ? "#17191d" : "#f4f1eb",
                  color: days === option ? "#fff" : "#17191d",
                }}
              >
                {option} Days
              </button>
            ))}

            <label style={{ marginLeft: 4 }}>
              Custom
              <input
                type="number"
                min={1}
                max={90}
                value={days}
                disabled={busy}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value)) {
                    setDays(Math.min(90, Math.max(1, value)));
                  }
                }}
                style={{
                  width: 78,
                  marginLeft: 8,
                  padding: "9px 10px",
                }}
              />
            </label>
          </div>

          <p style={{ opacity: 0.65, marginTop: 8 }}>
            <span style={{ color: "#dc2626", fontWeight: 700 }}>
            Campaign Director will prepare a {days}-day campaign.
          </span>
          </p>
        </div>

        <div style={{ marginTop: 28, marginBottom: 28 }}>
          <h3 style={{ marginBottom: 6 }}>Campaign Schedule</h3>

          <p style={{ opacity: 0.65, marginTop: 0 }}>
            Choose your start date, then select platforms for each scheduled day.
          </p>

          <div style={{ marginTop: 18, marginBottom: 18 }}>
            <label>
              Campaign start date
              <input
                type="date"
                value={campaignStartDate}
                disabled={busy}
                onChange={(e) => setCampaignStartDate(e.target.value)}
                style={{
                  marginLeft: 12,
                  padding: "9px 12px",
                }}
              />
            </label>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {Array.from({ length: days }, (_, index) => {
              const day = index + 1;
              const selected = platformsForDay(day);
              const isOpen = expandedDay === day;
              const specialDay = specialDayForDate(dateForDay(day));

              const platformNames = selected.map((platform) =>
                platform === "linkedin"
                  ? "LinkedIn"
                  : platform === "youtube"
                  ? "YouTube"
                  : platform === "tiktok"
                  ? "TikTok"
                  : platform.charAt(0).toUpperCase() +
                    platform.slice(1)
              );

              return (
                <div
                  key={day}
                  style={{
                    border: "1px solid #ded9d0",
                    borderRadius: 14,
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setExpandedDay(isOpen ? null : day)
                    }
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 16,
                      padding: "16px 18px",
                      border: 0,
                      background: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <strong>{formatCampaignDate(day)}</strong>

                      {specialDay && (
                        <div
                          style={{
                            marginTop: 5,
                            fontWeight: 700,
                          }}
                        >
                          ★ {specialDay}
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: 5,
                          opacity: 0.65,
                          fontSize: 14,
                        }}
                      >
                        {platformNames.length
                          ? platformNames.join(" · ")
                          : "No platforms selected"}
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: 22,
                        transform: isOpen
                          ? "rotate(90deg)"
                          : "none",
                      }}
                    >
                      ›
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        borderTop: "1px solid #eee9e1",
                        padding: "16px 18px 18px",
                      }}
                    >
                      <strong>Publish this day to</strong>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 16,
                          marginTop: 14,
                        }}
                      >
                        {platforms.map((platform) => (
                          <label
                            key={platform}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(platform)}
                              disabled={busy}
                              onChange={() =>
                                togglePlatform(day, platform)
                              }
                              style={{
                                appearance: "auto",
                                WebkitAppearance: "checkbox",
                                width: 18,
                                height: 18,
                                minWidth: 18,
                                margin: 0,
                                padding: 0,
                                position: "static",
                                transform: "none",
                                flex: "0 0 auto",
                              }}
                            />

                            {platform === "linkedin"
                              ? "LinkedIn"
                              : platform === "youtube"
                              ? "YouTube"
                              : platform === "tiktok"
                              ? "TikTok"
                              : platform.charAt(0).toUpperCase() +
                                platform.slice(1)}
                          </label>
                        ))}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          marginTop: 16,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => selectAllForDay(day)}
                          disabled={busy}
                        >
                          Select All
                        </button>

                        <button
                          type="button"
                          onClick={() => clearDay(day)}
                          disabled={busy}
                        >
                          Clear
                        </button>

                        <button
                          type="button"
                          onClick={() => applyDayToAll(day)}
                          disabled={busy}
                        >
                          Apply to All Days
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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

        <span
          style={{
            color: "#dc2626",
            fontWeight: 700,
            marginLeft: 18,
            display: "inline-block",
          }}
        >
          Campaign Director will prepare a {days}-day campaign.
        </span>

        {status && <p className="status">{status}</p>}
      </div>
    </>
  );
}
