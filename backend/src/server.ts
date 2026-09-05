import { createApp } from './app.js';
import { capabilities, env } from './config/env.js';
import { disconnectDatabase, prisma } from './database/client.js';
import { callsService } from './modules/calls/calls.service.js';
import { logger } from './utils/logger.js';

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

const start = async (): Promise<void> => {
  await prisma.$queryRaw`SELECT 1`;
  logger.info('Database connection established');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, capabilities }, 'Backend listening');
    if (!capabilities.livekit) logger.warn('LiveKit is not configured: calls cannot be placed');
    if (!capabilities.sip) logger.warn('LIVEKIT_SIP_TRUNK_ID is not set: outbound dialling is off');
    if (!capabilities.embeddings) {
      logger.warn('OPENAI_API_KEY is not set: retrieval falls back to keyword search');
    }
  });

  // Closes out calls whose provider events never arrived.
  const reconcile = setInterval(() => {
    callsService
      .reconcileStaleCalls()
      .catch((error) => logger.error({ err: error }, 'Reconciliation failed'));
  }, RECONCILE_INTERVAL_MS);
  reconcile.unref();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    clearInterval(reconcile);
    server.close(() => {
      disconnectDatabase()
        .catch(() => undefined)
        .finally(() => process.exit(0));
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start backend');
  process.exit(1);
});
