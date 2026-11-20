import { json } from "./neon-db.js";
import { requireAdmin } from "./require-session.js";

const PROJECT = process.env.SANITY_PROJECT_ID || "b2yibrs1";
const DATASET = process.env.SANITY_DATASET || "production";
const API_VERSION = process.env.SANITY_API_VERSION || "2021-10-21";

const SEO_TYPES = [
  "post",
  "page",
  "destination",
  "homepage",
  "aboutpage",
  "category",
  "experience",
] as const;

type ActivityBody = {
  search?: string;
  type?: string;
  seo_changes_only?: boolean;
  change_filter?: "all" | "seo" | "images";
  limit?: number;
  offset?: number;
};

type SanityUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
};

type Tx = {
  id: string;
  timestamp: string;
  author?: string;
  documentIDs?: string[];
  mutations?: any[];
};

function sanityToken() {
  return (
    process.env.SANITY_API_READ_TOKEN ||
    process.env.SANITY_READ_TOKEN ||
    process.env.SANITY_API_TOKEN ||
    process.env.SANITY_TOKEN ||
    ""
  );
}

function sanitizeLike(raw: string): string {
  return raw.replace(/[%_\\"']/g, "");
}

async function sanityFetch(path: string) {
  const token = sanityToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://${PROJECT}.api.sanity.io${path}`, { headers });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.message || data?.error?.description || `Sanity request failed (${res.status})`);
  }
  return { data, text, status: res.status };
}

async function sanityQuery(query: string) {
  const { data } = await sanityFetch(
    `/v${API_VERSION}/data/query/${DATASET}?query=${encodeURIComponent(query)}`,
  );
  return data?.result;
}

async function listTransactions(documentId: string, limit = 6): Promise<Tx[]> {
  const { text, data } = await sanityFetch(
    `/v${API_VERSION}/data/history/${DATASET}/transactions/${encodeURIComponent(documentId)}?excludeContent=true&reverse=true&limit=${limit}`,
  );
  // Single-transaction responses parse as one JSON object; multi-tx as NDJSON.
  if (Array.isArray(data)) return data.filter(Boolean).slice(0, limit) as Tx[];
  if (data && typeof data === "object" && data.id && data.timestamp) return [data as Tx];
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Tx;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, limit) as Tx[];
}

async function getDocumentAtRevision(documentId: string, revision: string) {
  const { data } = await sanityFetch(
    `/v${API_VERSION}/data/history/${DATASET}/documents/${encodeURIComponent(documentId)}?revision=${encodeURIComponent(revision)}`,
  );
  const docs = Array.isArray(data?.documents) ? data.documents : [];
  return docs[0] || null;
}

async function resolveAuthor(authorId: string, cache: Map<string, SanityUser>): Promise<SanityUser> {
  if (cache.has(authorId)) return cache.get(authorId)!;
  if (!authorId) {
    const unknown = { id: "", name: "Unknown", email: "", imageUrl: null };
    return unknown;
  }
  try {
    const { data } = await sanityFetch(`/v${API_VERSION}/users/${encodeURIComponent(authorId)}`);
    const user: SanityUser = {
      id: authorId,
      name: data?.displayName || data?.name || [data?.givenName, data?.familyName].filter(Boolean).join(" ") || authorId,
      email: data?.email || "",
      imageUrl: data?.imageUrl || data?.profileImage || null,
    };
    cache.set(authorId, user);
    return user;
  } catch {
    const fallback = { id: authorId, name: authorId, email: "", imageUrl: null };
    cache.set(authorId, fallback);
    return fallback;
  }
}

function seoSnapshot(doc: any) {
  return {
    seoTitle: String(doc?.SEOtitle || doc?.seoTitle || doc?.metaTitle || ""),
    seoDescription: String(doc?.SEOdescription || doc?.seoDescription || doc?.metaDescription || ""),
  };
}

