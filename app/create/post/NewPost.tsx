"use client";

import Link from "next/link";
import TikTokPostOptions from "@/components/TikTokPostOptions";
import type { TikTokPostOptions as TikTokOptions } from "@/lib/tiktok/options";
import YouTubePostOptions from "@/components/YouTubePostOptions";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Account = { id: string; provider: string; accountName: string | null };
type Brand = { id: string; name: string };

export default function NewPost({ brands, accounts }: { brands: Brand[]; accounts: Account[] }) {
  const [media, setMedia] = useState<File>();
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("private");
  const [madeForKids, setMadeForKids] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const [certified, setCertified] = useState(false);
  const [preparedId, setPreparedId] = useState("");
  const [tikTokOptions, setTikTokOptions] = useState<TikTokOptions | null>(null);
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

  const isVideo = !!media && (media.type === "video/mp4" || /\.mp4$/i.test(media.name));
  const destinations = accounts.filter(account => {
    if (["youtube", "tiktok"].includes(account.provider)) return true;
    if (account.provider === "google_business") return !!media && !isVideo;
    return true;
  });
  const picks = destinations.filter(account => selected.includes(account.id) && (!["youtube", "tiktok"].includes(account.provider) || isVideo));
  const tikTok = picks.find(account => account.provider === "tiktok");
  const includesYouTube = picks.some(account => account.provider === "youtube");
  const captionLimit = picks.some(account => account.provider === "google_business") ? 1500 : 2200;
  const canPublish = Boolean(media && picks.length && caption.trim() && caption.trim().length <= captionLimit && (!includesYouTube || certified) && (!tikTok || !preparedId || tikTokOptions));

  const accountLabel = (account: Account) => {
    const labels: Record<string, string> = {
      instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", google_business: "Google Business Profile",
    };
    const platform = labels[account.provider] || account.provider;
    return account.accountName ? platform + " · " + account.accountName : platform;
  };

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || saved || !media || !canPublish) return;
    const form = new FormData(event.currentTarget);
    requestId.current ||= crypto.randomUUID();
    form.set("requestId", requestId.current);
    form.set("media", media);
    if (tikTok && !preparedId) form.set("prepareOnly", "true");
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/posts/new", { method: "POST", body: form });
      const post = await response.json();
      if (!response.ok || typeof post.contentItemId !== "string") throw new Error(post.error || "Could not save your post.");
      const contentItemId = post.contentItemId;
      if (tikTok && !preparedId) {
        setPreparedId(contentItemId);
        return;
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
              ...(provider === "tiktok" ? { tiktok: tikTokOptions } : {}),
              socialConnectionId: id,
              ...(provider === "youtube" ? {
                youtube: { certified, privacy, madeForKids, containsSyntheticMedia: synthetic },
              } : {}),
            }),
          });
          const delivery = await publishResponse.json();
          message = publishResponse.ok
            ? delivery.pending ? "Submitted. Check Publishing for delivery status." : "Published."
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
        <select name="brandId" required onChange={() => { requestId.current = null; setPreparedId(""); setTikTokOptions(null); }}>
          {brands.length > 1 && <option value="">Choose a brand</option>}
          {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </label>
      <label>Photo or video
        <input type="file" name="media" accept="image/jpeg,image/png,image/webp,video/mp4" required onChange={event => {
          requestId.current = null; setPreparedId(""); setTikTokOptions(null);
          setCertified(false);
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
      {preview && (isVideo
        ? <video src={preview} controls playsInline style={{ maxWidth: "100%", maxHeight: 360 }} />
        : <img src={preview} alt="Post preview" style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }} />)}
      <label>Caption
        <textarea name="caption" value={caption} required maxLength={2200} rows={5} onChange={event => {
          requestId.current = null; setPreparedId(""); setTikTokOptions(null);
          setCaption(event.target.value);
        }} />
      </label>
      <fieldset>
        <legend>Post to</legend>
        {!destinations.length && <p>{media ? "No connected account supports this file type." : "Choose a photo or video to see available accounts."}</p>}
        {!accounts.some(account => account.provider === "youtube") && <p><Link href="/settings/youtube">Connect YouTube</Link> to post videos from this workspace.</p>}
        {!accounts.some(account => account.provider === "tiktok") && <p><Link href="/settings">Connect TikTok</Link> to post videos from this workspace.</p>}
        {destinations.map(account => <label key={account.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" disabled={(["youtube", "tiktok"].includes(account.provider) && !isVideo) || (account.provider === "tiktok" && !!tikTok && tikTok.id !== account.id)} checked={selected.includes(account.id)} onChange={event => {
            const checked = event.target.checked;
            if (account.provider === "tiktok") setTikTokOptions(null);
            setSelected(previous => checked ? [...previous, account.id] : previous.filter(id => id !== account.id));
          }} style={{ width: "auto" }} />
          {accountLabel(account)}{["youtube", "tiktok"].includes(account.provider) && !isVideo ? " · Add an MP4 to enable" : ""}
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
      {tikTok && preparedId && <TikTokPostOptions key={tikTok.id} connectionId={tikTok.id} contentItemId={preparedId} disabled={busy || saved} onChange={setTikTokOptions} />}
      <button type="submit" disabled={!canPublish}>
        {busy ? "Working…" : tikTok && !preparedId ? "Review TikTok settings" : "Post Now"}
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
