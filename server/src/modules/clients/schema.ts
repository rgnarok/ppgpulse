import { z } from 'zod';

export const listQuerySchema = z.object({
  q: z.string().optional(),
});

export type ListClientsQuery = z.infer<typeof listQuerySchema>;
