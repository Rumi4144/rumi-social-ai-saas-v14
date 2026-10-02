import { GET } from "@/app/api/publishing/inspect/route";

export const dynamic = "force-dynamic";

export default async function InspectPage() {
  const response = await GET(new Request(
    "https://rumisocialai.com/api/publishing/inspect?jobId=cmur3r57s0000jq04l4x50spq"
  ));
  const result = await response.json();
  return <main><h1>Existing Facebook post inspection</h1><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre></main>;
}
