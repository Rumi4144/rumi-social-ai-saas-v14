/** Prepare imported copy for the visible, editable script. Never run on paid submission. */
export function presenterSpeechText(source: string, limit = 600): string {
  const spokenDomain = (address: string) => {
    const hostname = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`).hostname.replace(/^www\./i, "");
    return hostname.split(".").map((part, index, parts) => {
      if (index === parts.length - 1 && /^(us|uk)$/i.test(part)) return part.toUpperCase().split("").join(" ");
      if (part.toLowerCase() === "rumiguitars") return "Rumi Guitars";
      return part.replace(/-/g, " ");
    }).join(" dot ");
  };
  const text = source
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$2")
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>]+|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|us|uk|ai|io)(?:[/?#][^\s<>]*)?/gi, match => {
      const suffix = match.match(/[.,!?;:)]+$/)?.[0] || "";
      const address = suffix ? match.slice(0, -suffix.length) : match;
      try { return spokenDomain(address) + suffix; } catch { return match; }
    })
    .replace(/\b41\s*[-–]?\s*inch\b/gi, "forty-one inch")
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1")
    .replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const bounded = text.slice(0, limit);
  return bounded.slice(0, bounded.lastIndexOf(" ") > 0 ? bounded.lastIndexOf(" ") : limit).trimEnd();
}

export const DEFAULT_PRESENTER_DIRECTION = "Friendly, natural delivery. Preserve the presenter’s appearance and background. Match lip movements to the voice recording.";
