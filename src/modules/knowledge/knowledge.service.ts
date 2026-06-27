import type { DocumentSourceType, KnowledgeDocument } from "@prisma/client";

import { AppError } from "../../shared/errors/app-error";
import { chunkText } from "../../shared/utils/text-chunker";
import type { AuditService } from "../admin/audit/audit.service";
import type { AuthService } from "../auth/auth.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { GeminiService } from "../ai/gemini.service";
import type { DocumentParserService } from "./document-parser.service";
import type { KnowledgeRepository, SearchResult } from "./knowledge.repository";
import { MemoryCache } from "../../shared/cache/memory-cache";

export class KnowledgeService {
  private readonly searchCache = new MemoryCache(300000); // 5 minutes TTL

  public constructor(
    private readonly repository: KnowledgeRepository,
    private readonly parser: DocumentParserService,
    private readonly gemini: GeminiService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Main pipeline: Create placeholder -> extract text -> chunk text -> query Gemini embeddings -> SQL bulk insert -> activate.
   */
  public async ingestDocument(
    actor: AuthenticatedUser,
    dto: {
      title: string;
      sourceType: DocumentSourceType;
      fileBuffer: Buffer;
      mimetype: string;
      sourceUrl?: string;
      sourceReference?: string;
      languageCode?: string;
      departmentId?: string;
      serviceId?: string;
      schemeId?: string;
    }
  ): Promise<KnowledgeDocument> {
    this.authService.assertPermission(actor, "knowledge.create");

    // 1. Create document placeholder in database
    const doc = await this.repository.createDocument({
      title: dto.title,
      sourceType: dto.sourceType,
      languageCode: dto.languageCode ?? "en-IN",
      ...(dto.sourceUrl !== undefined && { sourceUrl: dto.sourceUrl }),
      ...(dto.sourceReference !== undefined && { sourceReference: dto.sourceReference }),
      ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
      ...(dto.serviceId !== undefined && { serviceId: dto.serviceId }),
      ...(dto.schemeId !== undefined && { schemeId: dto.schemeId }),
      uploadedByUserId: actor.id,
      approvalStatus: "APPROVED", // Auto-approve ingested documents
      processingStatus: "INACTIVE"
    });

    try {
      // 2. Extract plain text
      const text = await this.parser.parseDocument(dto.fileBuffer, dto.mimetype);
      if (!text || text.trim() === "") {
        throw new Error("Parsed document returned empty text content.");
      }

      // 3. Sliding window text chunking
      const chunks = chunkText(text, 500, 100);
      if (chunks.length === 0) {
        throw new Error("No text chunks could be derived from the document text.");
      }

      // 4. Ingest embeddings from Gemini (batch loop)
      const embeddings: number[][] = [];
      for (const chunk of chunks) {
        const embedding = await this.gemini.generateEmbedding(chunk.content);
        embeddings.push(embedding);
      }

      // 5. SQL Insert Transaction
      await this.repository.saveChunksAndEmbeddings(
        doc.id,
        chunks.map((c) => ({ content: c.content, index: c.chunkIndex })),
        embeddings
      );

      // 6. Finalize status and update database
      const activeDoc = await this.repository.updateDocument(doc.id, {
        processingStatus: "ACTIVE",
        publishedAt: new Date()
      });

      // Clear search cache on successful ingestion
      this.searchCache.clear();

      // Audit Log
      await this.auditService.log({
        actorUserId: actor.id,
        action: "KNOWLEDGE_INGEST",
        entityType: "KnowledgeDocument",
        entityId: doc.id,
        metadata: { title: dto.title, chunksCount: chunks.length }
      });

      return activeDoc;
    } catch (error) {
      // Mark inactive / failed state
      await this.repository.updateDocument(doc.id, {
        processingStatus: "INACTIVE"
      });

      throw new AppError(500, "INGEST_FAILED", `Failed to ingest knowledge document: ${(error as Error).message}`);
    }
  }

  /**
   * Deletes document, its chunks, and corresponding embeddings.
   */
  public async deleteDocument(actor: AuthenticatedUser, id: string): Promise<KnowledgeDocument> {
    this.authService.assertPermission(actor, "knowledge.delete");

    const doc = await this.repository.findDocumentById(id);
    if (!doc) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", `KnowledgeDocument with ID '${id}' was not found.`);
    }

    const deleted = await this.repository.deleteDocument(id);

    // Clear search cache on successful deletion
    this.searchCache.clear();

    // Audit Log
    await this.auditService.log({
      actorUserId: actor.id,
      action: "KNOWLEDGE_DELETE",
      entityType: "KnowledgeDocument",
      entityId: id,
      metadata: { title: doc.title }
    });

    return deleted;
  }

  /**
   * Performs vector semantic search on documents.
   */
  public async search(
    actor: AuthenticatedUser,
    query: string,
    limit = 5,
    threshold = 0.5
  ): Promise<SearchResult[]> {
    this.authService.assertPermission(actor, "knowledge.read");

    if (!query || query.trim() === "") {
      return [];
    }

    const cacheKey = `${query}:${limit}:${threshold}`;
    const cached = this.searchCache.get<SearchResult[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const embedding = await this.gemini.generateEmbedding(query);
    const results = await this.repository.searchSimilarChunks(embedding, limit, threshold);
    this.searchCache.set(cacheKey, results);
    return results;
  }

  /**
   * Lists documents with paginated results.
   */
  public async listDocuments(
    actor: AuthenticatedUser,
    filters: { departmentId?: string; serviceId?: string; schemeId?: string },
    page = 1,
    pageSize = 20
  ): Promise<{ items: KnowledgeDocument[]; total: number }> {
    this.authService.assertPermission(actor, "knowledge.read");
    const skip = (page - 1) * pageSize;
    return this.repository.findManyDocuments(filters, skip, pageSize);
  }

  /**
   * Fetches specific details of a document.
   */
  public async getDocumentDetails(actor: AuthenticatedUser, id: string): Promise<KnowledgeDocument> {
    this.authService.assertPermission(actor, "knowledge.read");

    const doc = await this.repository.findDocumentById(id);
    if (!doc) {
      throw new AppError(404, "DOCUMENT_NOT_FOUND", `KnowledgeDocument with ID '${id}' was not found.`);
    }

    return doc;
  }
}
