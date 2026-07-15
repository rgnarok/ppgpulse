import { z } from 'zod';

export const listQuerySchema = z.object({
  q: z.string().optional(),
});

export const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required'),
});

export const updateClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required'),
});

export type ListClientsQuery = z.infer<typeof listQuerySchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
