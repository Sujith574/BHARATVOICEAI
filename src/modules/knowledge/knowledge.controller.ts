import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../shared/errors/app-error";
import { buildPaginationMeta } from "../../shared/pagination/pagination";
import type { IngestDocumentBody, ListDocumentsQuery, SearchQuery } from "./knowledge.schemas";
import type { KnowledgeService } from "./knowledge.service";

export class KnowledgeController {
  public constructor(private readonly service: KnowledgeService) {}

  /**
   * POST /admin/knowledge
   * Processes files uploaded using multer MemoryStorage and parses body options.
   */
  public uploadDocument = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "UNAUTHORIZED", "Authenticated user context not found.");
      }

      if (!request.file) {
        throw new AppError(400, "FILE_REQUIRED", "A document file must be uploaded.");
      }

      const body = request.body as IngestDocumentBody;

      const document = await this.service.ingestDocument(request.authUser, {
        title: body.title,
        sourceType: body.sourceType,
        fileBuffer: request.file.buffer,
        mimetype: request.file.mimetype,
        ...(body.sourceUrl !== undefined && { sourceUrl: body.sourceUrl }),
        ...(body.sourceReference !== undefined && { sourceReference: body.sourceReference }),
        ...(body.languageCode !== undefined && { languageCode: body.languageCode }),
        ...(body.departmentId !== undefined && { departmentId: body.departmentId }),
        ...(body.serviceId !== undefined && { serviceId: body.serviceId }),
        ...(body.schemeId !== undefined && { schemeId: body.schemeId })
      });

      response.status(201).json({ data: document });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /admin/knowledge
   * Lists available ingested documents.
   */
  public listDocuments = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "UNAUTHORIZED", "Authenticated user context not found.");
      }

      const query = (request as Request & { parsedQuery: ListDocumentsQuery }).parsedQuery;
      const { items, total } = await this.service.listDocuments(
        request.authUser,
        {
          ...(query.departmentId !== undefined && { departmentId: query.departmentId }),
          ...(query.serviceId !== undefined && { serviceId: query.serviceId }),
          ...(query.schemeId !== undefined && { schemeId: query.schemeId })
        },
        query.page,
        query.pageSize
      );

      const meta = buildPaginationMeta(total, query);

      response.status(200).json({ data: items, meta });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /admin/knowledge/:id
   * Fetches full metadata and chunk history for a single document.
   */
  public getDocumentDetails = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "UNAUTHORIZED", "Authenticated user context not found.");
      }

      const id = String(request.params["id"]);
      const document = await this.service.getDocumentDetails(request.authUser, id);

      response.status(200).json({ data: document });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /admin/knowledge/:id
   * Cleans up database state for a specific document.
   */
  public deleteDocument = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "UNAUTHORIZED", "Authenticated user context not found.");
      }

      const id = String(request.params["id"]);
      await this.service.deleteDocument(request.authUser, id);

      response.status(200).json({ data: { id, deleted: true } });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /admin/knowledge/search
   * Exposes a direct endpoint to execute cosine similarity pgvector checks on chunks.
   */
  public querySearch = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.authUser) {
        throw new AppError(401, "UNAUTHORIZED", "Authenticated user context not found.");
      }

      const query = (request as Request & { parsedQuery: SearchQuery }).parsedQuery;
      const results = await this.service.search(request.authUser, query.q, query.limit, query.threshold);

      response.status(200).json({ data: results });
    } catch (error) {
      next(error);
    }
  };
}
