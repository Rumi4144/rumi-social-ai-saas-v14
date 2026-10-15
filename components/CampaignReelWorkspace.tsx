"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const ReelEditor = dynamic(() => import("@/app/studio/reels/ReelEditor"), { loading: () => <p>Opening reel tools…</p> });
const eventName = "open-campaign-reel";

export function CampaignReelButton({ campaignId, contentItemId }: { campaignId: string; contentItemId: string }) {
  return <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(eventName, { detail: { campaignId, contentItemId } }))}>Create or finish this reel</button>;
}

export default function CampaignReelWorkspace({ campaignId, campaignTitle }: { campaignId: string; campaignTitle: string }) {
  const [open, setOpen] = useState(false);
  const [postId, setPostId] = useState("");
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash === "#automatic-reels") setOpen(true);
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{campaignId: string; contentItemId: string}>).detail;
      if (detail?.campaignId !== campaignId) return;
      setPostId(detail.contentItemId); setOpen(true);
      requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener(eventName, handle);
    return () => window.removeEventListener(eventName, handle);
  }, [campaignId]);
  return <section id="automatic-reels" ref={panel} className="card" style={{marginBottom: 24, scrollMarginTop: 24}}>
    <h2>Automatic reels</h2>
    {!open ? <><p>Create, review and post a reel here in your campaign.</p><button type="button" onClick={() => setOpen(true)}>Create or finish a reel</button></> :
      <ReelEditor embedded quick initialCampaignId={campaignId} initialContentItemId={postId} initialCampaigns={[{id: campaignId, title: campaignTitle}]} />}
  </section>;
}
