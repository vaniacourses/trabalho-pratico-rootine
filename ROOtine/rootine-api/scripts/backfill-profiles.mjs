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

const res = await client.query(`
  INSERT INTO public.profiles (id, name, nome, xp, onboarding_completed, daily_flashcards_completed, created_at)
  SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Guardião'),
    COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Guardião'),
    1,
    false,
    false,
    now()
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL
  ON CONFLICT (id) DO NOTHING
  RETURNING id
`);

console.log("Perfis criados no backfill:", res.rowCount);

const total = await client.query(`SELECT count(*)::int AS n FROM public.profiles`);
console.log("Total de perfis agora:", total.rows[0].n);

await client.end();
