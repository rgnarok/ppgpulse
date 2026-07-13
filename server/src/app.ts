import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { getConfig } from './config.js';
import { HttpError } from './lib/errors.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './modules/auth/routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const cfg = getConfig();
  const app = Fastify({
    logger: cfg.NODE_ENV === 'test' ? false : { level: 'info' },
    bodyLimit: cfg.MAX_UPLOAD_BYTES + 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: cfg.WEB_ORIGIN, credentials: true });
  await app.register(rateLimit, {
    global: false,
    max: 1000,
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: { fileSize: cfg.MAX_UPLOAD_BYTES, files: 1 },
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Invalid request',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({ error: 'rate_limited', message: 'Too many requests' });
    }
    request.log.error(err);
    return reply.status(500).send({ error: 'internal_error', message: 'Something went wrong' });
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // Serve the prototype (visual reference) at /prototype.
  const protoDir = path.resolve(here, '../../prototype');
  await app.register(fastifyStatic, { root: protoDir, prefix: '/prototype/' });
  app.get('/prototype', (_req, reply) => reply.redirect('/prototype/ppg-pulse.html'));

  app.get('/api/health', async () => ({ status: 'ok' }));

  await app.register(authRoutes, { prefix: '/api' });

  return app;
}
