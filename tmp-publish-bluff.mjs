import { readFileSync } from "fs";
import pg from "pg";
import { randomBytes } from "crypto";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  if (process.env[k] === undefined) {
    process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const sanityCfg = JSON.parse(
  readFileSync(process.env.HOME + "/.config/sanity/config.json", "utf8")
);
const token = sanityCfg.authToken;
const project = "b2yibrs1";
const dataset = "production";
const VRM_ID = "8644c3a1-270e-40fe-bd00-94b1a1b13ac6";
const KEY = "base44-1793997437487";

function key() {
  return randomBytes(6).toString("hex");
}

async function sanityQuery(query) {
  const url = `https://${project}.api.sanity.io/v2021-10-21/data/query/${dataset}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.result;
}

async function sanityMutate(mutations) {
  const res = await fetch(
    `https://${project}.api.sanity.io/v2021-10-21/data/mutate/${dataset}?returnDocuments=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mutations }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function uploadImageFromUrl(imageUrl, filename) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`fetch image failed ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";
  const res = await fetch(
    `https://${project}.api.sanity.io/v2021-10-21/assets/images/${dataset}?filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      body: buf,
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`upload failed ${res.status} ${JSON.stringify(data)}`);
  return data.document;
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const { rows } = await pool.query(
  `SELECT * FROM supabase.propertiesbase44 WHERE name ILIKE 'Down on the Bluff' LIMIT 1`
);
const prop = rows[0];
if (!prop) throw new Error("property missing");

let images = prop.images;
if (typeof images === "string") {
  try {
    images = JSON.parse(images);
  } catch {
    images = [];
  }
}
if (!Array.isArray(images)) images = [];
const photoUrls = images.filter(Boolean).slice(0, 5);
console.log("photos to upload", photoUrls.length);

const uploaded = [];
for (let i = 0; i < photoUrls.length; i++) {
  const doc = await uploadImageFromUrl(photoUrls[i], `down-on-the-bluff-${i + 1}.jpg`);
  uploaded.push(doc);
  console.log("uploaded", i + 1, doc._id);
}

const showcaseImages = uploaded.map((doc, i) => ({
  _key: key(),
  _type: "propertyImages",
  galleryImage: {
    _type: "image",
    asset: { _type: "reference", _ref: doc._id },
    ...(i === 0
      ? { alttext: "Exterior view of Down on the Bluff in the Finger Lakes." }
      : {}),
  },
}));

const lat = prop.latitude != null ? Number(prop.latitude) : 42.58;
const lng = prop.longitude != null ? Number(prop.longitude) : -77.1;

const newItem = {
  _key: KEY,
  _type: "showcaseProperty",
  name: "Down on the Bluff",
  slug: { _type: "slug", current: "down-on-the-bluff" },
  roomcount: String(prop.bedrooms || "5"),
  bathrooms: String(prop.bathrooms || "3"),
  occupancy: String(prop.occupancy || "12"),
  propertyLink:
    prop.vrm_url ||
    "https://www.lingerhospitality.com/vacation-rental-search/down-on-the-bluff",
  images: showcaseImages,
  proplocation: { _type: "geopoint", lat, lng },
};

const current = await sanityQuery(`*[_id=="${VRM_ID}"][0]{showcase}`);
const existing = Array.isArray(current?.showcase) ? current.showcase : [];
const without = existing.filter(
  (i) => i._key !== KEY && i.name !== "Down on the Bluff"
);
const nextShowcase = [...without, newItem];
console.log("showcase before", existing.length, "after", nextShowcase.length);

await sanityMutate([
  {
    patch: {
      id: VRM_ID,
      set: { showcase: nextShowcase },
    },
  },
]);

const verify = await sanityQuery(
  `*[_id=="${VRM_ID}"][0]{"names": showcase[].name, "down": showcase[_key=="${KEY}"][0]{name, roomcount, "imageCount": count(images), "firstRef": images[0].galleryImage.asset._ref}}`
);
console.log("sanity verify", JSON.stringify(verify, null, 2));

await pool.query(
  `UPDATE supabase.vrms SET showcase_json = $1::jsonb, updated_at = NOW() WHERE id = '38'`,
  [JSON.stringify(nextShowcase)]
);

const url = (
  process.env.BASE44_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const keyEnv =
  process.env.BASE44_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const remotePatch = await fetch(`${url}/rest/v1/vrms?id=eq.38`, {
  method: "PATCH",
  headers: {
    apikey: keyEnv,
    Authorization: `Bearer ${keyEnv}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({ showcase_json: nextShowcase }),
});
console.log("remote vrms patch", remotePatch.status, (await remotePatch.text()).slice(0, 200));

await pool.end();
console.log("DONE");
