"use client";

import Link from "next/link";
import TikTokPostOptions from "@/components/TikTokPostOptions";
import type { TikTokPostOptions as TikTokOptions } from "@/lib/tiktok/options";
import YouTubePostOptions from "@/components/YouTubePostOptions";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Account = { id: string; provider: string; accountName: string | null };
type Brand = { id: string; name: string };

export default function NewPost({ brands, accounts }: { brands: Brand[]; accounts: Account[] }) {
  const [brandId, setBrandId] = useState(brands.length === 1 ? brands[0].id : "");
  const [reviewPostId, setReviewPostId] = useState<string>();
  const [tiktokOptions, setTikTokOptions] = useState<Record<string, TikTokOptions | null>>({});
  const updateTikTokOptions = useCallback((id: string, options: TikTokOptions | null) => {
    setTikTokOptions(previous => ({ ...previous, [id]: options }));
  }, []);
  const [media, setMedia] = useState<File>();
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("private");
  const [madeForKids, setMadeForKids] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const [certified, setCertified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (!media) { setPreview(""); return; }
    const url = URL.createObjectURL(media);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [media]);

  const isVideo = media?.type === "video/mp4";
  const destinations = accounts.filter(account => {
    if (account.provider === "google_business") return !!media && !isVideo;
    return true;
  });
  const videoOnly = (provider: string) => provider === "youtube" || provider === "tiktok";
  const picks = destinations.filter(account => selected.includes(account.id) && (!videoOnly(account.provider) || isVideo));
  const tiktokPicks = picks.filter(account => account.provider === "tiktok");
  const needsTikTokReview = tiktokPicks.length > 0 && !reviewPostId;
  const includesYouTube = picks.some(account => account.provider === "youtube");
  const captionLimit = picks.some(account => account.provider === "google_business") ? 1500 : 2200;
  const canPublish = Boolean(brandId && media && picks.length && caption.trim() && caption.trim().length <= captionLimit && (needsTikTokReview || ((!includesYouTube || certified) && tiktokPicks.every(account => tiktokOptions[account.id]))));

  const accountLabel = (account: Account) => {
    const labels: Record<string, string> = {
      instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", google_business: "Google Business Profile",
    };
    const platform = labels[account.provider] || account.provider;
    return account.accountName ? platform + " · " + account.accountName : platform;
  };

  function resetReview() {
    requestId.current = null;
    setReviewPostId(undefined);
    setTikTokOptions({});
    setCertified(false);
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || saved || !media || !canPublish) return;
    const form = new FormData(event.currentTarget);
    requestId.current ||= crypto.randomUUID();
    form.set("requestId", requestId.current);
    form.set("media", media);
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      let contentItemId = reviewPostId;
      if (!contentItemId) {
        const response = await fetch("/api/posts/new", { method: "POST", body: form });
        const post = await response.json();
        if (!response.ok || typeof post.contentItemId !== "string") throw new Error(post.error || "Could not save your post.");
        contentItemId = post.contentItemId;
        if (needsTikTokReview) {
          setReviewPostId(contentItemId);
          return;
        }
      }
      setSaved(true);

      for (const { id, provider } of picks) {
        let message: string;
        try {
          const publishResponse = await fetch("/api/publishing/now", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contentItemId,
              socialConnectionId: id,
              ...(provider === "tiktok" ? { tiktok: tiktokOptions[id] } : {}),
              ...(provider === "youtube" ? {
                youtube: { certified, privacy, madeForKids, containsSyntheticMedia: synthetic },
              } : {}),
            }),
          });
          const delivery = await publishResponse.json();
          message = publishResponse.ok
            ? delivery.pending ? delivery.message || "Submitted. Check Publishing for delivery status." : "Published."
            : typeof delivery.error === "string" ? delivery.error : "Publishing failed. Check Publishing for details.";
        } catch {
          message = "Delivery could not be confirmed. Check Publishing before retrying.";
        }
        setResults(previous => ({ ...previous, [id]: message }));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your post.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <form className="card" onSubmit={publish} style={{ maxWidth: 700 }}>
    <fieldset disabled={busy || saved} style={{ display: "grid", gap: 16, border: 0, padding: 0, margin: 0 }}>
      <label>Brand
        <select name="brandId" value={brandId} required onChange={event => {
          resetReview();
          setSelected([]);
          setBrandId(event.target.value);
        }}>
          {brands.length > 1 && <option value="">Choose a brand</option>}
          {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </label>
      <label>Photo or video
        <input type="file" name="media" accept="image/jpeg,image/png,image/webp,video/mp4" required onChange={event => {
          resetReview();
          setSelected(previous => previous.filter(id => accounts.some(account =>
            account.id === id && ["facebook", "instagram"].includes(account.provider)
          )));
          const file = event.target.files?.[0];
          if (file && file.size > 3 * 1024 * 1024) {
            setError("Choose a photo or MP4 up to 3 MB.");
            event.target.value = "";
            setMedia(undefined);
            return;
          }
          setError("");
          setMedia(file);
        }} />
      </label>
      <small>JPG, PNG, WebP, or MP4 up to 3 MB.</small>
      {preview && (media?.type === "video/mp4"
        ? <video src={preview} controls playsInline style={{ maxWidth: "100%", maxHeight: 360 }} />
        : <img src={preview} alt="Post preview" style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }} />)}
      <label>Caption
        <textarea name="caption" value={caption} required maxLength={2200} rows={5} onChange={event => {
          resetReview();
          setCaption(event.target.value);
        }} />
      </label>
      <fieldset>
        <legend>Post to</legend>
        {!destinations.length && <p>{media ? "No connected account supports this file type." : "Choose a photo or video to see available accounts."}</p>}
        {destinations.map(account => <label key={account.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" disabled={videoOnly(account.provider) && !isVideo} checked={selected.includes(account.id)} onChange={event => {
            const checked = event.target.checked;
            if (!checked && account.provider === "tiktok") updateTikTokOptions(account.id, null);
            setSelected(previous => checked ? [...previous, account.id] : previous.filter(id => id !== account.id));
          }} style={{ width: "auto" }} />
          {accountLabel(account)}{videoOnly(account.provider) && !isVideo && " · Upload an MP4 to select"}
        </label>)}
      </fieldset>
      {caption.trim().length > captionLimit && <p role="alert">Google Business Profile captions can be up to 1,500 characters.</p>}
      {includesYouTube && <YouTubePostOptions
        disabled={busy || saved}
        privacy={privacy} onPrivacyChange={setPrivacy}
        madeForKids={madeForKids} onMadeForKidsChange={setMadeForKids}
        synthetic={synthetic} onSyntheticChange={setSynthetic}
        certified={certified} onCertifiedChange={setCertified}
      />}
      {reviewPostId && tiktokPicks.map(account => <TikTokDestinationOptions
        key={account.id}
        connectionId={account.id}
        contentItemId={reviewPostId}
        disabled={busy || saved}
        onChange={updateTikTokOptions}
      />)}
      <button type="submit" disabled={!canPublish}>
        {busy ? (needsTikTokReview ? "Preparing video…" : "Posting…") : needsTikTokReview ? "Review TikTok settings" : "Post Now"}
      </button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {saved && <div aria-live="polite">
      <ul>{picks.map(account =>
        <li key={account.id}>{accountLabel(account)} · {results[account.id] || "Waiting for delivery status…"}</li>
      )}</ul>
      <Link href="/publishing">View Publishing</Link>
      {!busy && <button type="button" onClick={() => window.location.reload()}>Create another post</button>}
    </div>}
  </form>;
}

function TikTokDestinationOptions({ connectionId, contentItemId, disabled, onChange }: {
  connectionId: string;
  contentItemId: string;
  disabled: boolean;
  onChange: (id: string, options: TikTokOptions | null) => void;
}) {
  const onOptionsChange = useCallback((options: TikTokOptions | null) => {
    onChange(connectionId, options);
  }, [connectionId, onChange]);
  return <TikTokPostOptions connectionId={connectionId} contentItemId={contentItemId}
    disabled={disabled} onChange={onOptionsChange} />;
}
