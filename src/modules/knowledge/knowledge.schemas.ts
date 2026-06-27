import { DocumentSourceType } from "@prisma/client";
import { z } from "zod";

import { paginationQuerySchema } from "../../shared/pagination/pagination";

export const listDocumentsQuerySchema = paginationQuerySchema.extend({
  departmentId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  schemeId: z.string().uuid().optional()
});

export const ingestDocumentBodySchema = z.object({
  title: z.string().min(2).max(300),
  sourceType: z.nativeEnum(DocumentSourceType),
  sourceUrl: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  sourceReference: z.string().max(200).optional().or(z.literal("").transform(() => undefined)),
  languageCode: z.string().max(16).default("en-IN"),
  departmentId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  schemeId: z.string().uuid().optional()
});

export const searchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).default(5),
  threshold: z.coerce.number().min(0).max(1).default(0.5)
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
export type IngestDocumentBody = z.infer<typeof ingestDocumentBodySchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
