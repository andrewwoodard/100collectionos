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

const PROJECT = process.env.SANITY_PROJECT_ID;
const DATASET = process.env.SANITY_DATASET;
const token = process.env.SANITY_API_READ_TOKEN;
const API = "2021-10-21";
console.log("env", { PROJECT, DATASET, tokenLen: token?.length || 0 });

const SEO_TYPES = ["post", "page", "destination", "homepage", "aboutpage", "category", "experience"];
const typeClause = `&& _type in ${JSON.stringify([...SEO_TYPES])}`;
const query = `*[
  (defined(SEOtitle) || defined(SEOdescription) || defined(seoTitle) || defined(metaTitle))
  ${typeClause}
] | order(_updatedAt desc) [0...3] {
  _id, _type, _updatedAt, _rev, title, name, "slug": slug.current, SEOtitle, SEOdescription
}`;

async function fetchSanity(path) {
  const res = await fetch(`https://${PROJECT}.api.sanity.io${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  return { status: res.status, text };
}

const qPath = `/v${API}/data/query/${DATASET}?query=${encodeURIComponent(query)}`;
const q = await fetchSanity(qPath);
console.log("query", q.status, q.text.slice(0, 400));

let docId = null;
try {
  const parsed = JSON.parse(q.text);
  docId = parsed?.result?.[0]?._id;
  console.log("first doc", docId, parsed?.result?.[0]?._type);
} catch (e) {
  console.log("parse fail", e.message);
}

if (docId) {
  const paths = [
    `/v${API}/data/history/${DATASET}/transactions/${encodeURIComponent(docId)}?excludeContent=true&reverse=true&limit=5`,
    `/v${API}/data/history/${DATASET}/documents/${encodeURIComponent(docId)}?excludeContent=true&limit=5`,
  ];
  for (const p of paths) {
    const r = await fetchSanity(p);
    console.log("\nhistory", r.status, r.text.slice(0, 220));
  }
}

process.env.VITE_AUTH_DEV_ADMIN = "true";
const { handleListSanitySeoActivity } = await import("./server/list-sanity-seo-activity.ts");
const { requireAdmin } = await import("./server/require-session.ts");

const fakeReq = { method: "POST", headers: { cookie: "" }, body: {} };
const gate = await requireAdmin(fakeReq);
console.log("gate without session", gate);

const fakeRes = {
  _code: 200,
  _body: null,
  status(code) {
    this._code = code;
    return this;
  },
  json(payload) {
    this._body = payload;
    return this;
  },
  setHeader() {},
  end() {},
};

// Bypass auth by calling the try block path: patch via temporary session mock is hard.
// Instead, manually exercise after setting a fake - call handle with monkeypatched require
const mod = await import("./server/list-sanity-seo-activity.ts");
console.log("exports", Object.keys(mod));
