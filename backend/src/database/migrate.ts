import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { disconnectDatabase, prisma } from './client.js';
import { logger } from '../utils/logger.js';

/**
 * Applies the Prisma migrations in backend/prisma/migrations, forward only.
 *
 * Deployment keeps calling this file (`node backend/dist/database/migrate.js`),
 * so the deploy script does not need to know that Prisma is what runs underneath.
 *
 * The one wrinkle is a database created by the pre-Prisma SQL runner: its tables
 * already exist but `_prisma_migrations` does not, so `migrate deploy` would try
 * to create everything again and fail. When that shape is detected the baseline
 * is marked as applied first, which is exactly what `prisma migrate resolve` is
 * for. Fresh databases skip that and just get the migration applied.
 */

// dist/database/migrate.js and src/database/migrate.ts are both two levels below
// the backend package root, so the schema resolves the same either way.
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaPath = path.join(backendRoot, 'prisma', 'schema.prisma');

const BASELINE_MIGRATION = '0_init';

const require = createRequire(import.meta.url);

/** Path to the Prisma CLI entry point, read from its own package manifest. */
const prismaCliPath = (): string => {
  const manifestPath = require.resolve('prisma/package.json');
  const manifest = require('prisma/package.json') as { bin?: Record<string, string> | string };
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.prisma;
  if (!bin) throw new Error('Could not locate the Prisma CLI entry point');
  return path.join(path.dirname(manifestPath), bin);
};

const runPrisma = (args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [prismaCliPath(), ...args], {
      // The CLI reads DATABASE_URL from the environment; env.ts has already
      // loaded the repo-root .env, which a bare CLI invocation would not see.
      env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`prisma ${args[0]} exited with code ${code}`)),
    );
  });

/** True when the schema predates Prisma: application tables but no Prisma ledger. */
const needsBaseline = async (): Promise<boolean> => {
  const [row] = await prisma.$queryRaw<Array<{ prisma_ledger: string | null; users: string | null }>>`
    SELECT to_regclass('public._prisma_migrations')::text AS prisma_ledger,
           to_regclass('public.users')::text AS users`;
  return Boolean(row && !row.prisma_ledger && row.users);
};

const run = async (): Promise<void> => {
  if (await needsBaseline()) {
    logger.info(
      { migration: BASELINE_MIGRATION },
      'Existing pre-Prisma schema found: marking the baseline migration as applied',
    );
    await runPrisma(['migrate', 'resolve', '--schema', schemaPath, '--applied', BASELINE_MIGRATION]);
  }

  await runPrisma(['migrate', 'deploy', '--schema', schemaPath]);
  logger.info('Migrations up to date');
};

run()
  .then(() => disconnectDatabase())
  .then(() => process.exit(0))
  .catch(async (error) => {
    logger.error({ err: error }, 'Migration run failed');
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
