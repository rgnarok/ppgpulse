import type { FastifyInstance } from 'fastify';
import { loginSchema, refreshSchema, logoutSchema } from './schema.js';
import { login, refresh, logout } from './service.js';
import { meDto } from './dto.js';

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);
    const { tokens, userId } = await login(app.prisma, email, password);
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, consultant: true },
    });
    return reply.send({
      access: tokens.access,
      refresh: tokens.refresh,
      user: user && {
        id: user.id,
        name: user.name,
        email: user.email,
        role: { key: user.role.key, label: user.role.label },
      },
    });
  });

  app.post('/auth/refresh', async (request, reply) => {
    const { refresh: token } = refreshSchema.parse(request.body);
    const tokens = await refresh(app.prisma, token);
    return reply.send({ access: tokens.access, refresh: tokens.refresh });
  });

  app.post('/auth/logout', async (request, reply) => {
    const { refresh: token } = logoutSchema.parse(request.body ?? {});
    await logout(app.prisma, token);
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    return meDto(request.currentUser);
  });
}
