import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";

const { Client } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const rootineDir = path.join(repoRoot, "Rootine");

function readEnvValue(envText, key) {
  const match = envText.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : undefined;
}

const envText = readFileSync(path.join(apiRoot, ".env"), "utf8");
const databaseUrl = readEnvValue(envText, "DATABASE_URL") ?? process.env.DATABASE_URL;
const dbSsl = (readEnvValue(envText, "DB_SSL") ?? "true") === "true";

if (!databaseUrl) {
  console.error("DATABASE_URL nao encontrada no .env");
  process.exit(1);
}

// Ordem: schema completo (ddl.sql) e depois RLS/policies/trigger/seeds (add.sql).
const files = ["ddl.sql", "add.sql"];

const client = new Client({
  connectionString: databaseUrl,
  ssl: dbSsl ? { rejectUnauthorized: false } : undefined,
});

try {
  console.log("Conectando ao Postgres do Supabase...");
  await client.connect();
  console.log("Conectado.");

  for (const file of files) {
    const sql = readFileSync(path.join(rootineDir, file), "utf8");
    console.log(`\n>>> Aplicando ${file} (${sql.length} caracteres)...`);
    await client.query(sql);
    console.log(`<<< OK: ${file}`);
  }

  console.log("\nSCHEMA APLICADO COM SUCESSO.");
} catch (err) {
  console.error("\nFALHA AO APLICAR SCHEMA:");
  console.error(err?.message ?? err);
  if (err?.position) console.error("Posicao no SQL:", err.position);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
