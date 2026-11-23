import { json } from "./neon-db.js";
import { requireSession } from "./require-session.js";

const PROJECT = process.env.SANITY_PROJECT_ID || "b2yibrs1";
const DATASET = process.env.SANITY_DATASET || "production";
const API_VERSION = process.env.SANITY_API_VERSION || "2021-10-21";

function sanityToken() {
  return (
    process.env.SANITY_API_READ_TOKEN ||
    process.env.SANITY_READ_TOKEN ||
    process.env.SANITY_API_TOKEN ||
    process.env.SANITY_TOKEN ||
    ""
  );
}

function slugify(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function blocksToText(blocks: any): string {
  if (!blocks) return "";
  const list = Array.isArray(blocks) ? blocks : [];
  return list
    .map((block) => {
      if (block?._type === "block" && Array.isArray(block.children)) {
        return block.children.map((c: any) => c?.text || "").join("");
      }
      if (typeof block === "string") return block;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

async function sanityQuery(query: string) {
  const token = sanityToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(
    `https://${PROJECT}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
    { headers }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error?.description || `Sanity query failed (${res.status})`);
  }
  return data?.result;
}

function projectDoc(doc: any) {
  if (!doc) return null;
  return {
    id: doc._id,
    title: doc.title || "",
    slug: doc.slug || "",
    seoTitle: doc.SEOtitle || doc.seoTitle || "",
    seoDescription: doc.SEOdescription || doc.seoDescription || "",
    shortDescription: doc.destinationshortdescription || "",
    areaDescriptor: doc.areadescriptor || "",
    area: doc.area || "",
    region: doc.region || "",
    location: doc.location || "",
    states: doc.states || null,
    notOnDestination: doc.destinationnoton || "",
    temporaryVrmUrl: doc.temporaryvrmurl || "",
    seasonInfo: doc.seasoninfo || "",
    months: Array.isArray(doc.months) ? doc.months : [],
    bodyText: blocksToText(doc.body),
    mainImageUrl: doc.mainImageUrl || "",
    mapImageUrl: doc.mapImageUrl || "",
    footerImageUrl: doc.footerImageUrl || "",
    sliderImages: Array.isArray(doc.sliderImages)
      ? doc.sliderImages.map((s: any) => s?.url).filter(Boolean)
      : [],
    categoryTitles: Array.isArray(doc.categoryTitles) ? doc.categoryTitles.filter(Boolean) : [],
    typeTitles: Array.isArray(doc.typeTitles) ? doc.typeTitles.filter(Boolean) : [],
    experienceTitles: Array.isArray(doc.experienceTitles) ? doc.experienceTitles.filter(Boolean) : [],
    updatedAt: doc._updatedAt || null,
    studioUrl: `https://www.sanity.io/manage/project/${PROJECT}/dataset/${DATASET}/document/${encodeURIComponent(doc._id)}`,
  };
}

const PROJECTION = `{
  _id,
  _updatedAt,
  title,
  "slug": slug.current,
  SEOtitle,
  SEOdescription,
  destinationshortdescription,
  areadescriptor,
  area,
  region,
  location,
  states,
  destinationnoton,
  temporaryvrmurl,
  seasoninfo,
  months,
  body,
  "mainImageUrl": mainImage.asset->url,
  "mapImageUrl": mapImage.asset->url,
  "footerImageUrl": footerImage.asset->url,
  "sliderImages": sliderImages[]{ "url": slideImage.asset->url },
  "categoryTitles": categories[]->title,
  "typeTitles": destinationtypes[]->title,
  "experienceTitles": experiences[]->title
}`;

/**
 * Load Sanity destination content + SEO meta for the admin Destinations detail view.
 */
export async function handleGetSanityDestination(req: any, res: any, body: any = {}) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  if (!sanityToken()) {
    return json(res, 500, { error: "SANITY_API_READ_TOKEN is not configured" });
  }

  const slug = slugify(body.slug || "");
  const name = String(body.name || body.title || "").trim();
  if (!slug && !name) return json(res, 400, { error: "slug or name is required" });

  try {
    let doc = null;
    if (slug) {
      doc = await sanityQuery(`*[_type == "destination" && slug.current == "${slug}"][0] ${PROJECTION}`);
    }
    if (!doc && name) {
      const escaped = name.replace(/"/g, '\\"');
      doc = await sanityQuery(
        `*[_type == "destination" && (title == "${escaped}" || lower(title) == lower("${escaped}"))][0] ${PROJECTION}`
      );
    }
    if (!doc && slug) {
      // Loose fallback: slug contained in title slugify equivalents
      const all = await sanityQuery(`*[_type == "destination"]{ _id, title, "slug": slug.current }`);
      const match = (Array.isArray(all) ? all : []).find(
        (d: any) => slugify(d.slug) === slug || slugify(d.title) === slug
      );
      if (match?._id) {
        doc = await sanityQuery(`*[_id == "${match._id}"][0] ${PROJECTION}`);
      }
    }

    return json(res, 200, {
      ok: true,
      found: Boolean(doc),
      destination: projectDoc(doc),
      projectId: PROJECT,
      dataset: DATASET,
    });
  } catch (error: any) {
    console.error("[getSanityDestination]", error);
    return json(res, 500, { error: error?.message || "Failed to load destination content" });
  }
}
