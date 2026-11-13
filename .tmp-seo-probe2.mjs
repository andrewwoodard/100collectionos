import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
      ];
    })
);
for (const [k, v] of Object.entries(env)) process.env[k] = String(v);
process.env.VITE_AUTH_DEV_ADMIN = "true";

const PROJECT = process.env.SANITY_PROJECT_ID;
const DATASET = process.env.SANITY_DATASET;
const token = process.env.SANITY_API_READ_TOKEN;
const API = "2021-10-21";

async function fetchSanity(path) {
  const res = await fetch(`https://${PROJECT}.api.sanity.io${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  return { status: res.status, text };
}

// Users API probe
const u = await fetchSanity(`/v${API}/users/pyEGHfC93`);
console.log("users", u.status, u.text.slice(0, 200));

// Document at revision
const docId = "c9ee2fa0-a15d-40e3-8ee9-32eb151c56c6";
const txId = "TiskbWAg8339xLi9CQg8XR";
const d = await fetchSanity(
  `/v${API}/data/history/${DATASET}/documents/${encodeURIComponent(docId)}?revision=${encodeURIComponent(txId)}`
);
console.log("doc@rev", d.status, d.text.slice(0, 250));

// Time the parallel pattern with limit 40
const SEO_TYPES = ["post", "page", "destination", "homepage", "aboutpage", "category", "experience"];
const typeClause = `&& _type in ${JSON.stringify([...SEO_TYPES])}`;
const query = `*[
  (defined(SEOtitle) || defined(SEOdescription) || defined(seoTitle) || defined(metaTitle))
  ${typeClause}
] | order(_updatedAt desc) [0...40] {
  _id, _type, _updatedAt, _rev, title, name, "slug": slug.current, SEOtitle, SEOdescription
}`;
const q = await fetchSanity(`/v${API}/data/query/${DATASET}?query=${encodeURIComponent(query)}`);
const docs = JSON.parse(q.text).result || [];
console.log("docs", docs.length);

const t0 = Date.now();
const results = await Promise.all(
  docs.map(async (doc) => {
    try {
      const hist = await fetchSanity(
        `/v${API}/data/history/${DATASET}/transactions/${encodeURIComponent(doc._id)}?excludeContent=true&reverse=true&limit=5`
      );
      const lines = hist.text.split("\n").filter(Boolean);
      const txs = lines.map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(Boolean);
      const latest = txs[0];
      const previous = txs[1];
      let prevSeo = null;
      if (previous?.id) {
        const prev = await fetchSanity(
          `/v${API}/data/history/${DATASET}/documents/${encodeURIComponent(doc._id)}?revision=${encodeURIComponent(previous.id)}`
        );
        if (prev.status === 200) {
          const parsed = JSON.parse(prev.text);
          const pdoc = parsed.documents?.[0];
          prevSeo = { t: pdoc?.SEOtitle, d: pdoc?.SEOdescription };
        } else {
          return { id: doc._id, prevStatus: prev.status, prevErr: prev.text.slice(0, 120) };
        }
      }
      let author = latest?.author;
      if (author) {
        const au = await fetchSanity(`/v${API}/users/${encodeURIComponent(author)}`);
        if (au.status !== 200) author = `${author}(user ${au.status})`;
        else author = JSON.parse(au.text).displayName || author;
      }
      return { id: doc._id, author, prevSeo: !!prevSeo, hist: hist.status };
    } catch (e) {
      return { id: doc._id, error: e.message };
    }
  })
);
console.log("elapsed_ms", Date.now() - t0);
console.log("sample", results.slice(0, 3));
console.log("errors", results.filter((r) => r.error || r.prevStatus));
process.exit(0);
