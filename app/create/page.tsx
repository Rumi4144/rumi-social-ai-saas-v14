"use client";

import GuidedFlow from "@/components/GuidedFlow";
import {useBrowserDraft} from "@/lib/workflow/browser-draft";
import {campaignDraftSchema, type CampaignPhoto} from "@/lib/workflow/draft-schema";
import CampaignSetupPhotos from "@/components/CampaignSetupPhotos";
import { useEffect, useState } from "react";
import { briefSuggestions, mixedTopicBrief, type BriefSuggestion } from "@/lib/campaign/brief-suggestions";
import { CONTENT_TYPES, campaignDate, newYorkToday, buildQuantityContentPlan, applyCampaignTopics, contentTypeLabel, specialDayForDate, type ContentQuantities, type SpecialDay } from "@/lib/campaign/content-plan";

export default function Create() {
  const [step, setStep] = useState(0);
  const [createdCampaign, setCreatedCampaign] = useState<string>();
  const [brief, setBrief] = useState("");
  const [suggestionContext, setSuggestionContext] = useState<{organizationId:string;draftScope:string;brandName:string;website?:string|null;source?:string;suggestions:BriefSuggestion[]}|null>(null);
  const [appliedTopics, setAppliedTopics] = useState<string[]>([]);
  const [mixTopics, setMixTopics] = useState(true);
  const [selectedTopics, setSelectedTopics] = useState<string[]|null>(null);
  const [readingWebsite, setReadingWebsite] = useState(false);
  const [topicStatus, setTopicStatus] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  useEffect(()=>{
    let active = true;
    fetch("/api/campaigns/brief-suggestions",{cache:"no-store"}).then(async response=>{
      if (!response.ok) return;
      const data = await response.json();
      if(active && typeof data.organizationId === "string" && typeof data.brandName === "string" && Array.isArray(data.suggestions)) setSuggestionContext(data);
    }).catch(()=>{}).finally(()=>{if(active)setSuggestionsLoading(false);});
    return ()=>{active=false;};
  },[]);
  const [goal, setGoal] = useState("launch");
  const [days, setDays] = useState(7);
  const [quantities, setQuantities] = useState<ContentQuantities>({post:2,reel_post:4,story_post:7,presenter_post:1});
  const [includeSpecialDays, setIncludeSpecialDays] = useState(true);
  const [excludedSpecialDays, setExcludedSpecialDays] = useState<string[]>([]);
  const [customSpecialDays, setCustomSpecialDays] = useState<SpecialDay[]>([]);
  const [specialDate, setSpecialDate] = useState("");
  const [specialLabel, setSpecialLabel] = useState("");

  const platforms = [
    "facebook",
    "instagram",
    "threads",
    "linkedin",
    "tiktok",
    "youtube",
    "google_business",
  ] as const;

  const [dailyPlatforms, setDailyPlatforms] = useState<
    Record<number, string[]>
  >({});

  const [campaignStartDate, setCampaignStartDate] = useState(
    () => newYorkToday()
  );

  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  function dateForDay(day: number) {
    return campaignDate(campaignStartDate || newYorkToday(), day);
  }

  function formatCampaignDate(day: number) {
    return dateForDay(day).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }


  const totalQuantity = CONTENT_TYPES.reduce((sum, type) => sum + quantities[type.value], 0);
  const validQuantities = totalQuantity > 0 && totalQuantity <= 60;
  const quantityCalendar = Array.from({length:days}, (_,index)=>({day:index+1,date:dateForDay(index+1).toISOString().slice(0,10),platforms:platformsForDay(index+1)}));
  const quantitySlots = validQuantities ? applyCampaignTopics(buildQuantityContentPlan(quantityCalendar, days, quantities), appliedTopics) : [];
  const contentForDay = (day:number) => quantitySlots.filter(slot=>slot.day===day).map(slot=>contentTypeLabel(slot.type) + (slot.topics?.length ? `: ${slot.topics.join(", ")}` : "")).join(" · ") || "No regular drafts planned";
  const suggestedDays = campaignStartDate ? Array.from({length: days}, (_, index) => {
    const date = dateForDay(index + 1), label = specialDayForDate(date);
    return label ? {date: date.toISOString().slice(0,10), label} : null;
  }).filter((day): day is SpecialDay => Boolean(day)) : [];
  const endDate = campaignStartDate ? dateForDay(days).toISOString().slice(0,10) : "";
  const specialKey = (day: SpecialDay) => `${day.date}:${day.label.toLowerCase()}`;
  const availableSpecialDays = [...suggestedDays, ...customSpecialDays.filter(day => day.date >= campaignStartDate && day.date <= endDate)].filter((day,index,all) => all.findIndex(other => specialKey(other) === specialKey(day)) === index);
  const selectedSpecialDays = includeSpecialDays ? availableSpecialDays.filter(day => !excludedSpecialDays.includes(specialKey(day))) : [];
  function addSpecialDay() {
    const label = specialLabel.trim();
    if (!specialDate || !label || specialDate < campaignStartDate || specialDate > endDate) { setStatus("Choose a named special day inside the campaign dates."); return; }
    const day = {date: specialDate, label};
    if (availableSpecialDays.some(other => specialKey(other) === specialKey(day))) {setStatus("That special day is already listed."); return;}
    if (customSpecialDays.length >= 20) {setStatus("You can add up to 20 custom special days."); return;}
    setCustomSpecialDays(current => [...current, day]); setSpecialLabel(""); setStatus("");
  }

  function platformsForDay(day: number) {
    return dailyPlatforms[day] ?? ["facebook", "instagram"];
  }

  function changeDays(count: number) {
    const selected = platformsForDay(1);
    setDailyPlatforms(current => Object.fromEntries(Array.from({length: count}, (_, i) => [i + 1, current[i + 1] || [...selected]])));
    setDays(count);
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
    useState<"website" | "ai" | "none" | "saved" | "upload">("none");
  const [photos,setPhotos] = useState<CampaignPhoto[]>([]);
  const campaignPhotos = photos.map(photo => photo.id);
  const [productUrl, setProductUrl] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [websiteImages, setWebsiteImages] = useState<string[]>([]);
  const [photoReceipt, setPhotoReceipt] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const draftValue = {step, brief, goal, days, appliedTopics, mixTopics, selectedTopics, quantities, includeSpecialDays, excludedSpecialDays, customSpecialDays, campaignStartDate, dailyPlatforms, photoSource, photos, productUrl, productTitle, websiteImages, selectedImages, photoReceipt, createdCampaign};
  const draft = useBrowserDraft(suggestionContext?.draftScope ? `campaign:${suggestionContext.draftScope}` : undefined, draftValue, campaignDraftSchema, saved => {
    setStep(saved.step); setBrief(saved.brief); setGoal(saved.goal); setDays(saved.days); setAppliedTopics(saved.appliedTopics); setMixTopics(saved.mixTopics); setSelectedTopics(saved.selectedTopics); setQuantities(saved.quantities); setIncludeSpecialDays(saved.includeSpecialDays); setExcludedSpecialDays(saved.excludedSpecialDays); setCustomSpecialDays(saved.customSpecialDays); setCampaignStartDate(saved.campaignStartDate); setDailyPlatforms(saved.dailyPlatforms); setPhotoSource(saved.photoSource); setPhotos(saved.photos); setProductUrl(saved.productUrl); setProductTitle(saved.productTitle); setWebsiteImages(saved.websiteImages); setSelectedImages(saved.selectedImages); setPhotoReceipt(saved.photoReceipt); setCreatedCampaign(saved.createdCampaign);
  });
  const creditCost = photoSource === "ai" ? 3 : 1;
  const blocker = !draft.ready ? suggestionsLoading ? "Loading your business…" : !suggestionContext?.draftScope ? "Your business could not load. Refresh this page to try again." : "Restoring your draft…"
    : brief.trim().length < 10 ? "Describe what you want to promote in at least 10 characters."
    : step >= 1 && photoSource === "website" && !selectedImages.length ? "Select at least one website photo, or choose Drafts only."
    : step >= 1 && ["saved","upload"].includes(photoSource) && !photos.length ? "Add at least one photo, or choose Drafts only."
    : step >= 2 && !validQuantities ? "Choose between 1 and 60 regular drafts."
    : step >= 2 && !campaignStartDate ? "Choose a campaign start date." : undefined;

  async function findWebsitePhotos() {
    if (!suggestionContext?.organizationId || importing || busy) return;
    setImporting(true); setImportError("");
    try {
      const response = await fetch("/api/campaigns/website-photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: suggestionContext.organizationId, topics: chosenTopics.map(topic => topic.label) }), signal: AbortSignal.timeout(45000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not find website photos.");
      if (data.organizationId !== suggestionContext.organizationId) throw new Error("Your workspace changed. Reload this page first.");
      const images: string[] = Array.isArray(data.images) ? data.images.filter((url: unknown): url is string => typeof url === "string").slice(0, 60) : [];
      setPhotoReceipt(data.photoReceipt || ""); setWebsiteImages(images); setSelectedImages(images); setProductTitle(data.title || "Website photos");
      setImportError(`${images.length} photos selected from your website. Review them below and deselect any you do not want.`);
    } catch (error) { setImportError(error instanceof Error && error.name === "TimeoutError" ? "The website took too long. Try again or import one product page." : error instanceof Error ? error.message : "Could not find website photos."); }
    finally { setImporting(false); }
  }

  async function importWebsitePhotos() {
    if (!productUrl.trim()) return;

    setImporting(true);
    setImportError("");
    setPhotoReceipt(""); setWebsiteImages([]);
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
    if (createdCampaign) {window.location.href = `/campaigns/${createdCampaign}`; return;}
    if (!draft.ready || step !== 3 || blocker || brief.trim().length < 10 || busy || importing || !validQuantities || !campaignStartDate || (photoSource === "website" && selectedImages.length === 0) || (["saved","upload"].includes(photoSource) && !campaignPhotos.length)) return;

    setBusy(true);
    setStatus("Preparing campaign...");

    try {
      const res = await fetch("/api/campaigns/create-everything", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: suggestionContext?.organizationId,
          campaignTopics: appliedTopics,
          brief,
          goal,
          days,
          dailyPlan: Array.from({ length: days }, (_, index) => ({
            day: index + 1,
            date: dateForDay(index + 1).toISOString().slice(0, 10),
            specialDay: specialDayForDate(dateForDay(index + 1)),
            platforms: platformsForDay(index + 1),
          })),
          contentQuantities: quantities,
          extraSpecialDays: selectedSpecialDays,
          photoSource,
          campaignPhotoIds: ["saved","upload"].includes(photoSource) ? campaignPhotos : [],
          photoReceipt: photoSource === "website" ? photoReceipt || undefined : undefined,
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

      setCreatedCampaign(campaignId);
      await draft.save({...draftValue, createdCampaign: campaignId}).catch(() => {});
      setStatus("Writing campaign...");

      for (let cycle = 0; cycle < 120; cycle++) {
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
        const primaryImageJobs = imageJobs;

        const completedPrimaryImages = primaryImageJobs.filter(
          (job: any) => job.status === "succeeded"
        ).length;

        const failedPrimaryImage = primaryImageJobs.find(
          (job: any) => job.status === "failed"
        );

        if (failedPrimaryImage) {
          throw new Error(
            failedPrimaryImage.error || "Primary image generation failed"
          );
        }

        if (
          ["none","saved","upload"].includes(photoSource) || (primaryImageJobs.length >= totalQuantity + selectedSpecialDays.length &&
          completedPrimaryImages >= totalQuantity + selectedSpecialDays.length)
        ) {
          setStatus("Campaign ready — opening...");

          await new Promise((resolve) =>
            setTimeout(resolve, 300)
          );

          window.location.href = `/campaigns/${campaignId}`;
          return;
        }

        setStatus(
          `Creating campaign images... ${completedPrimaryImages}/${totalQuantity + selectedSpecialDays.length}`
        );
      }

        await new Promise((resolve) =>
          setTimeout(resolve, 700)
        );
      }

      setStatus("Campaign is still finishing. Opening campaign...");
    window.location.href = `/campaigns/${campaignId}`;
    return;
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not create campaign"
      );
      setBusy(false);
    }
  }

  const topicIdeas = suggestionContext?.suggestions || briefSuggestions({name:"your business"});
  const chosenTopics = topicIdeas.filter(idea => selectedTopics === null || selectedTopics.includes(idea.label));
  async function readWebsiteTopics() {
    if (!suggestionContext || busy || readingWebsite) return;
    setReadingWebsite(true); setTopicStatus("Reading topic ideas from this business’s website…");
    try {
      const response = await fetch("/api/campaigns/brief-suggestions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:suggestionContext.organizationId})});
      const data = await response.json();
      if(!response.ok)throw new Error(data.error || "Could not read website topics.");
      setSuggestionContext(data); setSelectedTopics(null);setTopicStatus("Website topics loaded. Choose the ones you want, then fill the brief.");
    }catch(error){setTopicStatus(error instanceof Error ? error.message : "Could not read website topics.");}
    finally{setReadingWebsite(false);}
  }
  function useMixedTopics() {
    if(!chosenTopics.length)return;
    const sourceLinks=[...new Set(chosenTopics.map(idea=>idea.sourceUrl).filter(Boolean))];
    setBrief(mixedTopicBrief(suggestionContext?.brandName || "your business",chosenTopics.map(idea=>idea.label)) + (sourceLinks.length ? ` Website pages for these topics: ${JSON.stringify(sourceLinks)}.` : ""));
    setAppliedTopics(chosenTopics.map(idea=>idea.label));
    setGoal("education");
  }

  return (
    <>
      <div className="eyebrow">CREATE A CAMPAIGN</div>

      <h1>Plan your next campaign.</h1>
      <p>Choose your content, review the plan and cost, then create your drafts.</p>

      <GuidedFlow steps={["Your message", "Your photos", "Your plan", "Review & create"]} step={step} onStep={setStep} busy={busy || importing} blocked={createdCampaign ? undefined : blocker} saved={draft.message} action={createdCampaign ? <a className="button" href={`/campaigns/${createdCampaign}`}>Open created campaign</a> : <button className="button" type="button" disabled={busy || importing || !!blocker} onClick={go}>{busy ? "Creating drafts…" : `Create campaign drafts · ${creditCost} ${creditCost === 1 ? "credit" : "credits"}`}</button>}>
      <fieldset disabled={busy || !draft.ready} style={{border:0,padding:0,margin:0}}>
      {suggestionContext && <p><strong>{suggestionContext.brandName}</strong>{suggestionContext.website && <> · {suggestionContext.website}</>}</p>}
      <section hidden={step !== 0} aria-label="Your message">
        <details aria-label="Campaign ideas" style={{marginBottom:20}}>
          <summary>Need an idea? Choose a starting point.</summary>
          <p>{suggestionContext ? `Ideas for ${suggestionContext.brandName}.` : suggestionsLoading ? "Loading ideas for your workspace…" : "Choose general ideas, then add your business details."} Use several topics for variety, or turn off the mix for a single-topic campaign.</p>
          {suggestionContext?.website && <button type="button" disabled={busy || readingWebsite} onClick={readWebsiteTopics}>{readingWebsite ? "Reading website…" : "Find topics from my website"}</button>}
          {suggestionContext && !suggestionContext.website && <p>Add your website in <a href="/brand">Brand Brain</a> to find website topics.</p>}
          {suggestionContext?.source === "website" && <p>These topics come from this business’s product catalog or website pages. Review them before using.</p>}
          {topicStatus && <p role="status">{topicStatus}</p>}
          {!suggestionsLoading && <>
            <label style={{display:"flex",alignItems:"center",gap:8,marginTop:16,marginBottom:12}}><input type="checkbox" style={{width:18,height:18,margin:0}} checked={mixTopics} disabled={busy} onChange={e=>setMixTopics(e.target.checked)}/> Mix topics across this campaign</label>
            {mixTopics ? <>
              <p>Select or deselect topics. The campaign will alternate them, using one topic or product per draft before repeating.</p>
              <div style={{display:"grid",gap:10}}>{topicIdeas.map(idea=><label key={idea.label} style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" style={{width:18,height:18,margin:0}} disabled={busy} checked={selectedTopics === null || selectedTopics.includes(idea.label)} onChange={()=>setSelectedTopics(current=>{const selected=current||topicIdeas.map(topic=>topic.label);return selected.includes(idea.label)?selected.filter(label=>label!==idea.label):[...selected,idea.label];})}/>{idea.label}{idea.sourceUrl && <a href={idea.sourceUrl} target="_blank" rel="noreferrer" style={{fontWeight:400}}>View source</a>}</label>)}</div>
              <button type="button" style={{marginTop:16}} disabled={busy || !chosenTopics.length} onClick={useMixedTopics}>Fill brief with {chosenTopics.length} selected topics</button>
            </> : <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{topicIdeas.map(idea=><button type="button" key={idea.label} disabled={busy} onClick={()=>{setBrief(idea.brief);setAppliedTopics([]);setGoal(idea.goal);}}>{idea.label}</button>)}</div>}
            {appliedTopics.length > totalQuantity && <p>Your {totalQuantity} regular drafts will feature the first {totalQuantity} selected topics. Increase the number of drafts to include all {appliedTopics.length}.</p>}
            <p>You can edit the brief below. Editing it switches to your custom instructions. Choosing topics does not generate content or spend credits.</p>
          </>}
        </details>
        <label htmlFor="campaign-brief">What do you want to promote?</label>

        <textarea
          id="campaign-brief"
          rows={6}
          value={brief}
          onChange={(e) => {setBrief(e.target.value);setAppliedTopics([]);}}
          placeholder="Describe the product, service, or topic you want this campaign to promote…"
        />

        <label htmlFor="campaign-goal">Campaign goal</label>
        <select id="campaign-goal" value={goal} onChange={e => setGoal(e.target.value)}><option value="launch">Product or service launch</option><option value="sales">Sales</option><option value="awareness">Awareness</option><option value="education">Education</option></select>
      </section>
      <section hidden={step !== 1} aria-label="Your photos">
        <div style={{ marginTop: 24, marginBottom: 24 }}>
          <h3>Where should your photos come from?</h3>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 8,
              marginBottom: 14,
            }}
          >
            <button type="button" disabled={busy} onClick={() => setPhotoSource("none")}>{photoSource === "none" ? "✓ " : ""}Drafts only · no images</button>
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
          <button type="button" disabled={busy} onClick={()=>setPhotoSource("saved")}>{photoSource === "saved" ? "✓ " : ""}Reuse saved photos</button>{" "}<button type="button" disabled={busy} onClick={()=>setPhotoSource("upload")}>{photoSource === "upload" ? "✓ " : ""}Upload photos</button>
          </div>


          {["saved","upload"].includes(photoSource) && suggestionContext && <CampaignSetupPhotos organizationId={suggestionContext.organizationId} mode={photoSource as "saved"|"upload"} disabled={busy} photos={photos} onChange={setPhotos} onBusy={setImporting}/>}
          {photoSource === "website" && (
            <>
              <button type="button" disabled={busy || importing || !suggestionContext?.website} onClick={findWebsitePhotos}>{importing ? "Finding photos…" : "Find photos from my website"}</button>
              <p>Find a varied set from your business’s website and preselect it for this campaign. Review the photos below; you can deselect any. No image-generation credits are used to find photos.</p>
              {!suggestionContext?.website && !suggestionsLoading && <p>Add your website in Brand Brain to use automatic photo discovery.</p>}
              <label>Or import a specific product-page URL</label>

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
                  placeholder="https://your-website.com/product-or-service/"
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
                          loading="lazy"
                          decoding="async"
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

          {photoSource === "none" && <p>Prepare copy and video plans first. Creating the campaign uses 1 Rumi credit. Images and finished videos are created separately when you choose.</p>}
          {photoSource === "ai" && (
            <p className="status">
              Rumi Social AI will generate clean campaign photography
              automatically.
            </p>
          )}
        </div>

      </section>
      <section hidden={step !== 2} aria-label="Your plan">
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
            {[7, 15, 30].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => changeDays(option)}
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
                max={30}
                value={days}
                disabled={busy}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value)) {
                    changeDays(Math.min(30, Math.max(1, Math.floor(value))));
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

        <section style={{marginTop:24}} aria-label="Content mix">
          <h3>Content mix</h3>
          <p>Enter how many of each format you want.</p>
          <p>Entering 0 will skip a format, and the planner will spread your choices across the campaign dates.</p>
          <p>A day can contain more than one item.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:16}}>{CONTENT_TYPES.map(type => <label key={type.value}>{type.value === "presenter_post" ? "Presenter drafts" : type.value === "story_post" ? "Stories" : type.label + "s"}<input type="number" min={0} max={30} step={1} value={quantities[type.value]} disabled={busy} onChange={e=>setQuantities(current=>({...current,[type.value]:Math.max(0,Math.min(30,Math.floor(Number(e.target.value)||0)))}))}/></label>)}</div>
          <p>{totalQuantity} regular drafts across {days} days. Maximum 30 of each format, 60 regular drafts per campaign.</p>
          {!validQuantities && <p role="status">Choose between 1 and 60 regular drafts in total.</p>}
          <p>Stories are vertical drafts for you to review and download. Automatic Story publishing is not available yet.</p>
          <p>Reels and presenter videos start as drafts. Review them, then use the reel editor or presenter studio to create the finished video before scheduling.</p>
        </section>
        <details aria-label="Extra holiday and special-day posts">
          <summary>Extra holiday and special-day posts</summary>
          <label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" style={{width:18,height:18,margin:0}} checked={includeSpecialDays} disabled={busy} onChange={e=>setIncludeSpecialDays(e.target.checked)}/> Add extra posts for selected occasions</label>
          <p>U.S. national holidays and wellness observances within your campaign dates are selected by default. Uncheck any you do not want. Extra posts are added alongside your regular content, with photos directed to match each occasion.</p>
          <details><summary>Included U.S. national holidays</summary><p>New Year's Day, Martin Luther King Jr. Day, Presidents Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving and Christmas Day.</p><p>Posts use the holiday's actual calendar date. Wellness and kindness days are included separately when they fall within your campaign dates.</p></details>
          <p>Draft-only campaigns do not generate photos automatically. With website photos, special-day drafts wait for an occasion photo rather than recycling an unrelated product photo.</p>
          {includeSpecialDays && <>
            {!availableSpecialDays.length && <p>No suggested dates in this period. You can add your own below.</p>}
            {availableSpecialDays.map(day => <div key={specialKey(day)}><label style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><input type="checkbox" style={{width:18,height:18,margin:0}} disabled={busy} checked={!excludedSpecialDays.includes(specialKey(day))} onChange={()=>setExcludedSpecialDays(current=>current.includes(specialKey(day))?current.filter(key=>key!==specialKey(day)):[...current,specialKey(day)])}/> {day.date} · {day.label}</label></div>)}
            <label>Your special date<input type="date" value={specialDate} min={campaignStartDate} max={endDate} disabled={busy} onInput={e=>setSpecialDate(e.currentTarget.value)} onChange={e=>setSpecialDate(e.target.value)}/></label>
            <label>Occasion name<input value={specialLabel} maxLength={100} placeholder="Wellness event, anniversary, open day…" disabled={busy} onChange={e=>setSpecialLabel(e.target.value)}/></label>
            <button type="button" disabled={busy || !specialDate || !specialLabel.trim()} onClick={addSpecialDay}>Add special day</button>
          </>}
          <p><strong>{totalQuantity} regular drafts + {selectedSpecialDays.length} extra special-day drafts = {totalQuantity+selectedSpecialDays.length} planned posts.</strong></p>
        </details>
        <div style={{ marginTop: 28, marginBottom: 28 }}>
          <h3 style={{ marginBottom: 6 }}>Campaign Schedule</h3>

          <p style={{ opacity: 0.65, marginTop: 0 }}>
            Choose the dates and intended platforms for your drafts. You will choose publishing times after reviewing the finished content.
          </p>

          <div style={{ marginTop: 18, marginBottom: 18 }}>
            <label>
              Campaign start date
              <input
                type="date"
                value={campaignStartDate}
                disabled={busy}
                onInput={(e) => setCampaignStartDate(e.currentTarget.value)}
                onChange={(e) => setCampaignStartDate(e.target.value)}
                style={{
                  marginLeft: 12,
                  padding: "9px 12px",
                }}
              />
            </label>
          </div>

          <h3>Platforms for this campaign</h3>
          <div style={{display:"flex",flexWrap:"wrap",gap:16}}>{platforms.map(platform => <label key={platform}><input type="checkbox" checked={platformsForDay(1).includes(platform)} onChange={() => {const selected = platformsForDay(1).includes(platform) ? platformsForDay(1).filter(value => value !== platform) : [...platformsForDay(1),platform]; setDailyPlatforms(Object.fromEntries(Array.from({length:days},(_,i)=>[i+1,[...selected]])));}}/>{platform === "google_business" ? "Google Business Profile" : platform === "youtube" ? "YouTube" : platform === "tiktok" ? "TikTok" : platform === "linkedin" ? "LinkedIn" : platform.charAt(0).toUpperCase()+platform.slice(1)}</label>)}</div>
          <details><summary>Customize platforms for individual days</summary>
          <div style={{ display: "grid", gap: 10 }}>
            {Array.from({ length: days }, (_, index) => {
              const day = index + 1;
              const selected = platformsForDay(day);
              const isOpen = expandedDay === day;
              const specialDay = specialDayForDate(dateForDay(day));

              const platformNames = selected.map((platform) =>
                platform === "google_business" ? "Google Business Profile" : platform === "linkedin"
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
                      <div>{contentForDay(day)}</div>

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
                      <p>{contentForDay(day)}</p>
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

                            {platform === "google_business" ? "Google Business Profile" : platform === "linkedin"
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
          </details>
        </div>
      </section>
      <section hidden={step !== 3} aria-label="Review your campaign">
        <h3>Your message</h3><p style={{whiteSpace:"pre-wrap"}}>{brief}</p><button type="button" disabled={busy} onClick={()=>setStep(0)}>Edit message</button>
        <h3>Your photos</h3><p>{photoSource === "none" ? "Drafts only, without generated images" : photoSource === "ai" ? "Generate campaign photos with AI" : `${photoSource === "website" ? selectedImages.length : photos.length} selected photos`}</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:10}}>{(photoSource === "website" ? selectedImages.map(src=>({src,label:"Selected website photo"})) : ["saved","upload"].includes(photoSource) ? photos : []).map((photo,index)=><img key={index} src={photo.src} alt={photo.label} style={{width:90,height:100,objectFit:"contain"}}/>)}</div><button type="button" disabled={busy} onClick={()=>setStep(1)}>Edit photos</button>
        <h3>Your {days}-day plan</h3><p>{totalQuantity} regular drafts and {selectedSpecialDays.length} special-day drafts, beginning {campaignStartDate}.</p>
        <ul>{CONTENT_TYPES.filter(type=>quantities[type.value]>0).map(type=><li key={type.value}>{quantities[type.value]} {contentTypeLabel(type.value)} drafts</li>)}</ul>
        <details><summary>View day-by-day plan</summary><div style={{display:"grid",gap:12}}>{quantityCalendar.map(day=><article style={{padding:"12px 0",borderBottom:"1px solid #d7e3dc"}} key={day.day}><strong>{formatCampaignDate(day.day)}</strong><p>{contentForDay(day.day)}</p>{selectedSpecialDays.filter(special=>special.date===day.date).map(special=><p key={specialKey(special)}>{special.label} · extra draft</p>)}<small>{day.platforms.join(" · ") || "No platforms selected"}</small></article>)}</div></details><button type="button" disabled={busy} onClick={()=>setStep(2)}>Edit plan</button>
        <h3>Creation cost: {creditCost} Rumi {creditCost === 1 ? "credit" : "credits"}</h3>
        <p>Includes the campaign copy and {photoSource === "ai" ? "AI campaign photos" : "your selected photo choices"}. Reels and presenter videos are plans at this stage; finished video generation is priced separately.</p>
        <p>Review the generated drafts before scheduling. Creating this campaign does not publish any posts.</p>
        {createdCampaign && <p>This campaign has already been created. <button type="button" onClick={()=>{setCreatedCampaign(undefined);setStep(0);setStatus("");}}>Start another campaign with these choices</button></p>}
      </section>
      </fieldset>
      {status && <p className="status" role="status">{status}</p>}
      </GuidedFlow>
    </>
  );
}