// ---------------------------------------------------------------------------
// Whole-document diffing (SEO fields, images, body, everything else)
// ---------------------------------------------------------------------------

type ImageInfo = { ref: string; alt: string; caption: string };
type Flat = { fields: Map<string, string>; images: Map<string, ImageInfo> };

const SKIP_KEYS = new Set(["_id", "_rev", "_type", "_key", "_system", "_createdAt", "_updatedAt", "_originalId"]);

// Fields shown under "SEO" (path -> label).
const SEO_FIELD_LABELS: Record<string, string> = {
  SEOtitle: "SEO title",
  seoTitle: "SEO title",
  metaTitle: "SEO title",
  SEOdescription: "SEO description",
  seoDescription: "SEO description",
  metaDescription: "SEO description",
  noindex: "Hidden from search (noindex)",
  slug: "URL slug",
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  name: "Name",
  excerptText: "Excerpt",
  socialText: "Social text",
};

function flatten(value: any, path: string, out: Flat) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      const key = item && typeof item === "object" && item._key ? String(item._key) : String(i);
      flatten(item, `${path}[${key}]`, out);
    });
    return;
  }
  if (typeof value === "object") {
    const ref = value?.asset?._ref;
    if (typeof ref === "string" && ref.startsWith("image-")) {
      out.images.set(path, {
        ref,
        alt: String(value.alttext ?? value.alt ?? ""),
        caption: String(value.caption ?? ""),
      });
      return;
    }
    if (value._type === "slug") {
      out.fields.set(path, String(value.current || ""));
      return;
    }
    if (value._type === "block" && Array.isArray(value.children)) {
      out.fields.set(path, value.children.map((c: any) => c?.text || "").join(""));
      return;
    }
    if (typeof value._ref === "string") {
      out.fields.set(path, `ref:${value._ref}`);
      return;
    }
    for (const [k, v] of Object.entries(value)) {
      if (SKIP_KEYS.has(k)) continue;
      flatten(v, path ? `${path}.${k}` : k, out);
    }
    return;
  }
  out.fields.set(path, String(value));
}

function flattenDoc(doc: any): Flat {
  const out: Flat = { fields: new Map(), images: new Map() };
  if (doc && typeof doc === "object") {
    for (const [k, v] of Object.entries(doc)) {
      if (SKIP_KEYS.has(k)) continue;
      flatten(v, k, out);
    }
  }
  return out;
}

function humanize(segment: string) {
  return segment
    .replace(/\[[^\]]*\]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function pathLabel(path: string) {
  if (SEO_FIELD_LABELS[path]) return SEO_FIELD_LABELS[path];
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];
  return (
    path
      .split(".")
      .map(humanize)
      .filter(Boolean)
      .join(" › ") || path
  );
}

function sanityImage(ref: string) {
  const m = /^image-(.+)-(\d+x\d+)-([a-z0-9]+)$/i.exec(ref);
  if (!m) return { url: "", thumb: "" };
  const url = `https://cdn.sanity.io/images/${PROJECT}/${DATASET}/${m[1]}-${m[2]}.${m[3]}`;
  return { url, thumb: `${url}?w=320&h=220&fit=crop&auto=format` };
}

function imageSide(info: ImageInfo | undefined) {
  if (!info) return null;
  const { url, thumb } = sanityImage(info.ref);
  return { url, thumb, alt: info.alt, caption: info.caption };
}

function clip(text: string, max = 300) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type ImageChange = {
  path: string;
  label: string;
  kind: "added" | "removed" | "replaced" | "alt_changed";
  before: ReturnType<typeof imageSide>;
  after: ReturnType<typeof imageSide>;
};

