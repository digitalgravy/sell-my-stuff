import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/db/schema';

let database: PostgresJsDatabase<typeof schema> | undefined;

/**
 * Overseer's deploy manifest can only substitute a `${secret:<name>}`
 * placeholder as a whole env value, never embedded inside a larger string
 * (see overseer's secrets-resolver.ts) — so a deployed container gets the
 * password as its own DATABASE_PASSWORD var alongside literal
 * DATABASE_HOST/PORT/NAME/USER, not a single pre-built DATABASE_URL.
 * DATABASE_URL remains the simpler single-var option for local dev.
 */
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.DATABASE_HOST;
  const name = process.env.DATABASE_NAME;
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  if (host && name && user && password) {
    const port = process.env.DATABASE_PORT ?? '5432';
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(name)}`;
  }

  throw new Error(
    'DATABASE_URL is not configured (or DATABASE_HOST/DATABASE_NAME/DATABASE_USER/DATABASE_PASSWORD)',
  );
}

export function getDatabase(): PostgresJsDatabase<typeof schema> {
  if (database) return database;

  const client = postgres(resolveDatabaseUrl(), {
    max: Number(process.env.DATABASE_POOL_SIZE ?? '10'),
    prepare: false,
  });
  database = drizzle(client, { schema });
  return database;
}
