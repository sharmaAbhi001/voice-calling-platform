import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, pool } from './client.js';
import { logger } from '../utils/logger.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Plain forward-only SQL migrations. Each file runs once, inside a transaction,
 * in filename order. No ORM, so the schema stays readable in one place.
 */
const run = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (row) => row.name,
      ),
    );

    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) {
        logger.debug({ file }, 'Migration already applied');
        continue;
      }
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      logger.info({ file }, 'Applying migration');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
      }
    }

    logger.info({ count: files.length }, 'Migrations up to date');
  } finally {
    client.release();
  }
};

run()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (error) => {
    logger.error({ err: error }, 'Migration run failed');
    await closePool().catch(() => undefined);
    process.exit(1);
  });
