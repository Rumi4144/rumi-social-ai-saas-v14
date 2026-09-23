function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!
  );
}

function wrapText(text: string, maxChars: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;

    if (next.length <= maxChars) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);

  return lines;
}

export type SocialSvgInput = {
  headline: string;
  subheadline?: string;
  cta?: string;
  brand: string;
  format?: "square" | "portrait" | "story";
  imageUrl?: string;
  textPosition?: "left" | "right" | "top";
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
  designStyle?: string;
};

export function renderSocialSvg(input: SocialSvgInput) {
  const size =
    input.format === "story"
      ? [1080, 1920]
      : input.format === "portrait"
        ? [1080, 1350]
        : [1080, 1080];

  const [w, h] = size;

  const primary = input.primaryColor || "#171C24";
  const secondary = input.secondaryColor || "#F4F1EA";
  const accent = input.accentColor || "#D9BD7A";
  const headingFont = input.headingFont || "Georgia";
  const bodyFont = input.bodyFont || "Arial";

  const headlineLength = input.headline.trim().length;

  const headlineFontSize =
    input.textPosition === "top"
      ? headlineLength <= 30
        ? 36
        : headlineLength <= 55
          ? 32
          : 28
      : headlineLength <= 24
        ? 62
        : headlineLength <= 42
          ? 54
          : headlineLength <= 65
            ? 46
            : 40;

  const headlineLineHeight = Math.round(headlineFontSize * 1.14);

  const headlineMaxChars =
    input.textPosition === "top"
      ? 30
      : headlineFontSize >= 60
        ? 13
        : headlineFontSize >= 50
          ? 16
          : headlineFontSize >= 45
            ? 19
            : 22;

  const headlineLines = wrapText(
    input.headline,
    headlineMaxChars
  );

  const subheadlineLength =
    input.subheadline?.trim().length || 0;

  const subheadlineFontSize =
    subheadlineLength <= 90 ? 25 :
    subheadlineLength <= 180 ? 22 :
    subheadlineLength <= 280 ? 19 : 17;

  const subheadlineLineHeight =
    Math.round(subheadlineFontSize * 1.42);

  const subheadlineMaxChars =
    subheadlineFontSize >= 24 ? 34 :
    subheadlineFontSize >= 21 ? 39 :
    subheadlineFontSize >= 19 ? 44 : 50;

  const subheadlineLines = input.subheadline
    ? wrapText(input.subheadline, subheadlineMaxChars)
    : [];

  const textPosition = input.textPosition || "left";
  const textX =
    textPosition === "right"
      ? Math.round(w * 0.58)
      : textPosition === "top"
        ? w / 2
        : 90;

  const textAnchor =
    textPosition === "top"
      ? "middle"
      : "start";

  const headlineSvg = headlineLines
    .map(
      (line, i) =>
        `<tspan x="${textPosition === "top" ? 90 : textX}" dy="${i === 0 ? 0 : headlineLineHeight}">${esc(line)}</tspan>`
    )
    .join("");

  const subheadlineSvg = subheadlineLines
    .map(
      (line, i) =>
        `<tspan x="${textX}" dy="${i === 0 ? 0 : subheadlineLineHeight}">${esc(line)}</tspan>`
    )
    .join("");

  const image = input.imageUrl
    ? `<image
         href="${esc(input.imageUrl)}"
         width="${w}"
         height="${h}"
         preserveAspectRatio="xMidYMid slice"
       />`
    : "";

  const logo = input.logoUrl
    ? `<image
         href="${esc(input.logoUrl)}"
         x="90"
         y="75"
         width="180"
         height="70"
         preserveAspectRatio="xMinYMid meet"
       />`
    : "";

  const brandY =
    textPosition === "top"
      ? h - 145
      : input.logoUrl
        ? 185
        : 105;

  const headlineY =
    textPosition === "top"
      ? h - 88
      : brandY + 105;

  const subheadlineY =
    headlineY +
    Math.max(1, headlineLines.length) * headlineLineHeight +
    32;

  const ctaY =
    textPosition === "top"
      ? h - 118
      : subheadlineY +
        Math.max(1, subheadlineLines.length) * subheadlineLineHeight +
        48;

  return `<svg
    xmlns="http://www.w3.org/2000/svg"
    width="${w}"
    height="${h}"
    viewBox="0 0 ${w} ${h}"
  >
    <defs>
      <linearGradient id="textShade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${esc(primary)}" stop-opacity="0.62"/>
        <stop offset="42%" stop-color="${esc(primary)}" stop-opacity="0.20"/>
        <stop offset="88%" stop-color="${esc(primary)}" stop-opacity="0"/>
      </linearGradient>

    <linearGradient id="textShadeRight" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${esc(primary)}" stop-opacity="0"/>
      <stop offset="35%" stop-color="${esc(primary)}" stop-opacity="0"/>
      <stop offset="72%" stop-color="${esc(primary)}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${esc(primary)}" stop-opacity="0.58"/>
    </linearGradient>
    </defs>

    <rect width="100%" height="100%" fill="${esc(primary)}" />

    ${image}

  ${
    textPosition === "top"
      ? `<rect
          x="0"
          y="${h - 210}"
          width="${w}"
          height="210"
          fill="${esc(primary)}"
          opacity="0.72"
        />`
      : ""
  }

    <!-- subtle contrast only; photograph remains visible -->
    <rect
      x="0"
      y="0"
      width="100%"
      height="100%"
      fill="${
        textPosition === "right"
          ? "url(#textShadeRight)"
          : "url(#textShade)"
      }"
    />

    ${logo}

    <text
      x="${textX}"
      y="${brandY}"
      text-anchor="${textAnchor}"
      fill="${esc(accent)}"
      font-size="23"
      font-weight="700"
      font-family="${esc(bodyFont)}"
      letter-spacing="5"
    >${esc(input.brand.toUpperCase())}</text>

    <text
      x="${textX}"
      y="${headlineY}"
      text-anchor="${textAnchor}"
      fill="${esc(secondary)}"
      font-size="${headlineFontSize}"
      font-weight="700"
      font-family="${esc(headingFont)}"
    >${headlineSvg}</text>

    ${
      subheadlineLines.length && textPosition !== "top"
        ? `<text
            x="90"
            y="${subheadlineY}"
            fill="${esc(secondary)}"
            font-size="${subheadlineFontSize}"
            font-family="${esc(bodyFont)}"
            opacity="0.92"
          >${subheadlineSvg}</text>`
        : ""
    }

    <rect
      x="${textPosition === "top" || textPosition === "right" ? w - 360 : 90}"
      y="${ctaY}"
      width="270"
      height="62"
      rx="31"
      fill="${esc(accent)}"
    />

    <text
      x="${textPosition === "top" || textPosition === "right" ? w - 225 : 225}"
      y="${ctaY + 41}"
    text-anchor="middle"
      fill="${esc(primary)}"
      font-size="21"
      font-weight="700"
      font-family="${esc(bodyFont)}"
    >${esc((input.cta || "DISCOVER MORE").toUpperCase())}</text>
  </svg>`;
}
