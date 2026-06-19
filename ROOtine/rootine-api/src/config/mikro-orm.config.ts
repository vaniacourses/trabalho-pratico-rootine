import { defineConfig } from "@mikro-orm/postgresql";
import * as entities from "../entities";
import { env } from "./env";

/**
 * Driver PostgreSQL apontando para o Postgres do Supabase. O schema é a fonte
 * de verdade (`ddl.sql` + `add.sql`); não geramos schema a partir das entidades.
 * Use `npm run schema:diff` para validar drift (esperado: zero alterações
 * destrutivas).
 */
export function buildMikroOrmConfig() {
  const entityClasses = Object.values(entities).filter(
    (value) => typeof value === "function",
  ) as unknown as (new (...args: unknown[]) => object)[];

  return defineConfig({
    clientUrl: env.databaseUrl,
    entities: entityClasses,
    // Sobe o servidor HTTP mesmo sem o Postgres disponível de imediato; a
    // conexão é estabelecida de forma preguiçosa na primeira query. Evita que
    // uma indisponibilidade transitória do banco derrube o boot da API.
    connect: false,
    // Pool do pg é lazy: a aplicação sobe sem exigir o banco disponível de
    // imediato; as queries é que falham se o Postgres estiver inacessível.
    driverOptions: env.dbSsl ? { connection: { ssl: { rejectUnauthorized: false } } } : {},
    debug: env.dbDebug,
    // Autorização passa a ser responsabilidade da aplicação (Guard + filtros
    // `where user_id`). allowGlobalContext simplifica o uso do EM nos serviços.
    allowGlobalContext: true,
    forceUndefined: true,
    pool: { min: 0, max: 10 },
  });
}

export default buildMikroOrmConfig();
