import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { resolveDatabaseUrl } from './client';

// Deliberately not getDatabase()'s shared, long-lived connection pool --
// that's built for the app's lifetime and never closes itself, which
// would leave this one-shot script's process alive forever (an open
// socket keeps Node's event loop running even after main() resolves).
// A dedicated single connection, explicitly closed, lets the process
// exit on its own so entrypoint.sh's blocking call actually returns.
async function main() {
  const client = postgres(resolveDatabaseUrl(), { max: 1 });
  try {
    console.log('Applying database migrations...');
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    console.log('Database migrations applied (or already up to date).');
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Database migration failed:', error);
    process.exit(1);
  });
