"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function CampaignImageProcessor({
  campaignId,
}: {
  campaignId: string;
}) {
  const router = useRouter();
  const running = useRef(false);

  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function processImages() {
      if (running.current) return;
      running.current = true;

      try {
        for (let cycle = 0; cycle < 100 && !cancelled; cycle++) {
          const jobsRes = await fetch(
            `/api/jobs?campaignId=${encodeURIComponent(campaignId)}`,
            { cache: "no-store" }
          );

          if (!jobsRes.ok) break;

          const jobsData = await jobsRes.json();

          const campaignJobs = (jobsData.jobs || []).filter(
            (job: any) =>
              job.payload &&
              typeof job.payload === "object" &&
              job.payload.campaignId === campaignId
          );

          const imageJobs = campaignJobs.filter(
            (job: any) => job.type === "GENERATE_IMAGE"
          );

          const completed = imageJobs.filter(
            (job: any) => job.status === "succeeded"
          ).length;

          setProgress({
            completed,
            total: imageJobs.length,
          });

          const failed = imageJobs.find(
            (job: any) => job.status === "failed"
          );

          if (failed) {
            console.error(
              "Image generation failed:",
              failed.error || failed.id
            );
          }

          const nextJob = imageJobs.find(
            (job: any) =>
              job.status !== "succeeded" &&
              job.status !== "failed"
          );

          if (!nextJob) {
            router.refresh();
            break;
          }

          await fetch("/api/campaigns/process", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              jobId: nextJob.id,
            }),
          });

          router.refresh();

          await new Promise((resolve) =>
            setTimeout(resolve, 500)
          );
        }
      } catch (error) {
        console.error("Campaign image processor:", error);
      } finally {
        running.current = false;
      }
    }

    processImages();

    return () => {
      cancelled = true;
    };
  }, [campaignId, router]);

  if (!progress || progress.total === 0) {
    return null;
  }

  if (progress.completed >= progress.total) {
    return null;
  }

  return (
    <div
      style={{
        margin: "16px 0 24px",
        padding: "14px 18px",
        borderRadius: "14px",
        background: "rgba(0,0,0,0.05)",
      }}
    >
      Generating creatives in background…{" "}
      {progress.completed}/{progress.total}
    </div>
  );
}
