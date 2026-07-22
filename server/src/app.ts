import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { getConfig } from './config.js';
import { HttpError } from './lib/errors.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './modules/auth/routes.js';
import usersRoutes from './modules/users/routes.js';
import rolesRoutes from './modules/roles/routes.js';
import hierarchyRoutes from './modules/hierarchy/routes.js';
import reportRoutes from './modules/report/routes.js';
import hdisRoutes from './modules/hdis/routes.js';
import interviewsRoutes from './modules/interviews/routes.js';
import clientsRoutes from './modules/clients/routes.js';
import auditRoutes from './modules/audit/routes.js';
import kpisRoutes from './modules/kpis/routes.js';
import consultantLogRoutes from './modules/consultantLog/routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const cfg = getConfig();
  const app = Fastify({
    logger:
      cfg.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            // Never log secrets: redact auth headers and token/password fields.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'body.password',
                'body.refresh',
                '*.passwordHash',
              ],
              censor: '[redacted]',
            },
          },
    bodyLimit: cfg.MAX_UPLOAD_BYTES + 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  // Allow the configured web origin(s) (comma-separated), any *.vercel.app
  // deployment, and localhost in dev. Non-browser/same-origin requests (no
  // Origin header) are always allowed.
  const allowedOrigins = cfg.WEB_ORIGIN.split(',').map((o) => o.trim());
  await app.register(cors, {
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      try {
        const { hostname } = new URL(origin);
        if (hostname.endsWith('.vercel.app')) return cb(null, true);
        if (hostname === 'localhost' || hostname === '127.0.0.1') return cb(null, true);
      } catch {
        /* malformed origin */
      }
      return cb(null, false);
    },
  });
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
  await app.register(usersRoutes, { prefix: '/api' });
  await app.register(rolesRoutes, { prefix: '/api' });
  await app.register(hierarchyRoutes, { prefix: '/api' });
  await app.register(reportRoutes, { prefix: '/api' });
  await app.register(hdisRoutes, { prefix: '/api' });
  await app.register(interviewsRoutes, { prefix: '/api' });
  await app.register(clientsRoutes, { prefix: '/api' });
  await app.register(auditRoutes, { prefix: '/api' });
  await app.register(kpisRoutes, { prefix: '/api' });
  await app.register(consultantLogRoutes, { prefix: '/api' });

  // In production (and e2e), serve the built web SPA from the same origin.
  // Try a few candidate locations so it works from Docker, native runtimes, or dev.
  const webCandidates = [
    path.resolve(here, '../../web/dist'), // server/dist/app.js → repo/web/dist
    path.resolve(process.cwd(), 'web/dist'), // launched from repo root
    path.resolve(here, '../../../web/dist'), // extra nesting safety
  ];
  const webDist = webCandidates.find((p) => existsSync(path.join(p, 'index.html')));
  if (webDist) {
    app.log.info(`Serving web SPA from ${webDist}`);
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      decorateReply: false,
    });
    // SPA fallback: non-API GET routes return index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html', webDist);
      }
      return reply.status(404).send({ error: 'not_found', message: 'Not found' });
    });
  } else {
    app.log.warn(`Web SPA bundle not found (checked: ${webCandidates.join(', ')}). API-only mode.`);
  }

  return app;
}
