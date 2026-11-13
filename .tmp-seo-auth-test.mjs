import { readFileSync, writeFileSync } from "fs";

function loadEnv(path) {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnv(".env.local");

const { makeSignature } = await import("better-auth/crypto");
const { getNeonPool } = await import("./server/neon-db.ts");
const pool = getNeonPool();
const { rows } = await pool.query(`
  SELECT s.token, u.email, u.role
  FROM "session" s
  JOIN "user" u ON u.id = s."userId"
  WHERE s."expiresAt" > NOW() AND u.role = 'admin'
  ORDER BY s."expiresAt" DESC
  LIMIT 1
`);
if (!rows[0]) {
  console.log("no admin session");
  process.exit(1);
}
const token = rows[0].token;
const secret = process.env.BETTER_AUTH_SECRET;
const signed = `${token}.${await makeSignature(token, secret)}`;
const appId = process.env.VITE_BASE44_APP_ID;
const cookie = `better-auth.session_token=${encodeURIComponent(signed)}`;

const { auth } = await import("./server/auth.ts");
const { fromNodeHeaders } = await import("better-auth/node");
const session = await auth.api.getSession({
  headers: fromNodeHeaders({
    cookie: `better-auth.session_token=${signed}`,
    host: "localhost:5173",
    origin: "http://localhost:5173",
  }),
});
console.log("sessionOk", Boolean(session?.user), "role", session?.user?.role || null);

const res = await fetch(
  `http://localhost:5173/api/apps/${appId}/functions/listSanitySeoActivity`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `better-auth.session_token=${signed}`,
    },
    body: JSON.stringify({ limit: 5 }),
  }
);
const text = await res.text();
writeFileSync("/tmp/seo-auth-result.json", text);
console.log("status", res.status);
console.log("body", text.slice(0, 1000));
await pool.end();
process.exit(0);
