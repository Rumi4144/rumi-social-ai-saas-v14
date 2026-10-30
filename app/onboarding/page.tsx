"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { INDUSTRIES } from "@/lib/industries";

type WebsiteReview = { reviewId: string; website: string; logoUrl: string | null; products: { name: string; sourceUrl: string; photoCount: number }[]; warnings: string[] };
const fieldStyle = { display: "grid", gap: 8 };
const inputStyle = { width: "100%", minWidth: 0 };

export default function OnboardingPage() {
  const router = useRouter();
  const [brand, setBrand] = useState(""), [website, setWebsite] = useState("");
  const [description, setDescription] = useState(""), [industry, setIndustry] = useState(""), [targetAudience, setAudience] = useState("");
  const [busy, setBusy] = useState<"read" | "save" | null>(null), [message, setMessage] = useState("");
  const [review, setReview] = useState<WebsiteReview | null>(null), [canManage, setCanManage] = useState(false), [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/onboarding/profile", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to set up your business." : "Could not load your business. Refresh to try again.");
      const data = await response.json(); if (!active) return;
      if (data.brand?.onboardingCompleted) { router.replace("/dashboard"); return; }
      setBrand(data.brand?.name || ""); setWebsite(data.brand?.websiteUrl || ""); setDescription(data.brand?.description || "");
      setIndustry(data.brand?.industry || ""); setAudience(data.brand?.targetAudience || ""); setCanManage(data.canManage === true);
    }).catch(error => { if (active) setMessage(error.message); }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  function changedWebsite(value: string) { setWebsite(value); setReview(null); }
  async function readWebsite() {
    setBusy("read"); setMessage(""); setReview(null);
    try {
      const response = await fetch("/api/onboarding/website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: brand.trim(), website: website.trim() }) });
      const data = await response.json(); if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not read this website.");
      setWebsite(data.website); setReview(data);
      setDescription(current => current || data.suggestions.description); setIndustry(current => current || data.suggestions.industry); setAudience(current => current || data.suggestions.targetAudience);
      setMessage("Website read. Review your business details, then continue to your first week.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not read this website. You can add the details yourself."); }
    finally { setBusy(null); }
  }
  async function finish(event: React.FormEvent) {
    event.preventDefault(); setBusy("save"); setMessage("");
    try {
      const response = await fetch("/api/onboarding/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: brand.trim(), website: website.trim(), websiteReviewId: review?.reviewId, description: description.trim(), industry, targetAudience: targetAudience.trim() }) });
      const data = await response.json(); if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save your business.");
      router.push("/dashboard"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save your business."); }
    finally { setBusy(null); }
  }
  return <>
    <section className="hero v2"><div><div className="eyebrow">WELCOME TO RUMI SOCIAL AI</div><h1>Your first week starts here.</h1>
      <p>Add your website and business name. We can collect your actual logo and product photos, then prepare a week for you to review.</p></div></section>
    {!loaded && <p role="status">Loading your business…</p>}
    {loaded && !canManage && <p>Your workspace owner or administrator can finish setup. <a href="/dashboard">Return to This Week</a>.</p>}
    <form onSubmit={finish} className="card" style={{ marginTop: 24, maxWidth: 900 }}>
      <fieldset disabled={!loaded || !canManage || Boolean(busy)} style={{ border: 0, padding: 0, display: "grid", gap: 20, minWidth: 0 }}>
        <label style={fieldStyle}>Business name<input style={inputStyle} value={brand} onChange={event => { setBrand(event.target.value); setReview(null); }} minLength={2} maxLength={160} required placeholder="Your business name" /></label>
        <label style={fieldStyle}>Business website<input style={inputStyle} value={website} onChange={event => changedWebsite(event.target.value)} maxLength={2000} inputMode="url" placeholder="https://yourbusiness.com" />
          <small>No website yet? Add a short description below.</small></label>
        <div><button type="button" onClick={readWebsite} disabled={!website.trim() || brand.trim().length < 2}>{busy === "read" ? "Reading your website…" : "Read my website"}</button></div>
        {review && <section style={{ padding: 20, background: "#eef7f2", borderRadius: 16 }}>
          <h2>Your website assets</h2>
          {review.logoUrl && <img src={review.logoUrl} alt={`${brand} logo found on the website`} style={{ maxWidth: 220, maxHeight: 100, objectFit: "contain", background: "white", padding: 12, borderRadius: 8 }} />}
          <p>{review.products.length} {review.products.length === 1 ? "product" : "products"} found · {review.products.reduce((sum, product) => sum + product.photoCount, 0)} original product photos.</p>
          {review.products.length > 0 && <ul>{review.products.slice(0, 5).map(product => <li key={product.sourceUrl}>{product.name} · {product.photoCount} photos</li>)}</ul>}
          {review.warnings.map(warning => <p key={warning}>{warning}</p>)}
        </section>}
        <label style={fieldStyle}>What do you offer? <small>(optional with a website)</small><textarea style={inputStyle} value={description} onChange={event => setDescription(event.target.value)} maxLength={8000} rows={4} placeholder="What you sell or help people with, and what makes your business different." /></label>
        <details><summary>Additional business details (optional)</summary><div style={{ display: "grid", gap: 18, marginTop: 18 }}>
          <label style={fieldStyle}>Industry<select style={inputStyle} value={industry} onChange={event => setIndustry(event.target.value)}><option value="">Choose an industry</option>{INDUSTRIES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label style={fieldStyle}>Your customers<textarea style={inputStyle} value={targetAudience} onChange={event => setAudience(event.target.value)} rows={3} maxLength={4000} placeholder="Who should these posts speak to?" /></label>
        </div></details>
        <p>Your weekly posts are prepared for you. Approve each post, then download it or send it to your connected accounts.</p>
        <button type="submit" className="button" disabled={brand.trim().length < 2 || (!website.trim() && description.trim().length < 10)}>{busy === "save" ? "Saving your business…" : "Continue to my first week"}</button>
      </fieldset>
      {message && <p role="status" style={{ marginTop: 18 }}>{message}</p>}
      {busy === "read" && <p role="status">Collecting website information and original images. This can take a minute.</p>}
    </form>
  </>;
}
