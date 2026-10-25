import { get } from "@vercel/blob";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { labCanRun } from "@/lib/ai-lab/catalog";
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext(); if (!labCanRun(ctx.role, ctx.isSuperAdmin)) throw new Error("FORBIDDEN");
    const query = new URL(req.url).searchParams;
    const job = await prisma.job.findFirst({ where: { id: query.get("jobId") || "", organizationId: ctx.organizationId, type: "AI_LAB", status: "succeeded" } });
    const result = job?.result as { pathname?: string; contentType?: string } | null;
    if (!job || !result?.pathname?.startsWith(`ai-lab/${ctx.organizationId}/${job.id}.`)) return new Response("Sample not found", { status: 404 });
    const file = await get(result.pathname, { access: "private" });
    if (file?.statusCode !== 200) return new Response("Sample unavailable", { status: 404 });
    const ext = result.pathname.split(".").pop();
    const size = file.blob.size;
    const headers = new Headers({ "Content-Type": result.contentType || "application/octet-stream", "Content-Length": String(size), "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "Content-Disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="rumi-test-${job.id}.${ext}"` });
    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
      const end = match?.[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (!match[1] && Number(match[2]) === 0)) {
        await file.stream.cancel();
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
      headers.set("Content-Length", String(end - start + 1));
      const reader = file.stream.getReader();
      let offset = 0;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) { controller.close(); return; }
              const chunkStart = offset;
              offset += value.byteLength;
              if (offset <= start) continue;
              controller.enqueue(value.subarray(Math.max(0, start - chunkStart), Math.min(value.byteLength, end + 1 - chunkStart)));
              if (offset > end) { controller.close(); await reader.cancel(); }
              return;
            }
          } catch (error) { controller.error(error); }
        },
        cancel(reason) { return reader.cancel(reason); },
      });
      return new Response(stream, { status: 206, headers });
    }
    return new Response(file.stream, { headers });
  } catch (error) { return apiError(error, "Could not load this test sample."); }
}
