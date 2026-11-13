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
  const seoChangesOnly = Boolean(body.seo_changes_only);
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
          _id,
          _type,
          _updatedAt,
          _rev,
          title,
          name,
          "slug": slug.current,
          SEOtitle,
          SEOdescription,
          seoTitle,
          seoDescription,
          metaTitle,
          metaDescription
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
        if (previous?.id) {
          try {
            const prevDoc = await getDocumentAtRevision(doc._id, previous.id);
            if (prevDoc) {
              previousSeo = seoSnapshot(prevDoc);
              seoFieldsChanged =
                previousSeo.seoTitle !== current.seoTitle ||
                previousSeo.seoDescription !== current.seoDescription;
            }
          } catch {
            seoFieldsChanged = null;
          }
        } else if (latest) {
          // First known revision — treat as SEO present if fields exist
          seoFieldsChanged = Boolean(current.seoTitle || current.seoDescription);
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
          changedAt,
          updatedAt: doc._updatedAt || null,
          transactionId: latest?.id || null,
          author,
        };
      }),
    );

    const filtered = seoChangesOnly
      ? items.filter((item) => item.seoFieldsChanged === true)
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
