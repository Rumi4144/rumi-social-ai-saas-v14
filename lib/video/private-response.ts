import { get } from "@vercel/blob";
export async function privateVideoResponse(req: Request, pathname: string, contentType: string, filename: string) {
  const url = new URL(req.url);
    const result = await get(pathname, { access: "private" });
    if (result?.statusCode !== 200) return new Response("Video unavailable", { status: 404 });
    const size = result.blob.size;
    const headers = new Headers({ "Content-Type": contentType, "Accept-Ranges": "bytes", "Content-Length": String(size), "Cache-Control": "private, no-store", "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${filename}"` });
    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
      const end = match?.[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (!match[1] && Number(match[2]) === 0)) {
        await result.stream.cancel();
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
      headers.set("Content-Length", String(end - start + 1));
      const reader = result.stream.getReader();
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
    return new Response(result.stream, { headers });
}
