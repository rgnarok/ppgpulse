import fp from 'fastify-plugin';
import { prisma } from '../db.js';

/** Decorate the instance with the shared Prisma client. */
export default fp(async (app) => {
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
