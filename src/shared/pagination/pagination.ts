/**
 * pagination.ts
 *
 * Shared offset-based pagination utilities used across all list endpoints.
 *
 * Provides:
 *  - paginationQuerySchema  — Zod schema that parses & validates page/pageSize query params
 *  - PaginationQuery        — TypeScript type inferred from the schema
 *  - PaginationMeta         — Shape of the metadata object returned in list responses
 *  - buildPaginationMeta()  — Helper to construct the metadata from raw count
 *  - buildPrismaSkipTake()  — Converts pagination query into Prisma skip/take args
 *
 * Default: page 1, pageSize 20, max pageSize 100.
 */

import { z } from "zod";

// ─── Schema ───────────────────────────────────────────────────────────────────

export const paginationQuerySchema = z.object({
  /** 1-based page number */
  page: z.coerce.number().int().positive().default(1),
  /** Number of items per page (max 100) */
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// ─── Meta ─────────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  /** Total number of matching records */
  total: number;
  /** Current page (1-based) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether a next page exists */
  hasNextPage: boolean;
  /** Whether a previous page exists */
  hasPreviousPage: boolean;
}

/**
 * Constructs pagination metadata from a total count and current query.
 */
export const buildPaginationMeta = (total: number, query: PaginationQuery): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPreviousPage: query.page > 1
  };
};

/**
 * Converts a PaginationQuery into Prisma-compatible skip/take arguments.
 */
export const buildPrismaSkipTake = (query: PaginationQuery): { skip: number; take: number } => ({
  skip: (query.page - 1) * query.pageSize,
  take: query.pageSize
});
