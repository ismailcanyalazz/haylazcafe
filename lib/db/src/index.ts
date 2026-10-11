import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

/**
 * Sunucusuz (Vercel) ortamda her istek yeni bir modül örneği oluşturabilir
 * ama sıcak (warm) çağrılar aynı Node sürecini paylaşır. Havuzu globalThis
 * üzerinde saklamak, her istekte yeni bağlantı açılıp veritabanının
 * bağlantı limitine dayanmasını engeller.
 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/** Neon ve benzeri yönetilen sağlayıcılar TLS ister. */
const needsSsl =
  /\bsslmode=(require|verify-ca|verify-full)\b/.test(connectionString) ||
  /\.neon\.tech|\.supabase\.(co|com)|\.render\.com/.test(connectionString);

function createPool() {
  return new Pool({
    connectionString,
    // Sunucusuzda her örnek tek bağlantı tutar; havuzlama işini sağlayıcının
    // havuzlayıcısı (Neon pooler / PgBouncer) yapar.
    max: isServerless ? 1 : 10,
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

type PoolCache = { haylazPgPool?: pg.Pool };
const globalCache = globalThis as unknown as PoolCache;

export const pool: pg.Pool = globalCache.haylazPgPool ?? createPool();
if (isServerless) globalCache.haylazPgPool = pool;

// Havuzdaki boşta bağlantı hatası süreci düşürmemeli.
pool.on("error", (error) => {
  console.error("Beklenmeyen veritabanı havuzu hatası:", error);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
