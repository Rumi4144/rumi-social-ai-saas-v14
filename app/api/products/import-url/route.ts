import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { z } from "zod";

const Schema = z.object({
  url: z.string().trim().min(1),
});

function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();

  const candidate =
    /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

  const url = new URL(candidate);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("INVALID_WEBSITE_URL");
  }

  return url.toString();
}

function absoluteUrl(value: string, base: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    await tenantContext();

    const parsed = Schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const pageUrl = normalizeWebsiteUrl(parsed.data.url);

    const page = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 RumiSocialAI/1.0 ProductImporter",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      redirect: "follow",
    });

    if (!page.ok) {
      return NextResponse.json(
        { error: `WEBSITE_FETCH_FAILED_${page.status}` },
        { status: 400 }
      );
    }

    const html = await page.text();

    const title =
      html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
      )?.[1] ||
      html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.trim() ||
      "Imported Product";

    const candidates: string[] = [];
    const galleryCandidates: string[] = [];

    // Rumi Guitars uses Woostify/WooCommerce.
    // Woostify exposes the current product gallery with full_src,
    // thumb_src and image_id values. Prefer full_src so related
    // products and resized thumbnails are excluded.
    const woostifyFullImages: string[] = [];

    for (const match of html.matchAll(
      /["\\']full_src["\\']\s*:\s*["\\']([^"\\']+)["\\']/gi
    )) {
      if (match[1]) {
        woostifyFullImages.push(match[1]);
      }
    }

    // Also support HTML-escaped/JSON-escaped versions.
    for (const match of html.matchAll(
      /full_src\\?["']?\s*:\s*\\?["']([^"'\\]+(?:\\.[^"'\\]*)*)/gi
    )) {
      if (match[1]) {
        woostifyFullImages.push(
          match[1]
            .replace(/\\\//g, "/")
            .replace(/\\u0026/g, "&")
        );
      }
    }

    // Isolate THIS product's WooCommerce gallery.
    // Do not scan related products/recommendations when a gallery exists.
    const galleryStart = html.search(
      /<div[^>]+class=["'][^"']*woocommerce-product-gallery[^"']*["'][^>]*>/i
    );

    let productGalleryHtml = "";

    if (galleryStart >= 0) {
      const tail = html.slice(galleryStart);

      // The main product gallery normally ends before the summary/product
      // information area. This prevents related-product images from leaking in.
      const summaryIndex = tail.search(
        /<div[^>]+class=["'][^"']*(?:summary|product_meta)[^"']*["']/i
      );

      productGalleryHtml =
        summaryIndex > 0
          ? tail.slice(0, summaryIndex)
          : tail.slice(0, 50000);
    }

    const gallerySource =
      productGalleryHtml || html;

    // PRIORITY 1:
    // WooCommerce product gallery links normally contain the
    // full-size product photograph in href/data-large_image.
    for (const match of gallerySource.matchAll(
      /<(?:a|div)[^>]+(?:data-large_image|href)=["']([^"']+)["'][^>]*(?:woocommerce-product-gallery|woocommerce-product-gallery__image|zoomImg|data-large_image)[^>]*>/gi
    )) {
      galleryCandidates.push(match[1]);
    }

    // Common WooCommerce gallery figure markup.
    for (const block of gallerySource.matchAll(
      /<div[^>]+woocommerce-product-gallery__image[^>]*>([\s\S]*?)<\/div>/gi
    )) {
      const fragment = block[1];

      const large =
        fragment.match(/data-large_image=["']([^"']+)["']/i)?.[1] ||
        fragment.match(/href=["']([^"']+)["']/i)?.[1] ||
        fragment.match(/src=["']([^"']+)["']/i)?.[1];

      if (large) galleryCandidates.push(large);
    }

    // WordPress srcset often exposes the largest gallery version.
    for (const block of gallerySource.matchAll(
      /<[^>]+woocommerce-product-gallery__image[^>]*>[\s\S]*?<img[^>]+srcset=["']([^"']+)["']/gi
    )) {
      const entries = block[1]
        .split(",")
        .map((entry) => entry.trim())
        .map((entry) => {
          const parts = entry.split(/\s+/);
          const width = Number(
            parts[1]?.replace(/w$/i, "") || 0
          );

          return {
            url: parts[0],
            width,
          };
        })
        .filter((entry) => entry.url);

      entries.sort((a, b) => b.width - a.width);

      if (entries[0]?.url) {
        galleryCandidates.push(entries[0].url);
      }
    }

    // Open Graph images
    for (const match of html.matchAll(
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi
    )) {
      candidates.push(match[1]);
    }

    // Reverse attribute order: content before property
    for (const match of html.matchAll(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi
    )) {
      candidates.push(match[1]);
    }

    // Standard image tags
    for (const match of html.matchAll(
      /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi
    )) {
      candidates.push(match[1]);
    }

    // If WooCommerce gallery photographs were found, use them
    // instead of unrelated images elsewhere on the page.
    if (galleryCandidates.length > 0) {
      candidates.length = 0;
      candidates.push(...galleryCandidates);
    }

    if (woostifyFullImages.length > 0) {
      candidates.length = 0;
      candidates.push(...woostifyFullImages);
    }

    const cleaned = Array.from(
      new Set(
        candidates
          .map((src) => absoluteUrl(src, pageUrl))
          .filter((src): src is string => !!src)
          .filter((src) => /^https?:\/\//i.test(src))
          .filter(
            (src) =>
              !/logo|icon|avatar|emoji|spinner|placeholder/i.test(src)
          )
      )
    );

    // WooCommerce/WordPress often exposes many resized copies
    // of the same photograph: image-300x300.jpg, image-600x600.jpg, etc.
    // Group those variants together and prefer the original/largest URL.
    function imageKey(src: string) {
      try {
        const u = new URL(src);

        return (
          u.origin +
          u.pathname
            .replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, "")
            .replace(/-scaled(?=\.[a-z0-9]+$)/i, "")
        );
      } catch {
        return src;
      }
    }

    function imageScore(src: string) {
      const match = src.match(/-(\d+)x(\d+)(?=\.[a-z0-9]+(?:\?|$))/i);

      if (!match) {
        // Prefer the original image when available.
        return Number.MAX_SAFE_INTEGER;
      }

      return Number(match[1]) * Number(match[2]);
    }

    const bestByImage = new Map<string, string>();

    for (const src of cleaned) {
      const key = imageKey(src);
      const current = bestByImage.get(key);

      if (!current || imageScore(src) > imageScore(current)) {
        bestByImage.set(key, src);
      }
    }

    const images = Array.from(bestByImage.values()).slice(0, 20);

    if (images.length === 0) {
      return NextResponse.json(
        { error: "NO_PRODUCT_IMAGES_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      sourceUrl: pageUrl,
      title,
      images,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "PRODUCT_IMPORT_FAILED",
      },
      { status: 500 }
    );
  }
}
