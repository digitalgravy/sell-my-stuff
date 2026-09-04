import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDatabaseUrl } from '../server/db/client';

const DATABASE_ENV_KEYS = [
  'DATABASE_URL',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
] as const;

function withDatabaseEnv(
  values: Partial<Record<(typeof DATABASE_ENV_KEYS)[number], string>>,
  run: () => void,
) {
  const previous: Record<string, string | undefined> = {};
  for (const key of DATABASE_ENV_KEYS) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  try {
    run();
  } finally {
    for (const key of DATABASE_ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

void test('prefers DATABASE_URL when set', () => {
  withDatabaseEnv(
    {
      DATABASE_URL: 'postgres://u:p@example.com:5432/db',
      DATABASE_HOST: 'ignored.example.com',
    },
    () => {
      assert.equal(resolveDatabaseUrl(), 'postgres://u:p@example.com:5432/db');
    },
  );
});

void test('builds a URL from discrete parts, defaulting the port to 5432', () => {
  withDatabaseEnv(
    {
      DATABASE_HOST: 'docker.26fe.uk',
      DATABASE_NAME: 'sell_my_stuff',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'p@ss/word?',
    },
    () => {
      assert.equal(
        resolveDatabaseUrl(),
        'postgres://postgres:p%40ss%2Fword%3F@docker.26fe.uk:5432/sell_my_stuff',
      );
    },
  );
});

void test('uses DATABASE_PORT when provided', () => {
  withDatabaseEnv(
    {
      DATABASE_HOST: 'docker.26fe.uk',
      DATABASE_PORT: '5433',
      DATABASE_NAME: 'sell_my_stuff',
      DATABASE_USER: 'postgres',
      DATABASE_PASSWORD: 'secret',
    },
    () => {
      assert.equal(
        resolveDatabaseUrl(),
        'postgres://postgres:secret@docker.26fe.uk:5433/sell_my_stuff',
      );
    },
  );
});

void test('throws a clear error when neither shape is fully configured', () => {
  withDatabaseEnv({ DATABASE_HOST: 'docker.26fe.uk' }, () => {
    assert.throws(() => resolveDatabaseUrl(), /DATABASE_URL is not configured/);
  });
});
