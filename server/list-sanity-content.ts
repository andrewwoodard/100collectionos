import { getNeonPool, json } from "./neon-db.js";
import { requireSession } from "./require-session.js";

const PROJECT = process.env.SANITY_PROJECT_ID || "b2yibrs1";
const DATASET = process.env.SANITY_DATASET || "production";
const API_VERSION = process.env.SANITY_API_VERSION || "2021-10-21";

type BrowseBody = {
  kind?: "images" | "posts";
  search?: string;
  limit?: number;
  offset?: number;
};

function sanitizeLike(raw: string): string {
  return raw.replace(/[%_\\"']/g, "");
}

async function sanityQuery(query: string) {
  const token =
    process.env.SANITY_API_READ_TOKEN ||
    process.env.SANITY_READ_TOKEN ||
    process.env.SANITY_API_TOKEN ||
    process.env.SANITY_TOKEN ||
    "";
  const url = `https://${PROJECT}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error?.description || `Sanity query failed (${res.status})`);
  }
  return data?.result;
}

async function requireStaff(req: any) {
  const gate = await requireSession(req);
  if ("error" in gate && gate.error) return gate;
  const user = gate.session.user as { role?: string; email?: string };
  const role = String(user.role || "");
  if (role === "admin" || role === "media" || role === "super_admin" || process.env.VITE_AUTH_DEV_ADMIN === "true") {
    return gate;
  }
  const email = String(user.email || "").trim().toLowerCase();
  if (email) {
    const { rows } = await getNeonPool().query(
      `SELECT data->>'role' AS role FROM base44."user" WHERE lower(data->>'email') = $1 LIMIT 1`,
      [email],
    );
    const dbRole = String(rows[0]?.role || "");
    if (dbRole === "admin" || dbRole === "media") return gate;
  }
  return { error: 403 as const, message: "Staff access required" };
}

/**
 * Browse Sanity CDN assets and travel blog posts (read-only).
 * Used by Media Library for admin + media roles.
 */
export async function handleListSanityContent(req: any, res: any, body: BrowseBody = {}) {
  const gate = await requireStaff(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  const kind = body.kind === "posts" ? "posts" : "images";
  const search = String(body.search || "").trim();
  const limit = Math.min(Math.max(Number(body.limit) || 60, 1), 200);
  const offset = Math.max(Number(body.offset) || 0, 0);
  const like = search ? sanitizeLike(search).toLowerCase() : "";

  try {
    if (kind === "images") {
      const filter = like
        ? `&& (
            lower(coalesce(originalFilename, "")) match "*${like}*"
            || lower(coalesce(title, "")) match "*${like}*"
            || lower(coalesce(altText, "")) match "*${like}*"
            || lower(coalesce(description, "")) match "*${like}*"
          )`
        : "";
      const [items, total] = await Promise.all([
        sanityQuery(`
          *[_type == "sanity.imageAsset" ${filter}]
          | order(_updatedAt desc) [${offset}...${offset + limit}] {
            _id,
            originalFilename,
            url,
            size,
            mimeType,
            altText,
            title,
            description,
            _updatedAt,
            "width": metadata.dimensions.width,
            "height": metadata.dimensions.height,
            "lqip": metadata.lqip
          }
        `),
        sanityQuery(`count(*[_type == "sanity.imageAsset" ${filter}])`),
      ]);

      return json(res, 200, {
        kind: "images",
        items: (Array.isArray(items) ? items : []).map((r: any) => ({
          id: r._id,
          url: r.url,
          filename: r.originalFilename || "",
          alt: r.altText || "",
          title: r.title || r.originalFilename || "",
          description: r.description || "",
          size: r.size || 0,
          mimeType: r.mimeType || "",
          width: r.width || null,
          height: r.height || null,
          lqip: r.lqip || null,
          updatedAt: r._updatedAt || null,
        })),
        total: Number(total) || 0,
        limit,
        offset,
      });
    }

    const filter = like
      ? `&& (
          lower(coalesce(title, "")) match "*${like}*"
          || lower(coalesce(slug.current, "")) match "*${like}*"
          || lower(coalesce(SEOtitle, "")) match "*${like}*"
          || lower(coalesce(excerptText, "")) match "*${like}*"
        )`
      : "";
    const [items, total] = await Promise.all([
      sanityQuery(`
        *[_type == "post" ${filter}]
        | order(coalesce(publishedAt, _updatedAt) desc) [${offset}...${offset + limit}] {
          _id,
          title,
          "slug": slug.current,
          approved,
          pinned,
          publishedAt,
          SEOtitle,
          SEOdescription,
          excerptText,
          "author": author->name,
          "mainImageUrl": mainImage.asset->url,
          "mainImageAlt": mainImage.alttext,
          "categories": categories[]->title,
          _updatedAt
        }
      `),
      sanityQuery(`count(*[_type == "post" ${filter}])`),
    ]);

    return json(res, 200, {
      kind: "posts",
      items: (Array.isArray(items) ? items : []).map((r: any) => ({
        id: r._id,
        title: r.title || "Untitled",
        slug: r.slug || "",
        approved: Boolean(r.approved),
        pinned: Boolean(r.pinned),
        publishedAt: r.publishedAt || null,
        seoTitle: r.SEOtitle || "",
        seoDescription: r.SEOdescription || "",
        excerpt: r.excerptText || "",
        author: r.author || "",
        mainImageUrl: r.mainImageUrl || "",
        mainImageAlt: r.mainImageAlt || "",
        categories: Array.isArray(r.categories) ? r.categories.filter(Boolean) : [],
        updatedAt: r._updatedAt || null,
        publicUrl: r.slug ? `https://the100collection.com/travel/${r.slug}` : null,
      })),
      total: Number(total) || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    return json(res, 500, { error: error?.message || "Failed to load Sanity content" });
  }
}
