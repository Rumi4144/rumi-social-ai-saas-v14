"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Account = { id: string; provider: string; accountName: string | null };
type Brand = { id: string; name: string };

export default function NewPost({ brands, accounts }: { brands: Brand[]; accounts: Account[] }) {
  const [media, setMedia] = useState<File>();
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
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

  const accountLabel = (account: Account) => {
    const platform = account.provider === "instagram" ? "Instagram" : "Facebook";
    return account.accountName ? platform + " · " + account.accountName : platform;
  };

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || saved || !media || !selected.length || !caption.trim()) return;
    const form = new FormData(event.currentTarget);
    requestId.current ||= crypto.randomUUID();
    form.set("requestId", requestId.current);
    form.set("media", media);
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/posts/new", { method: "POST", body: form });
      const post = await response.json();
      if (!response.ok || typeof post.contentItemId !== "string") throw new Error(post.error || "Could not save your post.");
      setSaved(true);

      for (const id of selected) {
        let message: string;
        try {
          const publishResponse = await fetch("/api/publishing/now", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contentItemId: post.contentItemId, socialConnectionId: id }),
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
        <select name="brandId" required onChange={() => { requestId.current = null; }}>
          {brands.length > 1 && <option value="">Choose a brand</option>}
          {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </label>
      <label>Photo or video
        <input type="file" name="media" accept="image/jpeg,image/png,image/webp,video/mp4" required onChange={event => {
          requestId.current = null;
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
          requestId.current = null;
          setCaption(event.target.value);
        }} />
      </label>
      <fieldset>
        <legend>Post to</legend>
        {accounts.map(account => <label key={account.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={selected.includes(account.id)} onChange={event => {
            const checked = event.target.checked;
            setSelected(previous => checked ? [...previous, account.id] : previous.filter(id => id !== account.id));
          }} style={{ width: "auto" }} />
          {accountLabel(account)}
        </label>)}
      </fieldset>
      <button type="submit" disabled={!media || !caption.trim() || !selected.length}>
        {busy ? "Posting…" : "Post Now"}
      </button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {saved && <div aria-live="polite">
      <ul>{accounts.filter(account => selected.includes(account.id)).map(account =>
        <li key={account.id}>{accountLabel(account)} · {results[account.id] || "Waiting for delivery status…"}</li>
      )}</ul>
      <Link href="/publishing">View Publishing</Link>
      {!busy && <button type="button" onClick={() => window.location.reload()}>Create another post</button>}
    </div>}
  </form>;
}
