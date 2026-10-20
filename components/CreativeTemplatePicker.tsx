"use client";

import { useId, useMemo, useState } from "react";
import { renderSocialSvg, type SocialSvgInput } from "@/lib/render/svg";

export type CreativeTemplateChoice = {
  value: string;
  label: string;
  description: string;
  previewStyle?: string;
  previewOverrides?: Partial<SocialSvgInput>;
};

/** Inline SVG keeps supplied website photos visible; SVG image data URLs cannot load external photos. */
export function CreativeSvgPreview({ svg }: { svg: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const isolatedSvg = useMemo(() => svg
    .replace(/\bid="([^"]+)"/g, (_, name: string) => `id="${id}-${name}"`)
    .replace(/url\(#([^)]*)\)/g, (_, name: string) => `url(#${id}-${name})`), [svg, id]);
  return <div className="creative-svg-preview" aria-hidden="true" dangerouslySetInnerHTML={{ __html: isolatedSvg }} />;
}

export default function CreativeTemplatePicker({ label, value, onChange, options, preview, disabled = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly CreativeTemplateChoice[];
  preview: SocialSvgInput;
  disabled?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const gridId = useId();
  const cards = useMemo(() => options.map(option => ({ ...option, svg: renderSocialSvg({
    ...preview, ...option.previewOverrides, designStyle: option.previewStyle ?? option.value,
  }) })), [options, preview]);
  const selected = options.find(option => option.value === value);
  const featured = new Set(["modern-gradient", "framed-editorial", "geometric-focus", value]);
  const shownCards = showAll ? cards : cards.filter(option => featured.has(option.value));
  const hiddenCount = cards.filter(option => !featured.has(option.value)).length;
  return <fieldset className="creative-template-picker" disabled={disabled}>
    <legend>{label}</legend>
    <p className="template-intro">Choose a layout. Your message and photos stay the same.</p>
    <div className="creative-template-grid" id={gridId}>
      {shownCards.map(option => <button type="button" key={option.value} aria-pressed={option.value === value}
        className="creative-template-choice" onClick={() => onChange(option.value)}>
        <span className="template-artwork" style={{ aspectRatio: preview.format === "story" ? "9 / 16" : preview.format === "square" ? "1 / 1" : "4 / 5" }}>
          <CreativeSvgPreview svg={option.svg} />
        </span>
        <span className="template-label">{option.label}</span>
        <span className="template-selected" aria-hidden="true">{option.value === value ? "✓ Selected" : "Choose"}</span>
      </button>)}
    </div>
    {hiddenCount > 0 && <button className="template-more" type="button" aria-expanded={showAll} aria-controls={gridId} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer layouts" : `More layouts (${hiddenCount})`}</button>}
    {selected && <p className="template-description" aria-live="polite"><strong>{selected.label}:</strong> {selected.description}</p>}
    <style jsx global>{`
      .creative-template-picker { border:0; margin:16px 0; padding:0; min-width:0; max-width:760px; }
      .creative-template-picker legend { font-size:14px; font-weight:700; padding:0; }
      .creative-template-picker .template-intro { font-size:12px; line-height:1.5; color:#526d63; margin:7px 0 12px; }
      .creative-template-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(112px,1fr)); gap:10px; }
      main .creative-template-choice { display:flex; flex-direction:column; align-items:stretch; gap:6px; min-width:0; padding:6px!important; border:2px solid #d5e2dc!important; border-radius:12px!important; background:#fff!important; color:#173d36!important; text-align:left; }
      main .creative-template-choice[aria-pressed=true] { border-color:#146e60!important; background:#edf7f2!important; }
      .template-artwork { display:block; overflow:hidden; width:100%; border-radius:7px; background:#edf2ef; }
      .creative-svg-preview { display:block; width:100%; height:100%; }
      .creative-svg-preview svg { display:block; width:100%; height:100%; }
      .template-label { display:block; font-size:12px; font-weight:700; line-height:1.35; padding:0 3px; }
      .template-selected { display:block; margin-top:auto; font-size:11px; line-height:1.4; padding:0 3px 3px; color:#146e60; }
      .creative-template-picker .template-more { margin-top:10px; font-size:12px!important; }
      .creative-template-picker .template-description { font-size:12px; line-height:1.5; margin:12px 0 0; }
      @media(max-width:380px) { .creative-template-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    `}</style>
  </fieldset>;
}
