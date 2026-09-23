import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

const DEFAULT_TITLE = "The 100 Collection — Partner OS";
const DEFAULT_DESCRIPTION = "The 100 Collection — A curated collection of luxury vacation rentals.";

let metaCache = null;

async function fetchAllMeta() {
  if (metaCache) return metaCache;
  try {
    const records = await base44.entities.PageMeta.list("-updated_date", 100);
    const map = {};
    for (const r of records) {
      map[r.page_key] = r;
    }
    metaCache = map;
    return map;
  } catch {
    return {};
  }
}

export function invalidatePageMetaCache() {
  metaCache = null;
}

function upsertMetaTag(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  if (href) {
    el.setAttribute("href", href);
  } else {
    el.remove();
  }
}

/**
 * Applies stored PageMeta (title, description, og:image, canonical) to the document head.
 * Call from any marketing page with the matching page_key.
 * Pass overrides to force values regardless of stored data.
 */
export function usePageMeta(pageKey, overrides = {}) {
  useEffect(() => {
    let cancelled = false;

    async function apply() {
      const map = await fetchAllMeta();
      if (cancelled) return;
      const meta = map[pageKey] || {};
      const title = overrides.title || meta.title;
      const description = overrides.description || meta.description;
      const ogImage = overrides.og_image_url || meta.og_image_url;
      const ogImageAlt = overrides.og_image_alt || meta.og_image_alt;
      const canonical = overrides.canonical_url || meta.canonical_url;

      if (title) document.title = title;
      else document.title = DEFAULT_TITLE;

      const desc = description || DEFAULT_DESCRIPTION;
      upsertMetaTag("name", "description", desc);
      upsertMetaTag("property", "og:title", title || "The 100 Collection");
      upsertMetaTag("property", "og:description", desc);
      upsertMetaTag("property", "og:type", "website");
      upsertMetaTag("property", "og:image", ogImage);
      upsertMetaTag("name", "twitter:card", ogImage ? "summary_large_image" : "summary");
      upsertMetaTag("name", "twitter:title", title || "The 100 Collection");
      upsertMetaTag("name", "twitter:description", desc);
      upsertMetaTag("name", "twitter:image", ogImage);
      if (ogImageAlt) upsertMetaTag("property", "og:image:alt", ogImageAlt);

      upsertCanonical(canonical || null);
    }

    apply();
    return () => { cancelled = true; };
  }, [pageKey]);
}