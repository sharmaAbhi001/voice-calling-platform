import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Prisma opens its own pool inside the query engine, sized by a connection-string
 * parameter rather than by code. The previous pg pool used 10 connections and a
 * 30s idle timeout; keep that unless the operator has already tuned the URL.
 */
const connectionUrl = (): string => {
  try {
    const url = new URL(env.DATABASE_URL);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '10');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '30');
    }
    return url.toString();
  } catch {
    // Not a parseable URL (e.g. a libpq key=value DSN). Prisma will do its own
    // validation and produce a better message than we could here.
    return env.DATABASE_URL;
  }
};

export const prisma = new PrismaClient({
  datasources: { db: { url: connectionUrl() } },
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

prisma.$on('warn', (event) => logger.warn({ target: event.target }, event.message));
prisma.$on('error', (event) => logger.error({ target: event.target }, event.message));

/**
 * Runs a unit of work inside a transaction, rolling back on any throw. The
 * callback receives a transactional client with the same API as `prisma`.
 */
export const withTransaction = <T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => prisma.$transaction(fn);

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};
