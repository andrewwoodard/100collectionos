import { Pool } from "pg";

let pool: Pool | null = null;

export function getNeonPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 8,
  });
  return pool;
}

export function toSnake(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

export function quoteIdent(name: string) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export function newId() {
  return Date.now().toString(16) + Math.random().toString(16).slice(2, 10);
}

export function readBuffer(req: { on: Function }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function readBody(req: { on: Function }): Promise<string> {
  return readBuffer(req).then((buf) => buf.toString("utf8"));
}

export function json(res: any, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(payload);
}
