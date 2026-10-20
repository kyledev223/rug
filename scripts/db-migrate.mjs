// Applies db/migrations/*.sql in order to DATABASE_URL (Neon). Migrations are idempotent.
// Usage: npm run db:migrate   (reads .env.local if present)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
  process.exit(1);
}
// Node 22+ ships a global WebSocket; the Pool needs it for multi-statement SQL.
if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const pool = new Pool({ connectionString: url });
try {
  for (const f of files) {
    process.stdout.write(`applying ${f} … `);
    await pool.query(await readFile(path.join(dir, f), "utf8"));
    console.log("ok");
  }
} catch (e) {
  console.error("\nmigration failed:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
