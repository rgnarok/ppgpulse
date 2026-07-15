import type { FastifyInstance } from 'fastify';
import { assertCan } from '../rbac/index.js';
import { BadRequestError } from '../../lib/errors.js';
import {
  listQuerySchema,
  createHdisSchema,
  updateHdisSchema,
  pipelineSchema,
  linkSchema,
} from './schema.js';
import {
  listHdis,
  getHdisForUser,
  assertCanEditHdisRecord,
  toHdisDto,
  createHdis,
  updateHdis,
  deleteHdis,
  setPipeline,
  setLink,
  addAttachment,
  getAttachment,
  listActivity,
} from './service.js';

export default async function hdisRoutes(app: FastifyInstance) {
  app.get('/hdis', { preHandler: app.authenticate }, async (request) => {
    assertCan(request.currentUser, 'hdis', 'view');
    const q = listQuerySchema.parse(request.query);
    return listHdis(app.prisma, request.currentUser, q);
  });

  app.get<{ Params: { jdId: string } }>(
    '/hdis/:jdId',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'hdis', 'view');
      return toHdisDto(await getHdisForUser(app.prisma, request.currentUser, request.params.jdId));
    },
  );

  app.post('/hdis', { preHandler: app.authenticate }, async (request, reply) => {
    assertCan(request.currentUser, 'hdis', 'add');
    const input = createHdisSchema.parse(request.body);
    const created = await createHdis(app.prisma, request.currentUser.id, input);
    return reply.status(201).send(created);
  });

  app.patch<{ Params: { jdId: string } }>(
    '/hdis/:jdId',
    { preHandler: app.authenticate },
    async (request) => {
      await assertCanEditHdisRecord(app.prisma, request.currentUser, request.params.jdId);
      const input = updateHdisSchema.parse(request.body);
      return updateHdis(app.prisma, request.currentUser.id, request.params.jdId, input);
    },
  );

  app.delete<{ Params: { jdId: string } }>(
    '/hdis/:jdId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'hdis', 'delete');
      await deleteHdis(app.prisma, request.currentUser.id, request.params.jdId);
      return reply.status(204).send();
    },
  );

  app.put<{ Params: { jdId: string } }>(
    '/hdis/:jdId/pipeline',
    { preHandler: app.authenticate },
    async (request) => {
      await assertCanEditHdisRecord(app.prisma, request.currentUser, request.params.jdId);
      const input = pipelineSchema.parse(request.body);
      return setPipeline(app.prisma, request.currentUser.id, request.params.jdId, input);
    },
  );

  app.post<{ Params: { jdId: string } }>(
    '/hdis/:jdId/link',
    { preHandler: app.authenticate },
    async (request) => {
      await assertCanEditHdisRecord(app.prisma, request.currentUser, request.params.jdId);
      const { jdLink } = linkSchema.parse(request.body);
      return setLink(app.prisma, request.currentUser.id, request.params.jdId, jdLink);
    },
  );

  app.get<{ Params: { jdId: string } }>(
    '/hdis/:jdId/activity',
    { preHandler: app.authenticate },
    async (request) => {
      assertCan(request.currentUser, 'hdis', 'view');
      await getHdisForUser(app.prisma, request.currentUser, request.params.jdId);
      return listActivity(app.prisma, request.params.jdId);
    },
  );

  app.post<{ Params: { jdId: string } }>(
    '/hdis/:jdId/attachments',
    { preHandler: app.authenticate },
    async (request, reply) => {
      await assertCanEditHdisRecord(app.prisma, request.currentUser, request.params.jdId);
      const file = await request.file();
      if (!file) throw new BadRequestError('No file provided', 'no_file');
      const buffer = await file.toBuffer();
      if (file.file.truncated) {
        throw new BadRequestError('File exceeds the maximum allowed size', 'too_large');
      }
      const saved = await addAttachment(app.prisma, request.currentUser.id, request.params.jdId, {
        buffer,
        fileName: file.filename,
        contentType: file.mimetype,
      });
      return reply.status(201).send(saved);
    },
  );

  app.get<{ Params: { jdId: string; attachmentId: string } }>(
    '/hdis/:jdId/attachments/:attachmentId',
    { preHandler: app.authenticate },
    async (request, reply) => {
      assertCan(request.currentUser, 'hdis', 'view');
      await getHdisForUser(app.prisma, request.currentUser, request.params.jdId);
      const { buffer, fileName, contentType } = await getAttachment(
        app.prisma,
        request.params.jdId,
        request.params.attachmentId,
      );
      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
      return reply.send(buffer);
    },
  );
}
