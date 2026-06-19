/**
 * Acesso centralizado às variáveis de ambiente. A API NestJS substitui o
 * `service_role` + RLS das Edge Functions por uma conexão direta ao Postgres
 * (MikroORM) + validação de JWT do Supabase Auth no `JwtUserGuard`.
 */
function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function buildDatabaseUrl(): string {
  const explicit = optional("DATABASE_URL") ?? optional("MIKRO_ORM_CLIENT_URL");
  if (explicit) return explicit;

  const host = optional("PGHOST") ?? "localhost";
  const port = optional("PGPORT") ?? "5432";
  const user = optional("PGUSER") ?? "postgres";
  const password = optional("PGPASSWORD") ?? "postgres";
  const database = optional("PGDATABASE") ?? "postgres";

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export const env = {
  get port(): number {
    return Number(optional("PORT") ?? 3333);
  },
  get nodeEnv(): string {
    return optional("NODE_ENV") ?? "development";
  },
  get databaseUrl(): string {
    return buildDatabaseUrl();
  },
  get dbSsl(): boolean {
    return optional("DB_SSL") === "true";
  },
  get dbDebug(): boolean {
    return optional("MIKRO_ORM_DEBUG") === "true";
  },
  get supabaseUrl(): string | undefined {
    return optional("SUPABASE_URL");
  },
  get supabaseAnonKey(): string | undefined {
    return optional("SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey(): string | undefined {
    return optional("SUPABASE_SERVICE_ROLE_KEY");
  },
  /** Quando true, ignora a validação real de JWT (apenas DEV/local sem Supabase). */
  get authDevBypass(): boolean {
    return optional("AUTH_DEV_BYPASS") === "true";
  },
  get openAiKey(): string | undefined {
    return optional("OPENAI_API_KEY") ?? optional("OPEN_AI_KEY");
  },
  get openAiModel(): string {
    return optional("OPENAI_MODEL") ?? "gpt-4.1-mini";
  },
  get groqKey(): string | undefined {
    return optional("GROQ_API_KEY");
  },
  get groqModel(): string {
    return optional("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
  },
};
