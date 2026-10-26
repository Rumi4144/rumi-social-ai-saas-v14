"use client";
import GuidedFlow from "@/components/GuidedFlow";
import { useBrowserDraft } from "@/lib/workflow/browser-draft";
import { presenterDraftSchema } from "@/lib/workflow/draft-schema";
import { readReferencePhoto } from "@/lib/workflow/reference-photo";
import VideoLogoEditor from "@/components/VideoLogoEditor";
import { useEffect, useRef, useState } from "react";
import { photoProducts } from "@/lib/presenter/catalog-choices";
import { presenterCampaignChoices, presenterPostPrefill, type PresenterPost } from "@/lib/presenter/post-prefill";
import { presenterCost } from "@/lib/presenter/plan";
// Names follow the photo grid from left to right, top to bottom.
const PRESENTER_NAMES = ["Alex", "Morgan", "Jamie", "Taylor", "Jordan", "Casey", "Avery", "Riley", "Cameron", "Quinn", "Skyler", "Reese", "Rowan", "Parker", "Sage", "Drew", "Charlie", "Finley", "Emerson", "Blair", "Dakota", "Robin", "Hayden", "Remy"] as const;
type Job = {
    id: string;
    status: string;
    progress: number;
    error?: string;
    videoUrl?: string;
    cost: number;
    campaignId?: string;
    contentItemId?: string;
};
type Product = {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    sourceUrl?: string;
    websiteOnly?: boolean;
};
export default function PresenterStudio({ campaigns, initialCampaignId, initialContentItemId, draftScope, organizationId }: {
    draftScope: string;
    organizationId: string;
    campaigns: {
        id: string;
        title: string;
    }[];
    initialCampaignId: string;
    initialContentItemId: string;
}) {
    const [savingStep, setSavingStep] = useState(false);
    const [step, setStep] = useState(0), [newPresenter, setNewPresenter] = useState(false), [writingScript, setWritingScript] = useState(false);
    const [requestId, setRequestId] = useState(""), [requestKey, setRequestKey] = useState("");
    const prefilled = useRef(""), generationGuard = useRef(false);
    const [browseCatalog, setBrowseCatalog] = useState(false), [catalogSearch, setCatalogSearch] = useState("");
    const [photoLoading, setPhotoLoading] = useState(false);
    const [selectedPortrait, setSelectedPortrait] = useState<number | null>(null), [portraitLoading, setPortraitLoading] = useState(false);
    async function selectPortrait(index: number) {  setPortraitLoading(true); setError(""); setConsent(false); try {
        const image = new Image();
        image.src = index === 24 ? "/presenters/flamenco-presenter.svg" : "/presenters/presenter-contact-sheet.svg";
        await image.decode();
        const col = index % 6, row = Math.floor(index / 6), width = image.naturalWidth / 6, height = image.naturalHeight / 4;
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 420;
        const context = canvas.getContext("2d");
        if (!context)
            throw new Error("Could not load presenter photo.");
        if (index === 24) {
            canvas.height = 720;
            context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, 480, 720);
        }
        else
            context.drawImage(image, col * width + 3, row * height + 2, width - 6, height * .86, 0, 0, 480, 420);
        setCharacterImage(canvas.toDataURL("image/jpeg", .9));
        setNewPresenter(false);
        setSelectedPortrait(index);
        if (presenterUpload.current)
            presenterUpload.current.value = "";
        setRequestId("");
        setRequestKey("");
    }
    catch {
        setError("Could not load this presenter. Please try again.");
    }
    finally {
        setPortraitLoading(false);
    } }
    const [suggestions, setSuggestions] = useState<Product[]>([]), [pickCount, setPickCount] = useState(3), [picking, setPicking] = useState(false);
    const [campaignId, setCampaignId] = useState(initialCampaignId), [itemId, setItemId] = useState(initialContentItemId), [posts, setPosts] = useState<PresenterPost[]>([]), [products, setProducts] = useState<Product[]>([]), [productId, setProductId] = useState(""), [productImage, setProductImage] = useState(""), [name, setName] = useState(""), [details, setDetails] = useState(""), [characterImage, setCharacterImage] = useState(""), [look, setLook] = useState<"neutral" | "woman" | "man">("neutral"), [delivery, setDelivery] = useState<"natural" | "spanish" | "relaxed" | "british" | "australian" | "french" | "persian" | "cowboy" | "newyork">("natural"), [script, setScript] = useState(""), [duration, setDuration] = useState<5 | 10 | 15>(15), [consent, setConsent] = useState(false), [credits, setCredits] = useState(0), [configured, setConfigured] = useState(false), [connectionLoaded, setConnectionLoaded] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [jobs, setJobs] = useState<Job[]>([]), [current, setCurrent] = useState<Job | null>(null);
    const presenterUpload = useRef<HTMLInputElement>(null);
    const presenterPicker = useRef<HTMLFieldSetElement>(null);
    const returnToPicker = useRef(false);
    const cost = presenterCost(duration, !characterImage);
    const draftValue = { step, campaignId, itemId, productId, productImage, name, details, characterImage, selectedPortrait, look, delivery, script, duration, requestId, requestKey, newPresenter };
    const draft = useBrowserDraft(`presenter:${draftScope}`, draftValue, presenterDraftSchema, saved => {
        if ((initialCampaignId && saved.campaignId !== initialCampaignId) || (initialContentItemId && saved.itemId !== initialContentItemId)) return;
        if (saved.campaignId && !campaigns.some(c => c.id === saved.campaignId))
            return;
        setStep(saved.step);
        setCampaignId(saved.campaignId);
        setItemId(saved.itemId);
        setProductId(saved.productId);
        setProductImage(saved.productImage);
        setName(saved.name);
        setDetails(saved.details);
        setCharacterImage(saved.characterImage);
        setSelectedPortrait(saved.selectedPortrait);
        setLook(saved.look);
        setDelivery(saved.delivery);
        setScript(saved.script);
        setDuration(saved.duration);
        setRequestId(saved.requestId);
        setRequestKey(saved.requestKey);
        setNewPresenter(saved.newPresenter);
        setConsent(false);
        prefilled.current = `${saved.campaignId}:${saved.itemId}`;
    });
    useEffect(() => { setConsent(false); }, [campaignId, itemId, productId, productImage, name, details, characterImage, look, delivery, script, duration]);
    async function changeStep(next: number) {
        if (savingStep) return;
        setSavingStep(true); setConsent(false);
        try { await draft.save({...draftValue, step: next}); setStep(next); }
        catch { setError("Your changes could not be saved. Keep this page open and try Continue again."); }
        finally { setSavingStep(false); }
    }
    async function openBilling() { try {
        await draft.save();
        window.location.href = "/billing";
    }
    catch {
        setError("Your draft could not be saved. Keep this page open and open Billing in another tab.");
    } }
    async function writeScript() { setWritingScript(true); setError(""); try {
        const response = await fetch("/api/video/presenter/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, campaignId, contentItemId: itemId, seconds: duration, productName: name, productDetails: details }) });
        const data = await response.json();
        if (!response.ok)
            throw Error(data.error || "Could not write the script.");
        setScript(data.script);
        setConsent(false);
    }
    catch (error) {
        setError(error instanceof Error ? error.message : "Could not write the script.");
    }
    finally {
        setWritingScript(false);
    } }
    function removeUploadedPhoto() {  if (presenterUpload.current)
        presenterUpload.current.value = ""; if (selectedPortrait === null)
        setCharacterImage(""); setConsent(false); setError(""); setRequestId(""); setRequestKey(""); }
    function createAnotherPresenter() { if (presenterUpload.current)
        presenterUpload.current.value = ""; returnToPicker.current = true; setStep(1); setNewPresenter(false); setCurrent(null); setRequestId(""); setRequestKey(""); setConsent(false); setError(""); setCharacterImage(""); setSelectedPortrait(null); }
    useEffect(() => { if (current) {
        setJobs(previous => previous.map(job => job.id === current.id ? current : job));
    }
    else if (returnToPicker.current) {
        returnToPicker.current = false;
        presenterPicker.current?.scrollIntoView({ behavior: "instant", block: "start" });
        presenterPicker.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    } }, [current]);
    useEffect(() => { if (!draft.ready)
        return; let active = true; setLoading(true); setConnectionLoaded(false); setError(""); setProducts([]); setPosts([]); setSuggestions([]); setBrowseCatalog(false); fetch(`/api/video/presenter${campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : ""}`).then(async (r) => { const d = await r.json(); if (!r.ok)
        throw new Error(d.error || "Could not load studio."); if (campaignId) {
        try {
            const catalogResponse = await fetch(`/api/video/presenter/products?campaignId=${encodeURIComponent(campaignId)}`, { cache: "no-store" });
            const catalog = await catalogResponse.json();
            if (catalogResponse.ok)
                d.products = [...(d.products || []), ...(catalog.products || []).filter((p: Product) => !(d.products || []).some((old: Product) => old.id === p.id || old.sourceUrl && old.sourceUrl === p.sourceUrl))];
            else if (active)
                setError(catalog.error || "Website products could not load. You can use an imported product or upload its photo.");
        }
        catch {
            if (active)
                setError("Website products could not load. You can use an imported product or upload its photo.");
        }
    } if (active) {
        setCredits(d.credits);
        setConfigured(d.configured);
        setConnectionLoaded(true);
        setJobs(d.jobs || []);
        if (requestId) {
            const previous = (d.jobs || []).find((job: Job) => job.id === requestId);
            if (previous)
                setCurrent(previous);
        }
        const choices = presenterCampaignChoices(d.products || [], d.posts || []);
        const selectedPost = (d.posts || []).find((post: PresenterPost) => post.id === itemId) || d.posts?.[0];
        setProducts(choices);
        setPosts(d.posts || []);
        setItemId(selectedPost?.id || "");
        if (selectedPost && prefilled.current !== `${campaignId}:${selectedPost.id}`)
            fillPost(selectedPost, choices);
    } }).catch(e => active && setError(e.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [campaignId, draft.ready]);
    useEffect(() => { if (!current || !["running", "saving", "starting"].includes(current.status))
        return; const id = setInterval(async () => { try {
        const r = await fetch(`/api/video/presenter?jobId=${current.id}`);
        const d = await r.json();
        if (!r.ok)
            throw new Error(d.error);
        setCurrent(d.job);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Status delayed.");
    } }, 16000); return () => clearInterval(id); }, [current]);
    function fillPost(post: PresenterPost, choices: Product[]) {
        prefilled.current = `${campaignId}:${post.id}`;
        const filled = presenterPostPrefill(post, choices);
        setProductId(filled.productId); setProductImage(filled.image); setName(filled.name);
        setDetails(filled.details); setScript(filled.script); setConsent(false);
        setRequestId(""); setRequestKey("");
    }
    function choosePost(id: string) {
        setItemId(id);
        const post = posts.find(post => post.id === id);
        if (post) fillPost(post, products);
    }
    async function photo(file: File | undefined, character = false) { if (!file)
        return; setPhotoLoading(true); setError(""); try {
        const uri = await readReferencePhoto(file);
        if (character) {
            setCharacterImage(uri);
            setSelectedPortrait(null);
            setNewPresenter(false);
        }
        else
            setProductImage(uri);
        setConsent(false);
        setRequestId("");
        setRequestKey("");

    }
    catch (error) {
        setError((error instanceof Error ? error.message : "Photo unavailable.") + " Your previous selection is still saved.");
    } finally { setPhotoLoading(false); } }
    async function generate() {
        if (generationGuard.current || !draft.ready || step !== 3 || !consent || blocker)
            return;
        generationGuard.current = true;
        setBusy(true);
        setError("");
        const input = { provider: "runway", campaignId, contentItemId: itemId, productId: products.find(p => p.id === productId)?.websiteOnly ? undefined : productId || undefined, productImage: productImage || undefined, productName: name, productDetails: details, characterImage: characterImage || undefined, look, delivery, script, duration, consent: true };
        const key = JSON.stringify(input), id = requestKey === key && requestId ? requestId : crypto.randomUUID();
        setRequestId(id);
        setRequestKey(key);
        try {
            await draft.save({ ...draftValue, requestId: id, requestKey: key });
            const response = await fetch("/api/video/presenter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, requestId: id }) });
            const data = await response.json();
            if (!response.ok)
                throw Error(data.error || "Could not start presenter.");
            setCurrent(data.job);
            setJobs(previous => [data.job, ...previous.filter(job => job.id !== data.job.id)]);
            setConsent(false);
            const balance = await fetch("/api/video/presenter").then(r => r.json()).catch(() => null);
            if (typeof balance?.credits === "number")
                setCredits(balance.credits);
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "Request failed. Retry checks the same request.");
        }
        finally {
            generationGuard.current = false;
            setBusy(false);
        }
    }
    function useProduct(product: Product) { const post = posts.find(p => `post-${p.id}` === product.id); setProductId(product.id); setProductImage(product.imageUrl || ""); setName(product.name.slice(0, 180)); setDetails(product.description?.slice(0, 8000) || ""); setScript(post ? presenterPostPrefill(post, []).script : `Explore ${product.name.split(/\s+/).slice(0, 8).join(" ")}. See the photos and details on our website. Ask us anything.`); setConsent(false); setRequestId(""); setRequestKey(""); }
    function selectProduct(id: string) { setProductId(id); setProductImage(""); setConsent(false); const product = products.find(p => p.id === id); if (product)
        useProduct(product);
    else {
        const post = posts.find(p => p.id === itemId);
        const filled = post ? presenterPostPrefill(post, []) : null;
        setName(filled?.name || "");
        setDetails(filled?.details || "");
        setScript(filled?.script || "");
        setProductImage(filled?.image || "");
        setRequestId("");
        setRequestKey("");
    } }
    async function pickProducts() { setPicking(true); setError(""); try {
        const r = await fetch(`/api/video/presenter/products?campaignId=${encodeURIComponent(campaignId)}`);
        const data = await r.json();
        if (!r.ok)
            throw new Error(data.error || "Could not load website products.");
        const pool: Product[] = photoProducts(data.products || []);
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const choices = pool.slice(0, pickCount);
        if (!choices.length)
            throw new Error("No product photos were found. Browse your website catalog or upload an actual product photo.");
        setProducts(previous => [...previous, ...pool.filter(p => !previous.some(old => old.id === p.id))]);
        setSuggestions(choices);
        useProduct(choices[0]);
        if (choices.length < pickCount)
            setError(`Found ${choices.length} products with photos; fewer than the ${pickCount} requested. Browse the website catalog or upload another product photo.`);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not pick products.");
    }
    finally {
        setPicking(false);
    } }
    async function check(job: Job) { try {
        const r = await fetch(`/api/video/presenter?jobId=${job.id}`);
        const d = await r.json();
        if (!r.ok)
            throw new Error(d.error);
        setCurrent(d.job);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not check video.");
    } }
    const locked = busy || savingStep || writingScript || photoLoading || Boolean(current && ["starting", "running", "saving", "uncertain"].includes(current.status));
    const productReference = productImage || products.find(p => p.id === productId)?.imageUrl || "";
    const blocker = !draft.ready ? "Restoring your draft…" : loading ? "Loading your campaign…" : !campaignId || !itemId ? "Choose a campaign and post." : !name.trim() || !productReference ? "Choose your product and its photo."
        : step >= 1 && !characterImage && !newPresenter ? "Choose a presenter photo, or choose to create a new presenter."
            : step >= 2 && script.trim().length < 10 ? "Add the words you want your presenter to say."
                : step === 3 && !configured ? "Video generation is not connected. Your choices are saved."
                    : step === 3 && credits < cost ? `This video needs ${cost} credits; you have ${credits}.` : undefined;
    const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
    return <><div className="eyebrow">AI PRESENTER STUDIO</div><h1>Introduce your actual product.</h1><p>Choose your product and presenter, review the script and cost, then create your video.</p><a href="/studio/reels">Back to reel editor</a>{error && <p role="alert">{error}</p>}{loading && <p role="status">Loading campaigns and products…</p>}{photoLoading && <p role="status">Preparing and saving your photo…</p>}{!campaigns.length && <section className="card"><h2>Create a campaign first</h2><a className="button" href="/campaigns">Open campaigns</a></section>}
 <GuidedFlow steps={["Your product", "Your presenter", "Your script", "Review & create"]} step={step} onStep={changeStep} busy={locked || picking || portraitLoading} blocked={blocker} saved={draft.message} action={<button className="button" type="button" disabled={locked || !!blocker || !consent} onClick={generate}>{busy ? "Starting video…" : `Create video · ${cost} credits`}</button>}>
 <fieldset disabled={locked || loading || picking || portraitLoading || !draft.ready} className="presenter-form" style={{ border: 0, padding: 0 }}><section hidden={step !== 0} aria-label="Your product"><label htmlFor="presenter-campaign">Campaign</label><select id="presenter-campaign" value={campaignId} onChange={e => { setCampaignId(e.target.value); prefilled.current = ""; setItemId(""); setCurrent(null); setProductId(""); setProductImage(""); setSuggestions([]); setName(""); setDetails(""); setScript(""); setConsent(false); }}><option value="">Choose campaign</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select><label htmlFor="presenter-post">Choose post · automatically fill presenter information</label><select id="presenter-post" value={itemId} onChange={e => choosePost(e.target.value)}><option value="">Choose post</option>{posts.map(p => <option key={p.id} value={p.id}>{p.headline || "Untitled post"}</option>)}</select>{campaignId && !loading && !posts.length && <p>This campaign needs a draft post before you can save a presenter clip.</p>}
 <p>Select a post to fill its title, text and available photo. Review the short script before generating. If no photo is available, upload one below.</p>
 <details className="presenter-picker"><summary>Suggest products or services for me</summary><label htmlFor="presenter-pick-count">How many product photos?</label><select id="presenter-pick-count" value={pickCount} onChange={e => setPickCount(Number(e.target.value))}><option value={1}>1 product</option><option value={2}>2 products</option><option value={3}>3 products</option></select><button type="button" disabled={!campaignId || picking} onClick={pickProducts}>{picking ? "Finding products…" : suggestions.length ? "Pick again" : "Pick products or services for me"}</button><p>We fill the photo, name, available product details and an editable script. Choose one product per presenter clip; you can change everything before generating. Picking products uses no credits.</p><div className="presenter-choices">{suggestions.map(p => <article key={p.id}>{p.imageUrl && <img src={p.imageUrl} alt={p.name}/>}<p>{p.name}</p>{p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer">View product or service</a>}<button type="button" aria-pressed={productId === p.id} onClick={() => useProduct(p)}>{productId === p.id ? "Selected" : "Use this product"}</button></article>)}</div></details>
 <section className="presenter-picker"><h2>Choose a product or service from your website</h2><button type="button" disabled={loading || !campaignId} onClick={() => setBrowseCatalog(value => !value)}>{browseCatalog ? "Hide website catalog" : "Browse website products or services"}</button>{browseCatalog && <><label>Search products<input value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} placeholder="Search by product, service or topic"/></label><div className="presenter-choices">{photoProducts(products).filter(p => p.sourceUrl && p.name.toLowerCase().includes(catalogSearch.toLowerCase())).map(p => <article key={p.id}><img src={p.imageUrl} alt={p.name}/><h3>{p.name}</h3><a href={p.sourceUrl} target="_blank" rel="noreferrer">View on your website</a><button type="button" aria-pressed={productId === p.id} onClick={() => useProduct(p)}>{productId === p.id ? "Selected" : "Use this product and photo"}</button></article>)}</div>{!photoProducts(products).some(p => p.sourceUrl) && <p>No saved website photos are available for this business yet. Upload a product or service photo to continue.</p>}</>}</section>
 <label htmlFor="presenter-product">Choose a product, service or campaign topic</label>{!campaignId && <p>Choose a campaign above to load its brand’s products.</p>}<select id="presenter-product" value={productId} onChange={e => selectProduct(e.target.value)}><option value="">Use selected post information / uploaded photo</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><label>Actual product photo · optional replacement</label><input aria-label="Actual product photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => photo(e.target.files?.[0])}/>{(productImage || products.find(p => p.id === productId)?.imageUrl) && <img alt="Selected product reference" src={productImage || products.find(p => p.id === productId)?.imageUrl} style={{ width: 150, height: 180, objectFit: "contain" }}/>}{products.find(p => p.id === productId)?.sourceUrl && <p><a href={products.find(p => p.id === productId)!.sourceUrl} target="_blank" rel="noreferrer">View original product details</a></p>}<label htmlFor="presenter-name">Product name</label><input id="presenter-name" maxLength={180} value={name} onChange={e => setName(e.target.value)}/><label htmlFor="presenter-details">Product details from your catalog</label><p>Loaded from the selected product, service or campaign topic. Review and edit before generating; missing information stays blank.</p><textarea id="presenter-details" maxLength={8000} value={details} onChange={e => setDetails(e.target.value)}/></section><section hidden={step !== 1} aria-label="Your presenter"><fieldset ref={presenterPicker} disabled={busy || portraitLoading} style={{ border: 0, padding: 0, margin: "20px 0", scrollMarginTop: 24 }}><legend>Choose a presenter photo</legend><p>25 fictional presenters. Selecting a photo costs no credits. Video generation uses the selected face as a reference; the result can vary.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 12 }}>{PRESENTER_NAMES.map((presenterName, index) => <button key={index} type="button" aria-label={`Select ${presenterName}`} aria-pressed={selectedPortrait === index} onClick={() => selectPortrait(index)} style={{ padding: 6, border: selectedPortrait === index ? "3px solid #315943" : "1px solid #ddd", borderRadius: 10, background: "white", color: "#19241e" }}><svg aria-hidden="true" viewBox={`${(index % 6) * 256 + 3} ${Math.floor(index / 6) * 256 + 2} 250 220`} style={{ display: "block", width: "100%", borderRadius: 6 }}><image href="/presenters/presenter-contact-sheet.svg" width="1536" height="1024"/></svg><span>{presenterName}</span></button>)}<button type="button" aria-label="Select Lucia, flamenco guitarist" aria-pressed={selectedPortrait === 24} onClick={() => selectPortrait(24)} style={{ padding: 6, border: selectedPortrait === 24 ? "3px solid #315943" : "1px solid #ddd", borderRadius: 10, background: "white", color: "#19241e" }}><img alt="Fictional flamenco guitarist Lucia" src="/presenters/flamenco-presenter.svg" style={{ display: "block", width: "100%", aspectRatio: "250 / 220", objectFit: "cover", objectPosition: "center 20%", borderRadius: 6 }}/><span>Lucia · Flamenco</span></button></div>{portraitLoading && <p role="status">Loading presenter photo…</p>}</fieldset><details><summary>Create a new fictional presenter instead</summary><label><input type="checkbox" checked={newPresenter} onChange={e => { setNewPresenter(e.target.checked); if (e.target.checked) {
        setCharacterImage("");
        setSelectedPortrait(null);
    } setConsent(false); }}/> Create a new presenter portrait · 16 additional credits</label><label htmlFor="presenter-look">Presenter</label><select id="presenter-look" value={look} onChange={e => setLook(e.target.value as typeof look)}><option value="neutral">Fictional presenter</option><option value="woman">Fictional woman</option><option value="man">Fictional man</option></select></details><label>Or upload a presenter photo you have permission to use</label><input ref={presenterUpload} aria-label="Presenter reference photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => photo(e.target.files?.[0], true)}/><button type="button" onClick={removeUploadedPhoto}>Remove uploaded photo</button>{characterImage && <><img alt="Presenter reference" src={characterImage} style={{ width: 110, height: 140, objectFit: "contain" }}></img><button type="button" onClick={() => { if (presenterUpload.current)
        presenterUpload.current.value = ""; setCharacterImage(""); setSelectedPortrait(null); setNewPresenter(true);  setConsent(false); setRequestId(""); setRequestKey(""); }}>Use fictional presenter instead</button></>}
 </section><section hidden={step !== 2} aria-label="Your script">
 <label htmlFor="presenter-delivery">Accent / delivery</label><select id="presenter-delivery" value={delivery} onChange={e => { setDelivery(e.target.value as typeof delivery); setConsent(false); setRequestId(""); setRequestKey(""); }}><option value="spanish">Light Spanish accent · English</option><option value="natural">Natural English · warm and clear</option><option value="relaxed">Relaxed English · friendly and clear</option><option value="british">British English</option><option value="australian">Australian English</option><option value="french">Light French accent · English</option><option value="persian">Persian accent · English</option><option value="cowboy">Cowboy / Southern American</option><option value="newyork">New York English</option></select><p>The accent is a generation instruction and may vary. Put only the words to say in Spoken script.</p><button type="button" disabled={writingScript || !name.trim()} onClick={writeScript}>{writingScript ? "Writing…" : "Write a short script"}</button><label htmlFor="presenter-script">Spoken script</label><textarea id="presenter-script" maxLength={500} value={script} onChange={e => setScript(e.target.value)} placeholder="A short introduction using verified facts."/><p>Keep the script brief: about 10 words for 5 seconds, 20 for 10 seconds or 30 for 15 seconds.</p><label htmlFor="presenter-duration">Clip length</label><select id="presenter-duration" value={duration} onChange={e => setDuration(Number(e.target.value) as 5 | 10 | 15)}><option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={15}>15 seconds</option></select><p>{wordCount} words · {duration}-second video. {wordCount > duration * 2.7 ? "This script may be too long. Shorten it before creating the video." : "Read it aloud once to check the timing."}</p></section>
 <section hidden={step !== 3} aria-label="Review your presenter video"><h3>Your references</h3><div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}><figure style={{ margin: 0 }}><img alt="Product to use in your video" src={productReference || undefined} style={{ width: 180, height: 210, objectFit: "contain" }}/><figcaption>{name}</figcaption></figure><figure style={{ margin: 0 }}>{characterImage ? <img alt="Presenter to use in your video" src={characterImage} style={{ width: 180, height: 210, objectFit: "contain" }}/> : <p>New fictional presenter</p>}<figcaption>{characterImage ? selectedPortrait === null ? "Your uploaded presenter" : selectedPortrait === 24 ? "Lucia" : PRESENTER_NAMES[selectedPortrait] : look}</figcaption></figure></div><p><button type="button" onClick={() => changeStep(0)}>Edit product</button> <button type="button" onClick={() => changeStep(1)}>Edit presenter</button></p><h3>Spoken script</h3><p style={{ whiteSpace: "pre-wrap" }}>{script}</p><p>{duration} seconds · vertical video · {delivery} delivery</p><button type="button" onClick={() => changeStep(2)}>Edit script</button>
 <p><strong>{cost} Rumi credits</strong> · {credits} available. {characterImage ? "Uses your presenter reference." : "Includes creating a fictional presenter portrait."}</p>{credits < cost && configured && <p><button type="button" onClick={openBilling}>Save draft and open Billing</button> before generating this clip.</p>}{connectionLoaded && !configured && !loading && <p>Runway and private video storage need connecting before generation.</p>}<label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/> I approve the {cost} credit cost and have permission to use these photos.</label></section></fieldset></GuidedFlow>
 {current && <section className="card" style={{ marginTop: 24 }}><h2>Presenter draft</h2><p role="status">{current.status} · {current.progress}%</p>{current.error && <p>{current.error}</p>}<small>Request: {current.id}</small>{current.videoUrl && <><video controls src={current.videoUrl} style={{ width: "100%", maxWidth: 300 }}/><p><a href={`${current.videoUrl}${current.videoUrl.includes("?") ? "&" : "?"}download=1`} download="presenter.mp4">Download MP4</a> · <a href={`/studio/reels?campaignId=${current.campaignId || campaignId}&contentItemId=${current.contentItemId || itemId}`}>Use in reel editor</a></p><VideoLogoEditor src={current.videoUrl}/><p>The clip is saved to its campaign post for review. It has not been published.</p></>}{["succeeded", "failed"].includes(current.status) && <button type="button" onClick={createAnotherPresenter}>Create another presenter</button>}</section>}
 {!!jobs.length && <section className="card" style={{ marginTop: 24 }}><h2>Recent presenter drafts</h2>{jobs.map(j => <p key={j.id}>{j.status} · {j.cost} credits <button onClick={() => check(j)}>Open draft</button></p>)}</section>}</>;
}
