import twitterText from "twitter-text";

export type XCaptionReview = { text: string; sourceText: string; approved: true };
export function xCaptionMetrics(text: string, hasMedia = false) {
  const result = twitterText.parseTweet(text);
  return { weightedLength: result.weightedLength, valid: result.valid || (!text && hasMedia) };
}

/** Local draft only: preserve the source and its URLs; never purchase a rewrite. */
export function suggestXCaption(source: string): string {
  if (!source) return source;
  if (xCaptionMetrics(source).valid) return source;
  const urls = twitterText.extractUrlsWithIndices(source);
  const links = [...new Set(urls.map(url => url.url))].join(" ");
  const suffix = links ? `\n${links}` : "";
  // If links alone exhaust the allowance, leave the draft for manual review.
  if (twitterText.parseTweet(suffix).weightedLength > 250) return source;
  let body = source;
  for (const url of [...urls].reverse()) body = body.slice(0, url.indices[0]) + body.slice(url.indices[1]);
  body = body.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (xCaptionMetrics(body + suffix).valid) return body + suffix;
  const sentences = body.split(/(?<=[.!?])\s+/u);
  let complete = "";
  for (const sentence of sentences) {
    const next = complete ? `${complete} ${sentence}` : sentence;
    if (!xCaptionMetrics(next + suffix).valid) break;
    complete = next;
  }
  if (complete) return complete + suffix;
  let prefix = "";
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(body)) {
    if (twitterText.parseTweet(prefix + segment + "…" + suffix).weightedLength > 280) break;
    prefix += segment;
  }
  // Prefer a whole-word boundary, retaining grapheme boundaries for CJK/emoji.
  if (/\s/u.test(prefix) && prefix.length < body.length && !/\s/u.test(body[prefix.length] || "")) prefix = prefix.replace(/\s+\S*$/u, "");
  return prefix.trimEnd() + "…" + suffix;
}
