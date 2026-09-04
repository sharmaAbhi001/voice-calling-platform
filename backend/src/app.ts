import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { capabilities, env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { logger } from './utils/logger.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { callsRoutes } from './modules/calls/calls.routes.js';
import { contactsRoutes } from './modules/contacts/contacts.routes.js';
import { internalRoutes } from './modules/internal/internal.routes.js';
import { knowledgeBaseRoutes } from './modules/knowledge-base/knowledge-base.routes.js';
import { templatesRoutes } from './modules/templates/templates.routes.js';
import { webhooksRoutes } from './modules/webhooks/webhooks.routes.js';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(cookieParser());

  // Webhooks are mounted before the JSON parser: LiveKit signs the raw body.
  app.use('/webhooks', webhooksRoutes);

  app.use(express.json({ limit: '2mb' }));
  app.use(apiLimiter);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', capabilities });
  });

  app.use('/auth', authRoutes);
  app.use('/contacts', contactsRoutes);
  app.use('/templates', templatesRoutes);
  app.use('/knowledge-bases', knowledgeBaseRoutes);
  app.use('/calls', callsRoutes);
  app.use('/internal', internalRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