export function diffDocuments(beforeDoc: any, afterDoc: any) {
  const a = flattenDoc(beforeDoc);
  const b = flattenDoc(afterDoc);

  // Images
  const images: ImageChange[] = [];
  const imagePaths = new Set([...a.images.keys(), ...b.images.keys()]);
  for (const path of imagePaths) {
    const prev = a.images.get(path);
    const next = b.images.get(path);
    let kind: ImageChange["kind"] | null = null;
    if (!prev && next) kind = "added";
    else if (prev && !next) kind = "removed";
    else if (prev && next) {
      if (prev.ref !== next.ref) kind = "replaced";
      else if (prev.alt !== next.alt || prev.caption !== next.caption) kind = "alt_changed";
    }
    if (!kind) continue;
    images.push({
      path,
      label: pathLabel(path),
      kind,
      before: imageSide(prev),
      after: imageSide(next),
    });
  }
  // Drop pure moves (same image removed from one slot and added to another).
  const removedRefs = new Map<string, number>();
  images.forEach((img, i) => {
    if (img.kind === "removed") removedRefs.set(a.images.get(img.path)!.ref, i);
  });
  const drop = new Set<number>();
  images.forEach((img, i) => {
    if (img.kind !== "added") return;
    const ref = b.images.get(img.path)!.ref;
    const j = removedRefs.get(ref);
    if (j !== undefined && !drop.has(j)) {
      drop.add(i);
      drop.add(j);
    }
  });
  const imageChanges = images.filter((_, i) => !drop.has(i));

  // Text / scalar fields
  const seo: { field: string; label: string; before: string; after: string }[] = [];
  const other: { field: string; label: string; before: string; after: string }[] = [];
  const body = { added: 0, removed: 0, changed: 0 };
  const fieldPaths = new Set([...a.fields.keys(), ...b.fields.keys()]);
  for (const path of fieldPaths) {
    const prev = a.fields.get(path);
    const next = b.fields.get(path);
    if (prev === next) continue;
    const top = path.split(/[.[]/)[0];
    if (SEO_FIELD_LABELS[path]) {
      seo.push({ field: path, label: SEO_FIELD_LABELS[path], before: clip(prev ?? ""), after: clip(next ?? "") });
    } else if (top === "body") {
      if (prev === undefined) body.added++;
      else if (next === undefined) body.removed++;
      else body.changed++;
    } else {
      other.push({ field: path, label: pathLabel(path), before: clip(prev ?? ""), after: clip(next ?? "") });
    }
  }
  // De-dupe SEO labels that map to several keys (e.g. SEOtitle + seoTitle).
  const seoSeen = new Set<string>();
  const seoChanges = seo.filter((c) => (seoSeen.has(c.label) ? false : (seoSeen.add(c.label), true)));

  const bodyTotal = body.added + body.removed + body.changed;
  return {
    seo: seoChanges,
    images: imageChanges,
    body: bodyTotal ? body : null,
    other: other.slice(0, 12),
    otherMore: Math.max(other.length - 12, 0),
  };
}

/**
 * Admin feed of Sanity SEO document activity: who changed what, when.
 * Uses Sanity History + Users APIs with SANITY_API_READ_TOKEN from env.
 */
export async function handleListSanitySeoActivity(req: any, res: any, body: ActivityBody = {}) {
  const gate = await requireAdmin(req);
  if ("error" in gate && gate.error) return json(res, gate.error, { error: gate.message });

  if (!sanityToken()) {
    return json(res, 500, { error: "SANITY_API_READ_TOKEN is not configured" });
  }

  const search = String(body.search || "").trim();
  const typeFilter = String(body.type || "").trim();
  const changeFilter =
    body.change_filter === "seo" || body.change_filter === "images"
      ? body.change_filter
      : body.seo_changes_only
        ? "seo"
        : "all";
  const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 100);
  const offset = Math.max(Number(body.offset) || 0, 0);
  const like = search ? sanitizeLike(search).toLowerCase() : "";

  const typeClause =
    typeFilter && SEO_TYPES.includes(typeFilter as any)
      ? `&& _type == "${typeFilter}"`
      : `&& _type in ${JSON.stringify([...SEO_TYPES])}`;

  const searchClause = like
    ? `&& (
        lower(coalesce(title, "")) match "*${like}*"
        || lower(coalesce(name, "")) match "*${like}*"
        || lower(coalesce(SEOtitle, "")) match "*${like}*"
        || lower(coalesce(SEOdescription, "")) match "*${like}*"
        || lower(coalesce(slug.current, "")) match "*${like}*"
      )`
    : "";

  try {
    const [docs, total] = await Promise.all([
      sanityQuery(`
        *[
          (defined(SEOtitle) || defined(SEOdescription) || defined(seoTitle) || defined(metaTitle))
          ${typeClause}
          ${searchClause}
        ]
        | order(_updatedAt desc) [${offset}...${offset + limit}] {
          ...,
          "slug": slug.current
        }
      `),
      sanityQuery(`
        count(*[
          (defined(SEOtitle) || defined(SEOdescription) || defined(seoTitle) || defined(metaTitle))
          ${typeClause}
          ${searchClause}
        ])
      `),
    ]);

    const list = Array.isArray(docs) ? docs : [];
    const authorCache = new Map<string, SanityUser>();

    const items = await Promise.all(
      list.map(async (doc: any) => {
        const current = seoSnapshot(doc);
        let transactions: Tx[] = [];
        try {
          transactions = await listTransactions(doc._id, 5);
        } catch {
          transactions = [];
        }

        const latest = transactions[0] || null;
        const previous = transactions[1] || null;
        const author = await resolveAuthor(String(latest?.author || ""), authorCache);

        let previousSeo = { seoTitle: "", seoDescription: "" };
        let seoFieldsChanged: boolean | null = null;
        let imagesChanged: boolean | null = null;
        let changes: ReturnType<typeof diffDocuments> | null = null;
        const firstRevision = Boolean(latest && !previous?.id);
        if (previous?.id) {
          try {
            const prevDoc = await getDocumentAtRevision(doc._id, previous.id);
            if (prevDoc) {
              previousSeo = seoSnapshot(prevDoc);
              changes = diffDocuments(prevDoc, doc);
              seoFieldsChanged = changes.seo.length > 0;
              imagesChanged = changes.images.length > 0;
            }
          } catch {
            seoFieldsChanged = null;
          }
        } else if (latest) {
          // First known revision — treat as SEO present if fields exist
          seoFieldsChanged = Boolean(current.seoTitle || current.seoDescription);
          imagesChanged = false;
        }

        const changedAt = latest?.timestamp || doc._updatedAt || null;
        const title = doc.title || doc.name || current.seoTitle || doc._id;

        return {
          id: `${doc._id}:${latest?.id || doc._rev || doc._updatedAt}`,
          documentId: doc._id,
          documentType: doc._type,
          title,
          slug: doc.slug || "",
          seoTitle: current.seoTitle,
          seoDescription: current.seoDescription,
          previousSeoTitle: previousSeo.seoTitle,
          previousSeoDescription: previousSeo.seoDescription,
          seoFieldsChanged,
          imagesChanged,
          firstRevision,
          changes,
          changedAt,
          updatedAt: doc._updatedAt || null,
          transactionId: latest?.id || null,
          author,
        };
      }),
    );

    const filtered =
      changeFilter === "seo"
        ? items.filter((item) => item.seoFieldsChanged === true)
        : changeFilter === "images"
          ? items.filter((item) => item.imagesChanged === true)
          : items;

    return json(res, 200, {
      items: filtered,
      total: Number(total) || filtered.length,
      limit,
      offset,
      types: [...SEO_TYPES],
      dataset: DATASET,
      projectId: PROJECT,
    });
  } catch (error: any) {
    console.error("[listSanitySeoActivity] failed", error);
    return json(res, 500, { error: error?.message || "Failed to load Sanity SEO activity" });
  }
}
