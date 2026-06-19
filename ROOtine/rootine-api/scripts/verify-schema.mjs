import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Client } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");

function readEnvValue(envText, key) {
  const match = envText.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : undefined;
}

const envText = readFileSync(path.join(apiRoot, ".env"), "utf8");
const databaseUrl = readEnvValue(envText, "DATABASE_URL") ?? process.env.DATABASE_URL;
const dbSsl = (readEnvValue(envText, "DB_SSL") ?? "true") === "true";

const client = new Client({
  connectionString: databaseUrl,
  ssl: dbSsl ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

const tables = await client.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
);
console.log("Tabelas public:", tables.rows.map((r) => r.table_name).join(", "));

const trigger = await client.query(
  `SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created'`,
);
console.log("Trigger on_auth_user_created:", trigger.rowCount ? "OK" : "AUSENTE");

for (const t of ["flashcards", "mission_patterns", "quiz_questions", "sustainability_categories", "profiles"]) {
  try {
    const c = await client.query(`SELECT count(*)::int AS n FROM public.${t}`);
    console.log(`count ${t}:`, c.rows[0].n);
  } catch (e) {
    console.log(`count ${t}: ERRO ${e.message}`);
  }
}

await client.end();
